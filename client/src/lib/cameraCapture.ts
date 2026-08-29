/**
 * Getting the best pixels the device will give.
 *
 * THIS IS WHERE THE QUALITY ACTUALLY COMES FROM
 * ─────────────────────────────────────────────
 * Almost every camera on the web is built the same way: show a `<video>`, and
 * when the shutter is tapped, draw that video onto a canvas. It works, and it
 * throws away most of the photo. A video track is negotiated for streaming —
 * typically 1280×720 — while the sensor behind it will hand over 4000×3000 for
 * a still. That is twelve times the pixels, discarded before any processing
 * gets a chance.
 *
 * No amount of sharpening recovers it. So the order of preference here is
 * about resolution first and everything else second:
 *
 *   1. `ImageCapture.takePhoto()` — a real still off the photo pipeline, at
 *      sensor resolution, with the device's own processing applied.
 *   2. `ImageCapture.grabFrame()` — a frame off the video track, but decoded
 *      by the platform rather than repainted through a canvas.
 *   3. Drawing the `<video>` element. Always available, always the worst.
 *
 * Safari supports none of `ImageCapture`, so on iPhone the third path is the
 * only one — which is why the track is asked for the largest video size the
 * device will negotiate, rather than accepting the default. On a recent iPhone
 * that is 1920×1440 rather than 1280×720, and it is free.
 *
 * ZOOM IS THE SAME MISTAKE IN MINIATURE
 * ─────────────────────────────────────
 * The usual implementation scales the preview with a CSS transform and then
 * captures the preview. So a 2× shot is a 720p frame blown up — which is
 * exactly the mush people complain about.
 *
 * Two better answers, in order. Where the platform exposes a `zoom` track
 * capability, use it: that is the sensor's own zoom, and it costs nothing.
 * Where it does not, capture the FULL still and crop it — 2× on a
 * twelve-megapixel sensor still leaves three megapixels, which is more than the
 * whole video frame ever had.
 */

import { crop, zoomRect, lanczosResize, enhance, type Pixels, type EnhanceOptions } from './photoPipeline';
import { mergeBurst, type MergeReport } from './burstMerge';
import { superResolve, MAX_HONEST_SCALE, type SuperResolveReport } from './superResolve';
import { planMerge, mergeRows, MERGE_DEFAULTS, type MergePlan } from './burstMerge';
import { PhotoPool, mergeAcrossPool } from './photoPool';
import { capability } from './deviceTier';

/** Ask for far more than any phone has; the browser negotiates down. */
const IDEAL_W = 4096;
const IDEAL_H = 3072;

export type Facing = 'user' | 'environment';

export interface CaptureCapabilities {
  /** The sensor's own zoom, if the platform exposes it. */
  zoom: { min: number; max: number; step: number } | null;
  /** A torch, which on a phone is the flash. */
  torch: boolean;
  /** Whether a real still can be taken, or only a video frame. */
  stills: boolean;
}

export interface OpenCamera {
  stream: MediaStream;
  track: MediaStreamTrack;
  capabilities: CaptureCapabilities;
}

/**
 * Open the camera, asking for everything.
 *
 * `ideal` rather than `exact` throughout: a constraint the device cannot meet
 * with `exact` fails the whole request, and a camera that refuses to open is a
 * far worse outcome than one that opens at a lower resolution.
 */
export async function openCamera(facing: Facing): Promise<OpenCamera> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: facing },
      width: { ideal: IDEAL_W },
      height: { ideal: IDEAL_H },
      // A phone held upright wants a tall frame; asking for a square-ish aspect
      // lets the platform pick its native sensor shape rather than cropping to
      // 16:9, which quietly discards the top and bottom of every photo.
      aspectRatio: { ideal: 4 / 3 },
    },
  });

  const track = stream.getVideoTracks()[0];
  if (!track) {
    stream.getTracks().forEach(t => t.stop());
    throw new Error('კამერა ვერ გაიხსნა');
  }
  return { stream, track, capabilities: readCapabilities(track) };
}

