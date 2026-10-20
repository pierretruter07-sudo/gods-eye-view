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
    stop?.kind === 'base' ||
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

  const isEmpty = (entry) => {
    const r = entry.result;
    return entry.stop.kind === 'airport' && (!r || !r.ready || !(r.count > 0));
  };
  function record(entry, skipped) {
    const r = entry.result;
    log.push({
      kind: entry.stop.kind,
      id:
        entry.stop.airport?.id ||
        entry.stop.stop?.id ||
        entry.stop.event?.key ||
        null,
      count: r?.count ?? null,
      skipped,
    });
    if (log.length > 20) log.shift();
  }

  function plan(skips = 0) {
    const stop = planner.next(liveData());
    const entry = { stop, result: null };
    entry.staged =
      stage && needsAircraft(stop)
        ? Promise.resolve(stage(stop.view, stop))
            .catch(() => ({ ready: false, count: 0 }))
            .then((r) => {
              entry.result = r;
              // Still queued and empty: choose the replacement now, during
              // the dwell, so its data and map tiles load ahead too.
              if (upcoming === entry && isEmpty(entry) && skips < maxSkips) {
                record(entry, true);
                upcoming = plan(skips + 1);
              }
              return r;
            })
        : Promise.resolve((entry.result = { ready: true, count: null }));
    return entry;
  }

  return {
    /** Choose the next stop now and start loading its data. */
    planAhead() {
      upcoming = plan();
      return upcoming.stop;
    },
    /** The queued stop, if any (for diagnostics and tile warm-up). */
    peek: () => upcoming?.stop || null,
    /**
     * A brand-new incident takes the queued slot now (during the dwell)
     * rather than at departure, so its data and map tiles load ahead too.
     * Returns true when the queued stop changed.
     */
    preferFresh() {
      if (!upcoming || upcoming.stop?.kind === 'event') return false;
      if (!planner.hasFresh(incidents())) return false;
      upcoming = plan();
      return true;
    },
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
        const empty = isEmpty(entry);
        record(entry, empty && skips < maxSkips);
        if (!empty || skips >= maxSkips) {
          // The loaded data travels with the stop, so the arrival can draw
          // it at once, before the live layer's own refresh lands.
          entry.stop.staged = r;
          return entry.stop;
        }
        entry = plan();
      }
    },
    log: () => [...log],
  };
}
