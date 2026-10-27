import test from 'node:test';
import assert from 'node:assert/strict';
import { createNarrator, spokenMs } from './narrator.js';

function fakes() {
  const listeners = {};
  const on = (target) => ({
    addEventListener(type, fn) {
      (listeners[`${target}:${type}`] ||= []).push(fn);
    },
    removeEventListener(type, fn) {
      listeners[`${target}:${type}`] = (
        listeners[`${target}:${type}`] || []
      ).filter((f) => f !== fn);
    },
  });
  const doc = { visibilityState: 'visible', ...on('doc') };
  const win = on('win');
  const synth = {
    spoken: [],
    cancelled: 0,
    speak(u) {
      this.spoken.push(u.text);
    },
    cancel() {
      this.cancelled += 1;
    },
    resume() {},
    getVoices: () => [],
  };
  const fire = (key) => (listeners[key] || []).forEach((fn) => fn());
  return { doc, win, synth, fire };
}

globalThis.SpeechSynthesisUtterance ??= class {
  constructor(text) {
    this.text = text;
  }
};

test('the Director never speaks while its page is hidden', async () => {
  const { doc, win, synth } = fakes();
  const n = createNarrator({ synth, doc, win, log: {} });
  doc.visibilityState = 'hidden';
  const done = n.speak('one two');
  assert.deepEqual(synth.spoken, []);
  await done;
  n.destroy();
});

test('hiding or leaving the page cuts the speech off at once', async () => {
  const { doc, win, synth, fire } = fakes();
  const n = createNarrator({ synth, doc, win, log: {} });
  const line = n.speak('a long line');
  assert.deepEqual(synth.spoken, ['a long line']);
  doc.visibilityState = 'hidden';
  fire('doc:visibilitychange');
  await line; // resolves: the tour moves on silently
  const before = synth.cancelled;
  fire('win:pagehide');
  assert.equal(synth.cancelled, before + 1);
  n.destroy();
});

test('silent lines keep roughly their spoken length', () => {
  assert.equal(spokenMs(''), 0);
  assert.ok(spokenMs('one two three four five six') > 1500);
  assert.ok(spokenMs('word '.repeat(500)) <= 30_000);
});
