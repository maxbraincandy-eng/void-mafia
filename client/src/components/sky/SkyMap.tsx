import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { haptic } from '@/lib/haptics';
import {
  computeBodies, horizonToVector, equatorialToHorizon, julianDate,
  saturnRingTilt, RADIUS_KM, type SkyBody, type PlanetId,
} from '@/lib/astro';
import { ALL_STARS, CONSTELLATIONS, STAR_BY_KEY, starColour, type Star } from '@/lib/skyCatalog';
import { surfaceTexture, ringTexture, glowSprite, MOONS } from './planetArt';

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

export default function SkyMap({ onClose }: { onClose: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
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
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
        setCamOn(true);
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

    // Stars, as one point cloud.
    const starGeo = new THREE.BufferGeometry();
    const pos: number[] = [], col: number[] = [], siz: number[] = [];
    const starDirs: { star: Star; v: THREE.Vector3 }[] = [];
    for (const s of ALL_STARS) {
      const v = new THREE.Vector3();
      starDirs.push({ star: s, v });
      pos.push(0, 0, 0);
      const [r, g, b] = starColour(s.bv);
      col.push(r, g, b);
      siz.push(Math.max(1.2, 7.5 - s.mag * 1.5));
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    starGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    starGeo.setAttribute('size', new THREE.Float32BufferAttribute(siz, 1));
    const starMat = new THREE.PointsMaterial({
      size: 6, map: dot, vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false,
    });
    const starPoints = new THREE.Points(starGeo, starMat);
    starPoints.frustumCulled = false;
    scene.add(starPoints);

    // Constellation figures.
    const lineGeo = new THREE.BufferGeometry();
    const linePairs: [string, string][] = CONSTELLATIONS.flatMap(c => c.lines);
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(linePairs.length * 6).fill(0), 3));
    const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({
      color: 0x6f8fd0, transparent: true, opacity: 0.30, depthWrite: false,
    }));
    lines.frustumCulled = false;
    scene.add(lines);

    // Planets, Sun and Moon: a sprite each, sized by brightness.
    const marks: Record<string, THREE.Sprite> = {};
    for (const id of ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: dot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      sp.frustumCulled = false;
      marks[id] = sp;
      scene.add(sp);
    }

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

        for (const b of bodiesRef.current) {
          const sp = marks[b.id];
          const w = horizonToVector(b.horizon);
          sp.position.set(w.x * 100, w.y * 100, w.z * 100);
          const visible = b.horizon.alt > -2;
          sp.visible = visible;
          // Brightness → drawn size, on the same rough scale as the stars.
          const s = b.id === 'sun' ? 9 : b.id === 'moon' ? 8 : Math.max(2.2, 6.5 - b.mag * 1.1);
          sp.scale.setScalar(s * 0.55);
          const m = sp.material as THREE.SpriteMaterial;
          m.color.set(
            b.id === 'mars' ? 0xff9a6a : b.id === 'sun' ? 0xfff0a0 :
            b.id === 'jupiter' ? 0xffe9c0 : b.id === 'saturn' ? 0xf0dfae :
            b.id === 'moon' ? 0xf2f2f0 : b.id === 'neptune' ? 0x9ab8ff : 0xffffff,
          );
        }
      }

      if (manualRef.current.on) aimManually(); else aimFromDevice();

      if (camera.fov !== fovRef.current) {
        camera.fov = fovRef.current;
        camera.updateProjectionMatrix();
      }
      // Points do not scale with FOV on their own; zooming in should make the
      // sky feel magnified, not just cropped.
      starMat.size = 6 * Math.max(1, Math.min(4, 65 / fovRef.current) ** 0.6);

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
      starGeo.dispose(); lineGeo.dispose(); horizonGeo.dispose();
      dot.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [place.lat, place.lon]);

  // Stop the camera when the panel closes — a live camera nobody is looking at
  // is both a battery drain and a light people notice.
  useEffect(() => () => {
    const v = videoRef.current;
    const s = v?.srcObject as MediaStream | null;
    s?.getTracks().forEach(t => t.stop());
  }, []);

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
