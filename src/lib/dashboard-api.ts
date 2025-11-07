// src/lib/dashboard-api.ts
import { ModelRelease } from "@/lib/schemas";

const API_BASE_URL = process.env.DASHBOARD_API_BASE_URL;

if (!API_BASE_URL) {
  console.warn("DASHBOARD_API_BASE_URL environment variable is not set. Dashboard features may fail.");
}

// Define the shape of the model data used by the dashboard API
type DashboardModel = {
  name: string;
  owner: string;
  git_branch: string;
  // Add any other fields your API might expect, e.g., usernoode
  usernoode?: string; 
};

/**
 * Fetches the current list of target releases from the dashboard API.
 */
export async function getTargetReleases(): Promise<string[]> {
  if (!API_BASE_URL) throw new Error("Dashboard API URL is not configured.");
  const res = await fetch(`${API_BASE_URL}/target-release`);
  if (!res.ok) {
    throw new Error(`Failed to fetch dashboard target releases. Status: ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data.release) ? data.release : [];
}

/**
 * Updates the list of target releases on the dashboard API.
 */
export async function setTargetReleases(releases: string[], description: string, userName: string): Promise<void> {
  if (!API_BASE_URL) throw new Error("Dashboard API URL is not configured.");
  const payload = { release: releases, description, userName };
  const res = await fetch(`${API_BASE_URL}/target-release`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    throw new Error(`Failed to set active release target. Status: ${res.status}`);
  }
}

/**
 * Populates the dashboard with models for a specific release target. (POST for new)
 */
export async function populateModels(releaseTarget: string, models: ModelRelease[], userName: string): Promise<void> {
  if (!API_BASE_URL) throw new Error("Dashboard API URL is not configured.");
  const modelsPayload = {
    release: releaseTarget,
    models: models.map(model => ({
      name: model.modelName,
      owner: model.owner || userName,
      git_branch: model.branch,
      usernoode: model.usernoode // Include usernoode
    }))
  };
  const res = await fetch(`${API_BASE_URL}/releases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(modelsPayload)
  });
  if (!res.ok) {
    throw new Error(`Failed to populate dashboard with models. Status: ${res.status}`);
  }
}

/**
 * Checks if a specific release target is initialized in the dashboard.
 */
export async function checkDashboardInitialization(targetRelease: string): Promise<boolean> {
  const releases = await getTargetReleases();
  return releases.includes(targetRelease);
}


// +++ IMPLEMENTED FUNCTION +++
/**
 * Edits/Updates the models for an existing release target on the dashboard.
 * Implements the GET-then-PUT logic.
 */
export async function editDashboardModels(releaseTarget: string, modelsFromForm: ModelRelease[], userName: string): Promise<void> {
  if (!API_BASE_URL) throw new Error("Dashboard API URL is not configured.");

  // --- Step 1: GET existing models ---
  const getUrl = `${API_BASE_URL}/releases?releaseName=${releaseTarget}`;
  let existingModels: DashboardModel[] = [];
  try {
    const res = await fetch(getUrl);
    if (!res.ok) {
      throw new Error(`Failed to get existing models for ${releaseTarget}. Status: ${res.status}`);
    }
    existingModels = await res.json();
  } catch (error: any) {
    console.error(`Error fetching existing dashboard models: ${error.message}`);
    // If we can't get existing models, we risk overwriting.
    // Depending on API behavior, you might want to stop or proceed with caution.
    // For this logic, we'll assume we should only proceed if we can merge.
    throw new Error(`Failed to fetch existing models: ${error.message}`);
  }

  // --- Step 2: Merge lists ---
  // Create a map to handle overrides. Models from the form (new or modified) will
  // overwrite any existing models with the same name.
  const modelMap = new Map<string, DashboardModel>();

  // 1. Add all existing models to the map
  for (const model of existingModels) {
    modelMap.set(model.name, model);
  }

  // 2. Add/Overwrite with models from the form
  // (Assuming modelsFromForm contains *only* the models selected in the UI)
  for (const model of modelsFromForm) {
    modelMap.set(model.modelName, {
      name: model.modelName,
      owner: model.owner || userName, // Use form owner or default
      git_branch: model.branch,
      usernoode: model.usernoode // Include usernoode
    });
  }

  // 3. Convert the map back to the final list
  const finalModelList = Array.from(modelMap.values());

  // --- Step 3: PUT the complete new list ---
  const putUrl = `${API_BASE_URL}/releases`;
  const putPayload = {
    release: releaseTarget,
    models: finalModelList
  };

  try {
    const res = await fetch(putUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(putPayload)
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to edit dashboard models. Status: ${res.status}. Response: ${errorText}`);
    }
    
    console.log(`Successfully edited dashboard for ${releaseTarget}.`);

  } catch (error: any) {
    console.error(`Error editing dashboard models: ${error.message}`);
    throw error; // Re-throw to be caught by the server action
  }
}