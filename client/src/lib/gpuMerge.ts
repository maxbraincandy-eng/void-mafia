/**
 * The burst merge, on the GPU.
 *
 * HOW THIS IS ALLOWED TO EXIST
 * ────────────────────────────
 * It was written without a device to run it on, and a shader bug does not
 * throw — it writes slightly wrong pixels into every photograph, silently. That
 * would normally make this unshippable.
 *
 * What makes it shippable is `gpuGate`: before a single real photo goes through
 * here, a known input goes through both this and the CPU function it replaces,
 * and the answers are compared. If they disagree, this path is switched off for
 * the session and every shot goes down the tested one. The shader is not
 * trusted because it was reasoned about; it is trusted because it agreed, on
 * the actual device, minutes ago.
 *
 * WHY THIS OPERATION AND NOT ANOTHER
 * ──────────────────────────────────
 * The accumulation is the hot loop and it is embarrassingly parallel: every
 * output pixel reads a handful of samples from each frame and writes once, with
 * no dependency on its neighbours. Fourteen frames at three megapixels is
 * roughly seven hundred million samples, which is a second and a half spread
 * over the phone's cores and a small fraction of that on its GPU.
 *
 * Alignment stays on the CPU. It runs on heavily downsampled pyramids where
 * there is little to parallelise, and it is a decision about the whole image
 * rather than a per-pixel one.
 *
 * THE SHADER MIRRORS THE CPU DELIBERATELY
 * ───────────────────────────────────────
 * Same Catmull-Rom weights, same robustness falloff, same order of operations,
 * arithmetic in 0..255 rather than normalised. Not because that is the fastest
 * way to write it, but because the two have to agree to within a rounding
 * difference or the gate will — correctly — refuse to use it.
 */

import type { Pixels } from './photoPipeline';
import type { MergeOptions } from './burstMerge';

/*
 * The WebGPU surface this file touches, declared locally.
 *
 * `@webgpu/types` would do the same and adds a dependency for a feature most
 * browsers do not have yet. Declaring only what is used has a second benefit:
 * the list below IS the API surface, so anything reaching further shows up as a
 * type error rather than as an assumption.
 */
type GPUBuffer = { destroy(): void; mapAsync(m: number): Promise<void>; getMappedRange(): ArrayBuffer; unmap(): void };
type GPUComputePipeline = { getBindGroupLayout(i: number): unknown };
type GPUDevice = {
  limits: { maxStorageBufferBindingSize: number };
  lost: Promise<unknown>;
  queue: { writeBuffer(b: GPUBuffer, o: number, d: ArrayBufferView | ArrayBuffer): void; submit(c: unknown[]): void };
  createBuffer(d: { size: number; usage: number }): GPUBuffer;
  createShaderModule(d: { code: string }): unknown;
  createComputePipelineAsync(d: unknown): Promise<GPUComputePipeline>;
  createBindGroup(d: unknown): unknown;
  createCommandEncoder(): {
    beginComputePass(): {
      setPipeline(p: GPUComputePipeline): void;
      setBindGroup(i: number, g: unknown): void;
      dispatchWorkgroups(x: number, y: number): void;
      end(): void;
    };
    copyBufferToBuffer(a: GPUBuffer, ao: number, b: GPUBuffer, bo: number, n: number): void;
    finish(): unknown;
  };
};
const GPUBufferUsage = {
  STORAGE: 0x80, COPY_DST: 0x08, COPY_SRC: 0x04, UNIFORM: 0x40, MAP_READ: 0x01,
} as const;
const GPUMapMode = { READ: 0x01 } as const;

const WORKGROUP = 8;

/**
 * The compute shader.
 *
 * Frames arrive as one buffer of packed RGBA8, concatenated. Offsets arrive as
 * a separate small buffer. Each invocation owns one output pixel.
 */
