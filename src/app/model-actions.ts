"use server";

import dbConnect from "@/lib/mongodb";
import Model from "@/models/Model";
import { revalidatePath } from "next/cache";

/**
 * Fetches all models from the database.
 * @returns A promise that resolves to an array of model documents.
 */
export async function getModels() {
  await dbConnect();
  const models = await Model.find({}).sort({ name: 1 });
  // Convert to plain objects to avoid serialization issues
  return JSON.parse(JSON.stringify(models));
}

/**
 * Adds a new model to the database if it doesn't already exist.
 * @param name - The name of the model to add.
 * @returns The created or existing model document.
 */
export async function addModel(name: string) {
  await dbConnect();
  
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new Error("Model name cannot be empty.");
  }

  const trimmedName = name.trim();

  // Find existing model or create a new one (upsert)
  const newModel = await Model.findOneAndUpdate(
    { name: trimmedName },
    { $setOnInsert: { name: trimmedName } },
    { new: true, upsert: true, runValidators: true }
  );

  // Revalidate the path to ensure the UI can fetch the latest list
  revalidatePath('/');

  return JSON.parse(JSON.stringify(newModel));
}