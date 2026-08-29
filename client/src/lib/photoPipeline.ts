/**
 * What happens to a photo after the shutter.
 *
 * WHAT THIS IS NOT
 * ────────────────
 * It is not AI. A super-resolution model invents detail that was never in the
 * frame; nothing here does that, and nothing here pretends to. Every pixel out
 * of this file is derived from pixels that went in.
 *
 * That distinction matters because the honest version turns out to be most of
 * the win anyway. What makes a phone photo look "enhanced" to a person is
 * almost never invented detail — it is local contrast, edge acutance and the
 * absence of colour mottling. Those are the three things below, and they are
 * arithmetic, not inference: no model to download, no GPU, no server, and the
 * same result on every device.
 *
 * The genuinely large win is not even here. It is capturing at the sensor's
 * real resolution instead of grabbing a video frame — see `cameraCapture.ts`.
 * Twelve megapixels sharpened badly still beats one megapixel sharpened well.
 *
 * WHY THE MATH LIVES APART FROM THE CANVAS
 * ────────────────────────────────────────
 * Everything here is a function over a plain pixel buffer. No `document`, no
 * `<canvas>`, no `ImageData`. That is what makes it testable in node — and the
 * failures worth catching (an off-by-one in a blur kernel, a channel that wraps
 * instead of clamping, a resize that shifts the image half a pixel) are exactly
 * the ones that are invisible on screen and obvious in an assertion.
 *
 * COLOUR SPACE
 * ────────────
 * Everything works in YCbCr, and that is not incidental. Sharpening RGB
 * channels independently pulls them apart at edges, which is where colour
 * fringing comes from. Blurring RGB to kill noise takes the detail with it.
 * Splitting luma from chroma lets each get the treatment it needs: detail work
 * on Y, where the eye actually reads sharpness, and smoothing on CbCr, where it
 * cannot see the difference and the noise mostly lives.
 */

/** A pixel buffer, RGBA, exactly what `ImageData` is minus the DOM. */
export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface EnhanceOptions {
  /**
   * Local contrast, at a large radius. The "pop" that reads as depth and is
   * most of what people mean by an enhanced photo. Overdone, it produces the
   * grey halos around skylines that give HDR its bad name.
   */
  clarity: number;
  /** Edge acutance, at a small radius. Detail, not resolution. */
  sharpen: number;
  /**
   * Open the shadows. Applied to the blurred base only, so a dark corner
   * brightens without the texture inside it flattening — which is the
   * difference between recovered shadows and a grey smear.
   */
  shadows: number;
  /**
   * Hold the highlights back. A bright sky that clips has thrown its detail
   * away for good; pulling the top end down before anything else touches it is
   * the only chance to keep any.
   */
  highlights: number;
  /**
   * How much of a difference an edge must be before sharpening touches it.
   * Without this, sharpening amplifies sensor noise in flat areas — a clear
   * sky turns to grain — which is the single most common way this goes wrong.
   */
  threshold: number;
  /** Chroma smoothing. Kills colour speckle without touching detail. */
  denoise: number;
  /** 1 is unchanged. */
  saturation: number;
}

export const NATURAL: EnhanceOptions = {
  // The threshold is the number that was tuned rather than guessed. At 3 a
  // clear sky came back visibly grainier than it went in — sharpening cannot
  // tell fine noise from fine detail, and a smooth gradient is where that shows
  // first. 6 leaves flat areas alone and still finds every real edge.
  clarity: 0.22, sharpen: 0.55, threshold: 6, denoise: 0.6, saturation: 1.06,
  shadows: 0.16, highlights: 0.12,
};

/**
 * For a crop that has been enlarged: it needs the help and can take it.
 *
 * A harder hand on every dial, the threshold included — enlarging magnifies the
 * noise along with everything else, so the bar for "this is an edge, not grain"
 * has to be higher here than at 1×, not lower.
 */