const SHADER = /* wgsl */ `
struct Params {
  width      : u32,
  height     : u32,
  contribs   : u32,
  refOffset  : u32,   // index of the reference frame's first pixel
  motionInv  : f32,   // 1 / threshold^2, precomputed to match the CPU exactly
  cubic      : u32,
};

@group(0) @binding(0) var<storage, read>       frames  : array<u32>;
@group(0) @binding(1) var<storage, read>       offsets : array<vec4<f32>>; // xy = dx,dy; z = frame base index
@group(0) @binding(2) var<storage, read_write> outPix  : array<u32>;
@group(0) @binding(3) var<uniform>             P       : Params;

fn texel(base: u32, x: i32, y: i32) -> vec3<f32> {
  // Clamped at the edges, exactly as the CPU sampler does. Wrapping here would
  // put the top of the frame into the bottom of it.
  let cx = u32(clamp(x, 0, i32(P.width) - 1));
  let cy = u32(clamp(y, 0, i32(P.height) - 1));
  let v  = unpack4x8unorm(frames[base + cy * P.width + cx]);
  return vec3<f32>(v.r, v.g, v.b) * 255.0;
}

fn catmull(t: f32) -> vec4<f32> {
  let t2 = t * t;
  let t3 = t2 * t;
  return vec4<f32>(
    -0.5 * t3 + t2 - 0.5 * t,
     1.5 * t3 - 2.5 * t2 + 1.0,
    -1.5 * t3 + 2.0 * t2 + 0.5 * t,
     0.5 * t3 - 0.5 * t2
  );
}

@compute @workgroup_size(${WORKGROUP}, ${WORKGROUP})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  if (gid.x >= P.width || gid.y >= P.height) { return; }

  let idx = gid.y * P.width + gid.x;
  let refRgb = texel(P.refOffset, i32(gid.x), i32(gid.y));

  // The reference carries full weight everywhere; everything else earns its.
  var acc  = refRgb;
  var wsum = 1.0;

  for (var c : u32 = 0u; c < P.contribs; c = c + 1u) {
    let o    = offsets[c];
    let base = u32(o.z);
    let sx   = f32(gid.x) + o.x;
    let sy   = f32(gid.y) + o.y;
    let xi   = i32(floor(sx));
    let yi   = i32(floor(sy));
    let fx   = sx - f32(xi);
    let fy   = sy - f32(yi);

    var rgb = vec3<f32>(0.0);
    if (P.cubic == 1u) {
      let wx = catmull(fx);
      let wy = catmull(fy);
      for (var j : i32 = 0; j < 4; j = j + 1) {
        let cy = wy[j];
        for (var i : i32 = 0; i < 4; i = i + 1) {
          rgb = rgb + texel(base, xi - 1 + i, yi - 1 + j) * (wx[i] * cy);
        }
      }
    } else {
      let a = texel(base, xi,     yi);
      let b = texel(base, xi + 1, yi);
      let c2 = texel(base, xi,     yi + 1);
      let d = texel(base, xi + 1, yi + 1);
      rgb = a * ((1.0 - fx) * (1.0 - fy)) + b * (fx * (1.0 - fy))
          + c2 * ((1.0 - fx) * fy)        + d * (fx * fy);
    }

    // Distance from the reference over all three channels — a subject can move
    // without changing brightness, and colour catches that.
    let diff  = rgb - refRgb;
    let dist2 = dot(diff, diff) / 3.0;
    let w     = max(0.0, 1.0 - dist2 * P.motionInv);
    if (w > 0.0) {
      acc  = acc + rgb * w;
      wsum = wsum + w;
    }
  }

  let outRgb = acc / wsum;
  // Alpha is carried through from the reference, as on the CPU.
  let refA = unpack4x8unorm(frames[P.refOffset + idx]).a;
  outPix[idx] = pack4x8unorm(vec4<f32>(outRgb / 255.0, refA));
}
`;

export interface GpuMergeInput {
  frames: Pixels[];
  reference: number;
  contributors: { index: number; dx: number; dy: number }[];
  options: MergeOptions;
}

let devicePromise: Promise<GPUDevice | null> | null = null;

/**
 * The device, acquired once.
 *
 * Everything here answers null rather than throwing. WebGPU is absent on most
 * browsers today, present but adapterless in some virtualised environments, and
 * occasionally lost when a tab is backgrounded — none of which is exceptional
 * and all of which means the same thing: use the CPU.
 */
export function gpuDevice(): Promise<GPUDevice | null> {
  if (devicePromise) return devicePromise;
  devicePromise = (async () => {
    try {
      const gpu = (navigator as any).gpu;
      if (!gpu) return null;
      const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) return null;
      const device: GPUDevice = await adapter.requestDevice();
      /*
       * A lost device must not leave a stale handle behind. Clearing the cache
       * lets the next caller try again from scratch, and until then the gate
       * fails closed onto the CPU.
       */
      device.lost.then(() => { devicePromise = null; });
      return device;
    } catch {
      return null;
    }
  })();
  return devicePromise;
}

