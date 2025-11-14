// src/models/Release.ts
import mongoose, { Document, Schema } from 'mongoose';

// This interface defines the data we store for each release
export interface IRelease extends Document {
  releaseId: string;      // e.g., "r1111"
  jenkinsJobUrl?: string; // e.g., "http://jenkins.../job/csx-inference-release-qual-r1111"
  jenkinsJobName?: string;// e.g., "csx-inference-release-qual-r1111"
  jiraEpicKey?: string;   // e.g., "SW-12345"
  jiraEpicUrl?: string;   // e.g., "https://cerebras.atlassian.net/browse/SW-12345"
}

const ReleaseSchema: Schema = new Schema({
  releaseId: { type: String, required: true, unique: true, index: true },
  jenkinsJobUrl: { type: String },
  jenkinsJobName: { type: String },
  jiraEpicKey: { type: String },
  jiraEpicUrl: { type: String },
}, { timestamps: true });

export default mongoose.models.Release || mongoose.model<IRelease>('Release', ReleaseSchema);