// src/lib/dashboard-api.ts
import { ModelRelease } from "@/lib/schemas";

const API_BASE_URL = process.env.DASHBOARD_API_BASE_URL;

if (!API_BASE_URL) {
  console.warn("DASHBOARD_API_BASE_URL environment variable is not set. Dashboard features may fail.");
}

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
 * Populates the dashboard with models for a specific release target.
 */
export async function populateModels(releaseTarget: string, models: ModelRelease[], userName: string): Promise<void> {
  if (!API_BASE_URL) throw new Error("Dashboard API URL is not configured.");
  const modelsPayload = {
    release: releaseTarget,
    models: models.map(model => ({
      name: model.modelName,
      owner: model.owner || userName, // Use provided owner or default to userName
      git_branch: model.branch
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