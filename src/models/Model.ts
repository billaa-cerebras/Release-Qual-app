import mongoose, { Document, Schema, models } from 'mongoose';

export interface IModel extends Document {
  name: string;
}

const ModelSchema: Schema = new Schema({
  name: {
    type: String,
    required: [true, 'Model name is required.'],
    unique: true,
    trim: true,
  },
}, {
  timestamps: true,
});

// Avoid recompiling the model if it already exists
export default models.Model || mongoose.model<IModel>('Model', ModelSchema);