function readCapabilities(track: MediaStreamTrack): CaptureCapabilities {
  let zoom: CaptureCapabilities['zoom'] = null;
  let torch = false;
  try {
    // `getCapabilities` is absent on Safari and on older Firefox. Its absence
    // means "assume nothing extra", not an error.
    const caps: any = (track as any).getCapabilities?.() ?? {};
    if (caps.zoom && typeof caps.zoom.max === 'number' && caps.zoom.max > (caps.zoom.min ?? 1)) {
      zoom = {
        min: caps.zoom.min ?? 1,
        max: caps.zoom.max,
        step: caps.zoom.step && caps.zoom.step > 0 ? caps.zoom.step : 0.1,
      };
    }
    torch = Array.isArray(caps.torch) ? caps.torch.includes(true) : !!caps.torch;
  } catch { /* nothing extra */ }

  return { zoom, torch, stills: typeof (window as any).ImageCapture === 'function' };
}

/**
 * Ask the sensor to zoom.
 *
 * Returns whether it happened, because the caller has to know: if the sensor
 * zoomed, the still is already framed and must not be cropped again; if it did
 * not, the crop is the only zoom there is going to be.
 */
export async function setOpticalZoom(track: MediaStreamTrack, zoom: number): Promise<boolean> {
  try {
    const caps: any = (track as any).getCapabilities?.();
    if (!caps?.zoom) return false;
    const clamped = Math.min(caps.zoom.max, Math.max(caps.zoom.min ?? 1, zoom));
    await track.applyConstraints({ advanced: [{ zoom: clamped }] } as any);
    return true;
  } catch {
    return false;
  }
}

export async function setTorch(track: MediaStreamTrack, on: boolean): Promise<boolean> {
  try {
    await track.applyConstraints({ advanced: [{ torch: on }] } as any);
    return true;
  } catch {
    return false;
  }
}

// ── Taking the picture ────────────────────────────────────────────────────────

export interface Shot {
  pixels: Pixels;
  /** Which path produced it — shown in the detail readout, and useful in a bug report. */
  source: 'photo' | 'frame' | 'video';
  /** True when the sensor did the zooming, so the crop must not run again. */
  opticalZoom: boolean;
}

/**
 * One frame, by the best route available.
 *
 * Each fallback is a real device, not a hypothetical: `takePhoto` is Chrome on
 * Android, `grabFrame` is a handful of desktop builds where `takePhoto` throws,
 * and the video draw is every iPhone ever made.
 */
export async function captureFrame(
  track: MediaStreamTrack,
  video: HTMLVideoElement,
): Promise<{ pixels: Pixels; source: Shot['source'] }> {
  const IC: any = (window as any).ImageCapture;
  if (typeof IC === 'function') {
    let capture: any = null;
    try { capture = new IC(track); } catch { capture = null; }

    if (capture) {
      /*
       * The full still, at sensor resolution. This is the whole point of the
       * file, and it is also the call most likely to fail — some devices
       * advertise ImageCapture and then reject `takePhoto` with an
       * `OperationError`, or hang. So it is raced against a timeout: a photo a
       * second late is worse than a slightly smaller photo now.
       */
      try {
        const blob: Blob = await withTimeout(capture.takePhoto(), 2500);
        return { pixels: await pixelsFromBlob(blob), source: 'photo' };
      } catch { /* fall through */ }

      try {
        const bmp: ImageBitmap = await withTimeout(capture.grabFrame(), 1500);
        const out = pixelsFromBitmap(bmp);
        bmp.close?.();
        return { pixels: out, source: 'frame' };
      } catch { /* fall through */ }
    }
  }

  return { pixels: pixelsFromVideo(video), source: 'video' };
}

/**
 * A burst of video frames, as fast as the track produces them.
 *
 * Fast and low resolution. Used when full stills are too slow to burst, and on
 * every iPhone, where `ImageCapture` does not exist at all.
 */
