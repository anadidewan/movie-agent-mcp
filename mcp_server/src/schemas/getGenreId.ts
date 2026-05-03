import { z } from 'zod';

export const GetGenreIdSchema = z.object({
  name: z.string().min(1),
});

export type GetGenreIdInput = z.infer<typeof GetGenreIdSchema>;