export const ZOOMED: EnhanceOptions = {
  clarity: 0.28, sharpen: 0.85, threshold: 8, denoise: 0.8, saturation: 1.06,
  shadows: 0.16, highlights: 0.12,
};

export const OFF: EnhanceOptions = {
  clarity: 0, sharpen: 0, threshold: 0, denoise: 0, saturation: 1,
  shadows: 0, highlights: 0,
};

// ── Blur ──────────────────────────────────────────────────────────────────────

/**
 * Box blur, separable, with a running sum.
 *
 * O(1) per pixel regardless of radius, which is the only reason a 12-megapixel
 * photo can be processed on a phone without the page going white. A naive
 * kernel at the radius clarity needs would be tens of millions of multiplies
 * per pass.
 *
 * Repeated passes of a box converge on a Gaussian: three is the usual choice
 * and the error is well under a level of an 8-bit channel. Two is enough for a
 * small radius, where the shapes have barely diverged and the third pass is a
 * third of the cost of the most expensive step in the pipeline.
 *
 * Edges clamp rather than wrap. Wrapping puts the top of the sky into the
 * bottom of the ground, which at a clarity radius is a visible band.
 */
export function boxBlur(src: Float32Array, width: number, height: number, radius: number, passes = 3): Float32Array {
  if (radius < 1) return Float32Array.from(src);
  let buf = Float32Array.from(src);
  const tmp = new Float32Array(src.length);
  for (let pass = 0; pass < passes; pass++) {
    blurH(buf, tmp, width, height, radius);
    blurV(tmp, buf, width, height, radius);
  }
  return buf;
}

function blurH(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const span = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    // Seed the window with the clamped left edge repeated, so the first pixel
    // is an average of a full window rather than a short one.
    let sum = src[row] * (r + 1);
    for (let x = 1; x <= r; x++) sum += src[row + Math.min(x, w - 1)];
    for (let x = 0; x < w; x++) {
      dst[row + x] = sum / span;
      sum += src[row + Math.min(x + r + 1, w - 1)] - src[row + Math.max(x - r, 0)];
    }
  }
}

function blurV(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const span = r * 2 + 1;
  for (let x = 0; x < w; x++) {
    let sum = src[x] * (r + 1);
    for (let y = 1; y <= r; y++) sum += src[Math.min(y, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = sum / span;
      sum += src[Math.min(y + r + 1, h - 1) * w + x] - src[Math.max(y - r, 0) * w + x];
    }
  }
}

/**
 * A blurred guide, computed small.
 *
 * A box blur costs the same per pixel at any radius, so the price of this
 * pipeline is set by the megapixels, not the settings. On a twelve-megapixel
 * photo the four full-resolution guide blurs came to four and a half seconds on
 * a desktop — call it fifteen on a mid-range phone, with the interface frozen
 * for all of it. That is not a camera anybody would use twice.
 *
 * The saving is that a guide is blurred by definition. Computing it at a
 * quarter scale and stretching it back gives an image that differs from the
 * full-resolution version by well under one level of an 8-bit channel — the
 * upsample's own smoothing simply replaces some of the blur that would have
 * been done the expensive way.
 *
 * The one guide that does NOT come through here is the sharpening one. Its
 * radius is a pixel or two, which is precisely the detail a downsample throws
 * away — computing it small would mean sharpening against the wrong band and
 * the photo would come back soft.
 */
function blurGuide(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const BUDGET = 1_200_000;               // pixels; roughly a 1.2MP working image
  const n = w * h;
  if (n <= BUDGET || radius < 4) return boxBlur(src, w, h, radius);

  const k = Math.ceil(Math.sqrt(n / BUDGET));
  const sw = Math.max(1, Math.ceil(w / k));
  const sh = Math.max(1, Math.ceil(h / k));

  const small = downsample(src, w, h, sw, sh);
  const blurred = boxBlur(small, sw, sh, Math.max(1, Math.round(radius / k)));
  return upsample(blurred, sw, sh, w, h);
}

/** Box average. Aliasing does not matter — the result is about to be blurred. */
function downsample(src: Float32Array, w: number, h: number, sw: number, sh: number): Float32Array {
  const out = new Float32Array(sw * sh);
  const kx = w / sw, ky = h / sh;
  for (let y = 0; y < sh; y++) {
    const y0 = Math.floor(y * ky), y1 = Math.min(h, Math.max(y0 + 1, Math.floor((y + 1) * ky)));
    for (let x = 0; x < sw; x++) {
      const x0 = Math.floor(x * kx), x1 = Math.min(w, Math.max(x0 + 1, Math.floor((x + 1) * kx)));
      let sum = 0, count = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) { sum += src[yy * w + xx]; count++; }
      }
      out[y * sw + x] = sum / count;
    }
  }
  return out;
}

