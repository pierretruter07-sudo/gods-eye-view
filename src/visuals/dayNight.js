/**
 * @file Live day/night on the planet: the night side darkens behind a soft
 * terminator, and city lights glow on it.
 *
 * The photorealistic Google tiles are unlit and replace the globe surface,
 * so Cesium's own globe lighting cannot shade them. Instead a thin
 * translucent shell is drawn just above the surface (above the highest
 * mountains). Its shader darkens the side facing away from the Sun and adds
 * NASA's Black Marble night-lights image (VIIRS, public domain, served by
 * NASA GIBS). The Sun's direction comes from the wall clock, not the
 * viewer's clock, so the line is always live.
 *
 * It is a planet and regional view only: the shell fades in above about
 * 600 km camera height and is hidden below, so street-level and city views
 * (and the 3D tiles there) are never tinted.
 * @module visuals/dayNight
 */

/** Tunables (heights in metres). */
export const DAY_NIGHT = Object.freeze({
  /** Shell lift above the WGS84 ellipsoid: clears Everest (8,849 m). */
  liftM: 10_000,
  /** Camera height where the shell starts to show, and where it is full. */
  fadeStartM: 600_000,
  fadeFullM: 2_000_000,
  /** Night-side darkening and city-light strength (0-1). */
  nightAlpha: 0.8,
  lightsGain: 1.4,
});

/**
 * NASA GIBS night-lights images, tried in order (equirectangular, whole
 * world). Public domain (NASA); GIBS asks for an acknowledgement, which is
 * in the credits.
 */
export const NIGHT_LIGHTS_URLS = Object.freeze([
  'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=VIIRS_Black_Marble&STYLES=&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=4096&HEIGHT=2048&FORMAT=image/jpeg',
  'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=VIIRS_CityLights_2012&STYLES=&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=4096&HEIGHT=2048&FORMAT=image/jpeg',
]);

const RAD = Math.PI / 180;

/**
 * The point on Earth where the Sun is overhead (NOAA's low-precision solar
 * position; well under 1° error, plenty for a terminator line).
 * @param {Date} date
 * @returns {{lat: number, lon: number}} degrees
 */
export function subsolarPoint(date) {
  const jd = date.getTime() / 86_400_000 + 2_440_587.5;
  const n = jd - 2_451_545.0; // days since J2000.0
  const L = (280.46 + 0.9856474 * n) % 360; // mean longitude
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD; // mean anomaly
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const epsilon = (23.439 - 0.0000004 * n) * RAD;
  const decl = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda));
  // Greenwich mean sidereal time (degrees).
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;
  let lon = ra / RAD - gmst;
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  return { lat: decl / RAD, lon };
}

/** Unit vector to the Sun in Earth-fixed (ECEF) axes. */
export function sunDirectionEcef(date) {
  const { lat, lon } = subsolarPoint(date);
  const cl = Math.cos(lat * RAD);
  return {
    x: cl * Math.cos(lon * RAD),
    y: cl * Math.sin(lon * RAD),
    z: Math.sin(lat * RAD),
  };
}

/**
 * Shell opacity for a camera height: 0 at city and regional range, 1 at
 * planet scale, smooth in between.
 */
