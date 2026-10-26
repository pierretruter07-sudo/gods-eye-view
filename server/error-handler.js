/**
 * Central error handling for God's Eye View server.
 *
 * - Logs full error detail (stack, context) via the structured logger.
 * - Returns only a generic message to callers so internal detail is never leaked.
 * - Intercepts process-level uncaught exceptions and unhandled rejections.
 */
import { logger } from './logger.js';

/**
 * Express/Connect-style four-argument error-handling middleware.
 * Must be registered AFTER all normal routes:
 *   server.middlewares.use(errorHandler);
 *
 * @param {Error} err
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {Function} next
 */
export function errorHandler(err, req, res, next) {
  const status = err?.status ?? err?.statusCode ?? 500;
  logger.error(
    { event: 'request_error', path: req?.url, method: req?.method, status, err },
    'Unhandled request error',
  );
  if (res.headersSent) return next(err);
  res.writeHead(status < 600 ? status : 500, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'An unexpected error occurred. Please try again later.' }));
}

/**
 * Register process-level handlers so uncaught errors are logged centrally
 * rather than crashing silently or printing raw stack traces.
 */
export function registerProcessErrorHandlers() {
  process.on('uncaughtException', (err) => {
    logger.error({ event: 'uncaught_exception', err }, 'Uncaught exception — shutting down');
    process.exitCode = 1;
  });

  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logger.error({ event: 'unhandled_rejection', err }, 'Unhandled promise rejection');
  });
}