/**
 * Bilinear, centre-aligned.
 *
 * The half-pixel terms are not decoration: without them the guide comes back
 * shifted, and a shifted guide puts the clarity halo on one side of every edge
 * instead of both — which looks exactly like a lens with bad coma and would be
 * very hard to trace back to here.
 */
function upsample(src: Float32Array, sw: number, sh: number, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  const kx = sw / w, ky = sh / h;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) * ky - 0.5));
    const y0 = Math.floor(fy), y1 = Math.min(sh - 1, y0 + 1), wy = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) * kx - 0.5));
      const x0 = Math.floor(fx), x1 = Math.min(sw - 1, x0 + 1), wx = fx - x0;
      const a = src[y0 * sw + x0], b = src[y0 * sw + x1];
      const c = src[y1 * sw + x0], d = src[y1 * sw + x1];
      out[y * w + x] = (a + (b - a) * wx) * (1 - wy) + (c + (d - c) * wx) * wy;
    }
  }
  return out;
}

// ── The pipeline ──────────────────────────────────────────────────────────────

/**
 * Clarity, detail, denoise and saturation, in one pass over the image.
 *
 * Clarity and sharpening are the same operation at two scales — take the image,
 * subtract a blurred copy of itself, add the difference back amplified. A large
 * radius gives local contrast; a small one gives edge acutance. That is what
 * every "Clarity" and "Sharpness" slider in every photo app has always been,
 * and knowing they are one kernel is what keeps this short.
 *
 * The radii scale with the image, so a 12-megapixel photo and a 2-megapixel one
 * come out looking like the same treatment rather than the large one looking
 * untouched.
 */
