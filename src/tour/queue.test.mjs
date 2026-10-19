import test from 'node:test';
import assert from 'node:assert/strict';
import { createStopQueue, needsAircraft } from './queue.js';

function fakePlanner(stops) {
  let i = 0;
  let fresh = false;
  return {
    next: () => stops[i++ % stops.length],
    hasFresh: () => fresh,
    setFresh: (v) => (fresh = v),
  };
}
const airport = (id) => ({
  kind: 'airport',
  airport: { id },
  view: { lat: 0, lon: 0, rangeM: 14_000 },
});
const ship = { kind: 'vessel', view: { lat: 1, lon: 1, rangeM: 9_000 } };
const noWait = () => new Promise(() => {}); // the stage promise always wins

test('the next stop is planned on arrival and its data loads a whole dwell ahead', async () => {
  const staged = [];
  const planner = fakePlanner([airport('BNE'), ship]);
  const q = createStopQueue({
    planner,
    liveData: () => ({}),
    incidents: () => ({}),
    stage: (view, stop) => {
      staged.push(stop.airport.id);
      return Promise.resolve({ ready: true, count: 12 });
    },
    wait: noWait,
  });
  assert.equal(q.planAhead().airport.id, 'BNE');
  assert.deepEqual(staged, ['BNE'], 'loading starts at planning time');
  assert.equal((await q.take()).airport.id, 'BNE');
  assert.equal(
    (await q.take()).kind,
    'vessel',
    'non-aircraft stops are not staged',
  );
  assert.deepEqual(staged, ['BNE']);
});

test('an airport with no aircraft is skipped instead of shown empty', async () => {
  const planner = fakePlanner([airport('EMPTY'), airport('SYD')]);
  const q = createStopQueue({
    planner,
    liveData: () => ({}),
    incidents: () => ({}),
    stage: (view, stop) =>
      Promise.resolve({
        ready: true,
        count: stop.airport.id === 'SYD' ? 8 : 0,
      }),
    wait: noWait,
  });
  q.planAhead();
  const next = await q.take();
  assert.equal(next.airport.id, 'SYD');
  assert.equal(q.log()[0].skipped, true);
});

test('a slow source is waited for only briefly; a fresh incident jumps the queue', async () => {
  let release;
  const planner = fakePlanner([airport('SLOW'), ship]);
  const q = createStopQueue({
    planner,
    liveData: () => ({}),
    incidents: () => ({}),
    stage: () => new Promise((r) => (release = r)),
    wait: () => Promise.resolve(), // the wait budget runs out at once
    maxSkips: 1,
  });
  q.planAhead();
  const next = await q.take(); // SLOW times out → skipped once → ship
  assert.equal(next.kind, 'vessel');
  release({ ready: true, count: 3 });
  // Fresh incident: the queued stop is dropped and the planner decides again.
  const p2 = fakePlanner([airport('A'), ship]);
  const q2 = createStopQueue({
    planner: p2,
    liveData: () => ({}),
    incidents: () => ({}),
    stage: () => Promise.resolve({ ready: true, count: 1 }),
    wait: noWait,
  });
  q2.planAhead(); // A queued
  p2.setFresh(true);
  assert.equal((await q2.take()).kind, 'vessel', 'replanned, A dropped');
  assert.ok(needsAircraft(airport('X')));
  assert.ok(!needsAircraft(ship));
});

test('an empty airport is replaced during the dwell, so the replacement loads ahead too', async () => {
  const planner = fakePlanner([airport('EMPTY'), airport('SYD')]);
  const q = createStopQueue({
    planner,
    liveData: () => ({}),
    incidents: () => ({}),
    stage: (view, stop) =>
      Promise.resolve({
        ready: true,
        count: stop.airport.id === 'SYD' ? 8 : 0,
      }),
    wait: noWait,
  });
  q.planAhead();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(q.peek().airport.id, 'SYD', 'known before departure');
  assert.equal((await q.take()).airport.id, 'SYD');
  assert.deepEqual(
    q.log().map((e) => [e.id, e.skipped]),
    [
      ['EMPTY', true],
      ['SYD', false],
    ],
  );
});
