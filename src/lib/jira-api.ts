// src/lib/jira-api.ts
"use server";

import { ModelRelease } from "@/lib/schemas";

// Read all required Jira variables from environment
const JIRA_URL = process.env.JIRA_URL;
const JIRA_USER_EMAIL = process.env.ATLASSIAN_EMAIL;
// Use ATLASSIAN_API_TOKEN as requested
const JIRA_API_TOKEN = process.env.ATLASSIAN_API_TOKEN;
const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY;
const JIRA_EPIC_TYPE_NAME = process.env.JIRA_EPIC_ISSUE_TYPE_NAME || "Epic";
const JIRA_TASK_TYPE_NAME = process.env.JIRA_TASK_ISSUE_TYPE_NAME || "Task";
const JIRA_EPIC_LINK_FIELD = process.env.JIRA_EPIC_LINK_FIELD_ID; // e.g., customfield_10008
const JIRA_COMPONENTS_FIELD = process.env.JIRA_CUSTOM_FIELD_10048_ID; // customfield_10048
const JIRA_COMPONENTS_VALUE_ID = process.env.JIRA_CUSTOM_FIELD_10048_VALUE_ID; // 16185

/**
 * Creates the Basic Auth header for Jira using email and Atlassian API token.
 */
function getJiraAuthHeader(): string {
  if (!JIRA_USER_EMAIL || !JIRA_API_TOKEN) {
    throw new Error("Jira email (ATLASSIAN_EMAIL) or Atlassian API token (ATLASSIAN_API_TOKEN) is not configured.");
  }
  const auth = Buffer.from(`${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
  return `Basic ${auth}`;
}

/**
 * Creates the Atlassian Document Format (ADF) for a description.
 */
function createAdfDescription(text: string): any {
  // Create a richer description with formatted model details
  const paragraphs = text.trim().split('\n').filter(line => line.trim()).map(line => ({
    type: "paragraph",
    content: [{ type: "text", text: line.trim() }]
  }));

  return {
    type: "doc",
    version: 1,
    content: paragraphs.length > 0 ? paragraphs : [
      { // Ensure content is never empty
        type: "paragraph",
        content: [{ type: "text", text: "No description provided." }]
      }
    ]
  };
}

// --- USER SEARCH FUNCTION ---

// A simple in-memory cache to avoid searching for the same user multiple times
// during a single "Initialize Release" request.
const userCache = new Map<string, string | null>();

/**
 * Finds a Jira User's Account ID based on their name.
 * Returns null if the user is not found.
 */
export async function findJiraAccountId(ownerName: string): Promise<string | null> {
  if (!ownerName) return null;
  
  // Check cache first
  if (userCache.has(ownerName)) {
    return userCache.get(ownerName) || null;
  }

  if (!JIRA_URL) throw new Error("Jira URL is not configured.");

  // Use the 'query' parameter to search by name or email
  const searchUrl = `${JIRA_URL}/rest/api/3/user/search?query=${encodeURIComponent(ownerName)}`;

  try {
    const res = await fetch(searchUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": getJiraAuthHeader(),
      },
    });

    if (!res.ok) {
      console.warn(`Jira user search failed for "${ownerName}": ${res.status}`);
      userCache.set(ownerName, null); // Cache the failure (as null)
      return null;
    }

    const users: any[] = await res.json();
    
    // Find the best match. Jira query search can be broad.
    // We prioritize displayName, then email.
    const matchingUser = users.find(
      user => user.displayName?.toLowerCase() === ownerName.toLowerCase() || 
              user.emailAddress?.toLowerCase() === ownerName.toLowerCase()
    ) || users[0]; // Fallback to the first result if no exact match

    if (matchingUser && matchingUser.accountId) {
      console.log(`Found Jira Account ID for "${ownerName}": ${matchingUser.accountId}`);
      userCache.set(ownerName, matchingUser.accountId); // Cache the success
      return matchingUser.accountId;
    } else {
      console.warn(`Jira user search for "${ownerName}" found ${users.length} users, but none were a suitable match.`);
      userCache.set(ownerName, null);
      return null;
    }

  } catch (error: any) {
    console.error(`Error finding Jira user "${ownerName}": ${error.message}`);
    userCache.set(ownerName, null); // Cache the failure
    return null;
  }
}

/**
 * Creates the main Epic for the release.
 * +++ MODIFIED: Returns an object with both key and the full URL +++
 */
export async function createJiraEpic(releaseTarget: string): Promise<{ key: string, url: string }> {
  if (!JIRA_URL || !JIRA_PROJECT_KEY || !JIRA_COMPONENTS_FIELD || !JIRA_COMPONENTS_VALUE_ID) {
    throw new Error("Jira environment variables for Epic creation are missing.");
  }
  
  const payload = {
    fields: {
      project: { key: JIRA_PROJECT_KEY },
      summary: `Release Qualification - ${releaseTarget}`,
      description: createAdfDescription(`Tracking Epic for all model qualifications for ${releaseTarget}.`),
      issuetype: { name: JIRA_EPIC_TYPE_NAME },
      [JIRA_COMPONENTS_FIELD]: { id: JIRA_COMPONENTS_VALUE_ID } // Fixed: Object
    },
  };

  const res = await fetch(`${JIRA_URL}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": getJiraAuthHeader(),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("Jira Epic creation failed:", errorText);
    throw new Error(`Jira Epic creation failed: ${res.status} ${errorText}`);
  }

  const data = await res.json();
  const epicKey = data.key;
  // +++ NEW: Construct the URL here, where JIRA_URL is defined +++
  const epicUrl = `${JIRA_URL}/browse/${epicKey}`;
  
  console.log(`Created Epic: ${epicKey}`);
  return { key: epicKey, url: epicUrl }; // <-- Return both
}

