/**
 * @file Calls an open-source model through any OpenAI-compatible chat
 * endpoint (Ollama, vLLM, LM Studio, llama.cpp server, or a hosted router).
 * Off unless configured:
 *   CROSSCHECK_AI_URL    base URL, e.g. http://localhost:11434/v1
 *   CROSSCHECK_AI_MODEL  model name as that server knows it
 *   CROSSCHECK_AI_KEY    optional bearer key (hosted routers)
 * Source code never leaves the server except as the evidence summaries the
 * prompt carries; point it at a model you host to keep everything in house.
 * @module crosscheck/server/ai-client
 */
import { AI_BATCH, AI_SYSTEM, aiPrompt, parseAiReply, validateAiRatings } from '../engine/ai.js';

/** The AI settings in effect, or null when AI rating is off. */
export function aiConfig(env = process.env) {
  const url = env.CROSSCHECK_AI_URL;
  const model = env.CROSSCHECK_AI_MODEL;
  if (!url || !model) return null;
  return { url: url.replace(/\/+$/, ''), model, key: env.CROSSCHECK_AI_KEY || null };
}

/** One chat completion. */
async function complete(config, user, { fetchImpl = globalThis.fetch, timeoutMs = 120_000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${config.url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.key ? { Authorization: `Bearer ${config.key}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        messages: [
          { role: 'system', content: AI_SYSTEM },
          { role: 'user', content: user },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`model server answered ${res.status}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask the model about the unrated items, in batches, and keep only ratings
 * that pass validation.
 * @returns {Promise<{accepted: object[], rejected: object[], errors: string[], model: string}>}
 */
export async function aiRate({ config, evidence, facts, items, project, fetchImpl, maxItems = 200 }) {
  const accepted = [];
  const rejected = [];
  const errors = [];
  const todo = items.slice(0, maxItems);
  for (let i = 0; i < todo.length; i += AI_BATCH) {
    const batch = todo.slice(i, i + AI_BATCH);
    try {
      const text = await complete(config, aiPrompt({ evidence, facts, items: batch, project }), { fetchImpl });
      const reply = parseAiReply(text);
      if (!reply) {
        errors.push('The model did not return JSON for one batch');
        continue;
      }
      const v = validateAiRatings(reply, { items: batch, evidence, facts });
      accepted.push(...v.accepted);
      rejected.push(...v.rejected);
    } catch (error) {
      errors.push(error.message);
    }
  }
  return { accepted, rejected, errors, model: config.model };
}
