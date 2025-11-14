// src/ai/flows/trigger-jenkins-flow.ts
'use server';
/**
 * @fileOverview A flow for triggering Jenkins jobs for model releases.
 * Uses dynamically generated job names based on releaseTarget.
 */
import { ai } from '@/ai/plugins';
import { z } from 'zod';
import { modelReleaseSchema } from '@/lib/schemas';
import dbConnect from '@/lib/mongodb';
import Job from '@/models/Job'; // Assuming Job model exists and has jenkinsJobName field

const triggerJenkinsJobsInputSchema = z.object({
  releases: z.array(modelReleaseSchema).min(1, { message: "At least one release is required."}), // Ensure at least one release
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

    // --- REMOVED Dashboard Initialization Check ---
    // This check is now performed in the calling server action (triggerReleaseJobsAction)

    // --- Dynamic Job Name Logic ---
    const releaseTarget = releases[0].releaseTarget; // Assuming all releases in payload have the same target (validated by server action)
    if (!releaseTarget || !/^r\d{4}$/.test(releaseTarget)) {
        return { success: false, message: 'Invalid or missing releaseTarget in payload.' };
    }
    const jenkinsJobName = `csx-inference-release-qual-${releaseTarget}`; // Construct the dynamic job name

    // --- Jenkins Credentials ---
    const { JENKINS_URL, JENKINS_USERNAME, JENKINS_API_TOKEN } = process.env;

    if (!JENKINS_URL || !JENKINS_USERNAME || !JENKINS_API_TOKEN) {
      const message = 'Jenkins credentials are not configured in the environment.';
      // Log failure for all intended releases
      for (const release of releases) {
        await Job.create({
          releaseId: release.releaseTarget, modelName: release.modelName, type: 'RELEASE',
          status: 'FAILURE', message: message, jenkinsJobName: jenkinsJobName, // Log the intended job name
        });
      }
      return { success: false, message: message };
    }

    const auth = Buffer.from(`${JENKINS_USERNAME}:${JENKINS_API_TOKEN}`).toString('base64');

    // --- Get Crumb ---
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
              status: 'FAILURE', message: message, jenkinsJobName: jenkinsJobName, // Log the intended job name
            });
        }
        return { success: false, message: message };
    }

    // --- Trigger Jobs Loop ---
    const jobUrl = `${JENKINS_URL}/job/${jenkinsJobName}/buildWithParameters`; // Use dynamic job name
    const headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        [crumbData.crumbRequestField]: crumbData.crumb,
        'Authorization': `Basic ${auth}`
    };

    let allSuccessful = true;
    const results = [];

    for (const release of releases) {
        // Construct parameters (ensure these match the job's expected params)
        const params = new URLSearchParams({
          'project': '',
          'MODEL_NAME': release.modelName,
          'CUSTOM_MODEL_NAME': '',
          'MODEL_VARIANT_PARAMS': '',
          'PICK_DEFAULT_DRAFT_MODEL': 'true', // Assuming this is the default
          'DRAFT_MODEL_NAME': '', // Needs to be determined if there is a mapping
          'CUSTOM_MODEL_CONFIG_FILE': '',
          'RELEASE_PROFILE': release.customProfile || '',
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
          'MULTIBOX': release.multibox,
          'CONSTRAINTS': '',
          'USERNODE': release.usernoode, // This seems static in the script
          'USE_LOCAL_CHECKPOINT': 'true',
          'REMOTEWORKDIRROOT': '/n0/lab/test',
          'RELEASE_DRY_RUN': 'false',
          'RELEASE_KILL_SERVER_ON_ABORT': 'true',
          'ENABLE_SERVER_AUTO_RECOVERY': 'true',
          'TRAIN_PYTEST_ADDOPTS': '--cifparam runconfig.job_priority=p1 --cifparam runconfig.disable_version_check=true',
          'CUSTOM_TRAIN_FILE': '',
          'TRAIN_NAME': 'csx-inference-model-qual-v2',
          'branch': release.branch,
          'COMMIT': '',
          'LOGLEVEL': 'INFO',
          'BUILDID': 'latest',
          'TRIGGER_AUTOMATED_MSG': 'false',
          'Notes': ``,
          'TARGET_RELEASE': release.releaseTarget,
          'EXTRA_ENV_VARS': '',
          'JOB_LABELS': release.labels,
          'LAUNCH_AUTO_BISECT_JOB': 'false',
          'IMPORT_SECRETS_FROM_VAULT': 'OPENAI_API_KEY,EVAL_GITHUB_TOKEN,CEREBRAS_API_KEY,HF_TOKEN',
          'BUILD_NAME_SUFFIX': '',
          'TEST_BRANCH': '',
          'JOB_MONITOR_URL': release.monitorLink
      });

         try {
            const response = await fetch(jobUrl, { method: 'POST', headers: headers, body: params.toString() });
            if (response.status === 201) {
                const queueUrl = response.headers.get("Location");
                if (!queueUrl) throw new Error("Jenkins did not return a queue location.");

                // Save job info to DB including the specific job name used
                await Job.create({
                    releaseId: release.releaseTarget,
                    modelName: release.modelName,
                    jenkinsUrl: queueUrl,
                    type: 'RELEASE',
                    status: 'QUEUED',
                    message: `Job triggered on '${jenkinsJobName}' and is now in the queue.`,
                    jenkinsJobName: jenkinsJobName, // Store the job name
                });
                 results.push({ model: release.modelName, status: 'QUEUED' });
            } else {
                const errorText = await response.text();
                 let detailedError = `Failed to trigger job '${jenkinsJobName}'. Status: ${response.status}. Response: ${errorText}`;
                 if (response.status === 404) {
                     detailedError = `Failed to trigger job: Job '${jenkinsJobName}' not found on Jenkins. Was it created successfully?`;
                 } else if (errorText.includes('<!DOCTYPE html>')) {
                    detailedError = `Jenkins Internal Server Error when triggering '${jenkinsJobName}'.`;
                 }
                throw new Error(detailedError);
            }
        } catch (error: any) {
            allSuccessful = false;
            console.error(`Failed to trigger job ${jenkinsJobName} for ${release.modelName}:`, error);
            await Job.create({
                releaseId: release.releaseTarget,
                modelName: release.modelName,
                jenkinsUrl: '',
                type: 'RELEASE',
                status: 'FAILURE',
                message: error.message || `An unexpected error occurred during triggering job '${jenkinsJobName}'.`,
                jenkinsJobName: jenkinsJobName, // Store the intended job name even on failure
            });
            results.push({ model: release.modelName, status: 'FAILURE', error: error.message });
        }
    }

    const finalMessage = allSuccessful
      ? `All release jobs successfully triggered on '${jenkinsJobName}'.`
      : `Some release jobs failed to trigger on '${jenkinsJobName}'. Check logs/DB for details.`;

    // Consider returning more detailed results if needed by the UI
    return { success: allSuccessful, message: finalMessage };
  }
);