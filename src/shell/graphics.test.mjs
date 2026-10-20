import test from 'node:test';
import assert from 'node:assert/strict';
import { GRAPHICS, graphicsFlags, installGraphics } from './graphics.js';
import { ICON_TIERS_PX, iconTierPx } from '../data/aircraftIcons.js';

function fakeCesium() {
  class PostProcessStage {
    constructor(o) {
      Object.assign(this, o);
      this.enabled = true;
    }
  }
  class PostProcessStageComposite extends PostProcessStage {}
  return {
    PostProcessStage,
    PostProcessStageComposite,
    Cartesian2: function (x, y) {
      Object.assign(this, { x, y });
    },
    Tonemapper: { PBR_NEUTRAL: 'PBR_NEUTRAL' },
  };
}
function fakeViewer() {
  const list = [];
  return {
    scene: {
      highDynamicRangeSupported: true,
      highDynamicRange: false,
      postProcessStages: {
        fxaa: { enabled: true },
        tonemapper: 'REINHARD',
        exposure: 1,
        add: (s) => list.push(s),
        remove: (s) => list.splice(list.indexOf(s), 1),
        list,
      },
    },
  };
}

test('the scene look: HDR with a neutral tone map, gentle bloom, sharpening instead of FXAA', () => {
  const viewer = fakeViewer();
  const g = installGraphics(viewer, fakeCesium(), { flags: graphicsFlags('') });
  const stages = viewer.scene.postProcessStages;
  assert.equal(stages.fxaa.enabled, false, 'no FXAA blur');
  assert.equal(viewer.scene.highDynamicRange, true);
  assert.equal(stages.tonemapper, 'PBR_NEUTRAL');
  assert.deepEqual(stages.list.map((s) => s.name), ['gev-bloom', 'gev-sharpen']);
  assert.equal(stages.list[1].uniforms.sharpness, GRAPHICS.sharpness);
  assert.deepEqual(g.state(), { hdr: true, bloom: true, sharpen: true });
  g.setEffects(false);
  assert.equal(g.state().bloom, false, 'the quality ladder can shed bloom');
  g.destroy();
  assert.equal(stages.list.length, 0);
});

test('each effect can be switched off from the URL for comparison', () => {
  assert.deepEqual(graphicsFlags('?hdr=0&bloom=0&sharpen=0'), { hdr: false, bloom: false, sharpen: false });
  const viewer = fakeViewer();
  installGraphics(viewer, fakeCesium(), { flags: graphicsFlags('?bloom=0') });
  assert.equal(viewer.scene.highDynamicRange, true);
  assert.deepEqual(viewer.scene.postProcessStages.list.map((s) => s.name), ['gev-sharpen']);
});

test('icons are drawn from the raster closest to their size on screen, never magnified', () => {
  // A 1× desktop globe view: ~12 device px glyphs come from the 32 px raster, not 64.
  assert.equal(iconTierPx(12), 32);
  // A 3× phone close-up: 180 device px from the 192 px raster.
  assert.equal(iconTierPx(180, 64), 192);
  for (const px of [10, 30, 50, 90, 140, 200, 240]) {
    const tier = iconTierPx(px, 999);
    assert.ok(ICON_TIERS_PX.includes(tier));
    assert.ok(tier >= px * 0.95 || tier === ICON_TIERS_PX.at(-1), `${px} px from ${tier}`);
    assert.ok(tier <= Math.max(32, px * 2.2) || tier === ICON_TIERS_PX[0], `${px} px not shrunk too far from ${tier}`);
  }
  // Small zoom changes keep the current raster (no atlas thrash).
  assert.equal(iconTierPx(60, 64), 64);
  assert.equal(iconTierPx(66, 64), 64);
});
