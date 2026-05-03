import { z } from 'zod';

export const DiscoverMoviesSchema = z.object({
  genre: z.string().optional(),
  min_rating: z.number().min(0).max(10).optional(),
  year_from: z.number().int().optional(),
  year_to: z.number().int().optional(),
  keywords: z.string().optional(),
});

export type DiscoverMoviesInput = z.infer<typeof DiscoverMoviesSchema>;
