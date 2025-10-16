'use server';

import { ai } from '@/ai/plugins';
import { z } from 'zod';
import dbConnect from '@/lib/mongodb';
import Job from '@/models/Job';

const checkJenkinsJobStatusInputSchema = z.object({
  releaseId: z.string(),
});

const checkJenkinsJobStatusOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export type CheckJenkinsJobStatusInput = z.infer<typeof checkJenkinsJobStatusInputSchema>;
export type CheckJenkinsJobStatusOutput = z.infer<typeof checkJenkinsJobStatusOutputSchema>;

export async function checkJenkinsJobStatus(input: CheckJenkinsJobStatusInput): Promise<CheckJenkinsJobStatusOutput> {
  return checkJenkinsJobStatusFlow(input);
}

const pollQueueForBuildUrl = async (queueUrl: string, auth: string): Promise<string | null> => {
    try {
        const response = await fetch(`${queueUrl}api/json`, { headers: { 'Authorization': `Basic ${auth}` } });
        if (!response.ok) {
            console.warn(`Polling queue item failed: ${response.statusText}`);
            return null;
        }
        const queueItem = await response.json();
        return queueItem.executable?.url || null;
    } catch (error) {
         console.warn(`Polling queue item failed. Retrying...`, error);
         return null;
    }
};

const checkJenkinsJobStatusFlow = ai.defineFlow(
  {
    name: 'checkJenkinsJobStatusFlow',
    inputSchema: checkJenkinsJobStatusInputSchema,
    outputSchema: checkJenkinsJobStatusOutputSchema,
  },
  async ({ releaseId }) => {
    await dbConnect();
    const { JENKINS_USERNAME, JENKINS_API_TOKEN } = process.env;

    if (!JENKINS_USERNAME || !JENKINS_API_TOKEN) {
      throw new Error('Jenkins credentials are not configured in the environment.');
    }
    const auth = Buffer.from(`${JENKINS_USERNAME}:${JENKINS_API_TOKEN}`).toString('base64');

    // The provided flow handles both Release and Pre-check jobs, as long as they have a status that needs polling.
    const jobsToPoll = await Job.find({
      releaseId,
      $or: [
        { status: { $in: ['QUEUED', 'BUILDING'] } },
        { precheckStatus: 'PENDING' }
      ]
    });

    if (jobsToPoll.length === 0) {
      return { success: true, message: 'No active jobs to poll.' };
    }

    await Promise.all(
      jobsToPoll.map(async (job) => {
        const url = job.jenkinsUrl;
        if (!url) return;

        let statusUrl = url;
        let finalBuildUrl: string | null = null;

        try {
          if (url.includes('/queue/item/')) {
              finalBuildUrl = await pollQueueForBuildUrl(url, auth);
              if (finalBuildUrl) {
                  statusUrl = `${finalBuildUrl}api/json`;
              } else {
                  return; 
              }
          } else {
              finalBuildUrl = url;
              statusUrl = `${url}api/json`;
          }

          const response = await fetch(statusUrl, {
            headers: { 'Authorization': `Basic ${auth}` }
          });

          if (!response.ok) {
            throw new Error(`Failed to fetch build info: ${response.statusText}`);
          }

          const buildInfo = await response.json();
          const newStatus = buildInfo.building ? 'BUILDING' : (buildInfo.result || 'UNKNOWN');
          
          const update: any = {
            jenkinsUrl: finalBuildUrl || job.jenkinsUrl,
            message: `Duration: ${buildInfo.duration}ms. Last updated: ${new Date(buildInfo.timestamp).toLocaleString()}`,
          };

          if (job.type === 'RELEASE') {
            update.status = newStatus;
          } else {
            update.precheckStatus = newStatus;
          }

          await Job.findByIdAndUpdate(job._id, update);

        } catch (error: any) {
          console.error(`Error checking Jenkins status for ${url}:`, error);
          const update: any = { message: `Polling failed: ${error.message}` };
          if (job.type === 'RELEASE') {
            update.status = 'FAILURE';
          } else {
            update.precheckStatus = 'FAILURE';
          }
          await Job.findByIdAndUpdate(job._id, update);
        }
      })
    );

    return { success: true, message: `Polled ${jobsToPoll.length} jobs.` };
  }
);