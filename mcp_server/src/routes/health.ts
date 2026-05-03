import { Router, Request, Response, IRouter } from 'express';

/**
 * Health check router.
 * GET / → { status: "ok" } with HTTP 200.
 * Makes no outbound calls to the TMDB API.
 *
 * Requirements: 7.1, 7.2
 */
const router: IRouter = Router();

router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

export default router;
