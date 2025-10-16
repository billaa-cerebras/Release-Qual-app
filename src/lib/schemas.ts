import * as z from "zod";

export const modelReleaseSchema = z.object({
  selected: z.boolean().optional(),
  modelName: z.string({ required_error: "Model name is required." }).min(1, "Model name is required."),
  owner: z.string().optional(),
  cs: z.string().optional(),
  branch: z.string().min(1, "Branch is required."),
  appTag: z.string().min(1, "App-Tag is required."),
  multibox: z.string().min(1, 'MULTIBOX is required'),
  miqBranch: z.string().optional(),
  profile: z.string(),
  labels: z.string().min(1, "Labels are required."),
  releaseTarget: z
    .string()
    .regex(/^r\d{4}$/, 'Must be in the format rXXXX (e.g., r2542)'),
  monitorLink: z.string().optional(),
}).refine(data => data.miqBranch || data.profile, {
    message: "Either MIQ Branch or Profile is required.",
    path: ["miqBranch"],
});

export type ModelRelease = z.infer<typeof modelReleaseSchema>;

// Define the schema for the array of releases.
export const TriggerJenkinsJobsInputSchema = z.array(modelReleaseSchema);
export type TriggerJenkinsJobsInput = z.infer<typeof TriggerJenkinsJobsInputSchema>;

// Define the output schema for the flow.
export const TriggerJenkinsJobsOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  details: z.array(z.object({
    modelName: z.string(),
    status: z.string(), // SUCCESS, FAILURE, QUEUED
    message: z.string(),
    url: z.string().optional(), // This will be the queue URL
  })),
});
export type TriggerJenkinsJobsOutput = z.infer<typeof TriggerJenkinsJobsOutputSchema>;
