
'use server';
/**
 * @fileOverview A flow for triggering Jenkins jobs for model releases.
 *
 * - triggerJenkinsJobs - Triggers Jenkins jobs for a list of model releases.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { ModelReleaseSchema, TriggerJenkinsJobsInputSchema, TriggerJenkinsJobsOutputSchema, type TriggerJenkinsJobsInput, type TriggerJenkinsJobsOutput } from '@/lib/schemas';


// The main exported function that the frontend will call.
export async function triggerJenkinsJobs(input: TriggerJenkinsJobsInput): Promise<TriggerJenkinsJobsOutput> {
  return triggerJenkinsJobsFlow(input);
}

interface JenkinsCrumb {
    _class: string;
    crumb: string;
    crumbRequestField: string;
}

const triggerJenkinsJobsFlow = ai.defineFlow(
  {
    name: 'triggerJenkinsJobsFlow',
    inputSchema: TriggerJenkinsJobsInputSchema,
    outputSchema: TriggerJenkinsJobsOutputSchema,
  },
  async (releases) => {
    const { JENKINS_URL, JENKINS_USERNAME, JENKINS_API_TOKEN } = process.env;

    if (!JENKINS_URL || !JENKINS_USERNAME || !JENKINS_API_TOKEN) {
      const message = 'Jenkins credentials are not configured in the environment.';
      return {
        success: false,
        message: message,
        details: releases.map(release => ({
            modelName: release.modelName,
            status: 'FAILURE',
            message: message
        })),
      };
    }
    
    const auth = Buffer.from(`${JENKINS_USERNAME}:${JENKINS_API_TOKEN}`).toString('base64');

    let crumbData: JenkinsCrumb;
    try {
        const crumbUrl = `${JENKINS_URL}/crumbIssuer/api/json`;
        const response = await fetch(crumbUrl, {
            headers: { 'Authorization': `Basic ${auth}` }
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch Jenkins crumb: ${response.statusText}`);
        }
        crumbData = await response.json();
    } catch (error: any) {
        console.error("Error getting Jenkins crumb:", error);
        const message = `Error getting Jenkins crumb: ${error.message}`;
        return { 
            success: false, 
            message: message,
            details: releases.map(release => ({
                modelName: release.modelName,
                status: 'FAILURE',
                message: message
            })) 
        };
    }

    const jobName = "csx-inference-model-qual-v2";
    const jobUrl = `${JENKINS_URL}/job/${jobName}/buildWithParameters`;
    
    const headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        [crumbData.crumbRequestField]: crumbData.crumb,
        'Authorization': `Basic ${auth}`
    };

    const results = [];

    for (const release of releases) {
        // Map form fields to Jenkins parameters, based on the provided python script.
        const params = new URLSearchParams({
            'project': jobName,
            'MODEL_NAME': release.modelName,
            'CUSTOM_MODEL_NAME': '',
            'MODEL_VARIANT_PARAMS': '',
            'PICK_DEFAULT_DRAFT_MODEL': 'true', // Assuming this is the default
            'DRAFT_MODEL_NAME': '', // Needs to be determined if there is a mapping
            'CUSTOM_MODEL_CONFIG_FILE': '',
            'RELEASE_PROFILE': release.profile,
            'MIQ_PROFILE_BRANCH': release.miqBranch,
            'PROFILE_MODE': 'release',
            'PROFILE_FLOW_NAME_FILTER': '',
            'PROFILE_ATTR_FILTER': '',
            'SERVER_MODE': 'replica (Full replica server - requires systems)',
            'SERVER_CONFIG_PARAMS': 'job_priority=p2\njob_timeout_s=172800\nreadiness_timeout_s=86400\n',
            'CEREBRAS_API_HOST': '',
            'CEREBRAS_API_PORT': '',
            'APP_TAG': release.appTag,
            'APP_TAG_FROM_WORKSPACE': 'false',
            'NAMESPACE': 'inf-integ',
            'MULTIBOX': 'dh1',
            'CONSTRAINTS': '',
            'USERNODE': 'net004-us-sr04.sck2.cerebrascloud.com', // This seems static in the script
            'USE_LOCAL_CHECKPOINT': 'true',
            'REMOTEWORKDIRROOT': '/n0/lab/test',
            'RELEASE_DRY_RUN': 'false',
            'RELEASE_KILL_SERVER_ON_ABORT': 'true',
            'ENABLE_SERVER_AUTO_RECOVERY': 'true',
            'TRAIN_PYTEST_ADDOPTS': '--cifparam runconfig.job_priority=p1 --cifparam runconfig.disable_version_check=true',
            'CUSTOM_TRAIN_FILE': '',
            'TRAIN_NAME': jobName,
            'branch': release.branch,
            'COMMIT': '',
            'LOGLEVEL': 'INFO',
            'BUILDID': 'latest',
            'TRIGGER_AUTOMATED_MSG': 'false',
            'Notes': `Triggered from Release Form Builder for ${release.modelName}`,
            'TARGET_RELEASE': release.releaseTarget,
            'EXTRA_ENV_VARS': '',
            'JOB_LABELS': release.labels,
            'LAUNCH_AUTO_BISECT_JOB': 'false',
            'IMPORT_SECRETS_FROM_VAULT': 'OPENAI_API_KEY,EVAL_GITHUB_TOKEN,CEREBRAS_API_KEY,HF_TOKEN',
            'BUILD_NAME_SUFFIX': '',
            'TEST_BRANCH': ''
        });

        try {
            const response = await fetch(jobUrl, {
                method: 'POST',
                headers: headers,
                body: params.toString(),
            });

            if (response.status === 201) {
                const queueUrl = response.headers.get("Location");
                if (!queueUrl) {
                    throw new Error("Jenkins did not return a queue location.");
                }
                results.push({ modelName: release.modelName, status: 'QUEUED', message: `Job is queued.`, url: queueUrl });

            } else {
                const errorText = await response.text();
                results.push({ modelName: release.modelName, status: 'FAILURE', message: `Failed to trigger job. Status: ${response.status}. Response: ${errorText}` });
            }
        } catch (error: any) {
            results.push({ modelName: release.modelName, status: 'FAILURE', message: `An unexpected error occurred: ${error.message}` });
        }
    }
    
    const allSuccessful = results.every(r => r.status === 'QUEUED');

    return {
        success: allSuccessful,
        message: allSuccessful ? 'All Jenkins jobs processed successfully.' : 'Some Jenkins jobs failed to trigger.',
        details: results,
    };
  }
);