/**
 * Creates a single Task linked to the parent Epic, optionally assigning it.
 * Returns the Jira issue key (e.g., "SW-12346") on success.
 */
export async function createJiraTask(model: ModelRelease, epicKey: string, accountId: string | null): Promise<string> {
  if (!JIRA_URL || !JIRA_PROJECT_KEY || !JIRA_EPIC_LINK_FIELD || !JIRA_COMPONENTS_FIELD || !JIRA_COMPONENTS_VALUE_ID) {
    throw new Error("Jira environment variables for Task creation are missing.");
  }

  const summary = `[${model.releaseTarget}] Qualify Model: ${model.modelName}`;
  const descriptionText = `
    Model: ${model.modelName}
    Owner: ${model.owner}
    Branch: ${model.branch}
    MIQ Branch: ${model.miqBranch || 'N/A'}
    App-Tag: ${model.appTag}
    Usernode: ${model.usernoode}
    Multibox: ${model.multibox}
    Labels: ${model.labels}
    Monitor Link: ${model.monitorLink || 'N/A'}
  `;

  const payload = {
    fields: {
      project: { key: JIRA_PROJECT_KEY },
      summary: summary,
      description: createAdfDescription(descriptionText.trim()),
      issuetype: { name: JIRA_TASK_TYPE_NAME },
      [JIRA_EPIC_LINK_FIELD]: epicKey, // Links the Task to the Epic
      [JIRA_COMPONENTS_FIELD]: { id: JIRA_COMPONENTS_VALUE_ID }, // Add required "SW-Components"
      ...(accountId && { assignee: { accountId: accountId } })
    },
  };

  const res = await fetch(`${JIRA_URL}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": getJiraAuthHeader(),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`Jira Task creation failed for ${model.modelName}:`, errorText);
    throw new Error(`Jira Task creation failed for ${model.modelName}: ${res.status} ${errorText}`);
  }

  const data = await res.json();
  console.log(`Created Task: ${data.key} for model ${model.modelName}, assigned to ${accountId || 'unassigned'}`);
  return data.key;
}