/**
 * @file Optional AI rating for the items rules cannot rate. CrossCheck
 * sends an open-source model the evidence it gathered (signal summaries
 * with evidence ids, the declared facts and the file inventory) and the
 * unrated items, and asks for a rating per item that cites evidence ids.
 *
 * The model is an assistant, not an assessor: a rating is kept only when
 * every evidence id it cites exists, a model never rates an item Compliant
 * (at most Largely), never overrides a rule-based rating, and every rating
 * it gives is marked AI-rated so a reviewer can confirm or reject it.
 * Pure: building the request and checking the answer; the call is made by
 * the server.
 * @module crosscheck/engine/ai
 */

const STATUSES = new Set(['L', 'P', 'N', 'NA']);
/** At most this many items per request (keeps prompts small). */
export const AI_BATCH = 40;

/** The system prompt. */
export const AI_SYSTEM = [
  'You are a careful software compliance assessor working for CrossCheck.',
  'Rate each listed requirement for the software described, using ONLY the evidence given.',
  'Answer with JSON only: {"ratings":[{"id":"<item id>","status":"L|P|N|NA","cites":["<evidence id>",...],"why":"<one sentence>"}]}.',
  'L = largely met, P = partially met, N = not met, NA = does not apply to this software.',
  'Every rating must cite at least one evidence id from the list. If the evidence is not enough to judge, leave the item out.',
  'Never claim a requirement is fully met; a human reviewer confirms that.',
].join(' ');

/** Every evidence id the model may cite. */
export function evidenceIds(evidence, facts) {
  const ids = new Set();
  for (const [sid, s] of Object.entries(evidence.signals || {})) {
    ids.add(`signal:${sid}`);
    for (const e of s.evidence || []) ids.add(e.id);
  }
  for (const k of Object.keys(facts || {})) ids.add(`fact:${k}`);
  ids.add('inventory');
  return ids;
}

/**
 * The user message for one batch of items.
 * @param {{evidence: object, facts: object, items: object[], project?: string}} input
 */
export function aiPrompt({ evidence, facts, items, project = 'the software' }) {
  const signals = Object.entries(evidence.signals || {}).map(([id, s]) => ({
    id: `signal:${id}`,
    state: s.state,
    summary: s.summary,
    evidence: (s.evidence || []).slice(0, 3).map((e) => ({
      id: e.id,
      at: e.line ? `${e.path}:${e.line}` : e.path,
      note: e.note,
    })),
  }));
  return JSON.stringify({
    project,
    inventory: { id: 'inventory', ...evidence.inventory },
    facts: Object.entries(facts || {}).map(([k, v]) => ({ id: `fact:${k}`, answer: v })),
    signals,
    items: items.map((i) => ({ id: i.id, standard: i.standard, group: i.groupName || i.group, requirement: i.title })),
  });
}

/** Pull the JSON object out of a model reply (tolerates code fences). */
export function parseAiReply(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Keep only valid ratings: a known unrated item, an allowed status, and at
 * least one citation, every one of which exists.
 * @returns {{accepted: object[], rejected: Array<{id: string, why: string}>}}
 */
export function validateAiRatings(reply, { items, evidence, facts }) {
  const known = new Map(items.map((i) => [`${i.standard}|${i.id}`, i]));
  const byId = new Map(items.map((i) => [i.id, i]));
  const ids = evidenceIds(evidence, facts);
  const accepted = [];
  const rejected = [];
  for (const r of reply?.ratings || []) {
    const item = (r?.standard && known.get(`${r.standard}|${r.id}`)) || byId.get(r?.id);
    if (!item) {
      rejected.push({ id: String(r?.id), why: 'Not an item that was asked about' });
      continue;
    }
    let status = String(r.status || '').toUpperCase();
    if (status === 'C') status = 'L'; // a model never certifies
    if (!STATUSES.has(status)) {
      rejected.push({ id: item.id, why: `Unknown status ${r.status}` });
      continue;
    }
    const cites = Array.isArray(r.cites) ? r.cites.map(String) : [];
    const bad = cites.filter((c) => !ids.has(c));
    if (!cites.length || bad.length) {
      rejected.push({ id: item.id, why: cites.length ? `Cites unknown evidence: ${bad.join(', ')}` : 'No evidence cited' });
      continue;
    }
    accepted.push({
      standard: item.standard,
      id: item.id,
      status,
      cites,
      why: String(r.why || '').slice(0, 300),
    });
  }
  return { accepted, rejected };
}
