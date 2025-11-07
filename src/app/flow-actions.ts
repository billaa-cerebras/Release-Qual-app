// src/app/flow-actions.ts
"use server";

import dbConnect from "@/lib/mongodb";
import Job, { IJob, JobType, PrecheckStatus } from "@/models/Job"; // Assuming Job model exists
import Release, { IRelease } from "@/models/Release"; // +++ IMPORT THE NEW MODEL +++
import { revalidatePath } from "next/cache";
import { triggerJenkinsJobs } from "@/ai/flows/trigger-jenkins-flow";
import { triggerPrecheckJobs } from "@/ai/flows/trigger-precheck-flow";
import { checkJenkinsJobStatus } from "@/ai/flows/check-jenkins-flow";
import { cloneJenkinsJobFlow } from "@/ai/flows/clone-jenkins-job";
import { ModelRelease } from "@/lib/schemas";
// Import functions from the dashboard API module
import {
  getTargetReleases,
  setTargetReleases,
  populateModels,
  checkDashboardInitialization,
  editDashboardModels 
} from "@/lib/dashboard-api";
// +++ IMPORT THE NEW JIRA FUNCTIONS +++
import { createJiraEpic, createJiraTask, findJiraAccountId } from "@/lib/jira-api";

interface TriggerPayload {
  releases: ModelRelease[];
}

// --- All your existing functions (unchanged) ---

export async function isDashboardInitializedForRelease(targetRelease: string): Promise<boolean> {
  // ... (no changes)
  try {
    return await checkDashboardInitialization(targetRelease);
  } catch (error: any) {
    console.error("Dashboard check failed:", error);
    throw new Error(`Dashboard check failed: ${error.message}`);
  }
}

export async function triggerPrecheckJobsAction(payload: TriggerPayload) {
  // ... (no changes)
  const { releases } = payload;
  if (!releases || releases.length === 0) {
    return { success: false, message: "No releases provided." };
  }
  const targets = Array.from(new Set(releases.map(r => r.releaseTarget)));
  if (targets.length !== 1) {
    return { success: false, message: "All models must share the same release target for pre-check." };
  }
  const releaseTarget = targets[0];

  try {
    const ready = await isDashboardInitializedForRelease(releaseTarget);
    if (!ready) {
      return { success: false, message: `Dashboard not initialized for ${releaseTarget}. Please initialize the release first.` };
    }
  } catch (e: any) {
    return { success: false, message: `Dashboard check failed: ${e.message}` };
  }

  const result = await triggerPrecheckJobs(payload);
  revalidatePath("/");
  return result;
}

export async function triggerReleaseJobsAction(payload: TriggerPayload) {
  // ... (no changes)
  const { releases } = payload;
  if (!releases || releases.length === 0) {
    return { success: false, message: "No releases provided." };
  }
  const targets = Array.from(new Set(releases.map(r => r.releaseTarget)));
  if (targets.length !== 1) {
    return { success: false, message: "All models must share the same release target for release." };
  }
  const releaseTarget = targets[0];

  try {
    const ready = await isDashboardInitializedForRelease(releaseTarget);
    if (!ready) {
      return { success: false, message: `Dashboard not initialized for ${releaseTarget}. Please initialize the release first.` };
    }
  } catch (e: any) {
    return { success: false, message: `Dashboard check failed: ${e.message}` };
  }

  const result = await triggerJenkinsJobs(payload);
  revalidatePath("/");
  return result;
}

export async function checkJenkinsJobStatusAction({ releaseId }: { releaseId: string }) {
  // ... (no changes)
  await checkJenkinsJobStatus({ releaseId });
  revalidatePath("/");
}

export async function getPrecheckStatusForModels(modelNames: string[], releaseId: string) {
  // ... (no changes)
  await dbConnect();
  const statuses = await Job.find({
    releaseId,
    modelName: { $in: modelNames },
    type: "PRECHECK"
  }).sort({ submittedAt: -1 });

  const statusMap = new Map<string, string>();
  statuses.forEach(job => {
    if (!statusMap.has(job.modelName)) {
      statusMap.set(job.modelName, job.precheckStatus as PrecheckStatus); // Cast to PrecheckStatus
    }
  });
  return Object.fromEntries(statusMap);
}

