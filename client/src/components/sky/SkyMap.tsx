import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { haptic } from '@/lib/haptics';
import {
  computeBodies, horizonToVector, equatorialToHorizon, julianDate,
  saturnRingTilt, RADIUS_KM, type SkyBody, type PlanetId,
} from '@/lib/astro';
import { ALL_STARS, CONSTELLATIONS, STAR_BY_KEY, starColour, type Star } from '@/lib/skyCatalog';
import { milkyWayGrains } from '@/lib/milkyWay';
import { surfaceTexture, ringTexture, glowSprite, phaseDisc, MOONS } from './planetArt';

/**
 * ცის რუკა — point the phone at the sky and it tells you what is there.
 *
 * What this is NOT, said plainly because the difference matters: it is not a
 * telescope. No phone camera can resolve Saturn's rings — the physics is not
 * close. A phone's best telephoto has an aperture around 6mm, which diffraction
 * limits to roughly 20 arcseconds, and Saturn's whole globe is 18. The rings
 * would be a smear a couple of pixels wide, and its moons are far beyond reach.
 *
 * So the camera provides the horizon, the buildings, the trees — the part of
 * the view a camera is good at — and everything above it is computed and drawn.
 * When you zoom into Saturn you get Saturn: the real position, the real
 * distance, the real ring tilt for tonight, rendered at a size you can actually
 * look at. That is what a planetarium does, and it is the honest version of
 * what a phone can offer.
 */

const NAMES: Record<string, string> = {
  sun: 'მზე', moon: 'მთვარე', mercury: 'მერკური', venus: 'ვენერა',
  mars: 'მარსი', jupiter: 'იუპიტერი', saturn: 'სატურნი',
  uranus: 'ურანი', neptune: 'ნეპტუნი',
};

const FACTS: Record<string, string> = {
  sun: 'G2V ვარსკვლავი · 1.4 მლნ კმ დიამეტრი',
  moon: 'დედამიწის თანამგზავრი · 3 474 კმ',
  mercury: 'უმცირესი პლანეტა · უჰაერო · 4 879 კმ',
  venus: 'CO₂ ატმოსფერო · 465 °C · 12 104 კმ',
  mars: 'ორი თანამგზავრი · ყინულის პოლუსები · 6 779 კმ',
  jupiter: 'გაზური გიგანტი · 95 თანამგზავრი · 139 820 კმ',
  saturn: 'რგოლები 282 000 კმ განივში · 146 თანამგზავრი',
  uranus: 'გვერდზე დაწოლილი ღერძი · 50 724 კმ',
  neptune: 'ყველაზე ძლიერი ქარები · 2 100 კმ/სთ',
};

/** Reasonable default if location is refused — the app's home city. */
const FALLBACK = { lat: 41.716, lon: 44.783, name: 'თბილისი' };

type Perm = 'idle' | 'asking' | 'granted' | 'denied';

interface Picked {
  kind: 'planet' | 'star';
  id: string;
  name: string;
  body?: SkyBody;
  star?: Star;
  altAz: { alt: number; az: number };
}

