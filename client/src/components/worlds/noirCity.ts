// ── Premium World: ნუარი — ქალაქი ─────────────────────────────────────
// The noir adventure as a place you walk through instead of a page you read.
// One rain-soaked block: the bar at one end, the alley behind it, Levan's
// office above, and the docks at the far end. Each location carries a story
// trigger; walking up and pressing interact opens that scene.
//
// AAA look on a phone budget, same rules as the terrace:
//  • Every facade is ONE InstancedMesh sharing a single lit-window canvas.
//  • Rain is ONE InstancedMesh of 260 streaks, wrapped by moving instance
//    matrices — no per-drop objects and no per-frame allocation.
//  • Four real lights total. Neon, puddles and windows are unlit emissive.
//  • Puddle shimmer and rain throttle off when ctx.perf.reduced is set.
import * as THREE from 'three';
import type { WorldDef, WorldContext } from './types';

let _s = 907771;
function rnd() { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967295; }
function rr(a: number, b: number) { return a + (b - a) * rnd(); }

const _neon = new Map<number, THREE.MeshBasicMaterial>();
function neon(c: number) {
  let m = _neon.get(c);
  if (!m) { m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false }); _neon.set(c, m); }
  return m;
}

/** Dark facade speckled with lit windows — shared by every building. */
let _winTex: THREE.Texture | null = null;
function windowTexture(): THREE.Texture {
  if (_winTex) return _winTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#06070d'; g.fillRect(0, 0, 64, 128);
  const cols = ['#ffcf8a', '#ffe6bb', '#8fb3ff', '#ff9f7a'];
  for (let y = 4; y < 128; y += 9) {
    for (let x = 4; x < 64; x += 10) {
      if (rnd() < 0.34) {
        g.fillStyle = cols[(rnd() * cols.length) | 0];
        g.globalAlpha = 0.35 + rnd() * 0.5;
        g.fillRect(x, y, 6, 5);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 6);
  _winTex = t; return t;
}

/**
 * Story hooks. The world only announces WHICH beat was reached; the React layer
 * decides what to show. Keeping it a plain event means the 3D world has no
 * import of the story engine and stays a scene, not a game.
 */
export const NOIR_BEAT_EVENT = 'vm-noir-beat';
function beat(id: string, label: string) {
  window.dispatchEvent(new CustomEvent(NOIR_BEAT_EVENT, { detail: { id, label } }));
}

export const noirCity: WorldDef = {
  id: 'noir_city',
  name: 'ნუარი · ქალაქი',
  subtitle: 'იარე ამბავში · წვიმა · ნეონი',
  icon: '🌃',
  status: 'live',
  spawn: { x: 0, z: 26, yaw: Math.PI },
  oceanR: 70,
  fog: { color: 0x080a14, density: 0.021 },
  clear: 0x05060c,

  build(ctx: WorldContext) {
    _s = 907771; _neon.clear();
    const { three: T3, scene, disposables: D } = ctx;

    // ── ground: wet asphalt, with the pavement raised either side ──
    const road = new T3.Mesh(
      new T3.PlaneGeometry(200, 200),
      new T3.MeshStandardMaterial({ color: 0x0a0c12, roughness: 0.42, metalness: 0.15 }),
    );
    road.rotation.x = -Math.PI / 2; road.receiveShadow = true;
    scene.add(road); D.push(road.geometry, road.material as THREE.Material);

    const kerbMat = new T3.MeshStandardMaterial({ color: 0x11141c, roughness: 0.9 });
    D.push(kerbMat);
    for (const sx of [-9.5, 9.5]) {
      const kerb = new T3.Mesh(new T3.BoxGeometry(5, 0.22, 96), kerbMat);
      kerb.position.set(sx, 0.11, 0); kerb.receiveShadow = true;
      scene.add(kerb); D.push(kerb.geometry);
    }

    // ── buildings: one InstancedMesh for the whole block ──
    const winMat = new T3.MeshStandardMaterial({
      map: windowTexture(), emissiveMap: windowTexture(),
      emissive: 0xffffff, emissiveIntensity: 0.85,
      color: 0x0b0d15, roughness: 1,
    });
    const boxGeo = new T3.BoxGeometry(1, 1, 1);
    D.push(boxGeo, winMat);

    // Heights vary; POSITIONS do not. The alley is a real gap in the west row
    // (no tower at z = 1), because the alley is somewhere you have to be able
    // to walk — a collider there makes its story trigger unreachable.
    const ALLEY_Z = 1;
    const H = [17, 24, 13, 21, 15, 26, 12, 19, 23, 14, 20];
    const towers: Array<[number, number, number, number, number]> = []; // x,z,w,h,d
    for (let i = 0; i < 11; i++) {
      const z = -44 + i * 9;
      if (z !== ALLEY_Z) towers.push([-19, z, 12, H[i], 8]);
      towers.push([19, z, 12, H[(i + 4) % H.length], 8]);
    }
    const bld = new T3.InstancedMesh(boxGeo, winMat, towers.length);
    const m4 = new T3.Matrix4();
    towers.forEach(([x, z, w, h, d], i) => {
      m4.compose(
        new T3.Vector3(x, h / 2, z),
        new T3.Quaternion(),
        new T3.Vector3(w, h, d),
      );
      bld.setMatrixAt(i, m4);
      // A facade is solid: block the walkway in front of it.
      ctx.addCollider({ x, z, r: 6.4 });
    });
    bld.instanceMatrix.needsUpdate = true;
    bld.castShadow = true; bld.receiveShadow = true;
    scene.add(bld);

    // ── lighting: moon key + four practicals ──
    ctx.moon.intensity = 0.22;
    ctx.ambientLight.intensity = 0.16;

    const lamp = (x: number, z: number, colour: number, power = 1) => {
      const post = new T3.Mesh(new T3.CylinderGeometry(0.09, 0.11, 6, 6),
        new T3.MeshStandardMaterial({ color: 0x14171f, roughness: 0.85 }));
      post.position.set(x, 3, z); scene.add(post);
      D.push(post.geometry, post.material as THREE.Material);
      const head = new T3.Mesh(new T3.SphereGeometry(0.26, 10, 8), neon(colour));
      head.position.set(x, 6, z); scene.add(head); D.push(head.geometry);
      const pl = new T3.PointLight(colour, 1.5 * power, 17, 2);
      pl.position.set(x, 5.7, z); scene.add(pl);
      // The wet halo the lamp throws on the road.
      const pool = new T3.Mesh(new T3.CircleGeometry(4.2, 20),
        new T3.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.07, toneMapped: false }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.02, z);
      scene.add(pool); D.push(pool.geometry, pool.material as THREE.Material);
      ctx.addCollider({ x, z, r: 0.4 });
    };
    lamp(-7.4, 14, 0xffd9a0);
    lamp(7.4, -2, 0xffd9a0);
    lamp(-7.4, -22, 0xbcd4ff, 0.8);

    // ── the bar: neon sign, doorway, story trigger ──
    const barSign = new T3.Mesh(new T3.BoxGeometry(6.4, 1.1, 0.3), neon(0xff2d55));
    barSign.position.set(-12.6, 5.2, 12); scene.add(barSign); D.push(barSign.geometry);
    const barGlow = new T3.PointLight(0xff2d55, 2.4, 20, 2);
    barGlow.position.set(-12, 4.6, 12); scene.add(barGlow);
    const barDoor = new T3.Mesh(new T3.BoxGeometry(0.3, 3.2, 2.4),
      new T3.MeshStandardMaterial({ color: 0x2a1208, roughness: 0.8, emissive: 0xff2d55, emissiveIntensity: 0.16 }));
    barDoor.position.set(-12.8, 1.6, 12); scene.add(barDoor);
    D.push(barDoor.geometry, barDoor.material as THREE.Material);
    ctx.addInteractable({
      id: 'noir_bar', x: -11.2, z: 12, r: 2.6, label: 'ბარი „ლურჯი"',
      effect: () => beat('c1_bar_direct', 'ბარი „ლურჯი"'),
    });
    ctx.addAmbient({ kind: 'night', x: -12, z: 12, radius: 16, gain: 0.5 });

    // ── the alley: a gap in the west row, one flickering lamp ──
    const alleyLampMat = neon(0xffd45a);
    const alleyLamp = new T3.Mesh(new T3.SphereGeometry(0.22, 10, 8), alleyLampMat);
    alleyLamp.position.set(-16, 4.2, 1.5); scene.add(alleyLamp); D.push(alleyLamp.geometry);
    const alleyLight = new T3.PointLight(0xffd45a, 1.7, 13, 2);
    alleyLight.position.set(-16, 4, 1.5); scene.add(alleyLight);
    // Two bins so the alley reads as a back lot rather than a corridor.
    const binMat = new T3.MeshStandardMaterial({ color: 0x151a20, roughness: 0.95 });
    D.push(binMat);
    for (const [bx, bz] of [[-17.5, 3.6], [-15.2, -0.6]]) {
      const bin = new T3.Mesh(new T3.BoxGeometry(1.2, 1.3, 1.1), binMat);
      bin.position.set(bx, 0.65, bz); bin.castShadow = true;
      scene.add(bin); D.push(bin.geometry);
      ctx.addCollider({ x: bx, z: bz, r: 0.85, h: 1.3 });
    }
    ctx.addInteractable({
      id: 'noir_alley', x: -16, z: 1.5, r: 2.8, label: 'უკანა შესახვევი',
      effect: () => beat('c1_wait', 'უკანა შესახვევი'),
    });

    // ── Levan's office: the lit window above the east row ──
    const office = new T3.Mesh(new T3.BoxGeometry(3.4, 2.2, 0.24),
      new T3.MeshBasicMaterial({ color: 0xffd58a, toneMapped: false, transparent: true, opacity: 0.85 }));
    office.position.set(14.9, 8.4, -8); scene.add(office);
    D.push(office.geometry, office.material as THREE.Material);
    const officeDoor = new T3.Mesh(new T3.BoxGeometry(0.3, 3, 2.2),
      new T3.MeshStandardMaterial({ color: 0x1a1420, roughness: 0.8, emissive: 0xffd58a, emissiveIntensity: 0.2 }));
    officeDoor.position.set(12.9, 1.5, -8); scene.add(officeDoor);
    D.push(officeDoor.geometry, officeDoor.material as THREE.Material);
    ctx.addInteractable({
      id: 'noir_office', x: 11.4, z: -8, r: 2.6, label: 'ლევანის კაბინეტი',
      effect: () => beat('c2_office', 'ლევანის კაბინეტი'),
    });

    // ── the docks at the far end: containers, crane, black water ──
    const contMat = [0x1d3a44, 0x3a2418, 0x22303c, 0x123038].map(c =>
      new T3.MeshStandardMaterial({ color: c, roughness: 0.88, metalness: 0.22 }));
    contMat.forEach(m => D.push(m));
    const contGeo = new T3.BoxGeometry(6, 2.6, 2.5);
    D.push(contGeo);
    // Authored, not random: the stack must leave a walkable lane down the middle
    // to the blue container, and a random x could close it.
    const STACK: Array<[number, number, number]> = [   // x, z, tier
      [-7.5, -34, 0], [-7.5, -34, 1], [7.5, -34, 0],
      [-8.5, -38.4, 0], [8.5, -38.4, 0], [8.5, -38.4, 1],
      [-9, -42.8, 0], [9, -42.8, 0], [9, -42.8, 1],
    ];
    STACK.forEach(([x, z, tier], i) => {
      const c = new T3.Mesh(contGeo, contMat[i % contMat.length]);
      c.position.set(x, 1.3 + tier * 2.6, z);
      c.castShadow = true; c.receiveShadow = true;
      scene.add(c);
      // Only the ground tier collides; a stacked box is above head height.
      if (tier === 0) ctx.addCollider({ x, z, r: 3.1 });
    });
    // the blue one, alone, unmistakable
    const blue = new T3.Mesh(contGeo, new T3.MeshStandardMaterial({
      color: 0x1b4fa0, roughness: 0.8, metalness: 0.3, emissive: 0x0a2a5a, emissiveIntensity: 0.4,
    }));
    blue.position.set(0, 1.3, -44); blue.castShadow = true;
    scene.add(blue); D.push(blue.material as THREE.Material);
    ctx.addCollider({ x: 0, z: -44, r: 3.2 });
    ctx.addInteractable({
      // 5m off the hull, not 3.6: the collider is r=3.1 and the walker's own
      // radius adds 0.34, so a closer marker cannot be stood on.
      id: 'noir_docks', x: 0, z: -39, r: 3, label: 'ლურჯი კონტეინერი',
      effect: () => beat('c2_docks_brief', 'პორტი'),
    });

    const craneMat = new T3.MeshStandardMaterial({ color: 0x0e1a20, roughness: 0.9 });
    D.push(craneMat);
    for (const cx of [-15, 14]) {
      const mast = new T3.Mesh(new T3.BoxGeometry(0.7, 20, 0.7), craneMat);
      mast.position.set(cx, 10, -48); scene.add(mast); D.push(mast.geometry);
      const jib = new T3.Mesh(new T3.BoxGeometry(16, 0.6, 0.6), craneMat);
      jib.position.set(cx, 19.4, -48); scene.add(jib); D.push(jib.geometry);
      ctx.addCollider({ x: cx, z: -48, r: 0.9 });
    }
    ctx.addAmbient({ kind: 'wind', x: 0, z: -42, radius: 30, gain: 0.55 });

    // ── a parked car, drivable (the engine already knows how) ──
    ctx.addVehicle({ id: 'noir_car', x: 5.6, z: 18, yaw: Math.PI, kind: 'car', color: 0x1b1d24, num: 0 });

    // ── puddles: unlit discs that catch the neon ──
    const puddles: THREE.Mesh[] = [];
    for (let i = 0; i < 14; i++) {
      const p = new T3.Mesh(
        new T3.CircleGeometry(rr(0.9, 2.6), 14),
        new T3.MeshBasicMaterial({
          color: i % 3 === 0 ? 0xff2d55 : 0x8fb3ff,
          transparent: true, opacity: 0.06, toneMapped: false,
        }),
      );
      p.rotation.x = -Math.PI / 2;
      p.position.set(rr(-8.6, 8.6), 0.015, rr(-30, 30));
      scene.add(p); puddles.push(p);
      D.push(p.geometry, p.material as THREE.Material);
    }

    // ── rain: one InstancedMesh, wrapped by moving matrices ──
    const DROPS = 260;
    const dropGeo = new T3.BoxGeometry(0.02, 0.5, 0.02);
    const dropMat = new T3.MeshBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0.34, toneMapped: false });
    D.push(dropGeo, dropMat);
    const rain = new T3.InstancedMesh(dropGeo, dropMat, DROPS);
    rain.frustumCulled = false;
    const rp = new Float32Array(DROPS * 3);
    for (let i = 0; i < DROPS; i++) {
      rp[i * 3] = rr(-26, 26); rp[i * 3 + 1] = rr(0, 22); rp[i * 3 + 2] = rr(-50, 34);
    }
    scene.add(rain);
    // Reused across frames: allocating a Matrix4 per drop per frame is what
    // turns rain into a frame-rate problem.
    const tmp = new T3.Matrix4();
    const tmpP = new T3.Vector3();
    const tmpQ = new T3.Quaternion();
    const tmpS = new T3.Vector3(1, 1, 1);

    ctx.onUpdate((dt, elapsed) => {
      // Rain keeps falling even on reduced settings — it IS the world — but the
      // shimmer below is what gets dropped.
      for (let i = 0; i < DROPS; i++) {
        let y = rp[i * 3 + 1] - dt * 26;
        if (y < 0) { y = 20 + rnd() * 4; rp[i * 3] = rr(-26, 26); rp[i * 3 + 2] = rr(-50, 34); }
        rp[i * 3 + 1] = y;
        tmpP.set(rp[i * 3], y, rp[i * 3 + 2]);
        tmp.compose(tmpP, tmpQ, tmpS);
        rain.setMatrixAt(i, tmp);
      }
      rain.instanceMatrix.needsUpdate = true;

      if (ctx.perf.reduced) return;
      // Neon breathing in the puddles and the alley lamp's bad connection.
      for (let i = 0; i < puddles.length; i++) {
        const m = puddles[i].material as THREE.MeshBasicMaterial;
        m.opacity = 0.045 + 0.035 * (0.5 + 0.5 * Math.sin(elapsed * 1.4 + i));
      }
      const flick = Math.sin(elapsed * 17) > 0.82 ? 0.35 : 1;
      alleyLight.intensity = 1.7 * flick;
      (alleyLampMat as THREE.MeshBasicMaterial).opacity = flick;
      barGlow.intensity = 2.4 * (0.86 + 0.14 * Math.sin(elapsed * 2.1));
    });
  },
};
