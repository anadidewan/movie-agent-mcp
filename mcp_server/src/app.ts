import express from 'express';
import { httpLogger } from './lib/logger';
import { methodGuard } from './middleware/methodGuard';
import { contentTypeGuard } from './middleware/contentTypeGuard';
import { errorHandler } from './middleware/errorHandler';
import healthRouter from './routes/health';
import toolsDiscoveryRouter from './routes/tools';
import toolHandlersRouter from './routes/toolHandlers';

/**
 * Express app factory.
 *
 * Returns a fully configured Express application without calling `listen`,
 * which keeps the app importable and testable in integration tests.
 *
 * Middleware / route registration order:
 *   1. express.json()          — parse JSON request bodies
 *   2. httpLogger              — pino-http structured request logging (Req 12.1)
 *   3. methodGuard             — 405 for non-POST on /tools/* (Req 10.7)
 *   4. contentTypeGuard        — 415 for non-JSON POST bodies (Req 10.8)
 *   5. GET  /health            — health check (Req 7.1)
 *   6. GET  /tools             — tool discovery (Req 8.1)
 *   7. POST /tools/:tool       — tool dispatcher (Req 1.1, 2.1, 3.1, 4.1, 5.1, 6.1)
 *   8. errorHandler            — global error serializer (Req 10.1–10.9)
 *
 * Requirements: 7.1, 8.1, 10.7, 10.8, 12.1
 */
export function createApp(): express.Application {
  const app = express();

  // ── Body parsing ──────────────────────────────────────────────────────────
  app.use(express.json());

  // ── Structured request logging (pino-http) ────────────────────────────────
  app.use(httpLogger);

  // ── Method + Content-Type guards scoped to /tools/:tool ─────────────────
  // methodGuard runs for ALL methods on /tools/* so that wrong-method
  // requests (e.g. GET /tools/search_movies) are rejected with 405 before
  // any routing logic executes. (Req 10.7)
  // contentTypeGuard only needs to run for POST requests. (Req 10.8)
  app.use('/tools/*', methodGuard);
  app.post('/tools/*', contentTypeGuard);

  // ── Health check ──────────────────────────────────────────────────────────
  app.use('/health', healthRouter);

  // ── Tool discovery (GET /tools) ───────────────────────────────────────────
  app.use('/tools', toolsDiscoveryRouter);

  // ── Tool dispatcher (POST /tools/:tool) ──────────────────────────────────
  app.use('/tools', toolHandlersRouter);

  // ── Global error handler (must be last) ──────────────────────────────────
  app.use(errorHandler);

  return app;
}
