/**
 * @file Progress through the remediation, for the AUDIT view's timeline.
 *
 * Stops run from the baseline audit to the end of the last wave. A stop is
 * **measured** when the ledger records an audit for it, and **projected**
 * otherwise: the latest measured state with every planned fix of the waves
 * up to that stop applied (each finding's `target`). Projected stops are
 * always labelled as such; they are the plan, not evidence.
 * Pure functions over docs/evidence/ledger.json and the assessment items.
 * @module audit/progress
 */

const CLOSED = new Set(['C', 'L', 'NA']);
const OPEN = new Set(['P', 'N']);

/** Wave an audit belongs to (0 = baseline). Older records: their position. */
function waveOf(audit, index) {
  return typeof audit.wave === 'number' ? audit.wave : index;
}

/**
 * Timeline stops: Baseline, one per wave, then Sign-off (the end state with
 * the customer and an independent reviewer) when the ledger projects one.
 * @returns {{index:number, wave:number, kind:'measured'|'projected', label:string, sub:string, audit:object|null}[]}
 */
export function timelineStops(ledger) {
  const stops = [];
  const n = ledger.waves.length;
  const signOff = ledger.findings.some((f) => f.targetFull);
  for (let w = 0; w <= n + (signOff ? 1 : 0); w++) {
    // The last audit recorded for this wave is the one that counts.
    let audit = null;
    ledger.audits.forEach((a, i) => {
      if (waveOf(a, i) === w) audit = a;
    });
    const wave = w && w <= n ? ledger.waves[w - 1] : null;
    const last = w > n;
    stops.push({
      index: w,
      wave: w,
      kind: audit ? 'measured' : 'projected',
      final: last,
      label: last ? 'Sign-off' : w ? `Wave ${w}` : 'Baseline',
      name: last
        ? 'With the customer and an independent reviewer'
        : wave
          ? wave.name
          : 'Baseline audit',
      sub: audit ? audit.date : 'projected',
      audit,
    });
  }
  return stops;
}

/** Ids of the audits measured at or before a stop. */
function measuredAuditIds(ledger, stop) {
  const stops = timelineStops(ledger);
  const base =
    stops.filter((s) => s.kind === 'measured' && s.index <= stop.index).pop() ||
    stops[0];
  const upTo = base.audit ? ledger.audits.indexOf(base.audit) : 0;
  return new Set(ledger.audits.slice(0, upTo + 1).map((a) => a.id));
}

/** The latest stop that has been measured (the baseline at least). */
export function latestMeasured(stops) {
  return stops.filter((s) => s.kind === 'measured').pop() || stops[0];
}

/**
 * Status and severity of every finding at a stop.
 * @returns {Map<string, {status:string, severity:string|null, projected:boolean}>}
 */
export function findingStatesAt(ledger, stopIndex) {
  const stops = timelineStops(ledger);
  const stop = stops[Math.max(0, Math.min(stops.length - 1, stopIndex))];
  const allowed = measuredAuditIds(ledger, stop);
  const out = new Map();
  for (const f of ledger.findings) {
    let state = { status: f.baseline.status, severity: f.baseline.severity };
    for (const e of f.history) {
      if (allowed.has(e.audit || 'A0'))
        state = {
          status: e.status,
          severity: 'severity' in e ? e.severity : state.severity,
        };
    }
    let projected = false;
    if (
      stop.kind === 'projected' &&
      f.wave <= stop.wave &&
      OPEN.has(state.status)
    ) {
      const target = (stop.final ? f.targetFull : f.target) || 'C';
      if (target !== state.status) {
        state = {
          status: target,
          severity: OPEN.has(target) ? state.severity : null,
        };
        projected = true;
      }
    }
    out.set(f.id, { ...state, projected });
  }
  return out;
}

/**
 * The assessment items as they stand at a stop. Items without a finding
 * keep their assessed status. `fixed` marks a baseline gap now closed.
 */
export function itemsAt(ledger, items, stopIndex) {
  const states = findingStatesAt(ledger, stopIndex);
  const stops = timelineStops(ledger);
  const stop = stops[Math.max(0, Math.min(stops.length - 1, stopIndex))];
  const base = new Map(ledger.findings.map((f) => [f.id, f.baseline.status]));
  // Items waiting on the deployed host: unrated until a re-audit rates
  // them; projected stops assume the planned result from their wave on.
  const measured = measuredAuditIds(ledger, stop);
  const pending = new Map();
  for (const p of ledger.pending || []) {
    if (p.rated && measured.has(p.rated.audit))
      pending.set(p.id, { status: p.rated.status, projected: false });
    else if (stop.kind === 'projected' && p.wave <= stop.wave)
      pending.set(p.id, { status: p.target, projected: true });
    else pending.set(p.id, { status: null, projected: false });
  }
  return items.map((item) => {
    const s = states.get(item.id);
    if (!s) {
      const p = pending.get(item.id);
      if (p) return { ...item, status: p.status, projected: p.projected };
      return item;
    }
    const fixed = OPEN.has(base.get(item.id)) && CLOSED.has(s.status);
    return {
      ...item,
      status: s.status,
      sev: s.severity || undefined,
      fixed,
      projected: s.projected,
      baselineStatus: base.get(item.id),
    };
  });
}

/**
 * What one stop of the remediation does, in plain words, for the narrated
 * playback: what the wave fixes, which gaps it closes (compared with the
 * previous stop) and why that lets the next stage start.
 * @param {object[]} before - items at the previous stop (null for the first).
 * @param {object[]} after - items at this stop.
 * @param {Set<string>} mustIds - the baseline must-fix item ids.
 */
export function stopStory(ledger, index, before, after, mustIds) {
  const stops = timelineStops(ledger);
  const stop = stops[Math.max(0, Math.min(stops.length - 1, index))];
  const prev = new Map((before || []).map((i) => [i.id, i]));
  const closed = after.filter(
    (i) => CLOSED.has(i.status) && OPEN.has(prev.get(i.id)?.status),
  );
  const wave = stop.final
    ? ledger.signoff || {}
    : stop.wave
      ? ledger.waves[stop.wave - 1]
      : null;
  const gaps = ledger.findings.length;
  const must = mustIds.size;
  return {
    stop,
    who: wave?.who || 'CrossCheck',
    fixes: wave
      ? wave.fixes || wave.exit || ''
      : `CrossCheck rated every applicable objective and requirement against the code and documents: ${gaps} gaps, ${must} of them must-fix before any safe-and-secure claim.`,
    unlocks: wave
      ? wave.unlocks || ''
      : `The plan gives every gap one owner and one wave, so the work can start with the quickest risk reduction.`,
    closed: closed.length,
    mustClosed: closed.filter((i) => mustIds.has(i.id)).map((i) => i.id),
  };
}
