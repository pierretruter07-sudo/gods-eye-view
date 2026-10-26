/**
 * Authentication middleware for the Vite dev/preview server.
 * Protects all /api routes with JWT bearer-token verification.
 * Public endpoints: POST /api/auth/login, GET /api/auth/logout.
 */
import { jwt } from './jwt.js';
import { totp } from './totp.js';
import { requireRole } from './roles.js';
import { logger } from '../logger.js';
import {
  errorHandler,
  registerProcessErrorHandlers,
} from '../error-handler.js';

// Register process-level error handlers once at module load time.
registerProcessErrorHandlers();

const PUBLIC_PATHS = ['/api/auth/login', '/api/auth/logout'];

/**
 * Parse the Authorization header or falling back to the `token` cookie.
 * Returns the raw JWT string or null.
 */
function extractToken(req) {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  const cookie = req.headers['cookie'] ?? '';
  const match = cookie.match(/(?:^|;\s*)token=([^;]+)/);
  return match ? match[1] : null;
}

/**
 * Vite plugin that adds JWT authentication to every /api request.
 * Routes listed in PUBLIC_PATHS are always accessible.
 */
export function authPlugin() {
  const install = (server) => {
    // Login handler — issues a signed JWT.
    server.middlewares.use('/api/auth/login', (req, res, next) => {
      if (req.method !== 'POST') return next();
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const { username, password, otp } = parsed;
          // Demo credential check; replace with a real user store.
          const totpSecret = process.env.TOTP_SECRET;
          const totpOk = totpSecret ? totp.verify(totpSecret, otp ?? '') : true;
          if (
            username === (process.env.ADMIN_USER ?? 'admin') &&
            password === (process.env.ADMIN_PASS ?? 'changeme') &&
            totpOk
          ) {
            const token = jwt.sign(
              { sub: username, role: 'admin' },
              undefined,
              { expiresIn: 3600 },
            );
            logger.info(
              { event: 'sign_in', user: username, role: 'admin' },
              'Successful sign-in',
            );
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ token }));
          } else {
            logger.warn(
              { event: 'sign_in_failure', user: username },
              'Failed sign-in attempt',
            );
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid credentials' }));
          }
        } catch (err) {
          logger.error(
            { event: 'sign_in_error', err },
            'Error processing login',
          );
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Bad request' }));
        }
      });
    });

    // Guard all other /api routes only when credentials are configured.
    const authEnabled = !!(process.env.ADMIN_PASS || process.env.ADMIN_USER);
    server.middlewares.use('/api', (req, res, next) => {
      if (!authEnabled) return next();
      if (
        PUBLIC_PATHS.some((p) => req.url === p || req.url?.startsWith(p + '?'))
      )
        return next();

      const raw = extractToken(req);
      if (!raw) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
      }

      try {
        const payload = jwt.verify(raw);
        req.user = payload;
        // Enforce minimum role for all API access.
        requireRole(payload, 'user');
        next();
      } catch (err) {
        logger.warn(
          { event: 'auth_error', path: req.url, err: err.message },
          'API authentication failure',
        );
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message ?? 'Unauthorized' }));
      }
    });
  };

  const installWithErrorHandler = (server) => {
    install(server);
    // Attach the central error-handling middleware after all routes.
    server.middlewares.use(errorHandler);
  };

  return {
    name: 'auth-plugin',
    configureServer: installWithErrorHandler,
    configurePreviewServer: installWithErrorHandler,
  };
}
