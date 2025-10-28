// src/models/Job.ts (or update existing)
import mongoose, { Document, Schema } from 'mongoose';

export type JobType = "RELEASE" | "PRECHECK";
export type JobStatus = "QUEUED" | "BUILDING" | "SUCCESS" | "FAILURE" | "ABORTED" | "UNKNOWN" | "POLL_ERROR";
export type PrecheckStatus = "PENDING" | "BUILDING" | "SUCCESS" | "FAILURE" | "NOT_STARTED"; // Assuming from submission-details

export interface IJob extends Document {
  releaseId: string;
  modelName: string;
  jenkinsUrl: string;
  jenkinsJobName?: string; // <-- Added field
  type: JobType;
  status: JobStatus; // For RELEASE type
  precheckStatus: PrecheckStatus; // For PRECHECK type
  message?: string; // For RELEASE type
  precheckResult?: string; // For PRECHECK type
  submittedAt: Date;
}

const JobSchema: Schema = new Schema({
  releaseId: { type: String, required: true, index: true },
  modelName: { type: String, required: true },
  jenkinsUrl: { type: String },
  jenkinsJobName: { type: String }, // <-- Added field
  type: { type: String, enum: ["RELEASE", "PRECHECK"], required: true },
  status: { type: String, enum: ["QUEUED", "BUILDING", "SUCCESS", "FAILURE", "ABORTED", "UNKNOWN", "POLL_ERROR"] },
  precheckStatus: { type: String, enum: ["PENDING", "BUILDING", "SUCCESS", "FAILURE", "NOT_STARTED"] },
  message: { type: String },
  precheckResult: { type: String },
  submittedAt: { type: Date, default: Date.now },
}, { timestamps: true }); // Adding timestamps might be useful

export default mongoose.models.Job || mongoose.model<IJob>('Job', JobSchema);