"use server";

import dbConnect from "@/lib/mongodb";
import Job, { IJob, JobType } from "@/models/Job";
import { revalidatePath } from "next/cache";
import { triggerJenkinsJobs } from "@/ai/flows/trigger-jenkins-flow";
import { triggerPrecheckJobs } from "@/ai/flows/trigger-precheck-flow";
import { checkJenkinsJobStatus } from "@/ai/flows/check-jenkins-flow";
import { ModelRelease } from "@/lib/schemas";

const API_BASE_URL = "http://dashboards.cerebras.aws:3001/api";

interface TriggerPayload {
  releases: ModelRelease[];
}

/**
 * Utility: Check if the dashboard is initialized for a given target release.
 * Returns true if the targetRelease is present in the 'release' array from dashboard service.
 */
export async function isDashboardInitializedForRelease(targetRelease: string): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/target-release`);
  if (!res.ok) {
    throw new Error(`Failed to fetch dashboard releases. Status: ${res.status}`);
  }
  const data = await res.json();
  const releases: string[] = Array.isArray(data.release) ? data.release : [];
  return releases.includes(targetRelease);
}

/**
 * Trigger pre-check Jenkins jobs with mandatory dashboard initialization guard.
 */
export async function triggerPrecheckJobsAction(payload: TriggerPayload) {
  const { releases } = payload;
  if (!releases || releases.length === 0) {
    return { success: false, message: "No releases provided." };
  }

  // Enforce single releaseTarget
  const targets = Array.from(new Set(releases.map(r => r.releaseTarget)));
  if (targets.length !== 1) {
    return {
      success: false,
      message: "All selected models must share the same release target for pre-check submission."
    };
  }
  const releaseTarget = targets[0];

  // Dashboard initialization check
  try {
    const ready = await isDashboardInitializedForRelease(releaseTarget);
    if (!ready) {
      return {
        success: false,
        message: `Dashboard is not initialized for release: ${releaseTarget}. Please initialize the dashboard first.`
      };
    }
  } catch (e: any) {
    return { success: false, message: `Dashboard check failed: ${e.message}` };
  }

  const result = await triggerPrecheckJobs(payload);
  revalidatePath("/");
  return result;
}

/**
 * Trigger release Jenkins jobs with mandatory dashboard initialization guard.
 */
export async function triggerReleaseJobsAction(payload: TriggerPayload) {
  const { releases } = payload;
  if (!releases || releases.length === 0) {
    return { success: false, message: "No releases provided." };
  }

  const targets = Array.from(new Set(releases.map(r => r.releaseTarget)));
  if (targets.length !== 1) {
    return {
      success: false,
      message: "All selected models must share the same release target for release submission."
    };
  }
  const releaseTarget = targets[0];

  // Dashboard initialization check
  try {
    const ready = await isDashboardInitializedForRelease(releaseTarget);
    if (!ready) {
      return {
        success: false,
        message: `Dashboard is not initialized for release: ${releaseTarget}. Please initialize the dashboard first.`
      };
    }
  } catch (e: any) {
    return { success: false, message: `Dashboard check failed: ${e.message}` };
  }

  const result = await triggerJenkinsJobs(payload);
  revalidatePath("/");
  return result;
}

/**
 * Poll Jenkins job status (unchanged).
 */
export async function checkJenkinsJobStatusAction({ releaseId }: { releaseId: string }) {
  await checkJenkinsJobStatus({ releaseId });
  revalidatePath("/");
}

/**
 * Get the latest pre-check status for a set of model names within a release.
 */
export async function getPrecheckStatusForModels(modelNames: string[], releaseId: string) {
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
 * Fetch jobs by release ID and type.
 */
export async function getJobsByReleaseId(releaseId: string, type: JobType): Promise<IJob[]> {
  if (!releaseId) return [];
  await dbConnect();
  const jobs = await Job.find({ releaseId, type }).sort({ submittedAt: -1 }).lean();
  return JSON.parse(JSON.stringify(jobs));
}

/**
 * Dashboard initiation (unchanged).
 */
export async function initiateDashboardAction(
  selectedReleases: ModelRelease[],
  userName: string
) {
  const releaseTarget = selectedReleases[0]?.releaseTarget;
  if (!releaseTarget) {
    throw new Error("Release Target is missing.");
  }

  try {
    // Step 1: Fetch current release targets
    const getResponse = await fetch(`${API_BASE_URL}/target-release`);
    if (!getResponse.ok) {
      throw new Error(`Failed to fetch release targets. Status: ${getResponse.status}`);
    }
    const data = await getResponse.json();
    const existingReleases: string[] = data.release || [];
    if (!existingReleases.includes(releaseTarget)) {
      existingReleases.push(releaseTarget);
    }

    // Step 2: Update target-release list
    const setTargetPayload = {
      release: existingReleases,
      description: "New Release Initiation",
      userName
    };
    const setTargetResponse = await fetch(`${API_BASE_URL}/target-release`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(setTargetPayload)
    });
    if (!setTargetResponse.ok) {
      throw new Error(`Failed to set active release target. Status: ${setTargetResponse.status}`);
    }

    // Step 3: Populate models
    const modelsPayload = {
      release: releaseTarget,
      models: selectedReleases.map(model => ({
        name: model.modelName,
        owner: model.owner || userName,
        git_branch: model.branch
      }))
    };
    const populateDashboardResponse = await fetch(`${API_BASE_URL}/releases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(modelsPayload)
    });
    if (!populateDashboardResponse.ok) {
      throw new Error(`Failed to populate dashboard with models. Status: ${populateDashboardResponse.status}`);
    }

    revalidatePath("/");
    return { success: true, message: `New dashboard initiated for Release: ${releaseTarget}` };
  } catch (error: any) {
    console.error("Initiate Dashboard Action Error:", error);
    return { success: false, message: error.message };
  }
}