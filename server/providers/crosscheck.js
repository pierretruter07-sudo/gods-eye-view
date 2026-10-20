import { createCrossCheckHandler } from '../../crosscheck/server/handler.js';

/**
 * CrossCheck inside God's Eye View (pitch build): its API under
 * /api/crosscheck and its page at /crosscheck/. CrossCheck's own code lives
 * in crosscheck/ and never imports from God's Eye View.
 */
export function crossCheckPlugin(options = {}) {
  let handler = null;
  const install = (server) => {
    server.middlewares.use((req, res, next) => {
      const pathName = (req.url || '').split('?')[0];
      if (pathName === '/crosscheck' || pathName === '/crosscheck/') {
        res.statusCode = 302;
        res.setHeader('Location', '/crosscheck/app/');
        return res.end();
      }
      if (!pathName.startsWith('/api/crosscheck')) return next();
      handler ??= createCrossCheckHandler(options);
      return handler(req, res, next);
    });
  };
  return {
    name: 'crosscheck',
    configureServer: install,
    configurePreviewServer: install,
  };
}
