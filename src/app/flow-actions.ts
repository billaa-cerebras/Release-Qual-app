// src/app/flow-actions.ts
"use server";

import dbConnect from "@/lib/mongodb";
import Job, { IJob, JobType } from "@/models/Job"; // Assuming Job model exists
import { revalidatePath } from "next/cache";
import { triggerJenkinsJobs } from "@/ai/flows/trigger-jenkins-flow";
import { triggerPrecheckJobs } from "@/ai/flows/trigger-precheck-flow";
import { checkJenkinsJobStatus } from "@/ai/flows/check-jenkins-flow";
import { cloneJenkinsJobFlow } from "@/ai/flows/clone-jenkins-job"; // New import
import { ModelRelease } from "@/lib/schemas";
// Import functions from the new dashboard API module
import {
  getTargetReleases,
  setTargetReleases,
  populateModels,
  checkDashboardInitialization
} from "@/lib/dashboard-api";

interface TriggerPayload {
  releases: ModelRelease[];
}

/**
 * Utility: Check if the dashboard is initialized for a given target release.
 * Uses the refactored dashboard API function.
 */
export async function isDashboardInitializedForRelease(targetRelease: string): Promise<boolean> {
  try {
    // Use the centralized API function
    return await checkDashboardInitialization(targetRelease);
  } catch (error: any) {
    console.error("Dashboard check failed:", error);
    // Treat API errors as 'not initialized' or re-throw based on desired handling
    throw new Error(`Dashboard check failed: ${error.message}`);
  }
}

/**
 * Trigger pre-check Jenkins jobs with mandatory dashboard initialization guard.
 * Reads precheck job name from env.
 */
export async function triggerPrecheckJobsAction(payload: TriggerPayload) {
  const { releases } = payload;
  if (!releases || releases.length === 0) {
    return { success: false, message: "No releases provided." };
  }
  const targets = Array.from(new Set(releases.map(r => r.releaseTarget)));
  if (targets.length !== 1) {
    return { success: false, message: "All models must share the same release target for pre-check." };
  }
  const releaseTarget = targets[0];

  // Dashboard initialization check (uses updated isDashboardInitializedForRelease)
  try {
    const ready = await isDashboardInitializedForRelease(releaseTarget);
    if (!ready) {
      return { success: false, message: `Dashboard not initialized for ${releaseTarget}. Please initialize the release first.` };
    }
  } catch (e: any) {
    return { success: false, message: `Dashboard check failed: ${e.message}` };
  }

  // Call Genkit flow (which now reads job name from env)
  const result = await triggerPrecheckJobs(payload);
  revalidatePath("/");
  return result;
}

/**
 * Trigger release Jenkins jobs with mandatory dashboard initialization guard.
 * The called flow will dynamically determine the job name.
 */
export async function triggerReleaseJobsAction(payload: TriggerPayload) {
  const { releases } = payload;
  if (!releases || releases.length === 0) {
    return { success: false, message: "No releases provided." };
  }
  const targets = Array.from(new Set(releases.map(r => r.releaseTarget)));
  if (targets.length !== 1) {
    return { success: false, message: "All models must share the same release target for release." };
  }
  const releaseTarget = targets[0];

  // Dashboard initialization check (uses updated isDashboardInitializedForRelease)
  try {
    const ready = await isDashboardInitializedForRelease(releaseTarget);
    if (!ready) {
      return { success: false, message: `Dashboard not initialized for ${releaseTarget}. Please initialize the release first.` };
    }
  } catch (e: any) {
    return { success: false, message: `Dashboard check failed: ${e.message}` };
  }

  // Call Genkit flow (which now derives job name)
  const result = await triggerJenkinsJobs(payload);
  revalidatePath("/");
  return result;
}

/**
 * Poll Jenkins job status (unchanged logic, calls Genkit flow).
 */
export async function checkJenkinsJobStatusAction({ releaseId }: { releaseId: string }) {
  await checkJenkinsJobStatus({ releaseId });
  revalidatePath("/");
}

/**
 * Get the latest pre-check status for models (unchanged logic).
 */