export function enhance(img: Pixels, opts: EnhanceOptions): Pixels {
  const { width: w, height: h } = img;
  const n = w * h;
  if (n === 0) return img;

  const src = img.data;
  const Y = new Float32Array(n);
  const Cb = new Float32Array(n);
  const Cr = new Float32Array(n);

  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = src[p], g = src[p + 1], b = src[p + 2];
    Y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    Cb[i] = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    Cr[i] = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  }

  /*
   * Radii scale with the image, so the same numbers mean the same look on a
   * 12-megapixel photo and a 2-megapixel one — at a fixed radius the large one
   * comes out looking untouched.
   *
   * Both are bounded. Clarity at an unbounded radius on a panorama turns into a
   * global contrast curve, and sharpening at one stops being acutance and
   * becomes an embossing filter.
   */
  const diag = Math.hypot(w, h);
  const bigR = Math.max(2, Math.min(120, Math.round(diag / 110)));
  const smallR = Math.max(1, Math.min(4, Math.round(diag / 1200)));

  /*
   * Tone mapping and clarity, in one pass over one guide.
   *
   * WHY THEY ARE THE SAME OPERATION
   * ──────────────────────────────
   * Split the image into a blurred base and the detail left over. Clarity
   * amplifies the detail; tone mapping bends the base. They want the same
   * blurred guide, so they get computed together — and because blurring the
   * reconstruction gives back the base almost exactly, clarity after tone
   * mapping is a multiply rather than a second full blur.
   *
   * With `shadows` and `highlights` at zero this is algebraically identical to
   * the plain unsharp it replaces: base + detail·(1+clarity) is
   * Y + clarity·(Y − base). So it is a generalisation, not a new behaviour.
   *
   * WHY THIS IS THE HALF THAT WAS MISSING
   * ─────────────────────────────────────
   * Local contrast alone makes a photo punchier and darker — it pushes the
   * dark side of every edge further down. What an iPhone or a Pixel does that
   * we were not doing is the opposite at the low end: open the shadows, hold
   * the highlights back from clipping, and only then add contrast. Bending the
   * BASE rather than the pixels is what makes that possible without flattening
   * the picture, because the detail band rides through untouched.
   */
  if (opts.clarity > 0 || opts.shadows > 0 || opts.highlights > 0) {
    const base = blurGuide(Y, w, h, bigR);
    const detailGain = 1 + opts.clarity;
    const sh = opts.shadows, hi = opts.highlights;
    for (let i = 0; i < n; i++) {
      const b = base[i];
      const detail = Y[i] - b;

      let x = b * (1 / 255);
      if (sh > 0) {
        // Weighted by how dark the neighbourhood is, cubed — a strong lift
        // where it is genuinely dark and nothing at all in the midtones.
        const w0 = 1 - x;
        x += sh * w0 * w0 * w0;
      }
      if (hi > 0) {
        // The mirror, to the fourth: highlights need a tighter shoulder or the
        // midtones sag and the photo looks muddy.
        const w1 = x * x;
        x -= hi * w1 * w1;
      }

      Y[i] = x * 255 + detail * detailGain;
    }
  }

  if (opts.sharpen > 0) {
    /*
     * Full resolution, and the most expensive step here — a downsampled guide
     * would blur away exactly the band being sharpened against. Two passes
     * rather than three: at a radius of one to four pixels the difference from
     * a true Gaussian is below a level, and the third pass costs a third of a
     * second on a twelve-megapixel photo.
     */
    const guide = boxBlur(Y, w, h, smallR, 2);
    const t = opts.threshold;
    for (let i = 0; i < n; i++) {
      const d = Y[i] - guide[i];
      // Below the threshold this is noise, not an edge, and amplifying it is
      // how a clear sky turns to grain.
      if (d > t || d < -t) Y[i] += opts.sharpen * d;
    }
  }

  if (opts.denoise > 0) {
    /*
     * Chroma only, and the eye will not notice.
     *
     * Human colour acuity is a fraction of luminance acuity — JPEG has thrown
     * away half the chroma resolution since 1992 on exactly this basis. Colour
     * speckle in a dim shot lives here, and it can be blurred away while every
     * bit of the detail, which is in Y, is left alone.
     */
    const r = Math.max(1, Math.round(smallR * opts.denoise * 2));
    // Also safe to compute small — chroma carries no detail to lose.
    const cbB = blurGuide(Cb, w, h, r * 4);
    const crB = blurGuide(Cr, w, h, r * 4);
    const k = Math.min(1, opts.denoise);
    for (let i = 0; i < n; i++) {
      Cb[i] += k * (cbB[i] - Cb[i]);
      Cr[i] += k * (crB[i] - Cr[i]);
    }
  }

  const sat = opts.saturation;
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const y = Y[i];
    const cb = sat === 1 ? Cb[i] : (Cb[i] - 128) * sat + 128;
    const cr = sat === 1 ? Cr[i] : (Cr[i] - 128) * sat + 128;
    // Uint8ClampedArray clamps on assignment, which is the whole reason to use
    // it here: a channel that wraps turns a highlight black.
    out[p] = y + 1.402 * (cr - 128);
    out[p + 1] = y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128);
    out[p + 2] = y + 1.772 * (cb - 128);
    out[p + 3] = src[p + 3];
  }

  return { data: out, width: w, height: h };
}

