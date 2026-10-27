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

test('the DDG intro is the 5 s brand animation, transparent first, never longer than 6 s', () => {
  assert.equal(INTRO_SECONDS, 5);
  assert.equal(INTRO_LIMIT_MS, 6000);
  assert.deepEqual(
    INTRO_SOURCES.map((s) => s.src),
    ['/brand/intro.webm', '/brand/intro.mp4'],
  );
  assert.match(INTRO_SOURCES[0].type, /vp9/);
});
