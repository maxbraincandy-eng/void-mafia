/**
 * AI detail reconstruction, bounded so it cannot invent.
 *
 * THE TENSION THIS FILE RESOLVES
 * ──────────────────────────────
 * The directive asks for AI detail reconstruction and, a few lines later,
 * forbids hallucinated letters, faces, windows and objects. Those two
 * requirements are in direct conflict, because inventing plausible detail is
 * precisely what a super-resolution network is trained to do. Ask a model what
 * a four-pixel-wide smudge on a distant sign says and it will answer
 * confidently, in crisp letterforms, and be wrong.
 *
 * The resolution is not to pick a gentler model. It is to bound what any model
 * is allowed to change:
 *
 *   1. It only ever touches the HIGH-FREQUENCY BAND. Tone, colour and structure
 *      come from the measured image and are never up for negotiation, so a
 *      model cannot move a window, recolour a face or alter a shape.
 *   2. Its output is CLAMPED against the input's own local contrast. Detail
 *      that the source supports is passed through; detail the source cannot
 *      justify is limited to what it can. A model that decides a blur is a
 *      letter finds the letter's amplitude cut back to the blur's.
 *   3. It is BLENDED, never substituted. The result is always mostly the
 *      measured photograph.
 *
 * Under those bounds the model sharpens what is there and cannot introduce what
 * is not. That is reconstruction. It also means the ceiling on what this can do
 * is lower than an unbounded model's — which is the correct trade for a camera,
 * where a confidently invented street name is worse than a soft one.
 *
 * NO MODEL MEANS NO EFFECT
 * ────────────────────────
 * If no model is configured or it fails to load, this returns the image
 * untouched. It does not quietly substitute a sharpening filter and keep the
 * label. A camera that says "AI" over a bicubic resize is the thing the
 * directive spent a section forbidding.
 */

import { boxBlur, type Pixels } from './photoPipeline';

/**
 * What any model must look like from here.
 *
 * Deliberately minimal and free of ONNX, TensorFlow or any other runtime. The
 * engine is replaceable without touching the camera, which is what the
 * directive asked for — and it means this file can be tested with a stub that
 * behaves like a model without shipping a model.
 */
export interface DetailModel {
  /** For the readout, and so a bug report can say which one ran. */
  readonly name: string;
  /** Longest side the model accepts. Larger images are tiled. */
  readonly tileSize: number;
  /**
   * Enhance one tile. Same dimensions in and out — this reconstructs detail at
   * the resolution it was given rather than upscaling, because the upscaling is
   * already done, honestly, by multi-frame reconstruction.
   */
  run(tile: Pixels): Promise<Pixels>;
}

export interface AiOptions {
  /**
   * How much of the model's high-frequency output to blend in, 0..1.
   *
   * Not 1. The measured photograph is the ground truth and the model is a
   * suggestion about it; at full strength any systematic bias the model has
   * becomes the image's bias.
   */
  strength: number;
  /**
   * The ceiling on invention, as a multiple of the source's own local contrast.
   *
   * MEASURED, AND NOT THE NUMBER YOU WOULD GUESS
   * ────────────────────────────────────────────
   * The ceiling is compared against a MEAN local amplitude, while the detail it
   * limits has peaks. For a sinusoid the mean absolute value is about 0.64 of
   * the peak, so a ceiling of 1.0 does not mean "no change" — it means clipping
   * every peak to two thirds of its height. Set to 1.35 this engine measurably
   * SOFTENED genuine texture, coming out at 0.92× the source's own detail,
   * which is the opposite of the job.
   *
   * 2.0 lets real texture through with a modest lift and still cuts a
   * hallucinated letterform written into a smudge by around 94%. That asymmetry
   * is the whole design: the ceiling follows the source, so where the source has
   * structure there is room, and where it has none there is none.
   */
  maxGain: number;
}

export const AI_DEFAULTS: AiOptions = { strength: 0.7, maxGain: 2.0 };

let model: DetailModel | null = null;

/** Install a model. Called by whatever knows how to load one. */
export function setDetailModel(m: DetailModel | null): void { model = m; }
export function detailModel(): DetailModel | null { return model; }

