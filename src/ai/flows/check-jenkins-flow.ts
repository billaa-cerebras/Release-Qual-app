'use server';
/**
 * @fileOverview A flow for checking the status of a Jenkins build.
 *
 * - checkJenkinsJobStatus - Checks the status of a single Jenkins build or queue URL.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const JobStatusInputSchema = z.object({
  url: z.string().url(),
});

const JobStatusOutputSchema = z.object({
  status: z.string(), // e.g., 'QUEUED', 'BUILDING', 'SUCCESS', 'FAILURE'
  building: z.boolean(),
  result: z.string().nullable(),
  duration: z.number(),
  timestamp: z.number(),
  buildUrl: z.string().url().nullable(),
});

export type CheckJenkinsJobStatusInput = z.infer<typeof JobStatusInputSchema>;
export type CheckJenkinsJobStatusOutput = z.infer<typeof JobStatusOutputSchema>;

export async function checkJenkinsJobStatus(input: CheckJenkinsJobStatusInput): Promise<CheckJenkinsJobStatusOutput> {
  return checkJenkinsJobStatusFlow(input);
}

// Helper to poll the queue and get the final build URL
const pollQueueForBuildUrl = async (queueUrl: string, auth: string): Promise<string | null> => {
    try {
        const response = await fetch(`${queueUrl}api/json`, { headers: { 'Authorization': `Basic ${auth}` } });
        if (!response.ok) {
            console.warn(`Polling queue item failed: ${response.statusText}`);
            return null;
        }
        const queueItem = await response.json();
        return queueItem.executable?.url || null; // Return build URL if available, otherwise null
    } catch (error) {
         console.warn(`Polling queue item failed. Retrying...`, error);
         return null;
    }
};

const checkJenkinsJobStatusFlow = ai.defineFlow(
  {
    name: 'checkJenkinsJobStatusFlow',
    inputSchema: JobStatusInputSchema,
    outputSchema: JobStatusOutputSchema,
  },
  async ({ url }) => {
    const { JENKINS_USERNAME, JENKINS_API_TOKEN } = process.env;

    if (!JENKINS_USERNAME || !JENKINS_API_TOKEN) {
      throw new Error('Jenkins credentials are not configured in the environment.');
    }

    const auth = Buffer.from(`${JENKINS_USERNAME}:${JENKINS_API_TOKEN}`).toString('base64');
    let statusUrl = url;
    let finalBuildUrl: string | null = null;
    
    // If the URL is a queue URL, poll it to get the build URL.
    if (url.includes('/queue/item/')) {
        finalBuildUrl = await pollQueueForBuildUrl(url, auth);
        if (finalBuildUrl) {
            statusUrl = `${finalBuildUrl}api/json`;
        } else {
            // If we don't have a build URL yet, the job is still in the queue.
            return {
                status: 'QUEUED',
                building: false,
                result: null,
                duration: 0,
                timestamp: Date.now(),
                buildUrl: null,
            };
        }
    } else {
        // This is already a build URL
        finalBuildUrl = url;
        statusUrl = `${url}api/json`;
    }

    try {
      const response = await fetch(statusUrl, {
        headers: { 'Authorization': `Basic ${auth}` }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch build info: ${response.statusText}`);
      }

      const buildInfo = await response.json();
      
      return {
        building: buildInfo.building,
        result: buildInfo.result, // SUCCESS, FAILURE, ABORTED, etc.
        status: buildInfo.building ? 'BUILDING' : (buildInfo.result || 'UNKNOWN'),
        duration: buildInfo.duration,
        timestamp: buildInfo.timestamp,
        buildUrl: finalBuildUrl,
      };
    } catch (error: any) {
        console.error(`Error checking Jenkins status for ${statusUrl}:`, error);
        // Return a failure state that can be displayed on the frontend
        return {
            building: false,
            result: 'FAILURE',
            status: 'POLL_ERROR',
            duration: 0,
            timestamp: Date.now(),
            buildUrl: finalBuildUrl,
        };
    }
  }
);
