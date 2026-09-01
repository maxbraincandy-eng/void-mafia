/**
 * The gate that decides whether the GPU is allowed near a photograph.
 *
 * The shader itself cannot be tested here — no adapter, no device. What CAN be
 * tested, and is what actually keeps the product safe, is that a WRONG shader
 * gets caught and shut out. So every test below hands the gate a deliberately
 * broken implementation and checks that it is rejected.
 *
 * If these pass, then shipping an unverified shader is safe in the only sense
 * that matters: when it is wrong on somebody's device, that device stops using
 * it and the photograph is produced by the path that was tested.
 *
 *   npx tsx --test src/lib/gpuGate.test.ts
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';

import { compare, VerifiedPath, GPU_TOLERANCE } from './gpuGate.js';

const buf = (...v: number[]) => Uint8ClampedArray.from(v);

// ── Comparison ────────────────────────────────────────────────────────────────

test('identical results are trusted', () => {
  const a = buf(10, 20, 30, 255, 40, 50, 60, 255);
  assert.equal(compare(a, a).trusted, true);
  assert.equal(compare(a, a).maxDelta, 0);
});

test('a rounding difference between float widths is tolerated', () => {
  /*
   * The CPU path computes in doubles and a shader in 32-bit floats. Identical
   * arithmetic differs in the last bit, which after rounding to 8 bits is
   * occasionally one level. Demanding byte-equality would reject every correct
   * implementation there is.
   */
  const ref = buf(100, 100, 100, 255, 200, 200, 200, 255);
  const gpu = buf(101, 99, 100, 255, 199, 201, 200, 255);
  assert.equal(compare(gpu, ref).trusted, true);
});

test('a real bug is caught', () => {
  // An indexing mistake misses by tens or hundreds, not by one.
  const ref = buf(100, 100, 100, 255, 200, 200, 200, 255);
  const wrong = buf(100, 100, 100, 255, 40, 200, 200, 255);
  const v = compare(wrong, ref);
  assert.equal(v.trusted, false);
  assert.equal(v.maxDelta, 160);
  assert.equal(v.atByte, 4, 'and it says where');
});

test('the tolerance boundary is exact', () => {
  const ref = buf(100, 0, 0, 255);
  assert.equal(compare(buf(100 + GPU_TOLERANCE, 0, 0, 255), ref).trusted, true);
  assert.equal(compare(buf(100 + GPU_TOLERANCE + 1, 0, 0, 255), ref).trusted, false);
});

test('alpha is not compared', () => {
  /*
   * The merge carries alpha through from the reference frame untouched, so it
   * says nothing about whether the arithmetic is right. A shader that packs it
   * differently would be rejected for a reason that does not matter.
   */
  const ref = buf(10, 20, 30, 255);
  assert.equal(compare(buf(10, 20, 30, 0), ref).trusted, true);
});

test('a size mismatch is a failure, not a crash', () => {
  const v = compare(buf(1, 2, 3, 4), buf(1, 2, 3, 4, 5, 6, 7, 8));
  assert.equal(v.trusted, false);
  assert.match(v.reason, /size mismatch/);
});

// ── The gate ──────────────────────────────────────────────────────────────────

const probe = () => buf(10, 20, 30, 255, 90, 100, 110, 255);
const truth = (p: Uint8ClampedArray) => p;

test('a correct implementation is trusted, and the check runs once', async () => {
  let calls = 0;
  const gate = new VerifiedPath<Uint8ClampedArray>(
    async p => { calls++; return p; }, truth, probe,
  );
  assert.equal(await gate.trusted(), true);
  assert.equal(await gate.trusted(), true);
  assert.equal(calls, 1, 're-testing on every photo spends the speed the GPU was for');
});

test('a wrong implementation is shut out', async () => {
  const gate = new VerifiedPath<Uint8ClampedArray>(
    async p => { const bad = Uint8ClampedArray.from(p); bad[0] = 200; return bad; },
    truth, probe,
  );
  assert.equal(await gate.trusted(), false);
  assert.match(gate.result!.reason, /differs by/);
});

test('an implementation that throws is shut out rather than propagating', async () => {
  /*
   * A shader that will not compile, an adapter that vanished when the tab was
   * backgrounded, an out-of-memory on a device with less than the buffer needs.
   * All of them mean the same thing to the caller: use the CPU.
   */
  const gate = new VerifiedPath<Uint8ClampedArray>(
    async () => { throw new Error('shader compilation failed at line 42'); },
    truth, probe,
  );
  assert.equal(await gate.trusted(), false);
  assert.match(gate.result!.reason, /threw during verification/);
  assert.match(gate.result!.reason, /line 42/, 'and keeps enough to debug with');
});