export async function captureBurst(video: HTMLVideoElement, count: number): Promise<Pixels[]> {
  const frames: Pixels[] = [];
  for (let i = 0; i < count; i++) {
    frames.push(pixelsFromVideo(video));
    if (i < count - 1) await nextFrame();
  }
  return frames;
}

/**
 * The best burst this device can produce inside a time budget.
 *
 * WHY IT IS ADAPTIVE INSTEAD OF PICKING ONE
 * ─────────────────────────────────────────
 * Merging wants many frames; resolution wants full stills; `takePhoto` is
 * fast on some phones and takes half a second on others. Choosing statically
 * means either throwing away resolution on the phones that could have given it,
 * or leaving somebody holding still for six seconds on the ones that cannot.
 *
 * So it times the first still and decides. If stills come quickly, the burst is
 * full-resolution and this is as close to HDR+ as a browser gets. If they do
 * not, it drops to video frames — lower resolution, but many of them, which for
 * a dim scene is the better trade anyway.
 *
 * Frames are never mixed across the two. Merging a 12-megapixel still with a
 * 2-megapixel video frame would mean resampling one to meet the other, and
 * the alignment would be fitting a scaled image to a sharp one.
 */
export async function captureForMerge(
  track: MediaStreamTrack,
  video: HTMLVideoElement,
  count: number,
  budgetMs: number,
): Promise<{ frames: Pixels[]; source: Shot['source'] }> {
  const IC: any = (window as any).ImageCapture;
  if (typeof IC === 'function') {
    let capture: any = null;
    try { capture = new IC(track); } catch { capture = null; }

    if (capture) {
      const frames: Pixels[] = [];
      const started = Date.now();
      for (let i = 0; i < count; i++) {
        const left = budgetMs - (Date.now() - started);
        // Always allow the first one its full timeout: a single high-resolution
        // still is a good outcome even when a burst is not.
        if (i > 0 && left < 250) break;
        try {
          const blob: Blob = await withTimeout(capture.takePhoto(), i === 0 ? 2500 : Math.max(250, left));
          frames.push(await pixelsFromBlob(blob));
        } catch { break; }
      }
      // Two or more full-resolution stills is the best case there is.
      if (frames.length >= 2) return { frames, source: 'photo' };
      /*
       * Exactly one still means `takePhoto` works but is too slow to burst.
       * A single 12-megapixel frame beats a merge of eight 2-megapixel ones for
       * everything except noise, so it is kept rather than thrown away.
       */
      if (frames.length === 1) return { frames, source: 'photo' };
    }
  }

  return { frames: await captureBurst(video, count), source: 'video' };
}

/**
 * Apply zoom to a captured frame.
 *
 * A no-op when the sensor already did it. Otherwise: crop the full-resolution
 * frame, then resample back up so the output is a normal-sized photo rather
 * than a small one — and Lanczos rather than the browser's bilinear, because
 * the sharpening afterwards needs an edge to work with and bilinear leaves it
 * porridge.
 *
 * The enlargement is capped at the crop's own size when the crop is already
 * large: blowing a 3000-pixel crop up to 4000 adds no information and costs a
 * second of processing.
 */
export function applyDigitalZoom(pixels: Pixels, zoom: number, opticalZoom: boolean): Pixels {
  if (opticalZoom || zoom <= 1.01) return pixels;

  const r = zoomRect(pixels.width, pixels.height, zoom);
  const cropped = crop(pixels, r.x, r.y, r.w, r.h);

  // Back up to roughly the original frame size, but never beyond what the
  // sensor gave us in the first place.
  const target = Math.min(pixels.width, Math.round(cropped.width * Math.min(zoom, 2)));
  if (target <= cropped.width) return cropped;

  const scale = target / cropped.width;
  return lanczosResize(cropped, target, Math.round(cropped.height * scale));
}

// ── Pixels in, pixels out ─────────────────────────────────────────────────────

function scratch(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  // `willReadFrequently` matters here: without it the browser keeps the canvas
  // on the GPU and every `getImageData` is a stall reading it back.
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  return { canvas, ctx };
}

