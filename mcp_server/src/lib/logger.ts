import pino from 'pino';
import pinoHttp from 'pino-http';

const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = pino(
  {
    level: 'info',
    redact: {
      paths: ['req.headers.authorization'],
      censor: '[REDACTED]',
    },
  },
  isDevelopment
    ? pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      })
    : undefined,
);

export const httpLogger = pinoHttp({
  logger,
  // Redact the Authorization header at the pino-http level as well
  redact: {
    paths: ['req.headers.authorization'],
    censor: '[REDACTED]',
  },
  // Do not log request body — may contain sensitive data (Requirement 12.3)
  serializers: {
    req(req) {
      return {
        method: req.method,
        url: req.url,
        // Intentionally omit req.body
      };
    },
  },
});
