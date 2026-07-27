// ── Deathrun / bhop — Source-style movement ───────────────────────────
// A faithful port of the Quake→GoldSrc→Source player move, because the whole
// point of bhop is a very specific feel that only this exact maths produces:
//
//  • On the ground you have friction and accelerate toward your wish direction
//    up to `maxSpeed`. Nothing surprising.
//  • In the AIR the wish speed is clamped to a tiny value (30 u/s) for the
//    "how much am I already going that way" test, but the acceleration amount
//    still scales with the UNCLAMPED wish speed. That asymmetry is the bug that
//    became a genre: hold a strafe key, sweep the mouse the same way, and every
//    frame you gain a sliver of speed perpendicular to your motion.
//  • Friction is applied only while on the ground — so if you jump on the exact
//    frame you land, you never pay it. That's a bunny hop. We auto-hop while the
//    jump button is HELD (what every bhop server does), because frame-perfect
//    timing is impossible on a phone.
//
// Everything is metric; the classic constants are in Source units (1 u = 1 inch
// = 0.0254 m) and converted once, here, so the numbers stay recognisable.

export const U = 0.0254;                     // one Source unit, in metres

export interface MoveConfig {
  maxSpeed: number;      // ground run speed
  maxAirWish: number;    // the famous 30 u/s air cap
  accelerate: number;    // ground acceleration coefficient
  airAccelerate: number; // air acceleration coefficient
  friction: number;
  stopSpeed: number;     // below this, friction is applied as if at stopSpeed
  gravity: number;
  jumpSpeed: number;     // upward velocity of a jump
  stepHeight: number;    // how tall a ledge you walk straight up
  width: number;         // player AABB width (x and z)
  height: number;        // standing height
  duckHeight: number;
  eye: number;           // eye height above the feet when standing
  maxSpeedCap: number;   // hard ceiling so a perfect run can't reach orbit
}

// CS 1.6 values: sv_maxspeed 320 (250 with a knife out), sv_accelerate 5,
// sv_airaccelerate 10, sv_friction 4, sv_stopspeed 100, sv_gravity 800,
// jump 268 u/s (a 45-unit hop), 32x72 hull, 18-unit step.
export const CS: MoveConfig = {
  maxSpeed: 250 * U,
  maxAirWish: 30 * U,
  accelerate: 5,
  airAccelerate: 10,
  friction: 4,
  stopSpeed: 100 * U,
  gravity: 800 * U,
  jumpSpeed: 268 * U,
  stepHeight: 18 * U,
  width: 32 * U,
  height: 72 * U,
  duckHeight: 36 * U,
  eye: 64 * U,
  maxSpeedCap: 1600 * U,
};

export interface Vec3 { x: number; y: number; z: number }
export interface Body {
  pos: Vec3;            // FEET position (the AABB's bottom centre)
  vel: Vec3;
  onGround: boolean;
  ducking: boolean;
}
export interface WishInput {
  fwd: number;          // −1 … 1
  side: number;         // −1 … 1
  yaw: number;          // radians; 0 looks down −Z
  jump: boolean;        // held (auto-hop) — not edge-triggered
  duck: boolean;
}

/** An axis-aligned box: centre + half extents. */
export interface Box { x: number; y: number; z: number; hx: number; hy: number; hz: number }

export interface Solid {
  boxes: Box[];
}

const EPS = 1e-4;

function horizSpeed(v: Vec3) { return Math.hypot(v.x, v.z); }

/** Source's PM_Friction — only ever called while standing on something. */
function applyFriction(vel: Vec3, dt: number, cfg: MoveConfig) {
  const speed = horizSpeed(vel);
  if (speed < 0.05) { vel.x = 0; vel.z = 0; return; }
  // Below stopSpeed the drop is computed AS IF you were going stopSpeed, which
  // is what makes you come to a crisp halt instead of sliding forever.
  const control = Math.max(speed, cfg.stopSpeed);
  const drop = control * cfg.friction * dt;
  const newSpeed = Math.max(0, speed - drop) / speed;
  vel.x *= newSpeed; vel.z *= newSpeed;
}

/** Source's PM_Accelerate. */
function accelerate(vel: Vec3, wishDir: Vec3, wishSpeed: number, accel: number, dt: number) {
  const current = vel.x * wishDir.x + vel.z * wishDir.z;
  const add = wishSpeed - current;
  if (add <= 0) return;
  let accelSpeed = accel * wishSpeed * dt;
  if (accelSpeed > add) accelSpeed = add;
  vel.x += accelSpeed * wishDir.x;
  vel.z += accelSpeed * wishDir.z;
}

/**
 * Source's PM_AirAccelerate — the strafe engine. Note the two different wish
 * speeds: the "am I already fast in this direction" test uses the CAPPED value,
 * while the amount added uses the full one. Swap either and bhop dies.
 */
function airAccelerate(vel: Vec3, wishDir: Vec3, wishSpeed: number, cfg: MoveConfig, dt: number) {
  const capped = Math.min(wishSpeed, cfg.maxAirWish);
  const current = vel.x * wishDir.x + vel.z * wishDir.z;
  const add = capped - current;
  if (add <= 0) return;
  let accelSpeed = cfg.airAccelerate * wishSpeed * dt;
  if (accelSpeed > add) accelSpeed = add;
  vel.x += accelSpeed * wishDir.x;
  vel.z += accelSpeed * wishDir.z;
}

/** Overlap test between the player hull at `pos` and one box. */
function hits(pos: Vec3, hw: number, h: number, b: Box): boolean {
  return Math.abs(pos.x - b.x) < hw + b.hx
    && Math.abs(pos.z - b.z) < hw + b.hz
    && pos.y < b.y + b.hy - EPS
    && pos.y + h > b.y - b.hy + EPS;
}

