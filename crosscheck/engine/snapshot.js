/**
 * @file Builds the in-memory snapshot CrossCheck assesses, from any list of
 * file entries (a folder on disk, a zip archive): which files exist, their
 * sizes, and the text of the text files worth reading. Limits keep a huge or
 * hostile upload from exhausting memory.
 * Pure: the caller supplies the entries.
 * @module crosscheck/engine/snapshot
 */
import { isTextPath } from './signals.js';

export const SNAPSHOT_LIMITS = Object.freeze({
  /** Files kept (beyond this, the rest are counted but not listed). */
  maxFiles: 25_000,
  /** A text file larger than this is listed but not read. */
  maxTextBytes: 512 * 1024,
  /** Total text read across the snapshot. */
  maxTotalTextBytes: 40 * 1024 * 1024,
});

const SKIP = /(^|\/)(\.git|\.claude|node_modules|\.venv|venv|__pycache__|\.next|\.cache|\.vite[\w-]*)(\/|$)/;

/** Normalise a path: forward slashes, no leading ./ or /, no .. segments. */
export function cleanPath(p) {
  const parts = String(p).replace(/\\/g, '/').split('/');
  const out = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') return null;
    out.push(part);
  }
  return out.length ? out.join('/') : null;
}

/**
 * Strip the single top folder GitHub (and most zip tools) wrap a repository
 * in, so paths start at the repository root.
 */
export function stripCommonRoot(paths) {
  if (!paths.length) return '';
  const first = paths[0].split('/')[0];
  return paths.every((p) => p.startsWith(`${first}/`)) ? `${first}/` : '';
}

/**
 * Build a snapshot.
 * @param {Array<{path: string, size: number, read: () => (string|Buffer|Uint8Array|null)}>} entries
 * @param {{name?: string, source?: string}} [meta]
 */
export function buildSnapshot(entries, meta = {}, limits = SNAPSHOT_LIMITS) {
  const usable = [];
  for (const e of entries) {
    const p = cleanPath(e.path);
    if (p && !SKIP.test(p)) usable.push({ ...e, path: p });
  }
  const prefix = stripCommonRoot(usable.map((e) => e.path));
  const files = [];
  let textBytes = 0;
  let skipped = 0;
  for (const e of usable) {
    if (files.length >= limits.maxFiles) {
      skipped += 1;
      continue;
    }
    const path = prefix ? e.path.slice(prefix.length) : e.path;
    if (!path) continue;
    let text = null;
    if (
      isTextPath(path) &&
      e.size <= limits.maxTextBytes &&
      textBytes + e.size <= limits.maxTotalTextBytes
    ) {
      const raw = e.read();
      if (raw != null) {
        text = typeof raw === 'string' ? raw : new TextDecoder('utf-8', { fatal: false }).decode(raw);
        if (text.includes('\u0000')) text = null; // binary after all
        else textBytes += e.size;
      }
    }
    files.push({ path, size: e.size, text });
  }
  return {
    name: meta.name || (prefix ? prefix.replace(/\/$/, '') : 'upload'),
    source: meta.source || null,
    files,
    skipped,
    textBytes,
  };
}
