/**
 * @file CrossCheck's HTTP API, as connect-style middleware so any Node
 * server can mount it (God's Eye View's dev server, or CrossCheck's own
 * standalone server). Routes, under /api/crosscheck:
 *
 *   GET  /status            AI on or off, intake limits
 *   GET  /standards         the standards library (summaries)
 *   GET  /standards/:id     one standard with its items
 *   GET  /facts             the intake questions
 *   GET  /signals           the evidence checks
 *   GET  /example           the God's Eye View worked example
 *   POST /intake            a zip (application/zip) or {"github": "<link>"}
 *   POST /assess            {"id", "facts", "standards", "levels", "ai"}
 *
 * Source code is held only while it is read: intake keeps the evidence
 * (file paths, line numbers, short notes), never the code itself.
 * @module crosscheck/server/handler
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { assess } from '../engine/assess.js';
import { FACTS, cleanFacts } from '../engine/facts.js';
import { buildPlan, planMarkdown } from '../engine/plan.js';
import { SIGNALS, THEMES, gatherEvidence } from '../engine/signals.js';
import { aiConfig, aiRate } from './ai-client.js';
import { INTAKE_LIMITS, IntakeError, snapshotFromGithub, snapshotFromZip } from './intake.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');

/** Load every catalogue in crosscheck/catalogues. */
export function loadCatalogues(dir = path.join(ROOT, 'catalogues')) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

const LIBRARY_ORDER = ['asvs5', 'nist-ssdf', 'iso27001', 'ism-e8', 'ed153', 'mil882e', 'iso42001'];

/** A standard's library card (no items). */
export function summarise(c) {
  const groups = [...new Map(c.items.map((i) => [i.group, i.groupName])).entries()].map(([id, name]) => ({
    id,
    name,
    items: c.items.filter((i) => i.group === id).length,
  }));
  return {
    id: c.id,
    name: c.name,
    short: c.short,
    lens: c.lens,
    scale: c.scale,
    licence: c.licence,
    attribution: c.attribution || null,
    source: c.source,
    note: c.note || null,
    applies: c.applies || 'always',
    levelName: c.levelName || null,
    levels: c.levels || null,
    defaultLevel: c.defaultLevel || null,
    items: c.items.length,
    inScope: c.items.filter((i) => !i.out).length,
    mapped: c.items.filter((i) => !i.out && ((i.checks || []).length || (i.facts || []).length)).length,
    groups,
  };
}

/** Small in-memory store of intakes (evidence only), oldest dropped. */
function createStore({ max = 30, ttlMs = 60 * 60_000 } = {}) {
  const map = new Map();
  const sweep = () => {
    const now = Date.now();
    for (const [k, v] of map) if (now - v.at > ttlMs) map.delete(k);
    while (map.size > max) map.delete(map.keys().next().value);
  };
  return {
    put(value) {
      sweep();
      const id = randomUUID();
      map.set(id, { ...value, at: Date.now() });
      return id;
    },
    get(id) {
      sweep();
      return map.get(id) || null;
    },
  };
}

/** A simple per-address limit on intakes (each may fetch from GitHub). */
function createLimiter({ max = 12, windowMs = 10 * 60_000 } = {}) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) return false;
    list.push(now);
    hits.set(key, list);
    if (hits.size > 5000) hits.delete(hits.keys().next().value);
    return true;
  };
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