export async function getPrecheckStatusForModels(modelNames: string[], releaseId: string) {
   // ... (no changes needed here) ...
  await dbConnect();
  const statuses = await Job.find({
    releaseId,
    modelName: { $in: modelNames },
    type: "PRECHECK"
  }).sort({ submittedAt: -1 });

  const statusMap = new Map<string, string>();
  statuses.forEach(job => {
    if (!statusMap.has(job.modelName)) {
      statusMap.set(job.modelName, job.precheckStatus);
    }
  });
  return Object.fromEntries(statusMap);
}

/**
 * Fetch jobs by release ID and type (unchanged logic).
 */
export async function getJobsByReleaseId(releaseId: string, type: JobType): Promise<IJob[]> {
   // ... (no changes needed here) ...
   if (!releaseId) return [];
   await dbConnect();
   const jobs = await Job.find({ releaseId, type }).sort({ submittedAt: -1 }).lean();
   return JSON.parse(JSON.stringify(jobs));
}


// +++ NEW Action to wrap the clone flow +++
/**
 * Clones the Jenkins template job for a specific release target.
 */
export async function cloneJenkinsJobAction({ releaseTarget }: { releaseTarget: string }) {
    if (!releaseTarget || !/^r\d{4}$/.test(releaseTarget)) {
        return { success: false, message: 'Invalid Release Target format provided.' };
    }
    try {
        const result = await cloneJenkinsJobFlow({ releaseTarget });
        return result;
    } catch (error: any) {
         console.error("Clone Jenkins Job Action Error:", error);
        return { success: false, message: error.message || "An unknown error occurred during job cloning." };
    }
}


// --- Renamed and Modified Action ---
/**
 * Initializes the dashboard and clones the Jenkins job for the release.
 * Renamed from initiateDashboardAction.
 */
export async function initializeReleaseSetupAction(
  selectedReleases: ModelRelease[]
) {
  const releaseTarget = selectedReleases[0]?.releaseTarget;
  const userName = process.env.DASHBOARD_USERNAME || "release-qual-app-user"; // Read from env

  if (!releaseTarget) {
    return { success: false, message: "Release Target is missing from selected models." };
  }

  let dashboardInitialized = false;
  let jenkinsCloned = false;
  let dashboardMessage = "";
  let jenkinsMessage = "";
  let finalMessage = "";

  // Step 1: Initialize Dashboard
  try {
    const existingReleases = await getTargetReleases(); // Use new API function
    if (!existingReleases.includes(releaseTarget)) {
      existingReleases.push(releaseTarget);
      await setTargetReleases(existingReleases, `Initialize ${releaseTarget}`, userName); // Use new API function
      dashboardMessage = `Added ${releaseTarget} to dashboard targets. `;
    } else {
        dashboardMessage = `Dashboard target ${releaseTarget} already exists. `;
    }

    await populateModels(releaseTarget, selectedReleases, userName); // Use new API function
    dashboardMessage += "Populated models.";
    dashboardInitialized = true;
  } catch (error: any) {
    console.error("Dashboard Initialization Error:", error);
    dashboardMessage = `Dashboard initialization failed: ${error.message}`;
    // Stop if dashboard init fails
    return { success: false, message: dashboardMessage };
  }

  // Step 2: Clone Jenkins Job (only if dashboard init succeeded)
  try {
      const cloneResult = await cloneJenkinsJobAction({ releaseTarget }); // Call the new action
      jenkinsMessage = cloneResult.message;
      if (!cloneResult.success) {
          throw new Error(cloneResult.message);
      }
      jenkinsCloned = true;
  } catch (error: any) {
       console.error("Jenkins Job Clone Error:", error);
       jenkinsMessage = `Jenkins job cloning failed: ${error.message}`;
       // Return partial success if dashboard worked but Jenkins failed
       finalMessage = `${dashboardMessage} ${jenkinsMessage}`;
       return { success: false, message: finalMessage };
  }

  // If both steps succeeded
  finalMessage = `${dashboardMessage} ${jenkinsMessage}`;
  revalidatePath("/"); // Revalidate path after all successful operations
  return { success: true, message: finalMessage };
}