export async function pixelsFromBlob(blob: Blob): Promise<Pixels> {
  const bmp = await createImageBitmap(blob);
  const out = pixelsFromBitmap(bmp);
  bmp.close?.();
  return out;
}

function pixelsFromBitmap(bmp: ImageBitmap): Pixels {
  const { ctx } = scratch(bmp.width, bmp.height);
  ctx.drawImage(bmp, 0, 0);
  const d = ctx.getImageData(0, 0, bmp.width, bmp.height);
  return { data: d.data, width: d.width, height: d.height };
}

function pixelsFromVideo(video: HTMLVideoElement): Pixels {
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  const { ctx } = scratch(w, h);
  ctx.drawImage(video, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h);
  return { data: d.data, width: d.width, height: d.height };
}

/** Back to a JPEG, at a quality worth the resolution that was fought for. */
export function pixelsToDataUrl(p: Pixels, quality = 0.92): string {
  const { canvas, ctx } = scratch(p.width, p.height);
  // Via `createImageData` rather than the `ImageData` constructor: the buffer
  // here is a plain `Uint8ClampedArray` the pipeline allocated, and the
  // constructor's typing insists on one backed by a non-shared ArrayBuffer.
  const id = ctx.createImageData(p.width, p.height);
  id.data.set(p.data);
  ctx.putImageData(id, 0, 0);
  return canvas.toDataURL('image/jpeg', quality);
}

export function pixelsToBlob(p: Pixels, quality = 0.92): Promise<Blob | null> {
  const { canvas, ctx } = scratch(p.width, p.height);
  // Via `createImageData` rather than the `ImageData` constructor: the buffer
  // here is a plain `Uint8ClampedArray` the pipeline allocated, and the
  // constructor's typing insists on one backed by a non-shared ArrayBuffer.
  const id = ctx.createImageData(p.width, p.height);
  id.data.set(p.data);
  ctx.putImageData(id, 0, 0);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/**
 * Mirror a selfie.
 *
 * The preview is mirrored because that is what a mirror does and anything else
 * feels wrong to look at. The capture is not mirrored by the sensor, so without
 * this the photo comes out flipped relative to what was on screen — text
 * backwards, parting on the wrong side.
 */
export function mirrorPixels(p: Pixels): Pixels {
  const { data, width: w, height: h } = p;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      const from = row + x * 4;
      const to = row + (w - 1 - x) * 4;
      out[to] = data[from];
      out[to + 1] = data[from + 1];
      out[to + 2] = data[from + 2];
      out[to + 3] = data[from + 3];
    }
  }
  return { data: out, width: w, height: h };
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

const nextFrame = () => new Promise<void>(r => requestAnimationFrame(() => r()));

/**
 * Hand the photo to the phone.
 *
 * The share sheet first, and not as a nicety: inside a Capacitor WebView a
 * plain `<a download>` frequently does nothing at all, while the share sheet is
 * the platform's own "save to Photos". On iOS it is the only route to the
 * camera roll that does not need a native plugin.
 *
 * The download link stays as the desktop path, where there is no share sheet
 * and a file in Downloads is exactly what is wanted.
 */
