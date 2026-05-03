import { z } from 'zod';

export const GetMovieIdSchema = z.object({
  query: z.string().min(1),
  year: z.number().int().optional(),
});

export type GetMovieIdInput = z.infer<typeof GetMovieIdSchema>;
