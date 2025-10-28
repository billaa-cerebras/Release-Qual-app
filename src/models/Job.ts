import mongoose, { Document, Schema, models } from 'mongoose';

export type JobStatus = 'QUEUED' | 'BUILDING' | 'SUCCESS' | 'FAILURE' | 'ABORTED' | 'POLL_ERROR' | 'UNKNOWN';
export type PrecheckStatus = 'NOT_STARTED' | 'PENDING' | 'SUCCESS' | 'FAILURE' | 'BUILDING' | 'UNKNOWN';
export type JobType = 'PRECHECK' | 'RELEASE';

export interface IJob extends Document {
  releaseId: string;
  modelName: string;
  
  // Release Job Fields
  status: JobStatus;
  jenkinsUrl?: string;
  message?: string;

  // Pre-check Fields
  precheckStatus: PrecheckStatus;
  precheckResult?: string;

  // Metadata
  type: JobType;
  submittedAt: Date;
}

const JobSchema: Schema = new Schema({
  releaseId: { type: String, required: true, index: true },
  modelName: { type: String, required: true },
  
  status: { type: String, enum: ['QUEUED', 'BUILDING', 'SUCCESS', 'FAILURE', 'ABORTED', 'POLL_ERROR', 'UNKNOWN'], default: 'QUEUED' },
  jenkinsUrl: { type: String },
  message: { type: String },

  precheckStatus: { type: String, enum: ['NOT_STARTED', 'PENDING', 'SUCCESS', 'FAILURE', 'BUILDING', 'UNKNOWN'], default: 'NOT_STARTED' },
  precheckResult: { type: String },

  type: { type: String, enum: ['PRECHECK', 'RELEASE'], required: true },
  submittedAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
});

export default models.Job || mongoose.model<IJob>('Job', JobSchema);