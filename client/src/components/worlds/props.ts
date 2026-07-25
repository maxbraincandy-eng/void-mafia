// ── Shared world props ────────────────────────────────────────────────
// Small reusable set-pieces so each world doesn't hand-roll (and drift on) the
// same thing. Everything here is procedural and cheap.
import * as THREE from 'three';
import type { WorldContext } from './types';

/**
 * A couples' HUG SPOT: a low pad with two facing stand positions. Sitting on
 * one puts the avatar into the standing-embrace pose (hugL / hugR); with both
 * spots taken the two avatars stand chest-to-chest with their arms wrapped
 * around each other.
 *
 * `yaw` is the axis the pair faces along; the two spots sit either side of
 * (x,z) at ±GAP and each looks back at the centre, so they always face each
 * other no matter how the pad is rotated.
 */
export function addHugSpot(
  ctx: WorldContext,
  x: number, z: number, yaw: number,
  accent: number,
  id: string,
) {
  const GAP = 0.3;                     // half the distance between the partners
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; ctx.scene.add(g);

  // low pad so the spot reads as intentional
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.25, 0.12, 28),
    new THREE.MeshStandardMaterial({ color: 0x2a2333, roughness: 0.7, metalness: 0.2 }),
  );
  pad.position.y = 0.06; pad.receiveShadow = true; g.add(pad);

  const glowMat = new THREE.MeshBasicMaterial({ color: accent, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.045, 8, 40), glowMat);
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.13; g.add(ring);

  // two facing footprint marks
  for (const s of [-1, 1]) {
    const mark = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.4, toneMapped: false }));
    mark.rotation.x = -Math.PI / 2; mark.position.set(0, 0.13, s * GAP * 1.6); g.add(mark);
  }

  // floating heart marking it as the couples spot
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 12), new THREE.MeshBasicMaterial({ color: 0xff4d6d, toneMapped: false }));
  heart.scale.set(1, 0.9, 0.6); heart.position.y = 2.35; g.add(heart);
  ctx.onUpdate((_d, e) => { heart.position.y = 2.3 + Math.sin(e * 1.6) * 0.09; heart.rotation.y = e * 0.7; });

  // Two spots facing each other. A spot at P looking at the pad centre C uses
  // yaw = atan2(P.x - C.x, P.z - C.z) (the engine's "face the target" idiom),
  // which works out to `yaw` for one side and `yaw + PI` for the other.
  const sx = Math.sin(yaw) * GAP, sz = Math.cos(yaw) * GAP;
  ctx.addSeat({ id: `${id}-l`, x: x + sx, y: 0, z: z + sz, yaw, pose: 'hugL' });
  ctx.addSeat({ id: `${id}-r`, x: x - sx, y: 0, z: z - sz, yaw: yaw + Math.PI, pose: 'hugR' });

  // keep the pad walkable — no collider (players need to step onto the marks)
}
