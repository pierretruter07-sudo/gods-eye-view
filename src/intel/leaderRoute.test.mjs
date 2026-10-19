import test from 'node:test';
import assert from 'node:assert/strict';
import { assignLanes, orthogonalPath } from './leaderRoute.js';

/** Corner points of a path (M/H/V/Q end points), for checking direction. */
function points(d) {
  const out = [];
  let x = 0;
  let y = 0;
  for (const [, cmd, args] of d.matchAll(/([MHVQ])([^MHVQ]*)/g)) {
    const n = args.trim().split(/[\s,]+/).map(Number);
    if (cmd === 'M') [x, y] = n;
    if (cmd === 'H') [x] = n;
    if (cmd === 'V') [y] = n;
    if (cmd === 'Q') [, , x, y] = n;
    out.push({ cmd, x, y });
  }
  return out;
}

test('leader lines run only horizontally and vertically (corners rounded)', () => {
  const at = { x: 700, y: 450 };
  for (const to of [
    { x: 300, y: 200 },
    { x: 1100, y: 220 },
    { x: 320, y: 700 },
    { x: 1080, y: 690 },
  ]) {
    const d = orthogonalPath(at, to, Math.sign(to.x - at.x) * 12);
    assert.doesNotMatch(d, /L/, 'no diagonal line segments');
    const pts = points(d);
    assert.deepEqual(pts.at(-1), { cmd: 'H', x: to.x, y: to.y }, 'enters the card horizontally');
    assert.equal(pts.filter((p) => p.cmd === 'V').length, 1);
  }
  assert.equal(orthogonalPath(at, { x: 300, y: 450 }, -12), 'M700 450H300');
});

test('each leader gets its own lane, nearer cards on the outer lane, so they never cross', () => {
  const at = { x: 700, y: 450 };
  // Four cards stacked in one column on the left (drawer open).
  const anchors = [
    { x: 340, y: 120 },
    { x: 340, y: 330 },
    { x: 340, y: 560 },
    { x: 340, y: 780 },
  ];
  const lanes = assignLanes(at, anchors);
  assert.equal(new Set(lanes.filter((l, i) => anchors[i].y < at.y)).size, 2);
  assert.ok(Math.abs(lanes[1]) > Math.abs(lanes[0]), 'the nearer card turns further out');
  assert.ok(Math.abs(lanes[2]) > Math.abs(lanes[3]));
  assert.ok(lanes.every((l) => l < 0), 'all lanes on the cards’ side');
  // Corner cards: one lane each side, mirrored.
  const corners = assignLanes(at, [
    { x: 300, y: 200 },
    { x: 1100, y: 200 },
    null,
    { x: 1100, y: 700 },
  ]);
  assert.deepEqual(corners, [-12, 12, 0, 12]);
});