// ── Resampling ────────────────────────────────────────────────────────────────

/**
 * Lanczos resampling.
 *
 * For enlarging a crop, which is what zoom is when the camera has no real zoom
 * to give. The browser's own `drawImage` scaling is bilinear — cheap, and it
 * turns an enlargement into porridge. Lanczos keeps edges crisp enough that the
 * sharpening afterwards has something to work with instead of amplifying mush.
 *
 * Separable: horizontal then vertical, so the cost is O(w·h·a) rather than
 * O(w·h·a²). `a = 3` is the usual choice — wider rings add ringing, narrower
 * ones give up the sharpness that was the point.
 */
export function lanczosResize(img: Pixels, outW: number, outH: number, a = 3): Pixels {
  const { width: inW, height: inH } = img;
  if (outW === inW && outH === inH) return img;
  if (outW < 1 || outH < 1 || inW < 1 || inH < 1) {
    return { data: new Uint8ClampedArray(Math.max(0, outW * outH * 4)), width: Math.max(0, outW), height: Math.max(0, outH) };
  }

  // Horizontal first: inW × inH → outW × inH.
  const mid = new Float32Array(outW * inH * 4);
  const hw = weightsFor(inW, outW, a);
  for (let y = 0; y < inH; y++) {
    for (let d = 0; d < outW; d++) {
      const { first, w: wts } = hw[d];
      let r = 0, g = 0, b = 0, al = 0;
      for (let k = 0; k < wts.length; k++) {
        const p = (y * inW + first + k) * 4;
        const c = wts[k];
        r += img.data[p] * c; g += img.data[p + 1] * c;
        b += img.data[p + 2] * c; al += img.data[p + 3] * c;
      }
      const o = (y * outW + d) * 4;
      mid[o] = r; mid[o + 1] = g; mid[o + 2] = b; mid[o + 3] = al;
    }
  }

  // Vertical second: outW × inH → outW × outH.
  const out = new Uint8ClampedArray(outW * outH * 4);
  const vw = weightsFor(inH, outH, a);
  for (let d = 0; d < outH; d++) {
    const { first, w: wts } = vw[d];
    for (let x = 0; x < outW; x++) {
      let r = 0, g = 0, b = 0, al = 0;
      for (let k = 0; k < wts.length; k++) {
        const p = ((first + k) * outW + x) * 4;
        const c = wts[k];
        r += mid[p] * c; g += mid[p + 1] * c;
        b += mid[p + 2] * c; al += mid[p + 3] * c;
      }
      const o = (d * outW + x) * 4;
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = al;
    }
  }
  return { data: out, width: outW, height: outH };
}

function lanczos(x: number, a: number): number {
  if (x === 0) return 1;
  const ax = Math.abs(x);
  if (ax >= a) return 0;
  const px = Math.PI * x;
  return (a * Math.sin(px) * Math.sin(px / a)) / (px * px);
}

/**
 * The kernel for every output position along one axis.
 *
 * Computed once and reused down the whole perpendicular line — a 4000-pixel
 * wide image has 4000 output positions and 3000 rows, and recomputing the
 * weights per row would be three thousand times the trigonometry.
 *
 * Weights are normalised here rather than at use, so the caller's inner loop is
 * a multiply-accumulate and nothing else. Normalising also fixes the edges for
 * free: a window that hangs off the image keeps its remaining taps summing to
 * one, instead of darkening the border.
 */
