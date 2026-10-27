import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INTRO_LIMIT_MS,
  INTRO_SECONDS,
  INTRO_SOURCES,
  shouldPlayIntro,
} from './intro.js';

test('the DDG intro plays once per session and ?nointro or reduced motion skip it', () => {
  assert.equal(shouldPlayIntro({ search: '' }), true);
  assert.equal(shouldPlayIntro({ search: '?nointro' }), false);
  assert.equal(shouldPlayIntro({ search: '?quakerings=1&nointro' }), false);
  assert.equal(shouldPlayIntro({ seen: true }), false);
  assert.equal(shouldPlayIntro({ reducedMotion: true }), false);
});

test('the DDG intro hands over to the progress bar after 3.4 s, transparent first, never holds past 4.2 s', () => {
  assert.equal(INTRO_SECONDS, 3.4);
  assert.equal(INTRO_LIMIT_MS, 4200);
  assert.ok(INTRO_LIMIT_MS > INTRO_SECONDS * 1000);
  assert.deepEqual(
    INTRO_SOURCES.map((s) => s.src),
    ['/brand/intro.webm', '/brand/intro.mp4'],
  );
  assert.match(INTRO_SOURCES[0].type, /vp9/);
});
