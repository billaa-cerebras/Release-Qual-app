import { ai } from '@/ai/plugins'; // Corrected: Import from the new plugins file
import { z } from 'zod';
import dbConnect from '@/lib/mongodb';
import Job from '@/models/Job';

export const getJobsFlow = ai.defineFlow(
  {
    name: 'getJobsFlow',
    inputSchema: z.object({ releaseId: z.string() }),
    outputSchema: z.any(),
  },
  async ({ releaseId }) => {
    await dbConnect();

    if (!releaseId) {
      return [];
    }

    const jobs = await Job.find({ releaseId }).sort({ createdAt: 'asc' });
    
    return JSON.parse(JSON.stringify(jobs));
  }
);