async function readBody(req, max) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > max) throw new IntakeError('The upload is too large (over 100 MB)', 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Create the CrossCheck API middleware.
 * @param {{catalogues?: object[], example?: object, fetchImpl?: Function, env?: object, prefix?: string}} [options]
 */
export function createCrossCheckHandler(options = {}) {
  const catalogues = (options.catalogues || loadCatalogues()).sort(
    (a, b) => LIBRARY_ORDER.indexOf(a.id) - LIBRARY_ORDER.indexOf(b.id),
  );
  const byId = new Map(catalogues.map((c) => [c.id, c]));
  const prefix = options.prefix || '/api/crosscheck';
  const env = options.env || process.env;
  const store = createStore();
  const limited = createLimiter();
  let example = options.example || null;
  const loadExample = () => {
    if (!example)
      example = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples', 'gods-eye-view', 'assessment.json'), 'utf8'));
    return example;
  };

  async function intake(req, res) {
    const who = req.socket?.remoteAddress || 'unknown';
    if (!limited(who)) return send(res, 429, { error: 'Too many intakes from this address; try again in a few minutes.' });
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    let snapshot;
    if (type === 'application/json') {
      const body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}');
      if (!body.github) return send(res, 400, { error: 'Send a zip, or {"github": "https://github.com/owner/repo"}' });
      snapshot = await snapshotFromGithub(body.github, { fetchImpl: options.fetchImpl, token: env.CROSSCHECK_GITHUB_TOKEN });
    } else if (['application/zip', 'application/x-zip-compressed', 'application/octet-stream'].includes(type)) {
      const buf = await readBody(req, INTAKE_LIMITS.maxArchiveBytes);
      const name = String(req.headers['x-filename'] || 'upload.zip').replace(/[^\w.\- ]/g, '').replace(/\.zip$/i, '') || 'upload';
      snapshot = snapshotFromZip(buf, { name, source: 'Uploaded archive' });
    } else return send(res, 415, { error: 'Send a .zip file or a GitHub link' });
    if (!snapshot.files.length) return send(res, 422, { error: 'The archive has no files CrossCheck can read' });
    const evidence = gatherEvidence(snapshot);
    const id = store.put({ name: snapshot.name, source: snapshot.source, evidence });
    return send(res, 200, {
      id,
      name: snapshot.name,
      source: snapshot.source,
      skipped: snapshot.skipped,
      inventory: evidence.inventory,
      ai: evidence.ai,
      signals: evidence.signals,
    });
  }

  async function runAssessment(req, res) {
    const body = JSON.parse((await readBody(req, 256 * 1024)).toString('utf8') || '{}');
    const held = body.id ? store.get(String(body.id)) : null;
    if (!held) return send(res, 404, { error: 'That intake has expired; send the code again.' });
    const chosen = (Array.isArray(body.standards) && body.standards.length ? body.standards : catalogues.map((c) => c.id))
      .map((id) => byId.get(String(id)))
      .filter(Boolean);
    if (!chosen.length) return send(res, 400, { error: 'Choose at least one standard' });
    const levels = {};
    for (const c of chosen) {
      const want = body.levels?.[c.id];
      if (want != null && (c.levels || []).includes(String(want))) levels[c.id] = String(want);
    }
    const input = { evidence: held.evidence, facts: cleanFacts(body.facts), catalogues: chosen, levels };
    let result = assess(input);
    let ai = null;
    const config = aiConfig(env);
    if (body.ai && config) {
      const unrated = result.standards.flatMap((s) => s.items.filter((i) => !i.out && !i.status));
      ai = await aiRate({ config, evidence: held.evidence, facts: result.facts, items: unrated, project: held.name, fetchImpl: options.fetchImpl });
      input.aiRatings = ai.accepted;
      result = assess(input);
    }
    const plan = buildPlan(input, result);
    return send(res, 200, {
      project: { name: held.name, source: held.source },
      assessedAt: new Date().toISOString(),
      assessment: result,
      plan,
      planMarkdown: planMarkdown(plan, result, { project: held.name, date: new Date().toISOString().slice(0, 10) }),
      ai: ai ? { model: ai.model, accepted: ai.accepted.length, rejected: ai.rejected, errors: ai.errors } : null,
    });
  }

  const routes = {
    'GET /status': (req, res) => {
      const config = aiConfig(env);
      send(res, 200, {
        ai: config ? { on: true, model: config.model } : { on: false },
        github: { token: Boolean(env.CROSSCHECK_GITHUB_TOKEN) },
        limits: { maxArchiveMb: INTAKE_LIMITS.maxArchiveBytes / 1024 / 1024 },
      });
    },
    'GET /standards': (req, res) => send(res, 200, { standards: catalogues.map(summarise) }),
    'GET /facts': (req, res) => send(res, 200, { facts: FACTS }),
    'GET /signals': (req, res) =>
      send(res, 200, {
        themes: THEMES,
        signals: SIGNALS.map(({ id, title, theme, fix, weight }) => ({ id, title, theme, fix, weight: weight || 'medium' })),
      }),
    'GET /example': (req, res) => send(res, 200, loadExample()),
    'POST /intake': intake,
    'POST /assess': runAssessment,
  };

  return async function crossCheckApi(req, res, next) {
    const url = new URL(req.url || '/', 'http://local');
    if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return next?.();
    const sub = url.pathname.slice(prefix.length) || '/';
    try {
      const std = sub.match(/^\/standards\/([\w-]+)$/);
      if (std && req.method === 'GET') {
        const c = byId.get(std[1]);
        return c ? send(res, 200, { ...summarise(c), itemsList: c.items }) : send(res, 404, { error: 'Unknown standard' });
      }
      const route = routes[`${req.method} ${sub}`];
      if (!route) return send(res, 404, { error: 'Unknown CrossCheck route' });
      return await route(req, res);
    } catch (error) {
      if (error instanceof IntakeError) return send(res, error.status, { error: error.message });
      if (error instanceof SyntaxError) return send(res, 400, { error: 'The request body is not valid JSON' });
      console.error('[crosscheck]', error);
      return send(res, 500, { error: 'CrossCheck could not finish that request' });
    }
  };
}
