// ── Premium World: ძველი თბილისი ──────────────────────────────────────
// Eight hundred metres of the old town, on its real street plan.
//
// WHAT IS REAL AND WHAT IS NOT — worth being straight about, because the whole
// point of this world is that it IS Tbilisi rather than somewhere that looks a
// bit like it:
//
//   REAL   the street layout, every building's footprint, the shape of every
//          block, the Mtkvari's actual bank, and the positions of Sioni,
//          Metekhi, Narikala, the sulphur baths, the Bridge of Peace and the
//          Mtatsminda mast — all from OpenStreetMap.
//   REAL   the height of 388 of the 911 buildings (42.6%), surveyed and tagged.
//   NOT    the other 57% of the heights, estimated from footprint area and
//          building type. The skyline is plausible where it is not measured.
//   NOT    any facade. OSM holds no such data, so walls are stone, brick, civic
//          and sacred palettes over the real outlines. Old Town's balconies and
//          courtyards are suggested, not reproduced.
//   NOT    the terrain. There is no elevation data in this world's budget, so
//          Mtatsminda and the Narikala ridge are shaped by hand to put the mast
//          and the fortress where they belong and to close the view.
//
// Data © OpenStreetMap contributors, ODbL. The licence requires the credit to
// travel with the data and the world draws it on a sign at the spawn point.
// Do not remove it.
import * as THREE from 'three';
import type { WorldDef, WorldContext } from './types';
import { buildCity, buildWater, buildGround, lampPositions, type FacadeGroup } from './tbilisiBuild';
import {
  mtatsmindaMast, mtatsmindaRidge, narikala, georgianChurch, sulphurDomes,
  bridgeOfPeace, resetLandmarkSeed, type LandmarkCtx,
} from './tbilisiLandmarks';
import {
  TBILISI_BUILDINGS_B64, TBILISI_ROADS_B64, TBILISI_WATER_B64,
  TBILISI_LANDMARKS, TBILISI_STATS,
} from './tbilisiData';

/** The river's surface, below the streets. Meidan sits about here above it. */
const WATER_Y = -3.2;

/**
 * Where things are, in metres from Meidan.
 *
 * Read out of the generated data by name rather than typed in, so a re-extract
 * moves the landmarks with the streets instead of leaving them behind. The
 * fallback is only there so a renamed OSM feature degrades to a slightly
 * misplaced church rather than a crash.
 */
function at(fragment: string, fallback: { x: number; z: number }) {
  const hit = TBILISI_LANDMARKS.find(l => l.name.includes(fragment));
  return hit ? { x: hit.x, z: hit.z } : fallback;
}

// ── Facade textures ──────────────────────────────────────────────────────────
/**
 * One canvas per palette, tiled by the metre.
 *
 * The UVs out of the extruder are in metres divided by four, so one tile of
 * this texture covers four metres of wall — roughly a storey and a bit, which
 * is what makes a six-metre cottage and a twenty-metre block look like the same
 * city rather than the same box at two scales.
 */