export function nightFade(heightM, rules = DAY_NIGHT) {
  if (!Number.isFinite(heightM)) return 0;
  const t = (heightM - rules.fadeStartM) / (rules.fadeFullM - rules.fadeStartM);
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

const SHADER = `
uniform sampler2D lights;
uniform vec3 sunWC;
uniform float fade;
uniform float nightAlpha;
uniform float lightsGain;
uniform float hasLights;
czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material m = czm_getDefaultMaterial(materialInput);
  vec3 n = normalize(materialInput.normalEC);
  vec3 sunEC = normalize(czm_viewRotation * sunWC);
  float d = dot(n, sunEC);
  // Soft terminator: civil-twilight wide, not a hard edge.
  float night = 1.0 - smoothstep(-0.14, 0.06, d);
  vec3 nWC = normalize(czm_inverseViewRotation * n);
  vec2 uv = vec2(atan(nWC.y, nWC.x) / czm_twoPi + 0.5,
                 asin(clamp(nWC.z, -1.0, 1.0)) / czm_pi + 0.5);
  float lum = texture(lights, uv).r * hasLights;
  float city = smoothstep(0.10, 0.85, lum);
  // A thin warm glow along the line itself.
  float band = exp(-pow((d + 0.02) / 0.035, 2.0));
  vec3 lightsColor = vec3(1.0, 0.80, 0.50) * city * lightsGain;
  m.diffuse = vec3(0.0, 0.006, 0.02);
  m.emission = lightsColor * night + vec3(1.0, 0.42, 0.16) * band * 0.4;
  m.alpha = clamp((night * nightAlpha + city * night * 0.6 + band * 0.1) * fade, 0.0, 0.95);
  return m;
}`;

/**
 * Mount the day/night shell.
 * @param {{viewer: object, Cesium: object, enabled?: boolean,
 *   lightsUrls?: string[], now?: () => Date}} options
 */
export function createDayNight({
  viewer,
  Cesium,
  enabled = true,
  lightsUrls = NIGHT_LIGHTS_URLS,
  now = () => new Date(),
}) {
  const scene = viewer.scene;
  const lift = DAY_NIGHT.liftM;
  const radii = new Cesium.Cartesian3(
    6_378_137 + lift,
    6_378_137 + lift,
    6_356_752.3142 + lift,
  );
  // Until the night-lights image arrives: a 1×1 black texture.
  const blank = document.createElement('canvas');
  blank.width = 1;
  blank.height = 1;
  const material = new Cesium.Material({
    fabric: {
      uniforms: {
        lights: blank,
        sunWC: new Cesium.Cartesian3(1, 0, 0),
        fade: 0,
        nightAlpha: DAY_NIGHT.nightAlpha,
        lightsGain: DAY_NIGHT.lightsGain,
        hasLights: 0,
      },
      source: SHADER,
    },
    translucent: true,
  });
  const primitive = new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry: new Cesium.EllipsoidGeometry({
        radii,
        stackPartitions: 128,
        slicePartitions: 256,
        vertexFormat:
          Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat,
      }),
    }),
    appearance: new Cesium.MaterialAppearance({
      material,
      flat: true,
      translucent: true,
      closed: true,
      materialSupport: Cesium.MaterialAppearance.MaterialSupport.TEXTURED,
    }),
    asynchronous: false,
    allowPicking: false,
    show: false,
  });
  scene.primitives.add(primitive);

  let on = enabled;
  let lightsSource = null;
  let lastSunAt = 0;

  (async () => {
    for (const url of lightsUrls) {
      try {
        const image = await Cesium.Resource.fetchImage({ url });
        if (primitive.isDestroyed()) return;
        material.uniforms.lights = image;
        material.uniforms.hasLights = 1;
        lightsSource = url;
        scene.requestRender?.();
        return;
      } catch (error) {
        console.warn('[visuals] night-lights image unavailable', url, error);
      }
    }
  })();

  const sun = new Cesium.Cartesian3();
  function update() {
    if (primitive.isDestroyed()) return;
    const height = scene.camera.positionCartographic?.height;
    const fade = on ? nightFade(height) : 0;
    material.uniforms.fade = fade;
    primitive.show = fade > 0.01;
    if (!primitive.show) return;
    const t = Date.now();
    if (t - lastSunAt > 10_000) {
      lastSunAt = t;
      const s = sunDirectionEcef(now());
      material.uniforms.sunWC = Cesium.Cartesian3.fromElements(
        s.x,
        s.y,
        s.z,
        sun,
      );
    }
  }
  const removeHook = scene.preRender.addEventListener(update);

  return {
    setEnabled(value) {
      on = Boolean(value);
      update();
      scene.requestRender?.();
    },
    enabled: () => on,
    state: () => {
      update();
      return {
        enabled: on,
        shown: !primitive.isDestroyed() && primitive.show,
        fade: material.uniforms.fade,
        lights: lightsSource,
        subsolar: subsolarPoint(now()),
      };
    },
    destroy() {
      removeHook();
      if (!primitive.isDestroyed()) scene.primitives.remove(primitive);
    },
  };
}
