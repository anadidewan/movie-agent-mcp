import 'dotenv/config';
import { logger } from './lib/logger';
import { createApp } from './app';

/**
 * Entry point — validates environment, starts the HTTP server, and registers
 * graceful-shutdown handlers for SIGTERM and SIGINT.
 *
 * Requirements: 11.1, 11.4
 */

// ── Environment validation ────────────────────────────────────────────────────
// The TMDB API key must be present before any request can be served.
// Fail fast with a fatal log and a non-zero exit code (Requirement 11.4).
if (!process.env.TMDB_API_KEY) {
  logger.fatal('TMDB_API_KEY environment variable is not set. Exiting.');
  process.exit(1);
}

const PORT = parseInt(process.env.PORT ?? '3000', 10);

// ── Server startup ────────────────────────────────────────────────────────────
const app = createApp();

const server = app.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV ?? 'production' }, 'Server listening');
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// Stop accepting new connections, wait for in-flight requests to finish,
// then exit cleanly.
function shutdown(signal: string): void {
  logger.info({ signal }, 'Shutdown signal received — closing server');
  server.close(() => {
    logger.info('Server closed. Exiting.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