function anyHit(pos: Vec3, hw: number, h: number, boxes: Box[]): Box | null {
  for (const b of boxes) if (hits(pos, hw, h, b)) return b;
  return null;
}

/**
 * Move one axis and push back out of whatever we ended up inside. Axis-separated
 * resolution gives free wall-sliding, which is exactly what a bhop map wants —
 * you keep your speed brushing along a corridor instead of dead-stopping.
 * Returns true if it was blocked.
 */
function moveAxis(pos: Vec3, hw: number, h: number, boxes: Box[], axis: 'x' | 'y' | 'z', d: number): boolean {
  if (d === 0) return false;
  pos[axis] += d;
  let blocked = false;
  for (const b of boxes) {
    if (!hits(pos, hw, h, b)) continue;
    blocked = true;
    if (axis === 'y') {
      pos.y = d > 0 ? b.y - b.hy - h - EPS : b.y + b.hy + EPS;
    } else {
      const half = (axis === 'x' ? b.hx : b.hz) + hw;
      pos[axis] = (axis === 'x' ? b.x : b.z) + (d > 0 ? -half - EPS : half + EPS);
    }
  }
  return blocked;
}

/**
 * Advance the body by dt. `dt` is sliced so that no single step moves further
 * than a quarter of the hull — at 15 m/s and a 30 Hz frame you'd otherwise
 * tunnel straight through a trap wall.
 */
export function moveBody(body: Body, input: WishInput, dt: number, solid: Solid, cfg: MoveConfig = CS): void {
  const height = body.ducking ? cfg.duckHeight : cfg.height;
  const hw = cfg.width / 2;
  const boxes = solid.boxes;

  // ── jump BEFORE friction: that ordering is the bunny hop ──
  if (input.jump && body.onGround) {
    body.vel.y = cfg.jumpSpeed;
    body.onGround = false;
  } else if (body.onGround) {
    applyFriction(body.vel, dt, cfg);
  }

  // wish direction in the yaw plane (yaw 0 faces −Z)
  const sin = Math.sin(input.yaw), cos = Math.cos(input.yaw);
  let wx = -sin * input.fwd + cos * input.side;
  let wz = -cos * input.fwd - sin * input.side;
  const wlen = Math.hypot(wx, wz);
  let wishSpeed = 0;
  if (wlen > 1e-6) {
    wx /= wlen; wz /= wlen;
    wishSpeed = cfg.maxSpeed * Math.min(1, wlen);
    if (body.ducking && body.onGround) wishSpeed *= 0.34;
    const dir = { x: wx, y: 0, z: wz };
    if (body.onGround) accelerate(body.vel, dir, wishSpeed, cfg.accelerate, dt);
    else airAccelerate(body.vel, dir, wishSpeed, cfg, dt);
  }

  if (!body.onGround) body.vel.y -= cfg.gravity * dt;

  // hard ceiling — a flawless run should be fast, not unplayable
  const hs = horizSpeed(body.vel);
  if (hs > cfg.maxSpeedCap) { body.vel.x *= cfg.maxSpeedCap / hs; body.vel.z *= cfg.maxSpeedCap / hs; }

  // ── integrate, substepped ──
  const dist = Math.hypot(body.vel.x * dt, body.vel.y * dt, body.vel.z * dt);
  const steps = Math.max(1, Math.ceil(dist / (cfg.width * 0.25)));
  const sdt = dt / steps;

  for (let i = 0; i < steps; i++) {
    const dx = body.vel.x * sdt, dy = body.vel.y * sdt, dz = body.vel.z * sdt;

    // horizontal, with a step-up retry so stairs and ledges don't stop you dead
    const before = { x: body.pos.x, y: body.pos.y, z: body.pos.z };
    const bx = moveAxis(body.pos, hw, height, boxes, 'x', dx);
    const bz = moveAxis(body.pos, hw, height, boxes, 'z', dz);
    if ((bx || bz) && body.onGround) {
      const stepped = { x: before.x, y: before.y + cfg.stepHeight, z: before.z };
      if (!anyHit(stepped, hw, height, boxes)) {
        moveAxis(stepped, hw, height, boxes, 'x', dx);
        moveAxis(stepped, hw, height, boxes, 'z', dz);
        // only worth it if we actually got further along
        const gained = Math.hypot(stepped.x - before.x, stepped.z - before.z);
        const got = Math.hypot(body.pos.x - before.x, body.pos.z - before.z);
        if (gained > got + EPS) {
          // settle back down onto the ledge
          moveAxis(stepped, hw, height, boxes, 'y', -cfg.stepHeight);
          body.pos.x = stepped.x; body.pos.y = stepped.y; body.pos.z = stepped.z;
        }
      }
    }

    // vertical
    const hitY = moveAxis(body.pos, hw, height, boxes, 'y', dy);
    if (hitY) {
      if (dy <= 0) { body.onGround = true; body.vel.y = 0; }
      else body.vel.y = 0;                                   // bonked the ceiling
    } else if (dy < 0) {
      body.onGround = false;
    }
  }

  // still standing on something? (walking off an edge must drop you)
  if (body.onGround && body.vel.y <= 0) {
    const probe = { x: body.pos.x, y: body.pos.y - 0.04, z: body.pos.z };
    if (!anyHit(probe, hw, height, boxes)) body.onGround = false;
    else body.vel.y = 0;
  }
}

/** Speed shown on the HUD, in the units every bhop player actually thinks in. */
export function speedUnits(v: Vec3): number { return Math.hypot(v.x, v.z) / U; }