let pipelineCache: { device: GPUDevice; pipeline: GPUComputePipeline } | null = null;

async function pipelineFor(device: GPUDevice): Promise<GPUComputePipeline> {
  const cached = pipelineCache;
  if (cached && cached.device === device) return cached.pipeline;
  const module = device.createShaderModule({ code: SHADER });
  const pipeline = await device.createComputePipelineAsync({
    layout: 'auto',
    compute: { module, entryPoint: 'main' },
  });
  pipelineCache = { device, pipeline };
  return pipeline;
}

/**
 * Merge a burst on the GPU, or answer null.
 *
 * Null is not an error: it is "this device cannot, use the CPU". Every path out
 * of here that is not a correct result is null, including a shader that fails
 * to compile and a buffer allocation the device refuses.
 */
export async function gpuMerge(input: GpuMergeInput): Promise<Uint8ClampedArray | null> {
  const device = await gpuDevice();
  if (!device) return null;

  const { frames, reference, contributors, options } = input;
  if (frames.length === 0) return null;
  const w = frames[0].width, h = frames[0].height;
  const pixels = w * h;

  /*
   * Every frame the merge touches, in one buffer. Only the reference and the
   * contributors are uploaded — a frame that was dropped for poor alignment
   * would otherwise be copied to the GPU for nothing.
   */
  const used = [reference, ...contributors.map(c => c.index)];
  const bytes = used.length * pixels * 4;
  if (bytes > device.limits.maxStorageBufferBindingSize) return null;

  let frameBuf: GPUBuffer | null = null;
  let offsetBuf: GPUBuffer | null = null;
  let outBuf: GPUBuffer | null = null;
  let readBuf: GPUBuffer | null = null;
  let paramBuf: GPUBuffer | null = null;

  try {
    const packed = new Uint32Array(used.length * pixels);
    used.forEach((frameIndex, slot) => {
      packed.set(new Uint32Array(frames[frameIndex].data.buffer, frames[frameIndex].data.byteOffset, pixels), slot * pixels);
    });

    frameBuf = device.createBuffer({ size: packed.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(frameBuf, 0, packed);

    // vec4 per contributor: dx, dy, base index, padding. vec4 because a storage
    // array of vec3 is padded to 16 bytes anyway and the explicit version is
    // one less alignment rule to get wrong.
    const offs = new Float32Array(Math.max(1, contributors.length) * 4);
    contributors.forEach((c, i) => {
      offs[i * 4] = c.dx;
      offs[i * 4 + 1] = c.dy;
      offs[i * 4 + 2] = (used.indexOf(c.index)) * pixels;
    });
    offsetBuf = device.createBuffer({ size: offs.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(offsetBuf, 0, offs);

    outBuf = device.createBuffer({ size: pixels * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    readBuf = device.createBuffer({ size: pixels * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });

    const params = new ArrayBuffer(24);
    const pu = new Uint32Array(params);
    const pf = new Float32Array(params);
    pu[0] = w;
    pu[1] = h;
    pu[2] = contributors.length;
    pu[3] = 0;                                   // reference is always slot 0
    pf[4] = 1 / (options.motionThreshold * options.motionThreshold);
    pu[5] = options.cubic ? 1 : 0;
    paramBuf = device.createBuffer({ size: 24, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(paramBuf, 0, params);

    const pipeline = await pipelineFor(device);
    const bind = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: frameBuf } },
        { binding: 1, resource: { buffer: offsetBuf } },
        { binding: 2, resource: { buffer: outBuf } },
        { binding: 3, resource: { buffer: paramBuf } },
      ],
    });

    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(Math.ceil(w / WORKGROUP), Math.ceil(h / WORKGROUP));
    pass.end();
    enc.copyBufferToBuffer(outBuf, 0, readBuf, 0, pixels * 4);
    device.queue.submit([enc.finish()]);

    await readBuf.mapAsync(GPUMapMode.READ);
    const out = new Uint8ClampedArray(readBuf.getMappedRange().slice(0));
    readBuf.unmap();
    return out;
  } catch {
    return null;
  } finally {
    frameBuf?.destroy();
    offsetBuf?.destroy();
    outBuf?.destroy();
    readBuf?.destroy();
    paramBuf?.destroy();
  }
}
