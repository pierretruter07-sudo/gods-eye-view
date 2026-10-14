/**
 * @file The Director's look-ahead queue.
 *
 * The next stop is chosen as soon as the camera arrives at the current one,
 * and its live data starts loading right then, a whole dwell ahead of the
 * flight. When it is time to leave, the queue waits briefly for that data;
 * an airport with no aircraft yet is skipped rather than shown empty.
 * A brand-new incident always jumps the queue. Pure: no Cesium, no DOM.
 * @module tour/queue
 */

/** Whether a stop's picture depends on aircraft data near the destination. */
export function needsAircraft(stop) {
  return (
    stop?.kind === 'airport' ||
    (stop?.kind === 'city' && stop?.view?.rangeM <= 1_000_000)
  );
}

/**
 * @param {{
 *   planner: {next: Function, hasFresh: Function},
 *   liveData: () => object,
 *   incidents: () => object,
 *   stage?: (view: object, stop: object) => Promise<{ready: boolean, count: number|null}>,
 *   maxWaitMs?: number,
 *   maxSkips?: number,
 *   wait: (ms: number) => Promise<void>,
 * }} options
 */
export function createStopQueue({
  planner,
  liveData,
  incidents,
  stage = null,
  maxWaitMs = 6000,
  maxSkips = 3,
  wait,
}) {
  let upcoming = null; // { stop, staged: Promise, result }
  const log = []; // recent decisions, for diagnostics

  function plan() {
    const stop = planner.next(liveData());
    const entry = { stop, result: null };
    entry.staged =
      stage && needsAircraft(stop)
        ? Promise.resolve(stage(stop.view, stop))
            .catch(() => ({ ready: false, count: 0 }))
            .then((r) => (entry.result = r))
        : Promise.resolve((entry.result = { ready: true, count: null }));
    return entry;
  }

  return {
    /** Choose the next stop now and start loading its data. */
    planAhead() {
      upcoming = plan();
      return upcoming.stop;
    },
    /** The queued stop, if any (for diagnostics). */
    peek: () => upcoming?.stop || null,
    /**
     * The stop to fly to next. Waits up to `maxWaitMs` for its data; skips
     * an airport that has no aircraft so the Director never arrives at an
     * empty one.
     */
    async take() {
      if (upcoming && planner.hasFresh(incidents())) upcoming = null;
      let entry = upcoming || plan();
      upcoming = null;
      for (let skips = 0; ; skips += 1) {
        if (!entry.result) await Promise.race([entry.staged, wait(maxWaitMs)]);
        const r = entry.result;
        const empty =
          entry.stop.kind === 'airport' && (!r || !r.ready || !(r.count > 0));
        log.push({
          kind: entry.stop.kind,
          id:
            entry.stop.airport?.id ||
            entry.stop.stop?.id ||
            entry.stop.event?.key ||
            null,
          count: r?.count ?? null,
          skipped: empty && skips < maxSkips,
        });
        if (log.length > 20) log.shift();
        if (!empty || skips >= maxSkips) return entry.stop;
        entry = plan();
      }
    },
    log: () => [...log],
  };
}
