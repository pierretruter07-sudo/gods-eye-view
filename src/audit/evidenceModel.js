/**
 * @file Read the remediation ledger (docs/evidence/ledger.json) for the
 * evidence drawer. Pure functions; the drawer renders what these return.
 * Reading order is always top down: Level 0 pipeline and progress, Level 1
 * waves and re-audits, Level 2 workstreams, Level 3 per-finding history.
 * @module audit/evidenceModel
 */

const CLOSED = new Set(['C', 'L', 'NA']);

/** Current status of each finding: the assessment snapshot wins over the ledger. */
function currentStatus(ledger, items) {
  const byId = new Map(items.map((i) => [i.id, i.status]));
  const out = new Map();
  for (const f of ledger.findings)
    out.set(f.id, byId.has(f.id) ? byId.get(f.id) : f.current.status);
  return out;
}

/** Findings closed overall and among the must-fix ones. */
export function ledgerProgress(ledger, items) {
  const now = currentStatus(ledger, items);
  const closed = ledger.findings.filter((f) => CLOSED.has(now.get(f.id)));
  return {
    total: ledger.findings.length,
    closed: closed.length,
    blockTotal: ledger.findings.filter((f) => f.blocking).length,
    blockClosed: closed.filter((f) => f.blocking).length,
  };
}

/** The pipeline stages with the next one marked. */
export function stages(ledger) {
  const next = ledger.stages.find((s) => s.status !== 'done');
  return ledger.stages.map((s) => ({
    ...s,
    state: s.status === 'done' ? 'done' : s === next ? 'next' : 'planned',
  }));
}

/**
 * Readiness journey: target points per wave (dashed) plus measured audits
 * (dots) at the same positions, and the with-humans end state.
 */
export function readinessJourney(ledger) {
  const targets = ledger.projections?.journey || [];
  const points = targets.map((t, i) => {
    const audit = ledger.audits[i];
    return {
      label: t.label,
      kind: audit ? 'actual' : 'target',
      safety: audit ? audit.safety.readiness : t.safety,
      security: audit ? audit.security.readiness : t.security,
      ai: audit?.ai ? audit.ai.readiness : t.ai,
      targetSafety: t.safety,
      targetSecurity: t.security,
      targetAi: t.ai,
    };
  });
  return { points, scenarios: ledger.projections?.scenarios || [] };
}

/** Waves → workstreams → findings, each with closed counts. */
export function drillDown(ledger, items) {
  const now = currentStatus(ledger, items);
  const byWs = new Map();
  for (const f of ledger.findings) {
    if (!byWs.has(f.workstream)) byWs.set(f.workstream, []);
    byWs.get(f.workstream).push(f);
  }
  return ledger.waves.map((w) => {
    const workstreams = ledger.workstreams
      .filter((x) => x.wave === w.id)
      .map((x) => {
        const findings = (byWs.get(x.id) || []).map((f) => ({
          ...f,
          now: now.get(f.id),
          closed: CLOSED.has(now.get(f.id)),
        }));
        return {
          ...x,
          findings,
          closed: findings.filter((f) => f.closed).length,
        };
      });
    const total = workstreams.reduce((s, x) => s + x.findings.length, 0);
    const closed = workstreams.reduce((s, x) => s + x.closed, 0);
    return { ...w, workstreams, total, closed };
  });
}
