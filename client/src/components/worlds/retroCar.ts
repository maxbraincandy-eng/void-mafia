/**
 * A vintage Soviet saloon.
 *
 * Lifted out of the engine so it can be built and looked at without standing up
 * a whole world — which is how the first version was found to be invisible: the
 * harness recorded the vehicle spec and only the engine ever turned one into a
 * mesh, so there was nothing to see and nothing said so.
 */
import type * as _THREE from 'three';

/**
 * A vintage Soviet saloon — a Volga, near enough.
 *
 * WHY THIS IS NOT `buildCar` WITH DIFFERENT NUMBERS
 * ─────────────────────────────────────────────────
 * The racer is an open tub with a wing: no roof, no doors, no boot. Every
 * proportion that makes a sixties saloon read as one — the long bonnet, the
 * upright greenhouse, the chrome across the nose — is a part the racer does
 * not have. They share the driving model and nothing else.
 *
 * WHAT MAKES IT READ AS SOVIET RATHER THAN AS "OLD CAR"
 * ────────────────────────────────────────────────────
 * Three things, in this order: a wide chrome grille between two round lamps,
 * a roof that sits high and flat over a thin-pillared greenhouse, and full
 * chrome bumpers with overriders at each end. Miss any one and it drifts
 * towards a generic fifties American shape, which is twice the size and has
 * fins.
 *
 * Local −Z is the direction of travel, as with every vehicle here.
 */
