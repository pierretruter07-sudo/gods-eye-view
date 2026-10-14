import { ASSET_TYPES } from './assetTypes.js';

/**
 * Type reference photos from Wikimedia (free-licensed lead images of the
 * type's Wikipedia article). The whole catalogue resolves in a few batched
 * API calls (≤ 50 titles each); only small thumbnails are ever downloaded,
 * and only for types actually shown or about to be shown. Nothing is
 * bundled, so the app stays light. Each photo carries its author and
 * licence for the caption.
 */
const API = 'https://en.wikipedia.org/w/api.php';
export const THUMB_PX = 480; // 240 CSS px at DPR 2
const BATCH = 50;

const stripHtml = (s) =>
  String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function query(params, fetchImpl) {
  const qs = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', ...params });
  return fetchImpl(`${API}?${qs}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))));
}

/** Resolve article titles to { thumb, file } through redirects. Exported for tests. */
export function parsePageImages(json) {
  const alias = new Map();
  for (const n of json?.query?.normalized || []) alias.set(n.from, n.to);
  for (const r of json?.query?.redirects || []) alias.set(r.from, r.to);
  const pages = new Map();
  for (const p of json?.query?.pages || []) {
    if (p.missing || !p.thumbnail?.source) continue;
    pages.set(p.title, { thumb: p.thumbnail.source, file: p.pageimage || null, page: p.title });
  }
  return (title) => {
    let t = title;
    for (let i = 0; i < 3 && alias.has(t); i++) t = alias.get(t);
    return pages.get(t) || null;
  };
}

/** Author + licence per file. Exported for tests. */
export function parseCredits(json) {
  const out = new Map();
  for (const p of json?.query?.pages || []) {
    const meta = p.imageinfo?.[0]?.extmetadata || {};
    out.set(p.title.replace(/^File:/, ''), {
      artist: stripHtml(meta.Artist?.value).slice(0, 80) || null,
      licence: stripHtml(meta.LicenseShortName?.value) || null,
    });
  }
  return (file) => out.get(String(file || '').replace(/_/g, ' ')) || null;
}

export function createReferenceImages({ fetchImpl = (...a) => fetch(...a), types = ASSET_TYPES } = {}) {
  const byArticle = new Map(); // article -> { src, page, artist, licence } | null
  const listeners = new Set();
  let loading = null;

  async function loadAll() {
    const articles = [...new Set(types.map((t) => t.article))];
    for (let i = 0; i < articles.length; i += BATCH) {
      const chunk = articles.slice(i, i + BATCH);
      const json = await query(
        { prop: 'pageimages', piprop: 'thumbnail|name', pithumbsize: String(THUMB_PX), pilicense: 'free', redirects: '1', titles: chunk.join('|') },
        fetchImpl,
      );
      const resolve = parsePageImages(json);
      const files = [];
      for (const a of chunk) {
        const hit = resolve(a);
        byArticle.set(a, hit ? { src: hit.thumb, page: hit.page, file: hit.file, artist: null, licence: null } : null);
        if (hit?.file) files.push(`File:${hit.file}`);
      }
      if (files.length) {
        try {
          const credits = parseCredits(
            await query({ prop: 'imageinfo', iiprop: 'extmetadata', iiextmetadatafilter: 'Artist|LicenseShortName', titles: files.join('|') }, fetchImpl),
          );
          for (const a of chunk) {
            const entry = byArticle.get(a);
            const c = entry && credits(entry.file);
            if (c) Object.assign(entry, c);
          }
        } catch {
          /* credits fall back to "Wikimedia Commons" */
        }
      }
    }
    for (const fn of listeners) fn();
  }

  function ensure() {
    if (!loading) loading = loadAll().catch((error) => {
      console.warn('[intel] reference images unavailable', error?.message || error);
      loading = null; // allow a later retry
    });
    return loading;
  }

  const warmed = new Set();
  return {
    /** Start the (tiny) catalogue lookup; safe to call repeatedly. */
    load: ensure,
    /** The photo for a resolved type, or null if none / not loaded yet. */
    get(type) {
      if (!type?.article) return null; // unlisted types draw their outline only
      const entry = byArticle.get(type.article);
      if (entry === undefined) ensure();
      return entry || null;
    },
    /** Download a type's thumbnail ahead of display (e.g. during a Director flight). */
    prefetch(type) {
      const entry = this.get(type);
      if (!entry || warmed.has(entry.src)) return;
      warmed.add(entry.src);
      const img = new Image();
      img.decoding = 'async';
      img.src = entry.src;
    },
    onReady(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
