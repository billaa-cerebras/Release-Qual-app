// src/ai/flows/clone-jenkins-job.ts
'use server';

import { ai } from '@/ai/plugins';
import { z } from 'zod';

const cloneJenkinsJobInputSchema = z.object({
  releaseTarget: z.string().regex(/^r\d{4}$/, 'Must be in the format rXXXX'),
});

const cloneJenkinsJobOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  newJobName: z.string().optional(),
});

interface JenkinsCrumb {
  _class: string;
  crumb: string;
  crumbRequestField: string;
}

export const cloneJenkinsJobFlow = ai.defineFlow(
  {
    name: 'cloneJenkinsJobFlow',
    inputSchema: cloneJenkinsJobInputSchema,
    outputSchema: cloneJenkinsJobOutputSchema,
  },
  async ({ releaseTarget }) => {
    const { JENKINS_URL, JENKINS_USERNAME, JENKINS_API_TOKEN, JENKINS_TEMPLATE_JOB_NAME } = process.env;

    if (!JENKINS_URL || !JENKINS_USERNAME || !JENKINS_API_TOKEN || !JENKINS_TEMPLATE_JOB_NAME) {
      return { success: false, message: 'Jenkins URL, credentials, or template job name not configured.' };
    }

    const newJobName = `csx-inference-release-qual-${releaseTarget}`; // Define the new job name convention
    const sourceJobName = JENKINS_TEMPLATE_JOB_NAME;
    const auth = Buffer.from(`${JENKINS_USERNAME}:${JENKINS_API_TOKEN}`).toString('base64');
    const baseHeaders = { 'Authorization': `Basic ${auth}` };

    // 1. Check if the job already exists
    try {
      const checkUrl = `${JENKINS_URL}/job/${encodeURIComponent(newJobName)}/api/json`; // Check specific job URL
      const checkResponse = await fetch(checkUrl, { headers: baseHeaders });
      if (checkResponse.ok) {
        return { success: true, message: `Jenkins job '${newJobName}' already exists.`, newJobName };
      }
      if (checkResponse.status !== 404) {
        throw new Error(`Failed to check job existence: ${checkResponse.statusText} (Status: ${checkResponse.status})`);
      }
      // If 404, continue
    } catch (error: any) {
      console.warn(`Could not verify job existence for ${newJobName}: ${error.message}. Proceeding with creation attempt.`);
    }

    let configXml = '';
    // 2. Get config.xml from the template job
    try {
      const configUrl = `${JENKINS_URL}/job/${encodeURIComponent(sourceJobName)}/config.xml`;
      const configResponse = await fetch(configUrl, { headers: baseHeaders });
      if (!configResponse.ok) {
        throw new Error(`Failed to fetch config.xml from '${sourceJobName}'. Status: ${configResponse.status} ${configResponse.statusText}`);
      }
      configXml = await configResponse.text();
      if (!configXml || !configXml.startsWith('<?xml')) {
         throw new Error(`Received invalid config.xml from '${sourceJobName}'.`);
      }
    } catch (error: any) {
      console.error(`Error getting config.xml for template job '${sourceJobName}':`, error);
      return { success: false, message: `Failed to get template job configuration: ${error.message}` };
    }

    // 3. Get Crumb (Needed for the POST request)
    let crumbData: JenkinsCrumb | null = null;
    try {
      const crumbUrl = `${JENKINS_URL}/crumbIssuer/api/json`;
      const response = await fetch(crumbUrl, { headers: baseHeaders });
      if (response.ok) {
         crumbData = await response.json();
      } else if (response.status === 404) {
         console.log("Crumb issuer not found, proceeding without crumb (might fail if CSRF protection is enabled).");
      } else {
         throw new Error(`Failed to fetch Jenkins crumb: ${response.statusText}`);
      }
    } catch (error: any) {
      // Log the error but attempt to proceed without a crumb if CSRF protection might be off
      console.warn(`Warning: Error getting Jenkins crumb: ${error.message}. Attempting job creation without crumb.`);
    }

    // 4. Create the new job using the fetched config.xml
    try {
      const createUrl = `${JENKINS_URL}/createItem?name=${encodeURIComponent(newJobName)}`;
      const postHeaders: HeadersInit = {
        ...baseHeaders,
        'Content-Type': 'application/xml',
      };
      if (crumbData) {
        postHeaders[crumbData.crumbRequestField] = crumbData.crumb;
      }

      const response = await fetch(createUrl, {
        method: 'POST',
        headers: postHeaders,
        body: configXml // Send the config.xml as the request body
      });

      if (!response.ok) {
        const errorText = await response.text();
        // Handle common error: job already exists
        if (response.status === 400 && errorText.includes('already exists')) {
             return { success: true, message: `Jenkins job '${newJobName}' already exists (detected during creation).`, newJobName };
        }
        throw new Error(`Failed to create job '${newJobName}'. Status: ${response.status}. Response: ${errorText}`);
      }

      return { success: true, message: `Successfully created Jenkins job '${newJobName}' from template '${sourceJobName}'.`, newJobName };

    } catch (error: any) {
      console.error(`Failed to create job ${newJobName}:`, error);
      return { success: false, message: `Failed to create Jenkins job: ${error.message}` };
    }
  }
);