export function buildRetroCar(
THREE: typeof import('three'),
g: import('three').Group,
color: number | undefined,
wheels: import('three').Object3D[],
): void {
  const body = color ?? 0xdcd6c0;
  const paint = new THREE.MeshStandardMaterial({ color: body, roughness: 0.42, metalness: 0.25 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc8d0d8, roughness: 0.18, metalness: 0.95 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x30404e, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.62,
  });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0f1013, roughness: 0.95 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 0.8 });

  const L = 4.7, W = 1.78;

  // ── Lower body: one long box, sills a little narrower so it is not a brick.
  const hull = new THREE.Mesh(new THREE.BoxGeometry(W, 0.62, L), paint);
  hull.position.y = 0.72; hull.castShadow = true; g.add(hull);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(W - 0.16, 0.28, L - 0.5), paint);
  sill.position.y = 0.46; g.add(sill);

  // ── Bonnet and boot, both lower than the cabin: the three-box shape.
  const bonnet = new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, 0.2, 1.5), paint);
  bonnet.position.set(0, 1.03, -1.44); g.add(bonnet);
  const boot = new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, 0.2, 1.15), paint);
  boot.position.set(0, 1.03, 1.66); g.add(boot);

  /*
   * ── The greenhouse.
   *
   * Upright and airy, on thin pillars — the sixties cue. A modern car's
   * glasshouse is a visor; this one is a conservatory, and the difference is
   * most of what dates it.
   */
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W - 0.26, 0.12, 2.0), paint);
  roof.position.set(0, 1.86, 0.12); roof.castShadow = true; g.add(roof);
  // Windscreen, backlight and side glass, all raked a touch.
  const wind = new THREE.Mesh(new THREE.BoxGeometry(W - 0.34, 0.72, 0.06), glass);
  wind.position.set(0, 1.5, -0.86); wind.rotation.x = -0.22; g.add(wind);
  const rear = new THREE.Mesh(new THREE.BoxGeometry(W - 0.34, 0.66, 0.06), glass);
  rear.position.set(0, 1.5, 1.1); rear.rotation.x = 0.26; g.add(rear);
  for (const sx of [-(W / 2 - 0.13), W / 2 - 0.13]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.66, 1.9), glass);
    side.position.set(sx, 1.5, 0.12); g.add(side);
    // Chrome window surround — the line that catches the street lamps.
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 1.95), chrome);
    rail.position.set(sx, 1.17, 0.12); g.add(rail);
  }
  // B-pillar, so the side glass is two windows rather than one long pane.
  for (const sx of [-(W / 2 - 0.13), W / 2 - 0.13]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.66, 0.1), paint);
    pillar.position.set(sx, 1.5, 0.16); g.add(pillar);
  }

  // ── The face: a wide chrome grille between two round lamps.
  const grille = new THREE.Mesh(new THREE.BoxGeometry(W - 0.3, 0.3, 0.1), chrome);
  grille.position.set(0, 0.86, -L / 2 - 0.02); g.add(grille);
  for (let i = -3; i <= 3; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.26, 0.13), trim);
    bar.position.set(i * 0.19, 0.86, -L / 2 - 0.04); g.add(bar);
  }
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2cf, toneMapped: false });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2f22, toneMapped: false });
  for (const sx of [-(W / 2 - 0.28), W / 2 - 0.28]) {
    const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.1, 14), chrome);
    bezel.rotation.x = Math.PI / 2; bezel.position.set(sx, 0.92, -L / 2 - 0.02); g.add(bezel);
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.14, 14), headMat);
    lamp.position.set(sx, 0.92, -L / 2 - 0.08); g.add(lamp);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.06), tailMat);
    tl.position.set(sx, 0.95, L / 2 + 0.02); g.add(tl);
  }

  // ── Bumpers, with overriders. Chrome, and the full width of the car.
  for (const [z, sign] of [[-L / 2 - 0.1, -1], [L / 2 + 0.1, 1]] as const) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.16, 0.14), chrome);
    bar.position.set(0, 0.6, z); g.add(bar);
    for (const sx of [-0.42, 0.42]) {
      const over = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.16), chrome);
      over.position.set(sx, 0.68, z + sign * 0.02); g.add(over);
    }
  }
  // A chrome spear down each flank, and a little bonnet ornament.
  for (const sx of [-(W / 2 + 0.005), W / 2 + 0.005]) {
    const spear = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, L - 1.1), chrome);
    spear.position.set(sx, 0.86, 0.1); g.add(spear);
  }
  const orn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 8), chrome);
  orn.rotation.x = -Math.PI / 2; orn.position.set(0, 1.16, -2.12); g.add(orn);

  // ── Interior: a bench, a big thin wheel, a mirror.
  const bench = new THREE.Mesh(new THREE.BoxGeometry(W - 0.34, 0.16, 0.62), trim);
  bench.position.set(0, 0.98, 0.16); g.add(bench);
  const back = new THREE.Mesh(new THREE.BoxGeometry(W - 0.34, 0.56, 0.12), trim);
  back.position.set(0, 1.3, 0.5); back.rotation.x = -0.1; g.add(back);
  const dash = new THREE.Mesh(new THREE.BoxGeometry(W - 0.3, 0.2, 0.16), trim);
  dash.position.set(0, 1.14, -0.74); g.add(dash);
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 6, 20), trim);
  sw.position.set(-0.52, 1.22, -0.56); sw.rotation.x = 1.2; g.add(sw);

  /*
   * ── Wheels: narrow, tall, with a chrome hubcap.
   *
   * A period saloon rides on tyres the width of a modern bicycle's, and
   * getting that wrong is the quickest way to make it look like a toy.
   * Pushed into `wheels` so the engine spins and steers them.
   */
  const tyreGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.18, 16);
  const capGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.2, 14);
  for (const sx of [-(W / 2 - 0.08), W / 2 - 0.08]) {
    for (const sz of [-1.42, 1.38]) {
      const hub = new THREE.Group();
      const tyre = new THREE.Mesh(tyreGeo, rubber);
      tyre.rotation.z = Math.PI / 2; tyre.castShadow = true; hub.add(tyre);
      const cap = new THREE.Mesh(capGeo, chrome);
      cap.rotation.z = Math.PI / 2; cap.position.x = sx > 0 ? 0.02 : -0.02; hub.add(cap);
      hub.position.set(sx, 0.36, sz);
      g.add(hub);
      wheels.push(hub);
    }
  }
}


