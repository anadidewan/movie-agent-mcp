import { z } from 'zod';

export const GetMovieDetailsSchema = z.object({
  movie_id: z.number().int(),
});

export type GetMovieDetailsInput = z.infer<typeof GetMovieDetailsSchema>;
