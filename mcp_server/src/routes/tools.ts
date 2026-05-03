import { Router, Request, Response, IRouter } from 'express';
import { toolRegistry } from '../registry/toolRegistry';

/**
 * Tools discovery router.
 * GET / → { tools: toolRegistry } with HTTP 200.
 * Returns the full Tool_Registry with all six tools.
 * Makes no outbound calls to the TMDB API.
 *
 * Requirements: 8.1, 8.2, 8.3
 */
const router: IRouter = Router();

router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({ tools: toolRegistry });
});

export default router;