function facadeTexture(base: string, trim: string, lit: string, seed: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d')!;
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967295; };

  g.fillStyle = base; g.fillRect(0, 0, 64, 64);
  // Plaster mottling — without it a flat colour reads as untextured plastic.
  for (let i = 0; i < 180; i++) {
    g.globalAlpha = 0.04 + rnd() * 0.07;
    g.fillStyle = rnd() < 0.5 ? '#000' : '#fff';
    g.fillRect(rnd() * 64, rnd() * 64, 2 + rnd() * 7, 2 + rnd() * 5);
  }
  g.globalAlpha = 1;
  // A storey line and a row of windows, some of them lit.
  g.fillStyle = trim; g.fillRect(0, 30, 64, 2);
  for (const wx of [7, 25, 43]) {
    const on = rnd() < 0.42;
    g.fillStyle = on ? lit : '#14161d';
    g.fillRect(wx, 8, 12, 16);
    g.fillStyle = trim;
    g.fillRect(wx - 1, 7, 14, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export const oldTbilisi: WorldDef = {
  id: 'old_tbilisi',
  name: 'ძველი თბილისი',
  subtitle: 'რეალური ქუჩები · მთაწმინდა · აბანოთუბანი',
  icon: '🏛️',
  status: 'live',
  /*
   * A lane beside Sioni, facing the cathedral.
   *
   * Measured, not chosen: a grid search over the real colliders for a point
   * with three to nine metres of standing room — enough to turn round, close
   * enough to the walls to be a street. The first version spawned at the origin,
   * which is in the middle of the Mtkvari, and opened on an empty plain.
   */
  spawn: { x: -104, z: -36, yaw: 2.1 },
  oceanR: 420,
  /*
   * Far thinner fog than the other worlds, because this one is far bigger.
   *
   * Every other world here is a room a hundred and sixty metres across and its
   * fog is set to hide the edge of the set. This district is eight hundred
   * metres and the mast is two kilometres out: at 0.0042 the exponential
   * squared term has swallowed everything past about three hundred metres, and
   * the whole reason to stand at Meidan is to see Mtatsminda. 0.0013 leaves the
   * far bank clear and still softens the horizon.
   */
  fog: { color: 0x3b3348, density: 0.0013 },
  clear: 0x2a2438,

  build(ctx: WorldContext) {
    resetLandmarkSeed();
    const T = ctx.three;

    // Evening: the hour the old town is worth being in.
    /*
     * Ambient carries most of it, direct light only shapes.
     *
     * At 1.9 ambient against 2.1 direct, a wall facing away from the sun got
     * about half the light of one facing it and read as black beside its
     * neighbour — an old town of silhouettes. Dusk in a narrow street is mostly
     * bounced light anyway: almost nothing down there sees the sun directly.
     */
    ctx.ambientLight.color.setHex(0x8a86a8);
    ctx.ambientLight.intensity = 2.6;
    ctx.moon.color.setHex(0xffcf9a);
    ctx.moon.intensity = 1.15;
    // Low and to the west, behind Mtatsminda: long shadows up the lanes, and
    // the ridge reads as a silhouette rather than a lit wall.
    ctx.moon.position.set(-900, 420, -300);

    const lctx: LandmarkCtx = {
      three: T, scene: ctx.scene, disposables: ctx.disposables,
      addCollider: (c) => ctx.addCollider(c),
    };

    /*
     * The ground, with the river cut out of it.
     *
     * A solid plane here covered the water surface below it completely — the
     * river was drawn, correctly, and simply never seen. Nothing looked broken;
     * the old town just had an unexplained empty strip through the middle of it.
     */
    const groundMat = new T.MeshStandardMaterial({ color: 0x37322f, roughness: 1 });
    ctx.disposables.push(groundMat);
    const ground = buildGround(T, TBILISI_WATER_B64, groundMat, 900);
    ctx.disposables.push(ground.geometry);
    ctx.scene.add(ground);

    // ── The city, from its own footprints ──
    const facades: Record<FacadeGroup, THREE.Material> = {
      stone: new T.MeshStandardMaterial({ map: facadeTexture('#b6a892', '#8d7f6a', '#ffcf8e', 11), roughness: 0.93 }),
      brick: new T.MeshStandardMaterial({ map: facadeTexture('#9c7358', '#7a5742', '#ffc07a', 29), roughness: 0.95 }),
      civic: new T.MeshStandardMaterial({ map: facadeTexture('#c3bcae', '#9a9284', '#fff0c9', 47), roughness: 0.88 }),
      sacred: new T.MeshStandardMaterial({ map: facadeTexture('#a89b84', '#8a7c66', '#ffe2ab', 67), roughness: 0.9 }),
    };
    // Lighter than the ground it lies on, or the street plan is invisible.
    const roadMat = new T.MeshStandardMaterial({ color: 0x5b5550, roughness: 0.96 });
    for (const m of Object.values(facades)) ctx.disposables.push(m, (m as THREE.MeshStandardMaterial).map!);
    ctx.disposables.push(roadMat);

    /*
     * The whole district on a desktop; the biggest two thirds on a phone.
     *
     * `perf.reduced` is the engine's own live judgement, so this follows the
     * device rather than a guess about it — and because the extractor sorts by
     * footprint area, what a weak device loses is the sheds in the courtyards
     * rather than the street walls or the landmarks.
     */
    const city = buildCity(
      T, TBILISI_BUILDINGS_B64, TBILISI_ROADS_B64, facades, roadMat,
      { maxBuildings: ctx.perf.reduced ? 620 : undefined },
    );
    for (const m of city.meshes) { ctx.scene.add(m); ctx.disposables.push(m.geometry); }
    for (const c of city.colliders) ctx.addCollider(c);

    // ── The Mtkvari ──
    const waterMat = new T.MeshStandardMaterial({
      color: 0x16283a, roughness: 0.22, metalness: 0.55,
      transparent: true, opacity: 0.94,
    });
    ctx.disposables.push(waterMat);
    const river = buildWater(T, TBILISI_WATER_B64, waterMat, WATER_Y);
    if (river) { ctx.scene.add(river); ctx.disposables.push(river.geometry); }

    // ── The ridge, and what stands on it ──
    /*
     * Mtatsminda is two kilometres west and some four hundred metres up. Placed
     * from the mast's own OSM coordinates so the mountain is under the tower
     * rather than the tower somewhere near the mountain.
     */
    const mast = TBILISI_LANDMARKS.find(l => l.kind === 'mast');
    const mastX = mast?.x ?? -1998.8, mastZ = mast?.z ?? -525;
    const MTATSMINDA_Y = 392;
    mtatsmindaRidge(lctx, {
      x: mastX + 260, z: mastZ + 180, length: 2100, width: 900,
      crestY: MTATSMINDA_Y, yaw: 0.42,
    });
    mtatsmindaMast(lctx, mastX, MTATSMINDA_Y, mastZ);

    /*
     * Narikala's own ridge, much closer and much lower — it stands directly
     * over Abanotubani, which is why the fortress is the backdrop to every
     * photograph of the baths.
     */
    const nk = at('ნარიყალა', { x: 8.6, z: 354.7 });
    const NARIKALA_Y = 96;
    mtatsmindaRidge(lctx, {
      x: nk.x - 40, z: nk.z + 40, length: 620, width: 300,
      crestY: NARIKALA_Y, yaw: -0.28,
    });
    narikala(lctx, [
      { x: nk.x - 150, y: NARIKALA_Y * 0.62, z: nk.z + 18 },
      { x: nk.x - 70, y: NARIKALA_Y * 0.86, z: nk.z - 4 },
      { x: nk.x + 10, y: NARIKALA_Y * 0.95, z: nk.z - 10 },
      { x: nk.x + 96, y: NARIKALA_Y * 0.8, z: nk.z + 22 },
      { x: nk.x + 160, y: NARIKALA_Y * 0.58, z: nk.z + 64 },
    ]);

    // ── The set pieces, each on its surveyed spot ──
    const sioni = at('სიონის', { x: -122.5, z: -25.1 });
    georgianChurch(lctx, { x: sioni.x, y: 0, z: sioni.z, scale: 1.15, yaw: 0.3 });

    const metekhi = at('მეტეხის ხიდი', { x: 85.8, z: 83.6 });
    // The church stands on the cliff above the bridge, on the far bank.
    georgianChurch(lctx, { x: metekhi.x + 48, y: 22, z: metekhi.z - 30, scale: 1, yaw: -0.5 });

    const baths = at('სამეფო აბანო', { x: 169.5, z: 332.8 });
    sulphurDomes(lctx, { x: baths.x, z: baths.z, count: 9, spread: 34 });

    const peace = at('მშვიდობის ხიდი', { x: -78.5, z: -209 });
    // The Mtkvari runs roughly north-west to south-east here, so the crossing
    // lies across that — the yaw is the river's normal, not a guess.
    bridgeOfPeace(lctx, { x: peace.x, z: peace.z, yaw: 0.52, span: 150 });

    // ── Street lighting, as glow rather than as lights ──
    /*
     * Four real lights is the engine's budget for the whole scene and the moon
     * has one of them. Lamps are emissive spheres on posts: they cost a draw
     * call between them and they are what makes the lanes read at dusk.
     */
    const lampMat = new T.MeshBasicMaterial({ color: 0xffce84, toneMapped: false });
    const postMat = new T.MeshStandardMaterial({ color: 0x1d1c20, roughness: 0.8 });
    const bulbGeo = new T.SphereGeometry(0.32, 6, 5);
    const postGeo = new T.CylinderGeometry(0.1, 0.14, 4.2, 5);
    ctx.disposables.push(lampMat, postMat, bulbGeo, postGeo);
    /*
     * On the streets, walked off the real centrelines.
     *
     * Scattered at random they went through walls, and one stood directly in
     * front of the spawn point filling half the view. The road data was right
     * there.
     */
    const lamps = lampPositions(TBILISI_ROADS_B64, 26, ctx.perf.reduced ? 110 : 240);
    const lampCount = lamps.length;
    const bulbs = new T.InstancedMesh(bulbGeo, lampMat, lampCount);
    const posts = new T.InstancedMesh(postGeo, postMat, lampCount);
    const m4 = new T.Matrix4();
    for (let i = 0; i < lampCount; i++) {
      const { x, z } = lamps[i]!;
      m4.makeTranslation(x, 4.4, z); bulbs.setMatrixAt(i, m4);
      m4.makeTranslation(x, 2.1, z); posts.setMatrixAt(i, m4);
    }
    bulbs.instanceMatrix.needsUpdate = true; posts.instanceMatrix.needsUpdate = true;
    ctx.scene.add(bulbs, posts);

    // ── The credit the licence requires ──
    attribution(ctx);

    // A nudge in the right direction, and the honest numbers behind the view.
    if (typeof console !== 'undefined') {
      console.info(
        `[ძველი თბილისი] ${city.buildings} buildings, ${city.triangles.toLocaleString()} triangles, ` +
        `${city.meshes.length} draw calls · ${TBILISI_STATS.surveyedPct}% of heights surveyed · ` +
        'map data © OpenStreetMap contributors (ODbL)',
      );
    }
  },
};

/**
 * The ODbL credit, on a sign at the spawn point.
 *
 * On a board in the world rather than in a menu because the licence asks for
 * the attribution to travel with the data, and because a credit nobody can find
 * is not one. It stands at Meidan where every visitor arrives.
 */
function attribution(ctx: WorldContext): void {
  const T = ctx.three;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#14121a'; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#6b5f4a'; g.lineWidth = 4; g.strokeRect(6, 6, 500, 116);
  g.fillStyle = '#e8dcc4';
  g.font = 'bold 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('ძველი თბილისი', 256, 46);
  g.font = '19px system-ui, sans-serif';
  g.fillStyle = '#a99c84';
  g.fillText('რუკის მონაცემები © OpenStreetMap', 256, 78);
  g.fillText('contributors · ODbL', 256, 102);

  const tex = new T.CanvasTexture(c);
  const mat = new T.MeshBasicMaterial({ map: tex, transparent: true });
  const geo = new T.PlaneGeometry(5.2, 1.3);
  ctx.disposables.push(tex, mat, geo);

  // Beside the spawn, facing the arrival — a credit nobody meets is not one.
  const SX = -100, SZ = -30;
  const sign = new T.Mesh(geo, mat);
  sign.position.set(SX, 2.4, SZ);
  sign.rotation.y = -0.9;
  ctx.scene.add(sign);

  const postMat = new T.MeshStandardMaterial({ color: 0x2a262c, roughness: 0.9 });
  const postGeo = new T.CylinderGeometry(0.09, 0.11, 2.4, 6);
  ctx.disposables.push(postMat, postGeo);
  for (const dx of [-2.2, 2.2]) {
    const p = new T.Mesh(postGeo, postMat);
    p.position.set(SX + dx * Math.cos(-0.9), 1.2, SZ - dx * Math.sin(-0.9));
    ctx.scene.add(p);
  }
  ctx.addCollider({ x: SX, z: SZ, r: 2.4, h: 0.4 });
}
