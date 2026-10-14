import test from 'node:test';
import assert from 'node:assert/strict';
import { startApplicationChrome } from '../app/startupChrome.js';

function screen() {
  const classes = new Set();
  return {
    classList: { add: (c) => classes.add(c) },
    hidden: () => classes.has('hidden'),
  };
}

test('the loading screen fades after the start-up delay', async () => {
  const s = screen();
  startApplicationChrome({
    loadingScreen: s,
    signal: new AbortController().signal,
    delayMs: 5,
  });
  assert.equal(s.hidden(), false);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(s.hidden(), true);
});

test('shutdown before the delay leaves the loading screen alone', async () => {
  const s = screen();
  const dispose = startApplicationChrome({
    loadingScreen: s,
    signal: new AbortController().signal,
    delayMs: 5,
  });
  dispose();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(s.hidden(), false);
});

test('an aborted application never hides the loading screen', async () => {
  const s = screen();
  const controller = new AbortController();
  startApplicationChrome({
    loadingScreen: s,
    signal: controller.signal,
    delayMs: 5,
  });
  controller.abort();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(s.hidden(), false);
});
