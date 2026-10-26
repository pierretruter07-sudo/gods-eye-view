/**
 * Structured, centralised logger for God's Eye View server.
 * Attempts to load pino for production-grade NDJSON output; falls back to a
 * built-in implementation with the same API when pino is not installed.
 *
 * Usage:
 *   import { logger } from './logger.js';
 *   logger.info({ event: 'sign_in', user: 'alice' }, 'User signed in');
 *   logger.warn({ event: 'auth_failure' }, 'Bad credentials');
 *   logger.error({ err }, 'Unhandled error');
 */

function makeFallbackLogger(bindings = {}) {
  const LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };
  const minLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

  function write(levelNum, levelName, args) {
    if (levelNum < minLevel) return;
    const [first, ...rest] = args;
    let obj = bindings;
    let msg = '';
    if (typeof first === 'string') {
      msg = first;
    } else if (first && typeof first === 'object') {
      const { err, ...fields } = first;
      obj = { ...bindings, ...fields };
      if (err instanceof Error) {
        obj.err = { message: err.message, stack: err.stack, type: err.constructor.name };
      }
      msg = typeof rest[0] === 'string' ? rest[0] : '';
    }
    const line = JSON.stringify({ level: levelNum, levelName, time: Date.now(), ...obj, msg });
    (levelNum >= LEVELS.error ? process.stderr : process.stdout).write(line + '\n');
  }

  return {
    trace: (...a) => write(10, 'trace', a),
    debug: (...a) => write(20, 'debug', a),
    info:  (...a) => write(30, 'info',  a),
    warn:  (...a) => write(40, 'warn',  a),
    error: (...a) => write(50, 'error', a),
    fatal: (...a) => write(60, 'fatal', a),
    child: (extra) => makeFallbackLogger({ ...bindings, ...extra }),
  };
}

// Attempt to load pino for structured NDJSON logging; use built-in fallback otherwise.
let _logger;
try {
  const pinoModule = await import('pino');
  const pino = pinoModule.default ?? pinoModule;
  _logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
} catch {
  _logger = makeFallbackLogger();
}

export const logger = _logger;
