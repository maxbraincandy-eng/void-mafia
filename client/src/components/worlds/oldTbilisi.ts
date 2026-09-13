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
import {
  buildCity, buildWater, buildGround, lampPositions, carSpots, buildBalconies, buildTrees,
  buildDoors,
  type FacadeGroup,
} from './tbilisiBuild';
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
function facadeTexture(
  base: string, trim: string, lit: string, seed: number, pxPerM: number,
): THREE.Texture {
  /*
   * Eight metres across, four high — not four by four.
   *
   * Two things were wrong with a square tile. Sixteen pixels to the metre is a
   * smear at arm's length, and in a three-metre lane you are always at arm's
   * length from a wall. And a four-metre horizontal period is short enough to
   * SEE: a terrace wore the same three windows over and over, which is the one
   * thing that makes a facade read as wallpaper rather than as a building.
   *
   * Doubling the horizontal period costs nothing but canvas and breaks the
   * pattern, and the pixel density is set by the caller so a phone can have
   * the same wall at half the resolution rather than a different one.
   */
  const W = Math.round(8 * pxPerM), H = Math.round(4 * pxPerM);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967295; };
  const m = (v: number) => v * pxPerM;        // metres → pixels

  g.fillStyle = base; g.fillRect(0, 0, W, H);
  // Plaster mottling — without it a flat colour reads as untextured plastic.
  for (let i = 0; i < 2600; i++) {
    g.globalAlpha = 0.03 + rnd() * 0.06;
    g.fillStyle = rnd() < 0.5 ? '#000' : '#fff';
    // Small patches: at half a metre across they are blurry blobs the moment
    // you stand close, which is worse than no mottling at all.
    g.fillRect(rnd() * W, rnd() * H, m(0.04) + rnd() * m(0.16), m(0.03) + rnd() * m(0.12));
  }
  // A few long streaks: rain runs down plaster, it does not speckle it.
  for (let i = 0; i < 40; i++) {
    g.globalAlpha = 0.03 + rnd() * 0.04;
    g.fillStyle = '#000';
    g.fillRect(rnd() * W, rnd() * H, Math.max(1, m(0.02) + rnd() * m(0.05)), m(0.5) + rnd() * m(1.4));
  }
  g.globalAlpha = 1;

  // The storey band at the top of the tile, with a shadow line under it so it
  // reads as a moulding rather than a stripe.
  g.fillStyle = trim; g.fillRect(0, m(3.6), W, Math.max(2, m(0.11)));
  g.globalAlpha = 0.22; g.fillStyle = '#000';
  g.fillRect(0, m(3.71), W, Math.max(1, m(0.05)));
  g.globalAlpha = 1;

  /*
   * Windows: one every two metres, drawn rather than blocked in.
   *
   * Reveal, frame, sill and glazing bar. At the old resolution a window was a
   * 12 × 16 rectangle with no room for any of that, so every facade was a row
   * of stickers — and there were three to the four metres, half again as many
   * as a street of this kind actually has.
   */
  for (let k = 0; k < 4; k++) {
    const wx = m(0.62 + k * 2), wy = m(1.05);
    const ww = m(0.78), wh = m(1.3);
    const on = rnd() < 0.4;
    // Reveal: the wall thickness you see at the edge of the opening.
    g.globalAlpha = 0.3; g.fillStyle = '#000';
    g.fillRect(wx - m(0.05), wy - m(0.05), ww + m(0.1), wh + m(0.1));
    g.globalAlpha = 1;
    g.fillStyle = on ? lit : '#171a22';
    g.fillRect(wx, wy, ww, wh);
    // Glazing bars, a two-over-two sash.
    g.fillStyle = trim;
    g.fillRect(wx + ww / 2 - m(0.015), wy, Math.max(1, m(0.03)), wh);
    g.fillRect(wx, wy + wh / 2 - m(0.015), ww, Math.max(1, m(0.03)));
    // Frame, and a sill that oversails it the way a real one sheds water.
    g.lineWidth = Math.max(2, m(0.05)); g.strokeStyle = trim;
    g.strokeRect(wx - m(0.025), wy - m(0.025), ww + m(0.05), wh + m(0.05));
    g.fillRect(wx - m(0.09), wy + wh + m(0.03), ww + m(0.18), Math.max(2, m(0.08)));
    g.globalAlpha = 0.25; g.fillStyle = '#000';
    g.fillRect(wx - m(0.09), wy + wh + m(0.11), ww + m(0.18), Math.max(1, m(0.05)));
    g.globalAlpha = 1;
  }

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  /*
   * Anisotropy, because every wall in this world is seen edge-on.
   *
   * A lane three metres wide means the facade beside you runs away at a few
   * degrees to the view, and that is precisely the case trilinear filtering
   * handles worst: it picks a mip for the worst axis and blurs the other into
   * porridge. Sixteen is the usual ceiling and drivers clamp it themselves.
   */
  t.anisotropy = 16;
  return t;
}

