import { z } from 'zod';

export const SearchMoviesSchema = z.object({
  query: z.string().min(1),
  year: z.number().int().optional(),
});

export type SearchMoviesInput = z.infer<typeof SearchMoviesSchema>;