export default function SkyMap({ onClose: closeRequested }: { onClose: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  /**
   * The camera stream, held HERE and not read back off the <video> element.
   *
   * The old cleanup did `videoRef.current?.srcObject` — and React detaches refs
   * during the commit that removes the node, while a passive effect's cleanup
   * runs in the pass AFTER that. So the ref was always null by then, the tracks
   * were never stopped, and the camera stayed live until the whole app was
   * killed. A recording indicator nobody can turn off is not a small bug.
   */
  const streamRef = useRef<MediaStream | null>(null);
  const [perm, setPerm] = useState<Perm>('idle');
  const [camOn, setCamOn] = useState(false);
  // Passthrough is a help outdoors at night and a hindrance anywhere bright,
  // so it is a switch rather than a fact.
  const [showCam, setShowCam] = useState(true);
  const [place, setPlace] = useState(FALLBACK);
  const [fov, setFov] = useState(65);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [manual, setManual] = useState(false);

  // Live values the animation loop reads without re-subscribing.
  const fovRef = useRef(fov);
  const orient = useRef({ alpha: 0, beta: 0, gamma: 0, screen: 0, absolute: false });
  const manualRef = useRef({ az: 0, alt: 20, on: false });
  const bodiesRef = useRef<SkyBody[]>([]);
  const pickRef = useRef<((x: number, y: number) => void) | null>(null);

  useEffect(() => { fovRef.current = fov; }, [fov]);
  useEffect(() => { manualRef.current.on = manual; }, [manual]);

  // ── Where you are ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      p => setPlace({ lat: p.coords.latitude, lon: p.coords.longitude, name: '' }),
      () => { /* the fallback is already in place */ },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    );
  }, []);

  // ── The camera behind the sky ─────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }, audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
        setCamOn(true);
      } else {
        // Unmounted while the permission prompt was open.
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    } catch {
      // No camera, or refused: the sky still works against black, which is
      // what a planetarium is anyway.
      setCamOn(false);
    }
  }, []);

  // ── Which way the phone is pointing ───────────────────────────────────────
  const askOrientation = useCallback(async () => {
    setPerm('asking');
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    } | undefined;
    try {
      if (DOE?.requestPermission) {
        // iOS 13+: only from a user gesture, which is why this is behind a tap.
        const res = await DOE.requestPermission();
        if (res !== 'granted') { setPerm('denied'); setManual(true); return; }
      }
      setPerm('granted');
      await startCamera();
    } catch {
      setPerm('denied');
      setManual(true);
    }
  }, [startCamera]);

  useEffect(() => {
    if (perm !== 'granted') return;
    const onAbs = (e: DeviceOrientationEvent) => {
      if (e.alpha == null) return;
      orient.current = {
        alpha: e.alpha, beta: e.beta ?? 0, gamma: e.gamma ?? 0,
        screen: (screen.orientation?.angle ?? 0),
        absolute: true,
      };
      setHeading(360 - e.alpha);
    };
    const onRel = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
      if (e.alpha == null) return;
      // iOS gives true heading separately; without it alpha is relative to
      // wherever the phone happened to be and the sky points nowhere.
      const compass = e.webkitCompassHeading;
      orient.current = {
        alpha: compass != null ? 360 - compass : e.alpha,
        beta: e.beta ?? 0, gamma: e.gamma ?? 0,
        screen: (screen.orientation?.angle ?? 0),
        absolute: compass != null || !!e.absolute,
      };
      setHeading(compass != null ? compass : 360 - e.alpha);
    };
    window.addEventListener('deviceorientationabsolute', onAbs as EventListener);
    window.addEventListener('deviceorientation', onRel as EventListener);
    return () => {
      window.removeEventListener('deviceorientationabsolute', onAbs as EventListener);
      window.removeEventListener('deviceorientation', onRel as EventListener);
    };
  }, [perm]);

  // ── The sky itself ────────────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(65, mount.clientWidth / mount.clientHeight, 0.1, 2000);

    const dot = new THREE.CanvasTexture(glowSprite());

    /*
     * Stars.
     *
     * A PointsMaterial draws every point at ONE size — the per-star `size`
     * attribute the old code built was never read, so Sirius and a magnitude-3
     * filler star came out identically. On a real sky the brightest stars are
     * the whole structure; without that difference the view is a spray of
     * identical dots, which is the single thing that made this read as a
     * prototype. A small shader gives each star its own size, its own colour,
     * and two things a flat sprite cannot do:
     *
     *   EXTINCTION — air absorbs starlight, and near the horizon you are
     *   looking through far more of it. At 10° altitude a star is about a
     *   magnitude fainter than overhead, and redder. This is why the overlay
     *   used to look pasted on: real stars fade into the murk above a roofline
     *   and these did not.
     *
     *   SCINTILLATION — twinkling is the same air, and it is much stronger low
     *   down. It is also the cue that separates a star from a satellite or a
     *   dead pixel, and the eye reads it instantly.
     */
    const starGeo = new THREE.BufferGeometry();
    const pos: number[] = [], col: number[] = [], siz: number[] = [], twk: number[] = [];
    const starDirs: { star: Star; v: THREE.Vector3 }[] = [];
    for (const s of ALL_STARS) {
      const v = new THREE.Vector3();
      starDirs.push({ star: s, v });
      pos.push(0, 0, 0);
      const [r, g, b] = starColour(s.bv);
      col.push(r, g, b);
      // Brightness is logarithmic — each magnitude is ×2.512 in flux — so the
      // drawn radius follows the same law rather than a straight line.
      siz.push(2.0 + 16 * Math.pow(2.512, -0.28 * (s.mag + 1.5)));
      twk.push(Math.random() * 6.283);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    starGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    starGeo.setAttribute('size', new THREE.Float32BufferAttribute(siz, 1));
    starGeo.setAttribute('phase', new THREE.Float32BufferAttribute(twk, 1));

    const POINT_VERT = `
      attribute float size;
      attribute float phase;
      varying vec3 vColor;
      uniform float scale;
      uniform float time;
      uniform float twinkle;
      uniform float dpr;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // Altitude of this point, for extinction. y is up in the horizon frame.
        float alt = normalize(position).y;
        float air = clamp(alt, 0.02, 1.0);
        // Airmass ≈ 1/sin(alt); the exponent is the usual ~0.28 mag per airmass
        // in the visual band, converted to a flux multiplier.
        float ext = pow(0.77, (1.0 / air) - 1.0);
        float tw = 1.0 + twinkle * (1.0 - air) * 0.55 * sin(time * 7.3 + phase);
        vColor *= ext * tw;
        // gl_PointSize is in FRAMEBUFFER pixels. On a phone the framebuffer is
        // two or three times the CSS size, so without this every star drew at a
        // third of its intended diameter — which is most of why the sky looked
        // thin and unfinished.
        gl_PointSize = size * scale * dpr * sqrt(max(ext, 0.05));
        gl_Position = projectionMatrix * mv;
      }`;
    const POINT_FRAG = `
      uniform sampler2D map;
      varying vec3 vColor;
      void main() {
        vec4 t = texture2D(map, gl_PointCoord);
        gl_FragColor = vec4(vColor, 1.0) * t;
      }`;

    const dpr = renderer.getPixelRatio();
    const starUniforms = {
      map: { value: dot }, scale: { value: 1 }, time: { value: 0 }, twinkle: { value: 1 },
      dpr: { value: dpr },
    };
    const starMat = new THREE.ShaderMaterial({
      uniforms: starUniforms, vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
      transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, vertexColors: true,
    });
    const starPoints = new THREE.Points(starGeo, starMat);
    starPoints.frustumCulled = false;
    starPoints.renderOrder = 3;
    scene.add(starPoints);

    /*
     * The Milky Way — the same shader, dimmer and finer.
     *
     * Thousands of grains of unresolved starlight along the galactic plane. It
     * is computed, not painted: see lib/milkyWay. Drawn UNDER everything else
     * so a bright star sits on top of it rather than being lost in it.
     */
    const grains = milkyWayGrains(3400);
    const mwGeo = new THREE.BufferGeometry();
    const mwPos: number[] = [], mwCol: number[] = [], mwSiz: number[] = [], mwPh: number[] = [];
    const mwDirs: THREE.Vector3[] = [];
    for (const g of grains) {
      mwDirs.push(new THREE.Vector3());
      mwPos.push(0, 0, 0);
      // Faintly warm, the way the integrated light of an old stellar
      // population actually is — not the blue-white of a hot foreground star.
      const b = g.bright * 0.78;
      mwCol.push(b * 1.0, b * 0.94, b * 0.86);
      mwSiz.push(1.8 + g.bright * 3.0);
      mwPh.push(Math.random() * 6.283);
    }
    mwGeo.setAttribute('position', new THREE.Float32BufferAttribute(mwPos, 3));
    mwGeo.setAttribute('color', new THREE.Float32BufferAttribute(mwCol, 3));
    mwGeo.setAttribute('size', new THREE.Float32BufferAttribute(mwSiz, 1));
    mwGeo.setAttribute('phase', new THREE.Float32BufferAttribute(mwPh, 1));
    const mwUniforms = {
      map: { value: dot }, scale: { value: 1 }, time: { value: 0 }, twinkle: { value: 0 },
      dpr: { value: dpr },
    };
    const mwMat = new THREE.ShaderMaterial({
      uniforms: mwUniforms, vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
      transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, vertexColors: true,
    });
    const mwPoints = new THREE.Points(mwGeo, mwMat);
    mwPoints.frustumCulled = false;
    mwPoints.renderOrder = 1;
    scene.add(mwPoints);

    // Constellation figures.
    const lineGeo = new THREE.BufferGeometry();
    const linePairs: [string, string][] = CONSTELLATIONS.flatMap(c => c.lines);
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(linePairs.length * 6).fill(0), 3));
    const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({
      color: 0x6f8fd0, transparent: true, opacity: 0.30, depthWrite: false,
    }));
    lines.frustumCulled = false;
    lines.renderOrder = 2;
    scene.add(lines);

    // Planets, Sun and Moon: a glow each, sized by brightness.
    const BODY_IDS = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
    const marks: Record<string, THREE.Sprite> = {};
    for (const id of BODY_IDS) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: dot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      sp.frustumCulled = false;
      sp.renderOrder = 4;          // above the stars and the band
      marks[id] = sp;
      scene.add(sp);
    }

    /*
     * …and a real disc behind the glow, drawn with the body's actual phase.
     *
     * The disc is placed at its TRUE angular size — the Moon subtends about
     * half a degree, which is roughly seven pixels at the default field of
     * view, and it grows as you zoom exactly as the real one would through
     * binoculars. Nothing here is inflated to look impressive: a half moon
     * that is drawn full, or a Moon drawn the size of a coin, is the kind of
     * detail that makes the rest of the map untrustworthy.
     *
     * Which way the horns point is not baked into the picture. The bright limb
     * faces the Sun, and where the Sun is relative to the Moon ON SCREEN
     * depends on both their positions and how the phone is held, so the sprite
     * is rotated every frame from the geometry.
     */
    const discs: Record<string, { sprite: THREE.Sprite; tex: THREE.CanvasTexture; illum: number }> = {};
    for (const id of BODY_IDS) {
      if (id === 'sun') continue;                 // no phase, and never look at it
      const tex = new THREE.CanvasTexture(phaseDisc(id, 1, 128));
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false, depthTest: false,
      }));
      sp.frustumCulled = false;
      sp.renderOrder = 5;                          // in front of its own glow
      scene.add(sp);
      discs[id] = { sprite: sp, tex, illum: 1 };
    }

    const camRight = new THREE.Vector3();
    const camUp = new THREE.Vector3();
    const toSun = new THREE.Vector3();
    const bodyDir = new THREE.Vector3();

    /*
     * Horizon glow — the thing that makes the overlay belong to the picture.
     *
     * Look at any real photograph of a night sky: the bottom of the frame is
     * not black. There is airglow, scattered city light, and the sheer depth of
     * atmosphere you are looking through sideways, and it produces a warm band
     * that fades upward over twenty degrees or so. Drawing stars on straight
     * black over a camera feed is exactly what makes an AR overlay look stuck
     * on top of the world instead of in it, because the one gradient every
     * viewer has seen a thousand times is missing.
     *
     * A cylinder from just under the horizon to about 24° up, additively
     * blended so it lightens the camera image rather than covering it.
     */
    const hazeCanvas = document.createElement('canvas');
    hazeCanvas.width = 4; hazeCanvas.height = 128;
    {
      const g = hazeCanvas.getContext('2d')!;
      const grad = g.createLinearGradient(0, 128, 0, 0);
      grad.addColorStop(0.00, 'rgba(92,74,54,0.55)');   // sodium-lit murk
      grad.addColorStop(0.18, 'rgba(70,66,72,0.34)');
      grad.addColorStop(0.48, 'rgba(44,52,78,0.16)');   // turning to sky
      grad.addColorStop(1.00, 'rgba(30,40,70,0.00)');
      g.fillStyle = grad; g.fillRect(0, 0, 4, 128);
    }
    const hazeTex = new THREE.CanvasTexture(hazeCanvas);
    hazeTex.colorSpace = THREE.SRGBColorSpace;
    const hazeGeo = new THREE.CylinderGeometry(100, 100, 44, 64, 1, true);
    const haze = new THREE.Mesh(hazeGeo, new THREE.MeshBasicMaterial({
      map: hazeTex, transparent: true, opacity: 0.85, depthWrite: false, depthTest: false,
      side: THREE.BackSide, blending: THREE.AdditiveBlending,
    }));
    haze.position.y = 14;             // base a little below the horizon line
    haze.renderOrder = 0;             // under the Milky Way and the stars
    haze.frustumCulled = false;
    scene.add(haze);

    // A horizon ring, so "below the horizon" is visibly a place.
    const horizonGeo = new THREE.BufferGeometry();
    const hp: number[] = [];
    for (let a = 0; a <= 360; a += 2) {
      const v = horizonToVector({ alt: 0, az: a });
      hp.push(v.x * 100, v.y * 100, v.z * 100);
    }
    horizonGeo.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
    const horizon = new THREE.Line(horizonGeo, new THREE.LineBasicMaterial({
      color: 0x36d6a0, transparent: true, opacity: 0.35,
    }));
    horizon.frustumCulled = false;
    scene.add(horizon);

    // ── Device orientation → camera ──
    const zee = new THREE.Vector3(0, 0, 1);
    const euler = new THREE.Euler();
    const q0 = new THREE.Quaternion();
    const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
    const D = Math.PI / 180;

    function aimFromDevice() {
      const { alpha, beta, gamma, screen: sc } = orient.current;
      euler.set(beta * D, alpha * D, -gamma * D, 'YXZ');
      camera.quaternion.setFromEuler(euler);
      camera.quaternion.multiply(q1);
      camera.quaternion.multiply(q0.setFromAxisAngle(zee, -sc * D));
    }
    function aimManually() {
      const { az, alt } = manualRef.current;
      const v = horizonToVector({ alt, az });
      camera.position.set(0, 0, 0);
      camera.lookAt(v.x, v.y, v.z);
    }

    // ── Picking ──
    const ray = new THREE.Raycaster();
    pickRef.current = (cx: number, cy: number) => {
      const r = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const dir = ray.ray.direction.clone().normalize();

      // Nearest object by angle, with a tolerance that scales with the zoom —
      // at 60° a fat thumb should still hit, at 2° it must be precise.
      const tol = Math.max(1.2, fovRef.current * 0.05) * D;
      let best: Picked | null = null;
      let bestAngle = tol;

      for (const b of bodiesRef.current) {
        if (b.horizon.alt < -2) continue;
        const v = horizonToVector(b.horizon);
        const a = dir.angleTo(new THREE.Vector3(v.x, v.y, v.z));
        if (a < bestAngle) {
          bestAngle = a;
          best = { kind: 'planet', id: b.id, name: NAMES[b.id] ?? b.id, body: b, altAz: b.horizon };
        }
      }
      for (const { star, v } of starDirs) {
        if (v.lengthSq() === 0) continue;
        const a = dir.angleTo(v.clone().normalize());
        if (a < bestAngle) {
          bestAngle = a;
          best = {
            kind: 'star', id: star.k, name: star.name, star,
            altAz: { alt: 0, az: 0 },
          };
        }
      }
      haptic(best ? 'selection' : 'tap');
      setPicked(best);
    };

    /*
     * One rotation for the whole sky.
     *
     * Each star goes through equatorialToHorizon individually — 79 of those is
     * nothing. Three thousand four hundred grains is a different question, and
     * they all undergo the SAME rotation, so it is computed once by sending the
     * three equatorial basis vectors through the identical pipeline and reading
     * off the columns. Precession and the hour angle are both rotations, so the
     * composite is one too and this is exact, not an approximation.
     */
    const eqBasis = [
      { ra: 0, dec: 0 },      // x̂
      { ra: 6, dec: 0 },      // ŷ
      { ra: 0, dec: 90 },     // ẑ
    ];
    const skyRot = new THREE.Matrix3();
    function updateSkyRotation(jd: number) {
      const c = eqBasis.map(({ ra, dec }) => {
        const h = equatorialToHorizon({ ra, dec, dist: 1 }, jd, place.lat, place.lon);
        const v = horizonToVector(h);
        return new THREE.Vector3(v.x, v.y, v.z);
      });
      skyRot.set(
        c[0].x, c[1].x, c[2].x,
        c[0].y, c[1].y, c[2].y,
        c[0].z, c[1].z, c[2].z,
      );
    }
    // Grain directions as J2000 equatorial unit vectors, placed once.
    const grainEq = grains.map(g => {
      const raR = g.ra * 15 * Math.PI / 180, decR = g.dec * Math.PI / 180;
      return new THREE.Vector3(
        Math.cos(decR) * Math.cos(raR),
        Math.cos(decR) * Math.sin(raR),
        Math.sin(decR),
      );
    });

    // ── Frame ──
    let raf = 0;
    let lastCompute = 0;
    const tmp = new THREE.Vector3();

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);

      // Sky positions change slowly; twice a second is far more than the eye
      // can tell, and it keeps the ephemeris off the render path.
      if (t - lastCompute > 500) {
        lastCompute = t;
        const now = new Date();
        const jd = julianDate(now);
        bodiesRef.current = computeBodies(now, place.lat, place.lon);

        updateSkyRotation(jd);
        const mp = mwGeo.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < grainEq.length; i++) {
          tmp.copy(grainEq[i]).applyMatrix3(skyRot);
          mp.setXYZ(i, tmp.x * 100, tmp.y * 100, tmp.z * 100);
          mwDirs[i].copy(tmp);
        }
        mp.needsUpdate = true;

        const p = starGeo.getAttribute('position') as THREE.BufferAttribute;
        starDirs.forEach(({ star, v }, i) => {
          const hz = equatorialToHorizon({ ra: star.ra, dec: star.dec, dist: 1 }, jd, place.lat, place.lon);
          const w = horizonToVector(hz);
          v.set(w.x, w.y, w.z);
          p.setXYZ(i, w.x * 100, w.y * 100, w.z * 100);
        });
        p.needsUpdate = true;

        const lp = lineGeo.getAttribute('position') as THREE.BufferAttribute;
        linePairs.forEach(([a, b], i) => {
          const sa = starDirs.find(s => s.star.k === a)?.v;
          const sb = starDirs.find(s => s.star.k === b)?.v;
          if (!sa || !sb) return;
          lp.setXYZ(i * 2, sa.x * 100, sa.y * 100, sa.z * 100);
          lp.setXYZ(i * 2 + 1, sb.x * 100, sb.y * 100, sb.z * 100);
        });
        lp.needsUpdate = true;

        let repainted = false;
        for (const b of bodiesRef.current) {
          const sp = marks[b.id];
          const w = horizonToVector(b.horizon);
          sp.position.set(w.x * 100, w.y * 100, w.z * 100);
          const visible = b.horizon.alt > -2;
          sp.visible = visible;
          /*
           * Size from brightness, on the SAME logarithmic law as the stars.
           *
           * The old linear formula gave Venus at magnitude −4 about the same
           * mark as Jupiter at −2, when Venus is six times the brightness. A
           * planet that outshines every star in the sky has to look like it
           * does, or the one object a beginner can actually identify is the
           * one the map understates.
           */
          const px = b.id === 'sun' ? 46 : b.id === 'moon' ? 40
            : Math.min(40, 2.0 + 16 * Math.pow(2.512, -0.28 * (b.mag + 1.5)));
          sp.scale.setScalar(px * 0.16);

          const disc = discs[b.id];
          if (disc) {
            disc.sprite.position.copy(sp.position);
            disc.sprite.visible = visible;
            // b.size is the apparent diameter in arcseconds. At a sphere of
            // radius 100 the world scale that subtends the same angle is
            // 100 × θ, with θ in radians — so the disc is exactly as big on
            // screen as the real one is in the sky.
            const theta = (b.size / 3600) * Math.PI / 180;
            disc.sprite.scale.setScalar(Math.max(0.55, 100 * theta));
            // Redraw only when the phase has actually moved. The Moon changes
            // about 1.7% of a lunation an hour; this repaints a handful of
            // times a night rather than twice a second.
            // …and only one repaint per tick. Every disc starts drawn full, so
            // the first update would otherwise redraw all eight at once —
            // eight canvas surfaces in one frame, which is a visible hitch the
            // moment the sky opens.
            if (!repainted && Math.abs(b.illum - disc.illum) > 0.004) {
              repainted = true;
              disc.illum = b.illum;
              disc.tex.image = phaseDisc(b.id, b.illum, 128);
              disc.tex.needsUpdate = true;
            }
          }
          const m = sp.material as THREE.SpriteMaterial;
          m.color.set(
            b.id === 'mars' ? 0xff9a6a : b.id === 'sun' ? 0xfff0a0 :
            b.id === 'jupiter' ? 0xffe9c0 : b.id === 'saturn' ? 0xf0dfae :
            b.id === 'moon' ? 0xf2f2f0 : b.id === 'neptune' ? 0x9ab8ff : 0xffffff,
          );
        }
      }

      if (manualRef.current.on) aimManually(); else aimFromDevice();

      /*
       * Point every lit limb at the Sun.
       *
       * The direction from a body toward the Sun, projected onto the sky at
       * that body, is the tangential part of the Sun's direction. Turning that
       * into a rotation for a camera-facing sprite is a dot product against the
       * camera's own right and up axes — which is why this belongs in the frame
       * loop and not in the twice-a-second update: it changes when the PHONE
       * moves, not when the sky does.
       */
      const sun = bodiesRef.current.find(b => b.id === 'sun');
      if (sun) {
        camera.updateMatrixWorld();
        camRight.setFromMatrixColumn(camera.matrixWorld, 0);
        camUp.setFromMatrixColumn(camera.matrixWorld, 1);
        const sv = horizonToVector(sun.horizon);
        for (const b of bodiesRef.current) {
          const disc = discs[b.id];
          if (!disc || !disc.sprite.visible) continue;
          const bv = horizonToVector(b.horizon);
          bodyDir.set(bv.x, bv.y, bv.z).normalize();
          toSun.set(sv.x, sv.y, sv.z).normalize();
          // Remove the part along the body's own direction: what is left is the
          // way the Sun lies ON the sky as seen from that body.
          toSun.addScaledVector(bodyDir, -toSun.dot(bodyDir));
          if (toSun.lengthSq() < 1e-9) continue;
          toSun.normalize();
          (disc.sprite.material as THREE.SpriteMaterial).rotation =
            Math.atan2(toSun.dot(camUp), toSun.dot(camRight));
        }
      }

      if (camera.fov !== fovRef.current) {
        camera.fov = fovRef.current;
        camera.updateProjectionMatrix();
      }
      // Points do not scale with FOV on their own; zooming in should make the
      // sky feel magnified, not just cropped.
      const zoomScale = Math.max(1, Math.min(4, 65 / fovRef.current) ** 0.6);
      starUniforms.scale.value = zoomScale;
      starUniforms.time.value = t * 0.001;
      // The band is unresolved light, so it gains grain rather than size when
      // magnified — and it never twinkles, because no single point of it is a
      // point source.
      mwUniforms.scale.value = Math.max(1, zoomScale * 0.55);
      mwUniforms.time.value = t * 0.001;

      renderer.render(scene, camera);
      void tmp;
    };
    raf = requestAnimationFrame(frame);

    const onResize = () => {
      if (!mount) return;
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      starGeo.dispose(); lineGeo.dispose(); horizonGeo.dispose(); mwGeo.dispose();
      hazeGeo.dispose(); hazeTex.dispose();
      for (const d of Object.values(discs)) d.tex.dispose();
      starMat.dispose(); mwMat.dispose();
      dot.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [place.lat, place.lon]);

  /** Leave, and let go of the camera on the way out rather than after it. */
  const onClose = useCallback(() => { stopCameraRef.current?.(); closeRequested(); }, [closeRequested]);
  const stopCameraRef = useRef<(() => void) | null>(null);

  /** Release the camera. Safe to call twice. */
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamOn(false);
  }, []);

  stopCameraRef.current = stopCamera;

  // Stop the camera when the panel closes — a live camera nobody is looking at
  // is a battery drain, and on iOS a recording dot the person cannot explain.
  useEffect(() => stopCamera, [stopCamera]);

  // …and while the app is in the background. Leaving the sensor running behind
  // another app is the version of this bug people actually notice.
  useEffect(() => {
    const onHidden = () => { if (document.hidden) stopCamera(); };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', stopCamera);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', stopCamera);
    };
  }, [stopCamera]);

  // ── Gestures: pinch to zoom, drag to look around in manual mode ───────────
  const gesture = useRef<{ dist: number; fov: number; x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      gesture.current = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), fov, x: 0, y: 0 };
    } else if (e.touches.length === 1) {
      gesture.current = { dist: 0, fov, x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const g = gesture.current;
    if (!g) return;
    if (e.touches.length === 2 && g.dist) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      setFov(Math.max(1.2, Math.min(80, g.fov * (g.dist / d))));
    } else if (e.touches.length === 1 && manualRef.current.on) {
      const dx = e.touches[0].clientX - g.x, dy = e.touches[0].clientY - g.y;
      g.x = e.touches[0].clientX; g.y = e.touches[0].clientY;
      const k = fov / 400;
      manualRef.current.az = (manualRef.current.az - dx * k + 360) % 360;
      manualRef.current.alt = Math.max(-30, Math.min(89, manualRef.current.alt + dy * k));
    }
  };
  const onTap = (e: React.MouseEvent) => pickRef.current?.(e.clientX, e.clientY);

  const zoomLabel = fov > 40 ? '1×' : `${(65 / fov).toFixed(1)}×`;

  return createPortal(
    <div className="fixed inset-0 z-[2400] select-none" style={{ background: '#04050c' }}
      onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>

      <video ref={videoRef} playsInline muted
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: camOn && showCam ? 0.5 : 0, transition: 'opacity 400ms ease' }} />

      <div ref={mountRef} className="absolute inset-0"
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onClick={onTap} />

      {/* ── The gate: orientation needs a tap, on iOS by law of the platform ── */}
      {perm !== 'granted' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center"
          style={{ background: 'rgba(4,5,12,0.92)' }}>
          <div style={{ fontSize: 54 }}>🔭</div>
          <h2 className="font-display font-black text-white mt-3" style={{ fontSize: 22 }}>ცის რუკა</h2>
          <p className="font-mono text-[12px] text-white/50 mt-2 leading-relaxed max-w-xs">
            მიმართე ტელეფონი ცისკენ და ნახავ რა არის იქ — პლანეტები, ვარსკვლავები,
            თანავარსკვლავედები, ზუსტად იმ ადგილას სადაც ახლა დგანან.
          </p>
          <button onClick={askOrientation} disabled={perm === 'asking'}
            className="mt-6 px-6 py-3 rounded-2xl font-display font-bold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', fontSize: 15 }}>
            {perm === 'asking' ? '…' : 'დაწყება'}
          </button>
          {perm === 'denied' && (
            <p className="font-mono text-[11px] text-amber-300/70 mt-4 max-w-xs leading-relaxed">
              სენსორზე წვდომა არ მოგვეცა — ცის რუკა ხელით რეჟიმში გაიხსნება, თითით
              დაატრიალე.
            </p>
          )}
          <button onClick={onClose} className="mt-3 font-mono text-[12px] text-white/35">დახურვა</button>
        </div>
      )}

      {/* ── HUD ── */}
      {perm === 'granted' && (
        <>
          <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-4"
            style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
            <div className="rounded-2xl px-3 py-2" style={{ background: 'rgba(6,8,20,0.6)', backdropFilter: 'blur(10px)' }}>
              <p className="font-mono text-[10px] text-white/45 leading-none">
                {heading != null ? `${Math.round(heading)}° ${compassLetter(heading)}` : '—'}
                <span className="text-white/25"> · </span>
                {place.lat.toFixed(2)}°, {place.lon.toFixed(2)}°
              </p>
              <p className="font-mono text-[10px] mt-1 leading-none" style={{ color: '#8ee9ff' }}>{zoomLabel} ზუმი</p>
            </div>
            <button onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white/70"
              style={{ background: 'rgba(6,8,20,0.6)', border: '1px solid rgba(255,255,255,0.16)' }}>✕</button>
          </div>

          {/* Zoom, as a slider as well as a pinch — one hand, in the dark. */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
            <span className="font-mono text-[9px] text-white/40">＋</span>
            <input
              type="range" min={1.2} max={80} step={0.1} value={80 + 1.2 - fov}
              onChange={e => setFov(80 + 1.2 - Number(e.target.value))}
              className="vm-sky-zoom"
              style={{ writingMode: 'vertical-lr', direction: 'rtl', width: 26, height: 170 }}
            />
            <span className="font-mono text-[9px] text-white/40">−</span>
          </div>

          <div className="absolute left-0 right-0 flex justify-center gap-2"
            style={{ bottom: 'max(18px, env(safe-area-inset-bottom))' }}>
            <button onClick={() => { setManual(m => !m); haptic('tap'); }}
              className="px-3 py-2 rounded-xl font-mono text-[11px]"
              style={{
                background: manual ? 'rgba(124,58,237,0.35)' : 'rgba(6,8,20,0.6)',
                border: '1px solid rgba(255,255,255,0.14)', color: manual ? '#d8c6ff' : 'rgba(255,255,255,0.55)',
              }}>
              {manual ? '✋ ხელით' : '📱 სენსორით'}
            </button>
            <button onClick={() => { setShowCam(v => !v); haptic('tap'); }}
              className="px-3 py-2 rounded-xl font-mono text-[11px]"
              style={{
                background: showCam ? 'rgba(6,8,20,0.6)' : 'rgba(124,58,237,0.35)',
                border: '1px solid rgba(255,255,255,0.14)',
                color: showCam ? 'rgba(255,255,255,0.55)' : '#d8c6ff',
              }}>
              {showCam ? '📷 კამერა' : '🌑 მხოლოდ ცა'}
            </button>
            <button onClick={() => { setFov(65); haptic('tap'); }}
              className="px-3 py-2 rounded-xl font-mono text-[11px] text-white/55"
              style={{ background: 'rgba(6,8,20,0.6)', border: '1px solid rgba(255,255,255,0.14)' }}>
              ↺ ზუმი
            </button>
          </div>
        </>
      )}

      {/* ── What you tapped ── */}
      {picked && (
        <div className="absolute left-3 right-3 rounded-2xl p-4"
          style={{
            bottom: 'calc(max(18px, env(safe-area-inset-bottom)) + 52px)',
            background: 'rgba(8,10,22,0.92)', border: '1px solid rgba(255,255,255,0.12)',
            backdropFilter: 'blur(14px)',
          }}>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-display font-black text-white" style={{ fontSize: 18 }}>{picked.name}</p>
              {picked.kind === 'planet' && picked.body && (
                <>
                  <p className="font-mono text-[11px] text-white/45 mt-1">{FACTS[picked.id]}</p>
                  <p className="font-mono text-[11px] mt-1.5" style={{ color: '#8ee9ff' }}>
                    {(picked.body.eq.dist * 149.598).toFixed(1)} მლნ კმ ·
                    {' '}სიკაშკაშე {picked.body.mag.toFixed(1)}<sup>m</sup> ·
                    {' '}ზომა {picked.body.size.toFixed(1)}″
                  </p>
                  <p className="font-mono text-[10px] text-white/35 mt-1">
                    სიმაღლე {picked.body.horizon.alt.toFixed(0)}° · აზიმუტი {picked.body.horizon.az.toFixed(0)}°
                    {picked.body.horizon.alt < 0 && ' · ჰორიზონტს ქვემოთ'}
                  </p>
                </>
              )}
              {picked.kind === 'star' && picked.star && (
                <p className="font-mono text-[11px] text-white/45 mt-1">
                  ვარსკვლავი · სიკაშკაშე {picked.star.mag.toFixed(2)}<sup>m</sup>
                </p>
              )}
            </div>
            <button onClick={() => setPicked(null)} className="text-white/35 text-sm px-1">✕</button>
          </div>
          {picked.kind === 'planet' && picked.id !== 'sun' && (
            <button onClick={() => { haptic('selection'); setDetail(picked.id); }}
              className="w-full mt-3 py-2.5 rounded-xl font-display font-bold text-white text-[13px]"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
              🔭 ახლოდან ნახვა
            </button>
          )}
        </div>
      )}

      {detail && <PlanetDetail id={detail} onClose={() => setDetail(null)} />}
    </div>,
    document.body,
  );
}

