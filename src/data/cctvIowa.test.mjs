import test from 'node:test';
import assert from 'node:assert/strict';
import { iowaCameraToSource } from '../../server/providers/cctv/sources.js';

// Shaped like the live feature service (sampled on Replit, 20 Oct 2026).
const feature = (props, coords = [-93.624546, 41.59534]) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: coords },
  properties: {
    device_id: 'dmtv114',
    Desc_: 'DM - I-235 @ MM 8.4 (5th Ave)',
    ImageName: 'dmtv114hd',
    ImageURL: 'https://atmsqf.iowadot.gov/SNAPSHOTS/PUBLIC/Metro/dmtv114hd.jpeg',
    VideoURL: 'https://video4.iowadot.gov:8888/ankeny/dmtv114lb/playlist.m3u8',
    latitude: 41.59534,
    longitude: -93.624546,
    ...props,
  },
});

test('Iowa DOT cameras register as live HLS video with the snapshot as fallback, credited CC BY 4.0', () => {
  const cam = iowaCameraToSource(feature());
  assert.equal(cam.id, 'iowa-dmtv114');
  assert.equal(cam.feedType, 'hls');
  assert.equal(cam.url, 'https://video4.iowadot.gov:8888/ankeny/dmtv114lb/playlist.m3u8');
  assert.equal(cam.snapshotUrl, 'https://atmsqf.iowadot.gov/SNAPSHOTS/PUBLIC/Metro/dmtv114hd.jpeg');
  assert.equal(cam.city, 'Des Moines');
  assert.equal(cam.provider, 'Iowa Department of Transportation');
  assert.match(cam.license, /CC BY 4\.0/);
  // After the host migration (video4 → video) the camera still plays.
  assert.equal(
    iowaCameraToSource(feature({ VideoURL: 'https://video.iowadot.gov/ankeny/dmtv114lb/playlist.m3u8' })).feedType,
    'hls',
  );
});

test('Iowa rows without video are stills; foreign hosts and bad positions are refused', () => {
  const still = iowaCameraToSource(feature({ VideoURL: null }));
  assert.equal(still.feedType, 'image');
  assert.equal(still.url, still.snapshotUrl);
  assert.equal(
    iowaCameraToSource(feature({ VideoURL: 'https://evil.example/x/playlist.m3u8' })).feedType,
    'image',
    'video only from Iowa DOT hosts',
  );
  assert.equal(iowaCameraToSource(feature({ ImageURL: 'https://evil.example/a.jpeg' })), null);
  assert.equal(
    iowaCameraToSource(feature({ latitude: 0, longitude: 0 }, [0, 0])),
    null,
  );
  assert.equal(iowaCameraToSource(feature({ device_id: null, COMMON_ID: null, ImageName: null })), null);
});
