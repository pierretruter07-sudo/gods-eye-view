import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { createBrowserViteConfig } from '../../build/vite.js';
import { localProviderPlugins } from '../providers/local.js';
import { apiNotFoundPlugin } from './api-not-found.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

/** `<short commit>[-dirty] · <UTC date>`, or GEV_BUILD when set by a pipeline. */
export function buildIdentity(cwd = root) {
  if (process.env.GEV_BUILD) return process.env.GEV_BUILD;
  const date = new Date().toISOString().slice(0, 10);
  try {
    const git = (args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const dirty = git(['status', '--porcelain', '--untracked-files=no']) ? '-dirty' : '';
    return `${git(['rev-parse', '--short=7', 'HEAD'])}${dirty} · ${date}`;
  } catch {
    return `unversioned · ${date}`;
  }
}

/** Load this checkout's configuration and attach its local provider middleware. */
export default defineConfig(({ command, mode }) => {
  const loaded = loadEnv(mode, root, '');
  for (const [key, value] of Object.entries(loaded)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return createBrowserViteConfig({
    plugins: [...localProviderPlugins(), apiNotFoundPlugin()],
    googleApiKey: process.env.GOOGLE_MAPS_API_KEY,
    cesiumToken: process.env.CESIUM_ION_TOKEN,
    buildId: buildIdentity(),
    host: process.env.HOST,
    port: process.env.PORT,
    command,
  });
});
