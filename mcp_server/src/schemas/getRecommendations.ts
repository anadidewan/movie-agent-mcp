import { z } from 'zod';

export const GetRecommendationsSchema = z.object({
  movie_id: z.number().int(),
});

export type GetRecommendationsInput = z.infer<typeof GetRecommendationsSchema>;
