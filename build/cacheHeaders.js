/**
 * @file Cache policy for files served by the production preview server.
 *
 * Content-hashed build output never changes, so browsers keep it for a year.
 * Cesium's runtime and the 3D models keep their names across builds, so they
 * get shorter lifetimes. The page itself always revalidates, so a new deploy
 * is picked up on the next load. API responses set their own headers.
 * @module build/cacheHeaders
 */

/** Cache-Control for a request path, or null to leave the response as is. */
export function cacheControlFor(path) {
  if (path.startsWith('/api/')) return null;
  if (path.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
  if (path.startsWith('/cesium/')) return 'public, max-age=3600';
  if (path.startsWith('/models/'))
    return 'public, max-age=86400, stale-while-revalidate=604800';
  if (path === '/' || path.endsWith('.html')) return 'no-cache';
  return null;
}

/** Vite plugin: apply `cacheControlFor` in `vite preview` (production). */
export function staticCachePlugin() {
  return {
    name: 'gev-static-cache',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const value = cacheControlFor((req.url || '').split('?')[0]);
        if (value) res.setHeader('Cache-Control', value);
        next();
      });
    },
  };
}

/**
 * Let classic scripts a plugin injects into index.html download without
 * blocking the first paint. Deferred scripts still run in document order,
 * before the app's module script, so the Cesium global is ready in time.
 */
export function deferInjectedScripts(plugin) {
  if (Array.isArray(plugin)) return plugin.map(deferInjectedScripts);
  const hook = plugin?.transformIndexHtml;
  if (!hook) return plugin;
  const fn = typeof hook === 'function' ? hook : hook.handler;
  async function handler(...args) {
    const result = await fn.apply(this, args);
    const tags = Array.isArray(result) ? result : result?.tags;
    for (const tag of tags || []) {
      if (tag.tag === 'script' && tag.attrs?.src && !tag.attrs.type)
        tag.attrs.defer = true;
    }
    return result;
  }
  return {
    ...plugin,
    transformIndexHtml:
      typeof hook === 'function' ? handler : { ...hook, handler },
  };
}
