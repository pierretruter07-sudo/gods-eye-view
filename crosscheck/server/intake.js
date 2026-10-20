/**
 * @file CrossCheck intake: turn a GitHub link or an uploaded zip into a
 * snapshot. Only github.com repository links are fetched (through GitHub's
 * zipball API), so the server cannot be pointed at internal addresses.
 * Private repositories need a token in CROSSCHECK_GITHUB_TOKEN.
 * @module crosscheck/server/intake
 */
import { buildSnapshot } from '../engine/snapshot.js';
import { readZip, ZipError } from './zip.js';

export const INTAKE_LIMITS = Object.freeze({
  /** Largest archive downloaded or uploaded. */
  maxArchiveBytes: 100 * 1024 * 1024,
  /** GitHub download time limit. */
  timeoutMs: 60_000,
});

/** An intake problem the user can act on (shown as is). */
export class IntakeError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const REF = /^[A-Za-z0-9_./-]{1,200}$/;

/**
 * Parse a GitHub repository link: https://github.com/owner/repo, optionally
 * with /tree/<ref>, a .git suffix, or "owner/repo" alone.
 * @returns {{owner: string, repo: string, ref: string|null}}
 */
export function parseGithubUrl(input) {
  const raw = String(input || '').trim();
  let path = raw;
  if (/^https?:\/\//i.test(raw)) {
    let url;
    try {
      url = new URL(raw);
    } catch {
      throw new IntakeError('That is not a valid link');
    }
    if (url.protocol !== 'https:' || !['github.com', 'www.github.com'].includes(url.hostname.toLowerCase()))
      throw new IntakeError('Only https://github.com repository links can be fetched');
    path = url.pathname;
  }
  const parts = path.replace(/^\/+|\/+$/g, '').split('/');
  const [owner, repoRaw, kind, ...rest] = parts;
  const repo = (repoRaw || '').replace(/\.git$/i, '');
  if (!NAME.test(owner || '') || !NAME.test(repo)) throw new IntakeError('Give a repository as https://github.com/owner/repo');
  let ref = null;
  if (kind === 'tree' && rest.length) {
    ref = rest.join('/');
    if (!REF.test(ref) || ref.includes('..')) throw new IntakeError('That branch or tag name is not valid');
  }
  return { owner, repo, ref };
}

/** Read a response body up to a byte limit. */
async function readCapped(res, max) {
  const len = Number(res.headers.get('content-length'));
  if (Number.isFinite(len) && len > max) throw new IntakeError('The repository archive is too large (over 100 MB)', 413);
  const chunks = [];
  let total = 0;
  for await (const chunk of res.body) {
    total += chunk.length;
    if (total > max) throw new IntakeError('The repository archive is too large (over 100 MB)', 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

/**
 * Download a repository's archive from GitHub.
 * @param {{owner: string, repo: string, ref: string|null}} target
 * @param {{fetchImpl?: Function, token?: string}} [options]
 */
export async function fetchGithubArchive(target, { fetchImpl = globalThis.fetch, token = process.env.CROSSCHECK_GITHUB_TOKEN } = {}) {
  const ref = target.ref ? `/${encodeURIComponent(target.ref).replace(/%2F/g, '/')}` : '';
  const url = `https://api.github.com/repos/${target.owner}/${target.repo}/zipball${ref}`;
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'CrossCheck' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), INTAKE_LIMITS.timeoutMs);
  let res;
  try {
    res = await fetchImpl(url, { headers, redirect: 'follow', signal: ctrl.signal });
  } catch (error) {
    clearTimeout(timer);
    throw new IntakeError(`Could not reach GitHub (${error.name === 'AbortError' ? 'timed out' : error.message})`, 502);
  }
  try {
    if (res.status === 404)
      throw new IntakeError(
        token
          ? 'Repository or branch not found (or the token cannot see it)'
          : 'Repository or branch not found. A private repository needs a GitHub token on the server (CROSSCHECK_GITHUB_TOKEN).',
        404,
      );
    if (res.status === 403 || res.status === 429)
      throw new IntakeError('GitHub refused the download (rate limit or permissions). Try again later or set a token.', 429);
    if (!res.ok) throw new IntakeError(`GitHub answered ${res.status}`, 502);
    return await readCapped(res, INTAKE_LIMITS.maxArchiveBytes);
  } finally {
    clearTimeout(timer);
  }
}

/** Snapshot an archive held in memory. */
export function snapshotFromZip(buf, meta = {}) {
  try {
    return buildSnapshot(readZip(buf), meta);
  } catch (error) {
    if (error instanceof ZipError) throw new IntakeError(error.message, 422);
    throw error;
  }
}

/** Snapshot a GitHub repository. */
export async function snapshotFromGithub(link, options = {}) {
  const target = parseGithubUrl(link);
  const buf = await fetchGithubArchive(target, options);
  return snapshotFromZip(buf, {
    name: `${target.owner}/${target.repo}`,
    source: `https://github.com/${target.owner}/${target.repo}${target.ref ? `/tree/${target.ref}` : ''}`,
  });
}
