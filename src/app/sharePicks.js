/** @module app/sharePicks */

/**
 * One click used to run up to nine full `scene.pick` passes, one per layer's
 * own click handler, all for the same pixel in the same frame (audit, 21
 * Oct). The first pick for a pixel in a frame is shared with the rest.
 * @param {object} scene a Cesium Scene
 */
export function sharePicks(scene) {
  const pick = scene.pick.bind(scene);
  let last = null;
  scene.pick = function sharedPick(position, width, height) {
    const frame = scene.frameState?.frameNumber;
    if (
      last &&
      position &&
      last.frame === frame &&
      last.x === position.x &&
      last.y === position.y &&
      last.width === width &&
      last.height === height
    )
      return last.result;
    const result = pick(position, width, height);
    last = position
      ? { frame, x: position.x, y: position.y, width, height, result }
      : null;
    return result;
  };
  return scene;
}