export async function getJobsByReleaseId(releaseId: string, type: JobType): Promise<IJob[]> {
   // ... (no changes)
   if (!releaseId) return [];
   await dbConnect();
   const jobs = await Job.find({ releaseId, type }).sort({ submittedAt: -1 }).lean();
   return JSON.parse(JSON.stringify(jobs));
}

export async function cloneJenkinsJobAction({ releaseTarget }: { releaseTarget: string }) {
    // ... (no changes)
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


/**
 * Edits an existing release dashboard with the provided models.
 */
export async function editReleaseDashboardAction(
  selectedReleases: ModelRelease[]
) {
  // ... (no changes)
  const releaseTarget = selectedReleases[0]?.releaseTarget;
  const userName = process.env.DASHBOARD_USERNAME || "release-qual-app-user";

  if (!releaseTarget) {
    return { success: false, message: "Release Target is missing from selected models." };
  }

  try {
    // Call the API function
    await editDashboardModels(releaseTarget, selectedReleases, userName);
    
    revalidatePath("/");
    return { success: true, message: `Successfully edited dashboard for ${releaseTarget}.` };

  } catch (error: any) {
    console.error("Dashboard Edit Error:", error);
    return { success: false, message: `Dashboard edit failed: ${error.message}` };
  }
}

export async function getReleaseLinks(releaseId: string): Promise<IRelease | null> {
  // ... (no changes)
  if (!releaseId) return null;
  try {
    await dbConnect();
    const releaseDoc = await Release.findOne({ releaseId }).lean();
    if (!releaseDoc) return null;
    return JSON.parse(JSON.stringify(releaseDoc));
  } catch (error: any) {
    console.error("Failed to get release links:", error);
    return null;
  }
}

// +++ NEW ACTION: Step 1 of Initialization +++
/**
 * Creates and populates the dashboard.
 */
export async function initializeDashboardAction(
  selectedReleases: ModelRelease[]
) {
  // ... (no changes)
  const releaseTarget = selectedReleases[0]?.releaseTarget;
  const userName = process.env.DASHBOARD_USERNAME || "release-qual-app-user";
  
  if (!releaseTarget) {
    return { success: false, message: "Release Target is missing." };
  }

  try {
    const existingReleases = await getTargetReleases();
    existingReleases.push(releaseTarget);
    await setTargetReleases(existingReleases, `Initialize ${releaseTarget}`, userName);
    await populateModels(releaseTarget, selectedReleases, userName);
    
    return { success: true, message: "Dashboard initialized and populated." };
  } catch (error: any) {
    console.error("Dashboard Initialization Error:", error);
    return { success: false, message: `Dashboard initialization failed: ${error.message}` };
  }
}


// +++ NEW ACTION: Step 3 of Initialization +++
/**
 * Creates Jira Epic and Tasks.
 * This is split from the internal helper to be callable from the frontend.
 * +++ MODIFIED: Now returns epicUrl as well +++
 */
export async function createJiraTicketsAction(
  selectedReleases: ModelRelease[],
  releaseTarget: string
): Promise<{ success: boolean, message: string, epicKey: string | null, epicUrl: string | null }> {
  
  // --- Step 1: Find all unique users first ---
  // ... (user search logic is unchanged) ...
  const uniqueOwnerNames = [...new Set(selectedReleases.map(m => m.owner).filter(Boolean))];
  const userMap = new Map<string, string | null>();
  try {
    const findUserPromises = uniqueOwnerNames.map(ownerName => 
      findJiraAccountId(ownerName).then(accountId => ({ ownerName, accountId }))
    );
    const userResults = await Promise.all(findUserPromises);
    userResults.forEach(result => {
      userMap.set(result.ownerName, result.accountId);
    });
    console.log("Jira User Map created:", Array.from(userMap.entries()));
  } catch (userError: any) {
    console.error("Failed to search for Jira users:", userError);
  }
  
  // --- Step 2: Create the Epic ---
  let epicKey = "";
  let epicUrl = ""; // <-- New var
  try {
    // +++ MODIFIED: Get both key and url from the API function +++
    const { key, url } = await createJiraEpic(releaseTarget);
    epicKey = key;
    epicUrl = url; // <-- Store the full, correct URL
  } catch (epicError: any) {
    console.error("Jira Epic creation failed:", epicError);
    return { success: false, message: `Jira Epic creation failed: ${epicError.message}`, epicKey: null, epicUrl: null };
  }

  // --- Step 3: Create Tasks in parallel ---
  // ... (task creation logic is unchanged) ...
  const taskPromises = selectedReleases.map(model => {
    const accountId = userMap.get(model.owner) || null;
    return createJiraTask(model, epicKey, accountId)
      .then(taskKey => ({ status: 'fulfilled', modelName: model.modelName, taskKey }))
      .catch(e => ({ status: 'rejected', modelName: model.modelName, error: e.message }))
  });
  
  const results = await Promise.all(taskPromises);
  const successes = results.filter(r => r.status === 'fulfilled').length;
  const failures = results.filter(r => r.status === 'rejected');

  let message = `Epic ${epicKey} created. ${successes}/${selectedReleases.length} tasks created.`;
  if (failures.length > 0) {
    const failedModels = failures.map(f => f.modelName).join(', ');
    message += ` Failed tasks for: ${failedModels}.`;
    console.error("Failed to create some Jira tasks:", failures.map(f => (f as any).error));
  }
  
  return { success: true, message: message, epicKey: epicKey, epicUrl: epicUrl }; // <-- Return both
}


// --- MODIFIED ACTION ---
/**
 * This action now serves two purposes:
 * 1. As a "check" to see if a dashboard is initialized (returns alreadyInitialized: true).
 * 2. As a "saver" for the final links IF the frontend orchestration succeeds.
 */
export async function initializeReleaseSetupAction(
  selectedReleases: ModelRelease[],
  // +++ NEW: Pass in the results from the frontend +++
  links?: {
    jenkinsJobUrl: string;
    jenkinsJobName: string;
    jiraEpicKey: string;
    jiraEpicUrl: string;
  }
) {
  const releaseTarget = selectedReleases[0]?.releaseTarget;
  if (!releaseTarget) {
    return { success: false, message: "Release Target is missing from selected models." };
  }

  // --- If links are passed, it means this is the *final* step: Save and exit ---
  if (links) {
    try {
      await dbConnect();
      await Release.findOneAndUpdate(
        { releaseId: releaseTarget },
        {
          $set: {
            releaseId: releaseTarget,
            jenkinsJobUrl: links.jenkinsJobUrl,
            jenkinsJobName: links.jenkinsJobName,
            jiraEpicKey: links.jiraEpicKey,
            jiraEpicUrl: links.jiraEpicUrl // <-- This will now be the correct, full URL
          }
        },
        { upsert: true, new: true }
      );
      revalidatePath("/");
      return { success: true, message: "All links saved successfully." };
    } catch (dbError: any) {
      console.error("Failed to save release links to DB:", dbError);
      return { success: false, message: "Initialization complete, but failed to save links to DB." };
    }
  }

  // --- If no links are passed, this is the *first* step: Check for existing ---
  try {
    const isInitialized = await checkDashboardInitialization(releaseTarget);
    if (isInitialized) {
      // Dashboard already exists, return special status to prompt user
      return { 
        success: false, 
        message: `Dashboard for ${releaseTarget} is already initialized.`,
        alreadyInitialized: true // <-- This new flag triggers the frontend dialog
      };
    }
    // If not initialized, return success: false, but *without* alreadyInitialized flag
    // This tells the frontend it's safe to proceed with the full sequence.
    return { success: false, message: "Ready to initialize." };

  } catch (error: any) {
     return { success: false, message: `Dashboard check failed: ${error.message}` };
  }
}