test('an implementation that reports itself unavailable is shut out', async () => {
  const gate = new VerifiedPath<Uint8ClampedArray>(async () => null, truth, probe);
  assert.equal(await gate.trusted(), false);
  assert.equal(gate.result!.reason, 'unavailable');
});

test('concurrent callers share one check', async () => {
  // Every strip of a photo asks at once. Running the self-test once per strip
  // would cost more than the acceleration returns.
  let calls = 0;
  const gate = new VerifiedPath<Uint8ClampedArray>(
    async p => { calls++; await new Promise(r => setTimeout(r, 10)); return p; },
    truth, probe,
  );
  const all = await Promise.all([gate.trusted(), gate.trusted(), gate.trusted(), gate.trusted()]);
  assert.deepEqual(all, [true, true, true, true]);
  assert.equal(calls, 1);
});

test('a failure is remembered, not retried', async () => {
  // A device that failed will fail again. Retrying every shot would mean paying
  // for a broken GPU path on every photograph for the life of the session.
  let calls = 0;
  const gate = new VerifiedPath<Uint8ClampedArray>(
    async () => { calls++; throw new Error('nope'); }, truth, probe,
  );
  await gate.trusted();
  await gate.trusted();
  await gate.trusted();
  assert.equal(calls, 1);
});

test('the verdict is unknown until the check has run', () => {
  const gate = new VerifiedPath<Uint8ClampedArray>(async p => p, truth, probe);
  assert.equal(gate.result, null, 'a gate that claims a verdict it has not reached is the bug');
});

// ── The real probe ────────────────────────────────────────────────────────────

test('the probe is built so that a broken shader cannot pass it', async () => {
  /*
   * A self-test only proves something if it exercises everything the real path
   * does. Each property below corresponds to a specific bug that would
   * otherwise slip through:
   *
   *   flat colour            → a sampler ignoring its coordinates passes
   *   whole-pixel offsets    → a broken interpolator passes
   *   identical frames       → an inverted robustness weight passes
   *   workgroup-sized image  → dropping the final partial workgroup passes
   */
  const { buildProbe } = await import('./gpuPath.js');
  const p = buildProbe();

  assert.ok(p.frames.length >= 3, 'a probe of one frame merges nothing');
  assert.ok(p.contributors.length >= 2);

  assert.ok(p.contributors.some(c => c.dx % 1 !== 0), 'no fractional x offset — interpolation untested');
  assert.ok(p.contributors.some(c => c.dy % 1 !== 0), 'no fractional y offset');
  assert.ok(p.contributors.some(c => c.dx < 0) && p.contributors.some(c => c.dx > 0),
    'offsets all one sign — a dropped minus sign would pass');

  assert.notEqual(p.frames[0].width % 8, 0, 'width is a multiple of the workgroup — a dropped edge would pass');
  assert.notEqual(p.frames[0].height % 8, 0, 'height is a multiple of the workgroup');

  // Structure at pixel scale: neighbouring pixels must actually differ.
  const d = p.frames[0].data;
  let varied = 0;
  for (let i = 0; i < 200; i++) if (Math.abs(d[i * 4] - d[(i + 1) * 4]) > 8) varied++;
  assert.ok(varied > 40, `only ${varied}/200 neighbours differ — too smooth to catch a sampler bug`);

  // One frame must disagree enough for the robustness weight to bite.
  const ref = p.frames[p.reference].data;
  const odd = p.frames[3].data;
  let big = 0;
  for (let i = 0; i < 400; i++) if (Math.abs(odd[i * 4] - ref[i * 4]) > 40) big++;
  assert.ok(big > 50, 'no frame disagrees strongly — rejection logic untested');
});

test('the gate refuses the GPU where there is no GPU', async () => {
  // Which is this environment, and most browsers today. The point is that it
  // answers "no" cleanly rather than throwing on the way past.
  const { tryGpuMerge, gpuVerdict } = await import('./gpuPath.js');
  const { buildProbe } = await import('./gpuPath.js');
  const p = buildProbe();
  const out = await tryGpuMerge(p.frames, p.reference, p.contributors, p.options);
  assert.equal(out, null, 'a merge came back from a device that does not exist');
  void gpuVerdict();
});