/**
 * Cobbles — irregular, because Old Town's are laid by hand and a regular grid
 * reads as graph paper the moment you stand on it.
 */
function cobbleTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d')!;
  let s = 0xc0bb1e;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967295; };
  g.fillStyle = '#4a4038'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 8) {
    const off = (y / 8) % 2 ? 4 : 0;
    for (let x = -8; x < 128; x += 8) {
      const v = 0.72 + rnd() * 0.5;
      g.fillStyle = `rgb(${Math.round(96 * v)},${Math.round(84 * v)},${Math.round(74 * v)})`;
      const w = 6 + rnd() * 1.6, h = 6 + rnd() * 1.4;
      g.fillRect(x + off + (rnd() - 0.5), y + (rnd() - 0.5), w, h);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  // The ground's UVs run at 0.01 per metre, so this makes a tile about 2 m.
  t.repeat.set(50, 50);
  return t;
}

/**
 * A dusk dome: warm low in the west where the sun has just gone, deep blue
 * overhead, with stars only in the upper half where the light has left.
 */
function buildSky(ctx: WorldContext): void {
  const T = ctx.three;
  /*
   * The gradient is a texture; the stars are not.
   *
   * A star painted into the dome's texture is not a star, it is however many
   * metres of sky one texel covers — on a dome two and a half kilometres
   * across that is fifteen, and each one came out as a fat white capsule
   * hanging over the city. Widening the canvas only made them narrower
   * capsules. The gradient varies in one direction and is the only thing here
   * that wants to be a texture at all, so it stays four pixels wide.
   */
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#161228');    // zenith
  grad.addColorStop(0.45, '#2e2742');
  grad.addColorStop(0.78, '#4c3a4e');
  grad.addColorStop(0.94, '#7a5348');  // the last of the sun on the horizon
  grad.addColorStop(1, '#8d6350');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);

  const tex = new T.CanvasTexture(c);
  const geo = new T.SphereGeometry(2400, 24, 16);
  /*
   * Painted first, never tested against depth.
   *
   * The dome is drawn with no depth write, which is right, but it was still
   * sorted with everything else and came out over the hills. A background is
   * not something to sort: draw it before the world and let the world paint
   * over it.
   */
  const mat = new T.MeshBasicMaterial({
    map: tex, side: T.BackSide, fog: false, depthWrite: false, depthTest: false,
  });
  ctx.disposables.push(tex, geo, mat);
  const dome = new T.Mesh(geo, mat);
  dome.renderOrder = -2;
  dome.matrixAutoUpdate = false;
  ctx.scene.add(dome);

  // Stars as points, so one star is one pixel however far off the dome is.
  let s = 0x51a25;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967295; };
  const xyz: number[] = [];
  for (let i = 0; i < 1600; i++) {
    // Uniform over the hemisphere, then thinned towards the lit horizon where
    // they would be washed out anyway.
    const el = Math.acos(rnd());   // 0 at the zenith, π/2 at the horizon
    if (rnd() > 0.2 + 0.8 * Math.cos(el)) continue;
    const az = rnd() * Math.PI * 2;
    const r = 2300, s1 = Math.sin(el);
    xyz.push(r * s1 * Math.cos(az), r * Math.cos(el), r * s1 * Math.sin(az));
  }
  const sGeo = new T.BufferGeometry();
  sGeo.setAttribute('position', new T.Float32BufferAttribute(xyz, 3));
  /*
   * The stars, unlike the dome, DO test against depth.
   *
   * They are transparent, and a transparent object is drawn in three's second
   * pass — after every opaque one, with renderOrder only sorting within that
   * pass. So the first version, which borrowed the dome's depthTest:false,
   * painted stars straight over the buildings: standing in a lane at Sioni you
   * could see the constellations through a four-storey wall. Testing depth and
   * not writing it is the whole answer: the wall is already in the buffer.
   */
  const sMat = new T.PointsMaterial({
    color: 0xfff6dc, size: 1.7, sizeAttenuation: false, fog: false,
    depthWrite: false, transparent: true, opacity: 0.8,
  });
  ctx.disposables.push(sGeo, sMat);
  const stars = new T.Points(sGeo, sMat);
  stars.matrixAutoUpdate = false;
  ctx.scene.add(stars);
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
   * Measured, not chosen: a grid search over the real colliders, scored on
   * three things at once — standing room between two and nine metres, so it is
   * a street and not a square; an unbroken sightline of at least thirty metres
   * along the facing, so there is somewhere to walk; and Sioni within forty-odd
   * degrees of it, so the cathedral is the thing you arrive looking at.
   *
   * All three, because each of the first two versions had only one. The first
   * spawned at the origin, which is in the middle of the Mtkvari. The second
   * asked for standing room alone and found it in the middle of an empty plain
   * — and when that was measured properly it turned out to be facing a wall
   * three metres away, with the plain behind it.
   */
  spawn: { x: -112.5, z: -55.1, yaw: 2.094 },
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

    /*
     * A sky, rather than a clear colour.
     *
     * Half of every view looking up the lanes is sky, and a flat purple fill
     * carries no information at all — it is the same mistake the ground was
     * making. A dome with a dusk gradient and a scatter of stars costs one
     * unlit draw call and gives the world a top.
     */
    buildSky(ctx);

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
    /*
     * Paving, not a void.
     *
     * A flat unlit brown filled the bottom half of every view from eye level —
     * the single most visible thing in the world and the one carrying no
     * information at all. A cobble texture at half a metre a tile gives the
     * ground a scale, which is what tells you how big everything else is.
     */
    const groundMat = new T.MeshStandardMaterial({ map: cobbleTexture(), roughness: 0.98 });
    ctx.disposables.push(groundMat, groundMat.map!);
    const ground = buildGround(T, TBILISI_WATER_B64, groundMat, 900);
    ctx.disposables.push(ground.geometry);
    ctx.scene.add(ground);

    // ── The city, from its own footprints ──
    /*
     * The texture is now greyscale detail and the COLOUR comes per building, as
     * a vertex attribute.
     *
     * Before this, every building in the largest bucket wore one beige — and
     * since most of OSM's buildings are tagged `building=yes`, that was most of
     * the district. Nine hundred identical boxes is what made it read as a
     * housing estate. Painting per building keeps it to one draw call.
     */
    const px = ctx.perf.reduced ? 64 : 128;
    const facades: Record<FacadeGroup, THREE.Material> = {
      /*
       * Half the pixel density on a reduced device.
       *
       * The four atlases at 128 px/m are 8 MB of texture before mipmaps, which
       * is worth it on a desktop standing in a three-metre lane and is not
       * worth it on a phone that is already budgeting draw calls. Same wall,
       * fewer pixels — not a different wall.
       */
      stone: new T.MeshStandardMaterial({ map: facadeTexture('#ffffff', '#c8c8c8', '#ffe6b8', 11, px), roughness: 0.93, vertexColors: true }),
      brick: new T.MeshStandardMaterial({ map: facadeTexture('#ffffff', '#c0c0c0', '#ffd9a0', 29, px), roughness: 0.95, vertexColors: true }),
      civic: new T.MeshStandardMaterial({ map: facadeTexture('#ffffff', '#cfcfcf', '#fff0c9', 47, px), roughness: 0.88, vertexColors: true }),
      sacred: new T.MeshStandardMaterial({ map: facadeTexture('#ffffff', '#c4c4c4', '#ffe2ab', 67, px), roughness: 0.9, vertexColors: true }),
    };
    // Tile: matte, and coloured per building like the walls.
    const roofMat = new T.MeshStandardMaterial({ roughness: 0.97, vertexColors: true, flatShading: true });
    ctx.disposables.push(roofMat);
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
      T, TBILISI_BUILDINGS_B64, TBILISI_ROADS_B64, facades, roadMat, roofMat,
      { maxBuildings: ctx.perf.reduced ? 620 : undefined },
    );
    for (const m of city.meshes) { ctx.scene.add(m); ctx.disposables.push(m.geometry); }
    for (const c of city.colliders) ctx.addCollider(c);

    /*
     * The wooden galleries.
     *
     * The one feature that makes a photograph of Tbilisi recognisable as
     * Tbilisi rather than as any other old town — and the thing whose absence
     * was most of why the first version looked like a generic city. OSM has no
     * idea they exist, so they are hung off the longest wall of every house
     * with a first floor.
     */
    const woodMat = new T.MeshStandardMaterial({ color: 0x6a4a34, roughness: 0.92 });
    ctx.disposables.push(woodMat);
    for (const m of buildBalconies(T, city.balconies, woodMat, ctx.perf.reduced ? 160 : 400)) {
      ctx.scene.add(m);
    }

    /*
     * ── Street doors ──
     *
     * Every building met the pavement with a blank wall. A frontage with no
     * way into it is the other half of why the district read as a set of
     * extrusions rather than as somewhere people live — the walls were right
     * and nobody could have got in through any of them.
     */
    for (const m of buildDoors(T, city.doors, ctx.perf.reduced ? 260 : 700)) {
      ctx.scene.add(m);
      const im = m as import('three').InstancedMesh;
      ctx.disposables.push(im.geometry, im.material as import('three').Material);
    }

    // ── The Mtkvari ──
    /*
     * Slate blue, barely metallic, lifted by its own emissive.
     *
     * It was metalness 0.55 at roughness 0.22, which is a mirror — and there
     * is no environment map in this scene for a mirror to reflect, so the
     * Mtkvari rendered as very nearly pure black. From the embankment the city
     * ended at a hole. A river at dusk is mostly the sky lying on it, so the
     * sky's own colour goes in as emissive and the metalness comes back out,
     * leaving the moon a specular streak at roughness 0.3.
     */
    const waterMat = new T.MeshStandardMaterial({
      color: 0x22364c, roughness: 0.3, metalness: 0.08,
      emissive: 0x2b2742, emissiveIntensity: 0.55,
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

    /*
     * Metekhi, on its cliff — with the cliff.
     *
     * The church was placed at twenty-two metres because that is where it
     * stands, and nothing was built underneath it. It hung in the sky over the
     * river, which is the first thing anybody walking the embankment saw.
     */
    const metekhi = at('მეტეხის ხიდი', { x: 85.8, z: 83.6 });
    const MX = metekhi.x + 48, MZ = metekhi.z - 30, MY = 22;
    mtatsmindaRidge(lctx, { x: MX + 18, z: MZ - 6, length: 180, width: 110, crestY: MY + 5, yaw: -0.5 });
    georgianChurch(lctx, { x: MX, y: MY, z: MZ, scale: 1, yaw: -0.5 });

    const baths = at('სამეფო აბანო', { x: 169.5, z: 332.8 });
    sulphurDomes(lctx, { x: baths.x, z: baths.z, count: 9, spread: 34 });

    const peace = at('მშვიდობის ხიდი', { x: -78.5, z: -209 });
    // The Mtkvari runs roughly north-west to south-east here, so the crossing
    // lies across that — the yaw is the river's normal, not a guess.
    bridgeOfPeace(lctx, { x: peace.x, z: peace.z, yaw: 0.52, span: 150 });

    /*
     * ── Volgas, parked on the street ──
     *
     * A vintage Soviet saloon is the right car for this district and the wrong
     * one for the speedway, which is why it is its own vehicle kind rather than
     * a repaint of the racer.
     *
     * Placed off the road centrelines and kept clear of the buildings, so they
     * sit ON streets pointing the way the street goes — a car dropped at a
     * random spot and angle reads as abandoned, not parked. Colours are the
     * ones these actually came in: cream, pale blue, bottle green, grey.
     */
    const VOLGA_COLOURS = [0xdcd6c0, 0x8fa7b8, 0x4f6b52, 0x9a9c99, 0xc4b9a0, 0x6c7f93];
    const spots = carSpots(TBILISI_ROADS_B64, {
      count: 8, minWidth: 6, apart: 45, clearOf: city.colliders,
      // One of them within a short walk of where you arrive, and the rest
      // spread over the part of the district anybody is going to walk.
      anchor: oldTbilisi.spawn, within: 300,
    });
    spots.forEach((s, i) => {
      ctx.addVehicle({
        id: `volga${i}`, x: s.x, z: s.z, yaw: s.yaw,
        kind: 'retro', color: VOLGA_COLOURS[i % VOLGA_COLOURS.length]!,
      });
    });

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

    /*
     * ── Planes along the streets ──
     *
     * The walk-through renders are what asked for these. The footprints are
     * real and the roofs sit right, but between a wall and the kerb there was
     * bare cobble as far as the eye went, and that is what made the place read
     * as a model of a city rather than a city. Two instanced meshes.
     */
    const trees = buildTrees(T, TBILISI_ROADS_B64, {
      spacing: 19, limit: ctx.perf.reduced ? 130 : 320, minWidth: 5,
      clearOf: city.colliders,
    });
    trees.forEach(t => {
      ctx.scene.add(t);
      const im = t as import('three').InstancedMesh;
      ctx.disposables.push(im.geometry, im.material as import('three').Material);
    });

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
