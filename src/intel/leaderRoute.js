/**
 * @file Orthogonal routes for the leader lines from a focused asset to its
 * cards: horizontal and vertical runs only, with small rounded corners,
 * like circuit traces.
 *
 * Each line leaves the asset sideways towards its card, turns in its own
 * vertical lane, runs up or down to the card's anchor height, and enters
 * the card horizontally. Lines heading the same way get separate lanes,
 * and the one with the nearer card takes the outer lane, so they never
 * cross or run on top of each other beyond the first few pixels.
 * @module intel/leaderRoute
 */

/** Distance from the asset to the first vertical lane (px). */
export const LANE_START_PX = 12;
/** Gap between neighbouring lanes (px). */
export const LANE_GAP_PX = 9;
/** Corner radius (px). */
export const CORNER_PX = 6;

const f = (n) => (Math.round(n * 10) / 10).toString();

/**
 * Lane offsets for a set of leaders from one asset point.
 * @param {{x: number, y: number}} at asset screen point
 * @param {Array<{x: number, y: number}|null>} anchors card anchors
 * @returns {number[]} signed lane offset from the asset's x, per anchor
 */
export function assignLanes(at, anchors) {
  const lanes = anchors.map(() => 0);
  const groups = new Map();
  anchors.forEach((a, i) => {
    if (!a) return;
    const key = `${Math.sign(a.x - at.x) || 1}:${Math.sign(a.y - at.y) || 1}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  });
  for (const [key, members] of groups) {
    const side = Number(key.split(':')[0]);
    // Farthest card first: it turns on the innermost lane.
    members.sort(
      (i, j) => Math.abs(anchors[j].y - at.y) - Math.abs(anchors[i].y - at.y),
    );
    members.forEach((i, k) => {
      lanes[i] = side * (LANE_START_PX + k * LANE_GAP_PX);
    });
  }
  return lanes;
}

/**
 * SVG path data from the asset to a card anchor, orthogonal only.
 * @param {{x: number, y: number}} at
 * @param {{x: number, y: number}} to
 * @param {number} lane signed horizontal offset of the vertical run
 * @param {number} [radius]
 */
export function orthogonalPath(at, to, lane, radius = CORNER_PX) {
  const dx = to.x - at.x;
  const dy = to.y - at.y;
  // Too close to turn: a plain horizontal or vertical run.
  if (Math.abs(dy) < 1) return `M${f(at.x)} ${f(at.y)}H${f(to.x)}`;
  const side = Math.sign(dx) || 1;
  // Keep the lane between the asset and the card.
  let laneX = at.x + lane;
  const room = Math.abs(dx);
  if (Math.abs(lane) > room - radius)
    laneX = at.x + side * Math.max(0, room / 2);
  if (Math.abs(dx) < 1) return `M${f(at.x)} ${f(at.y)}V${f(to.y)}`;
  const vy = Math.sign(dy);
  const r = Math.max(
    0,
    Math.min(
      radius,
      Math.abs(laneX - at.x) / 2,
      Math.abs(to.x - laneX) / 2,
      Math.abs(dy) / 2,
    ),
  );
  const h = Math.sign(laneX - at.x) || side;
  const h2 = Math.sign(to.x - laneX) || side;
  return [
    `M${f(at.x)} ${f(at.y)}`,
    `H${f(laneX - h * r)}`,
    `Q${f(laneX)} ${f(at.y)} ${f(laneX)} ${f(at.y + vy * r)}`,
    `V${f(to.y - vy * r)}`,
    `Q${f(laneX)} ${f(to.y)} ${f(laneX + h2 * r)} ${f(to.y)}`,
    `H${f(to.x)}`,
  ].join('');
}