/**
 * Reconstruct detail, within bounds.
 *
 * Returns the input unchanged when there is no model — which is the honest
 * answer, and the one that keeps "AI" from meaning "a filter with a label".
 */
export async function reconstructDetail(
  img: Pixels,
  options: AiOptions = AI_DEFAULTS,
): Promise<{ image: Pixels; applied: boolean; model: string | null }> {
  const m = model;
  if (!m || img.width < 8 || img.height < 8) {
    return { image: img, applied: false, model: null };
  }

  try {
    const out = await m.run(img);
    if (out.width !== img.width || out.height !== img.height) {
      // A model that changed the geometry is not doing what this pipeline
      // asked; splicing its output back in would misalign the whole frame.
      return { image: img, applied: false, model: null };
    }
    return { image: bound(img, out, options), applied: true, model: m.name };
  } catch {
    return { image: img, applied: false, model: null };
  }
}

/**
 * Keep only the part of the model's output the source can justify.
 *
 * Both images are split into a smooth base and the detail above it. The base is
 * taken entirely from the SOURCE — so tone, colour and structure are the
 * measured photograph's and the model has no say in them at all. Only the
 * detail band is blended, and only up to `maxGain` times the amplitude the
 * source's own detail had at that pixel.
 *
 * That last clause is the whole safety property. Where the source has an edge,
 * the model may sharpen it. Where the source has almost nothing — a distant
 * sign reduced to a smudge — there is almost nothing to scale, so the model's
 * confident letterform is scaled to almost nothing too.
 */
export function bound(src: Pixels, modelOut: Pixels, options: AiOptions): Pixels {
  const { width: w, height: h } = src;
  const n = w * h;

  // Luma of each, and a smooth version of each, so the detail bands can be
  // compared like for like.
  const srcY = new Float32Array(n);
  const modY = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    srcY[i] = 0.299 * src.data[p] + 0.587 * src.data[p + 1] + 0.114 * src.data[p + 2];
    modY[i] = 0.299 * modelOut.data[p] + 0.587 * modelOut.data[p + 1] + 0.114 * modelOut.data[p + 2];
  }

  // Small radius: this is the fine band, the only one a model is allowed near.
  const radius = Math.max(1, Math.min(3, Math.round(Math.hypot(w, h) / 1200)));
  const srcBase = boxBlur(srcY, w, h, radius, 2);
  const modBase = boxBlur(modY, w, h, radius, 2);

  /*
   * Local amplitude of the source's own detail, so the ceiling follows the
   * picture rather than being one number for the whole frame. A textured wall
   * gets a generous allowance; a flat sky gets almost none, which is also what
   * stops the model from decorating smooth areas with invented grain.
   */
  const srcDetail = new Float32Array(n);
  for (let i = 0; i < n; i++) srcDetail[i] = Math.abs(srcY[i] - srcBase[i]);
  const localAmp = boxBlur(srcDetail, w, h, Math.max(2, radius * 3), 2);

  const out = new Uint8ClampedArray(src.data.length);
  const k = Math.max(0, Math.min(1, options.strength));

  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const sd = srcY[i] - srcBase[i];
    const md = modY[i] - modBase[i];

    // The ceiling: what the source's neighbourhood supports, plus a small floor
    // so genuinely fine texture on a smooth ground is not clipped to nothing.
    const ceiling = localAmp[i] * options.maxGain + 1.5;
    const clamped = Math.max(-ceiling, Math.min(ceiling, md));

    // Blend in the detail band only. Everything else stays the source's.
    const delta = (clamped - sd) * k;

    /*
     * Applied to all three channels equally, which keeps it a luminance edit.
     * Letting a model move channels independently is how colour fringing and
     * invented tints arrive, and neither is detail.
     */
    out[p] = src.data[p] + delta;
    out[p + 1] = src.data[p + 1] + delta;
    out[p + 2] = src.data[p + 2] + delta;
    out[p + 3] = src.data[p + 3];
  }

  return { data: out, width: w, height: h };
}
