import { fileURLToPath } from 'node:url';
import cesium from 'vite-plugin-cesium';
import { deferInjectedScripts, staticCachePlugin } from './cacheHeaders.js';

const page = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));

/** The pages built. */
export const BUILD_INPUTS = Object.freeze({
  main: page('index.html'),
});

/** Build browser assets with explicit inputs; never load environment or providers. */
export function createBrowserViteConfig({
  plugins = [],
  publicDir,
  googleApiKey,
  cesiumToken,
  buildId,
  host = 'localhost',
  port = 4173,
  command,
} = {}) {
  return {
    plugins: [deferInjectedScripts(cesium()), ...plugins, staticCachePlugin()],
    ...(publicDir === undefined ? {} : { publicDir }),
    // A production build must not clean the dependency cache a running dev
    // server is still serving optimized module URLs from.
    ...(command === 'build' ? { cacheDir: 'node_modules/.vite-build' } : {}),
    // The production build drops log/info/debug chatter (feed updates,
    // narration lines, quality steps); warnings and errors stay.
    ...(command === 'build'
      ? { esbuild: { pure: ['console.log', 'console.info', 'console.debug'] } }
      : {}),
    optimizeDeps: {
      // First reached through a dynamic import. Pre-bundle at startup so first
      // use cannot invalidate already-transformed URLs with Vite's
      // "Outdated Optimize Dep" 504 response.
      include: ['egm96-universal'],
    },
    server: {
      host: host || 'localhost',
      port: parseInt(port, 10) || 4173,
      allowedHosts:
        host === '0.0.0.0' || host === '::'
          ? true
          : ['localhost', '127.0.0.1', '.local'],
      fs: {
        deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/ENVIRONMENT'],
      },
      // Never framed (clickjacking).
      headers: {
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "frame-ancestors 'none'",
      },
    },
    define: {
      'import.meta.env.GOOGLE_MAPS_API_KEY': JSON.stringify(googleApiKey),
      'import.meta.env.CESIUM_ION_TOKEN': JSON.stringify(cesiumToken),
      // Not a credential: the commit/date identity shown in the app.
      'import.meta.env.GEV_BUILD': JSON.stringify(buildId),
    },
    build: {
      chunkSizeWarningLimit: 1500,
      rollupOptions: { input: { ...BUILD_INPUTS } },
    },
  };
}