function weightsFor(srcLen: number, dstLen: number, a: number): { first: number; w: Float32Array }[] {
  const scale = dstLen / srcLen;
  // Shrinking widens the kernel in source space — otherwise a big reduction
  // samples a handful of pixels and aliases everything between them.
  const support = scale < 1 ? a / scale : a;
  const out: { first: number; w: Float32Array }[] = [];

  for (let d = 0; d < dstLen; d++) {
    // Centre of this output pixel in source coordinates. The half-pixel terms
    // are what stop the whole image drifting by half a pixel per resize.
    const centre = (d + 0.5) / scale - 0.5;
    const first = Math.max(0, Math.ceil(centre - support));
    const last = Math.min(srcLen - 1, Math.floor(centre + support));

    const w = new Float32Array(Math.max(1, last - first + 1));
    let total = 0;
    for (let s = first; s <= last; s++) {
      const t = scale < 1 ? (s - centre) * scale : s - centre;
      const v = lanczos(t, a);
      w[s - first] = v;
      total += v;
    }
    if (total === 0) { w.fill(0); w[0] = 1; total = 1; }
    for (let i = 0; i < w.length; i++) w[i] /= total;

    out.push({ first, w });
  }
  return out;
}

// ── Frame stacking ────────────────────────────────────────────────────────────

/**
 * Average a burst into one frame.
 *
 * The oldest noise reduction there is, and still the one that actually adds
 * information rather than trading it away: sensor noise is random and the scene
 * is not, so averaging N frames improves signal-to-noise by √N while every
 * blurring denoiser can only ever remove detail.
 *
 * It assumes the frames are aligned, which for a handheld burst a few tens of
 * milliseconds apart is close enough to true. Anything moving in the scene will
 * ghost — which is why the caller keeps the burst short, and why this is used
 * on the low-light path rather than on every shot.
 *
 * Frames of differing sizes are refused rather than stretched: a mismatch means
 * the camera reconfigured mid-burst, and averaging across that would be worse
 * than the noise.
 */
export function stackFrames(frames: Pixels[]): Pixels {
  if (frames.length === 0) throw new Error('stackFrames: nothing to stack');
  const first = frames[0];
  const usable = frames.filter(f => f.width === first.width && f.height === first.height);
  if (usable.length === 1) return usable[0];

  const len = first.data.length;
  const acc = new Float32Array(len);
  for (const f of usable) {
    for (let i = 0; i < len; i++) acc[i] += f.data[i];
  }
  const out = new Uint8ClampedArray(len);
  const k = 1 / usable.length;
  for (let i = 0; i < len; i++) out[i] = acc[i] * k;
  return { data: out, width: first.width, height: first.height };
}

// ── Cropping ──────────────────────────────────────────────────────────────────

/**
 * Cut a region out of a full-resolution frame.
 *
 * This is what digital zoom should be, and the opposite of what it usually is.
 * The common mistake is to zoom the preview and then capture the preview — a
 * 720p frame blown up, which is where the mush comes from. Cropping the
 * full-resolution still instead means 2× zoom on a 12-megapixel sensor still
 * leaves three megapixels of real detail.
 *
 * The rectangle is clamped rather than validated: a crop that runs off the edge
 * because of a rounding error should give back a slightly smaller picture, not
 * throw away the shot.
 */
export function crop(img: Pixels, x: number, y: number, w: number, h: number): Pixels {
  const x0 = Math.max(0, Math.min(img.width - 1, Math.round(x)));
  const y0 = Math.max(0, Math.min(img.height - 1, Math.round(y)));
  const cw = Math.max(1, Math.min(img.width - x0, Math.round(w)));
  const ch = Math.max(1, Math.min(img.height - y0, Math.round(h)));

  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let row = 0; row < ch; row++) {
    const from = ((y0 + row) * img.width + x0) * 4;
    out.set(img.data.subarray(from, from + cw * 4), row * cw * 4);
  }
  return { data: out, width: cw, height: ch };
}

/**
 * The centre rectangle a zoom factor corresponds to.
 *
 * Separate from `crop` so the arithmetic can be checked on its own — an
 * off-centre zoom is the kind of bug that looks like a shaky hand.
 */
export function zoomRect(width: number, height: number, zoom: number): { x: number; y: number; w: number; h: number } {
  const z = Math.max(1, zoom);
  const w = width / z;
  const h = height / z;
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}
