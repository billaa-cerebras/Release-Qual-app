'use server';
/**
 * @fileOverview A flow for triggering Jenkins jobs for model releases.
 */
import { ai } from '@/ai/plugins';
import { z } from 'zod';
import { modelReleaseSchema } from '@/lib/schemas';
import dbConnect from '@/lib/mongodb';
import Job from '@/models/Job';

const triggerJenkinsJobsInputSchema = z.object({
  releases: z.array(modelReleaseSchema),
});

const triggerJenkinsJobsOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

interface JenkinsCrumb {
  _class: string;
  crumb: string;
  crumbRequestField: string;
}

export const triggerJenkinsJobs = ai.defineFlow(
  {
    name: 'triggerJenkinsJobs',
    inputSchema: triggerJenkinsJobsInputSchema,
    outputSchema: triggerJenkinsJobsOutputSchema,
  },
  async ({ releases }) => {
    await dbConnect();

    const { JENKINS_URL, JENKINS_USERNAME, JENKINS_API_TOKEN } = process.env;

    if (!JENKINS_URL || !JENKINS_USERNAME || !JENKINS_API_TOKEN) {
      const message = 'Jenkins credentials are not configured in the environment.';
      for (const release of releases) {
        await Job.create({
          releaseId: release.releaseTarget, modelName: release.modelName, type: 'RELEASE',
          status: 'FAILURE', message: message,
        });
      }
      return { success: false, message: message };
    }
    
    const auth = Buffer.from(`${JENKINS_USERNAME}:${JENKINS_API_TOKEN}`).toString('base64');

    let crumbData: JenkinsCrumb;
    try {
        const crumbUrl = `${JENKINS_URL}/crumbIssuer/api/json`;
        const response = await fetch(crumbUrl, { headers: { 'Authorization': `Basic ${auth}` } });
        if (!response.ok) throw new Error(`Failed to fetch Jenkins crumb: ${response.statusText}`);
        crumbData = await response.json();
    } catch (error: any) {
        const message = `Error getting Jenkins crumb: ${error.message}`;
        for (const release of releases) {
            await Job.create({
              releaseId: release.releaseTarget, modelName: release.modelName, type: 'RELEASE',
              status: 'FAILURE', message: message,
            });
        }
        return { success: false, message: message };
    }

    const jobName = "csx-inference-model-qual-v2";
    const jobUrl = `${JENKINS_URL}/job/${jobName}/buildWithParameters`;
    const headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        [crumbData.crumbRequestField]: crumbData.crumb,
        'Authorization': `Basic ${auth}`
    };

    let allSuccessful = true;

    for (const release of releases) {
        const params = new URLSearchParams({
            'project': jobName, 'MODEL_NAME': release.modelName, 'CUSTOM_MODEL_NAME': '', 'MODEL_VARIANT_PARAMS': '',
            'PICK_DEFAULT_DRAFT_MODEL': 'true', 'DRAFT_MODEL_NAME': '', 'CUSTOM_MODEL_CONFIG_FILE': '', 'RELEASE_PROFILE': release.profile,
            'MIQ_PROFILE_BRANCH': release.miqBranch, 'PROFILE_MODE': 'release', 'PROFILE_FLOW_NAME_FILTER': '', 'PROFILE_ATTR_FILTER': '',
            'SERVER_MODE': 'replica (Full replica server - requires systems)', 'SERVER_CONFIG_PARAMS': 'job_priority=p2\njob_timeout_s=172800\nreadiness_timeout_s=86400\n',
            'CEREBRAS_API_HOST': '', 'CEREBRAS_API_PORT': '', 'APP_TAG': release.appTag, 'APP_TAG_FROM_WORKSPACE': 'false', 'NAMESPACE': 'inf-integ',
            'MULTIBOX': release.multibox, 'CONSTRAINTS': '', 'USERNODE': 'net004-us-sr04.sck2.cerebrascloud.com', 'USE_LOCAL_CHECKPOINT': 'true',
            'REMOTEWORKDIRROOT': '/n0/lab/test', 'RELEASE_DRY_RUN': 'false', 'RELEASE_KILL_SERVER_ON_ABORT': 'true', 'ENABLE_SERVER_AUTO_RECOVERY': 'true',
            'TRAIN_PYTEST_ADDOPTS': '--cifparam runconfig.job_priority=p1 --cifparam runconfig.disable_version_check=true', 'CUSTOM_TRAIN_FILE': '',
            'TRAIN_NAME': jobName, 'branch': release.branch, 'COMMIT': '', 'LOGLEVEL': 'INFO', 'BUILDID': 'latest', 'TRIGGER_AUTOMATED_MSG': 'false',
            'Notes': `Triggered from Release Form Builder for ${release.modelName}`, 'TARGET_RELEASE': release.releaseTarget, 'EXTRA_ENV_VARS': '',
            'JOB_LABELS': release.labels, 'LAUNCH_AUTO_BISECT_JOB': 'false', 'IMPORT_SECRETS_FROM_VAULT': 'OPENAI_API_KEY,EVAL_GITHUB_TOKEN,CEREBRAS_API_KEY,HF_TOKEN',
            'BUILD_NAME_SUFFIX': '', 'TEST_BRANCH': ''
        });

        try {
            const response = await fetch(jobUrl, { method: 'POST', headers: headers, body: params.toString() });
            if (response.status === 201) {
                const queueUrl = response.headers.get("Location");
                if (!queueUrl) throw new Error("Jenkins did not return a queue location.");
                await Job.create({
                    releaseId: release.releaseTarget, modelName: release.modelName, jenkinsUrl: queueUrl,
                    type: 'RELEASE', status: 'QUEUED', message: 'Job successfully triggered and is now in the queue.',
                });
            } else {
                const errorText = await response.text();
                if (errorText.includes('<!DOCTYPE html>')) {
                    throw new Error('Jenkins Internal Server Error');
                } else {
                    throw new Error(`Failed to trigger job. Status: ${response.status}. Response: ${errorText}`);
                }
            }
        } catch (error: any) {
            allSuccessful = false;
            console.error(`Failed to trigger job for ${release.modelName}:`, error);
            await Job.create({
                releaseId: release.releaseTarget, modelName: release.modelName, jenkinsUrl: '',
                type: 'RELEASE', status: 'FAILURE', message: error.message || 'An unexpected error occurred during triggering.',
            });
        }
    }
    return { success: allSuccessful, message: allSuccessful ? 'All Jenkins jobs processed successfully.' : 'Some Jenkins jobs failed to trigger.' };
  }
);