export async function savePhoto(blob: Blob, filename: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: 'image/jpeg' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });
      return 'shared';
    }
  } catch (e: any) {
    // A cancelled share sheet is a decision, not a failure — falling through to
    // a download would drop a file the user just declined to save.
    if (e?.name === 'AbortError') return 'shared';
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

/** Megapixels, for the readout that shows the capture was worth it. */
export function megapixels(p: Pixels): string {
  return (p.width * p.height / 1_000_000).toFixed(1);
}

/**
 * Run the pipeline without freezing the interface.
 *
 * A twelve-megapixel photo is a couple of seconds of arithmetic. On the main
 * thread that is a couple of seconds in which nothing paints — the spinner
 * stops mid-turn and taps queue up — which people read as a crash rather than
 * as work, and then press the shutter again.
 *
 * The fallback is not paperwork. Workers are unavailable behind some strict
 * content-security policies and in a handful of embedded WebViews, and a photo
 * that arrives late is enormously better than a camera that does not work at
 * all — so if the worker cannot be built, or answers with an error, the same
 * function runs here instead.
 */
export interface ProcessResult {
  pixels: Pixels;
  /** Present when a plain multi-frame merge ran. */
  report: MergeReport | null;
  /** Present when the burst was reconstructed onto a finer grid instead. */
  sr: SuperResolveReport | null;
  /** How many workers actually did the accumulation. For the readout. */
  workers: number;
}

/*
 * One pool for the life of the camera screen.
 *
 * Starting a worker costs tens of milliseconds and a burst would do it several
 * times per shot. `releasePool` is called when the screen closes — a camera
 * that leaks a worker per photo runs a phone out of threads by the twentieth.
 */
let pool: PhotoPool | null = null;

function makeWorker(): Worker {
  return new Worker(new URL('./photoWorker.ts', import.meta.url), { type: 'module' });
}

export function acquirePool(): PhotoPool | null {
  if (pool) return pool.usable ? pool : null;
  const cap = capability();
  const p = new PhotoPool(cap.workers, makeWorker);
  pool = p;
  return p.usable ? p : null;
}

export function releasePool(): void {
  pool?.destroy();
  pool = null;
}

/**
 * Merge and enhance a burst, using as many cores as the device has.
 *
 * The fallbacks are not paperwork. Workers are unavailable behind some strict
 * content-security policies and in a handful of embedded WebViews, and a photo
 * that takes longer is enormously better than a camera that does not work — so
 * every stage degrades to running inline rather than failing.
 */
export async function processOffThread(
  rawFrames: Pixels[], options: EnhanceOptions, opts: { superResolve?: boolean } = {},
): Promise<ProcessResult> {
  // Filter by size once, here, so every stage downstream — main thread and
  // worker alike — is looking at the same list and agrees about indices.
  const first = rawFrames[0];
  const frames = rawFrames.filter(f => f.width === first.width && f.height === first.height);

  const inline = (): ProcessResult => {
    if (frames.length > 1 && opts.superResolve) {
      const out = superResolve(frames, { scale: MAX_HONEST_SCALE });
      return { pixels: enhance(out.image, options), report: null, sr: out.report, workers: 1 };
    }
    const merged = frames.length > 1 ? mergeBurst(frames) : null;
    const base = merged ? merged.merged : frames[0];
    return { pixels: enhance(base, options), report: merged?.report ?? null, sr: null, workers: 1 };
  };

  const p = acquirePool();
  if (!p) return inline();

  try {
    /*
     * Super-resolution stays on one worker for now. It runs on the zoom crop,
     * which is a fraction of the frame, and splitting it would need the same
     * halo reasoning as the merge for a much smaller prize.
     */
    if (frames.length < 2 || opts.superResolve) {
      const d = await p.run<any>({ frames, options, superResolve: !!opts.superResolve });
      return {
        pixels: { data: d.data, width: d.width, height: d.height },
        report: d.report ?? null, sr: d.sr ?? null, workers: 1,
      };
    }

    // ── Plan once, on the whole burst ────────────────────────────────────
    const lite = await p.run<any>({ kind: 'plan', frames, options: MERGE_DEFAULTS });
    const plan: MergePlan = {
      reference: lite.reference,
      contributors: lite.contributors,
      offsets: lite.offsets,
      dropped: lite.dropped,
      usable: frames,
    };

    // ── Accumulate in strips, across every core ──────────────────────────
    const { image: merged, agreement } = await mergeAcrossPool(
      p, plan, first.width, first.height, MERGE_DEFAULTS,
      (pl, rows) => mergeRows(pl, rows, MERGE_DEFAULTS),
    );

    const enhanced = await p.run<any>({ kind: 'enhance', frame: merged, options });

    return {
      pixels: { data: enhanced.data, width: enhanced.width, height: enhanced.height },
      report: {
        reference: plan.reference,
        offsets: plan.offsets,
        dropped: plan.dropped,
        agreement,
      },
      sr: null,
      workers: p.size,
    };
  } catch {
    return inline();
  }
}