function compassLetter(deg: number): string {
  const names = ['ჩ', 'ჩა', 'ა', 'სა', 'ს', 'სდ', 'დ', 'ჩდ'];
  return names[Math.round(((deg % 360) / 45)) % 8];
}

/**
 * The close-up.
 *
 * This is the part that answers "show me Saturn with its rings". It is a
 * rendered model, not a photograph, and it is labelled as one — but the tilt of
 * the rings is tonight's real tilt, the size on screen tracks the real distance,
 * and the moons are at their real orbital radii.
 */
function PlanetDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState(0);

  useEffect(() => {
    const mount = ref.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.01, 200);

    /**
     * How far back to stand.
     *
     * A portrait phone is narrow, and Saturn's rings are 4.5 planet-radii
     * across, so the framing is limited by WIDTH — computing the distance from
     * the height, as the first version did, put the camera inside the planet's
     * face with the rings running off both edges and every moon out of frame.
     */
    const extent = MOONS[id]?.length ? 3.8 : id === 'saturn' ? 2.5 : 1.8;
    let orbitR = 6;
    const frame = () => {
      const aspect = mount.clientWidth / mount.clientHeight;
      const halfFov = (cam.fov / 2) * Math.PI / 180;
      // Fit the extent to whichever of the two is tighter.
      orbitR = Math.max(extent / (Math.tan(halfFov) * Math.max(aspect, 0.35)), extent / Math.tan(halfFov));
      orbitR = Math.min(orbitR, 26);
    };
    frame();

    scene.add(new THREE.AmbientLight(0xffffff, 0.32));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
    sun.position.set(-4, 1.6, 3);
    scene.add(sun);

    const tex = new THREE.CanvasTexture(surfaceTexture(id));
    tex.colorSpace = THREE.SRGBColorSpace;
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 64),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }),
    );
    // Uranus really does lie on its side; it is the one planet whose axial tilt
    // is the first thing anyone says about it.
    planet.rotation.z = (id === 'uranus' ? 98 : id === 'saturn' ? 26.7 : id === 'jupiter' ? 3.1 : id === 'mars' ? 25.2 : 0) * Math.PI / 180;
    scene.add(planet);

    const group = new THREE.Group();
    group.add(planet);
    scene.add(group);

    // Drag to look from somewhere else. The default is tonight's real geometry,
    // which for a year either side of a ring-plane crossing means the rings are
    // nearly edge-on — true, and also the one time you want to be able to tilt
    // the thing yourself and see them.
    const view = { yaw: 0, pitch: 0.28, dist: 1 };

    let ringTilt = 0;
    if (id === 'saturn') {
      ringTilt = saturnRingTilt(julianDate(new Date()));
      setTilt(ringTilt);
      const rt = new THREE.CanvasTexture(ringTexture());
      rt.colorSpace = THREE.SRGBColorSpace;
      // Real proportions: the bright rings run from 1.24 to 2.27 planet radii.
      const geo = new THREE.RingGeometry(1.24, 2.27, 256, 1);
      // RingGeometry's default UVs are square; remap so the strip runs radially.
      const p = geo.attributes.position as THREE.BufferAttribute;
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      const v3 = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v3.fromBufferAttribute(p, i);
        const r = v3.length();
        uv.setXY(i, (r - 1.24) / (2.27 - 1.24), 0.5);
      }
      uv.needsUpdate = true;
      const rings = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        map: rt, side: THREE.DoubleSide, transparent: true, depthWrite: false,
      }));
      rings.rotation.x = Math.PI / 2;
      group.add(rings);
      // Tonight's real opening angle. The camera starts on the ring plane so
      // this angle is what you see, rather than the sum of two arbitrary tilts.
      group.rotation.x = ringTilt * Math.PI / 180;
      view.pitch = 0.16;
    }

    // Moons, on their real orbital radii, scaled with the planet.
    const moons = MOONS[id] ?? [];
    const rp = RADIUS_KM[id as PlanetId] ?? 1;
    const moonMeshes = moons.map(m => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.05, Math.min(0.16, (m.radiusKm / rp) * 2.4)), 20, 14),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(m.tint), roughness: 1 }),
      );
      group.add(mesh);
      return { mesh, def: m };
    });
    /**
     * Where to draw each moon.
     *
     * True scale does not survive a phone screen. Saturn's moons run from
     * Tethys at 5 planet-radii to Iapetus at 61, so scaling the outermost into
     * frame put the inner four INSIDE the rings — which is not compressed, it
     * is wrong. A logarithmic ramp keeps every moon outside the ring edge, in
     * the right order, with its real period; the distances are the one thing
     * given up, and the screen says so.
     */
    const radii = moons.map(m => Math.log(m.orbitKm / rp));
    const lo = Math.min(...radii, 0), hi = Math.max(...radii, 1);
    const screenRadius = (m: typeof moons[number]) =>
      2.6 + 1.0 * ((Math.log(m.orbitKm / rp) - lo) / Math.max(0.001, hi - lo));

    const epoch = julianDate(new Date());
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const secs = (t - t0) / 1000;
      planet.rotation.y = secs * 0.16;

      const r = orbitR * view.dist;
      cam.position.set(
        Math.sin(view.yaw) * Math.cos(view.pitch) * r,
        Math.sin(view.pitch) * r,
        Math.cos(view.yaw) * Math.cos(view.pitch) * r,
      );
      cam.lookAt(0, 0, 0);
      moonMeshes.forEach(({ mesh, def }, i) => {
        // Real period, sped up so a moon visibly moves while you watch.
        const ang = ((epoch / def.periodDays) * Math.PI * 2) + secs * (0.35 / Math.sqrt(def.periodDays)) + i;
        const r = screenRadius(def);
        mesh.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
      });
      renderer.render(scene, cam);
    };
    raf = requestAnimationFrame(tick);

    // Drag to orbit, pinch to close in.
    let drag: { x: number; y: number } | null = null;
    let pinch = 0;
    const el = renderer.domElement;
    const onDown = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                           e.touches[0].clientY - e.touches[1].clientY);
      } else {
        drag = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinch) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                             e.touches[0].clientY - e.touches[1].clientY);
        view.dist = Math.max(0.4, Math.min(2.4, view.dist * (pinch / d)));
        pinch = d;
        return;
      }
      if (!drag) return;
      view.yaw -= (e.touches[0].clientX - drag.x) * 0.008;
      view.pitch = Math.max(-1.45, Math.min(1.45, view.pitch + (e.touches[0].clientY - drag.y) * 0.006));
      drag = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onUp = () => { drag = null; pinch = 0; };
    el.addEventListener('touchstart', onDown, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onUp);

    const onResize = () => {
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      cam.aspect = mount.clientWidth / mount.clientHeight;
      cam.updateProjectionMatrix();
      frame();
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      el.removeEventListener('touchstart', onDown);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onUp);
      renderer.dispose();
      tex.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [id]);

  return (
    <div className="absolute inset-0 z-10 flex flex-col" style={{ background: '#03040a' }}>
      <div className="flex items-center justify-between p-4" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <div>
          <p className="font-display font-black text-white" style={{ fontSize: 20 }}>{NAMES[id] ?? id}</p>
          <p className="font-mono text-[10px] text-white/35 mt-0.5">
            {id === 'saturn'
              ? `რგოლების დახრა ამაღამ ${Math.abs(tilt).toFixed(1)}°`
              : FACTS[id]}
          </p>
        </div>
        <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center text-white/70"
          style={{ border: '1px solid rgba(255,255,255,0.16)' }}>✕</button>
      </div>
      <div ref={ref} className="flex-1" />
      <p className="font-mono text-[9.5px] text-white/25 text-center px-6 pb-5 leading-relaxed"
        style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
        ჩავლებით დაატრიალე · მოდელი, არა ფოტო — ტელეფონის კამერა ამას ვერ გადაიღებს.
        {MOONS[id] ? ' თანამგზავრების პერიოდები რეალურია, მანძილები შეკუმშული.' : ''}
      </p>
    </div>
  );
}
