import { z } from 'zod';

export const GetTrendingSchema = z.object({
  window: z.enum(['day', 'week']),
});

export type GetTrendingInput = z.infer<typeof GetTrendingSchema>;
