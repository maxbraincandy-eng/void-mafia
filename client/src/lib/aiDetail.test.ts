/**
 * The bounds that keep AI reconstruction from becoming AI invention.
 *
 * The directive asks for AI detail reconstruction and, a few lines later,
 * forbids hallucinated letters, faces and objects. Those requirements conflict:
 * inventing plausible detail is exactly what a super-resolution network does.
 *
 * The resolution is to bound what any model may change, and these tests are
 * that resolution's proof. Every one of them hands the engine a deliberately
 * hallucinating model — one that writes crisp structure into a smudge, or
 * recolours things, or alters tone — and checks that the bound holds.
 *
 * A model good enough to be worth shipping will still be bounded by this. That
 * is the point: the ceiling on what this can do is lower than an unbounded
 * model's, and that is the correct trade for a camera, where a confidently
 * invented street name is worse than a soft one.
 *
 *   npx tsx --test src/lib/aiDetail.test.ts
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';

import {
  reconstructDetail, setDetailModel, detailModel, bound, AI_DEFAULTS,
  type DetailModel,
} from './aiDetail.js';
import type { Pixels } from './photoPipeline.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function grey(w: number, h: number, v = 128): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return { data, width: w, height: h };
}

/** A smudge: what a distant sign actually looks like at the sensor. */
function smudge(w: number, h: number): Pixels {
  const img = grey(w, h, 120);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = 120 + 6 * Math.sin(x * 0.25) * Math.cos(y * 0.2);
      const p = (y * w + x) * 4;
      img.data[p] = img.data[p + 1] = img.data[p + 2] = v;
    }
  }
  return img;
}

/** Real texture, of the sort a model is legitimately allowed to sharpen. */
function textured(w: number, h: number): Pixels {
  const img = grey(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = 128 + 45 * Math.sin(x * 1.3) + 35 * Math.cos(y * 1.1);
      const p = (y * w + x) * 4;
      img.data[p] = img.data[p + 1] = img.data[p + 2] = Math.max(0, Math.min(255, v));
    }
  }
  return img;
}

/** A model that writes hard, confident structure wherever it is pointed. */
function hallucinator(name = 'hallucinator'): DetailModel {
  return {
    name, tileSize: 512,
    async run(t: Pixels) {
      const data = new Uint8ClampedArray(t.data);
      for (let y = 0; y < t.height; y++) {
        for (let x = 0; x < t.width; x++) {
          const p = (y * t.width + x) * 4;
          // Crisp letterform-like strokes: exactly the invention to prevent.
          const stroke = (x % 7 < 2 && y % 11 < 6) ? 110 : -50;
          data[p] = data[p] + stroke;
          data[p + 1] = data[p + 1] + stroke;
          data[p + 2] = data[p + 2] + stroke;
        }
      }
      return { data, width: t.width, height: t.height };
    },
  };
}

const detail = (im: Pixels) => {
  let t = 0, n = 0;
  for (let y = 2; y < im.height - 2; y++) {
    for (let x = 2; x < im.width - 2; x++) {
      const p = (y * im.width + x) * 4;
      t += Math.abs(im.data[p] - im.data[p - 4]); n++;
    }
  }
  return t / n;
};

// ── No model means no effect ──────────────────────────────────────────────────

test('with no model installed the image is returned untouched', async () => {
  /*
   * The engine must not quietly substitute a sharpening filter and keep the
   * label. A camera that prints "AI" over a bicubic resize is the thing the
   * directive spent a whole section forbidding.
   */
  setDetailModel(null);
  const img = textured(64, 64);
  const r = await reconstructDetail(img);
  assert.equal(r.applied, false);
  assert.equal(r.model, null);
  assert.equal(r.image, img, 'the image was reprocessed despite there being no model');
});

test('a model that throws leaves the photograph alone', async () => {
  setDetailModel({ name: 'broken', tileSize: 256, async run() { throw new Error('out of memory'); } });
  const img = textured(64, 64);
  const r = await reconstructDetail(img);
  assert.equal(r.applied, false);
  assert.deepEqual([...r.image.data], [...img.data]);
  setDetailModel(null);
});

test('a model that changes the geometry is refused', async () => {
  // Splicing a differently-sized output back in would misalign the whole frame.
  setDetailModel({
    name: 'resizer', tileSize: 256,
    async run(t) { return grey(t.width * 2, t.height * 2); },
  });
  const r = await reconstructDetail(textured(48, 48));
  assert.equal(r.applied, false);
  setDetailModel(null);
});

test('an installed model is reported by name', async () => {
  setDetailModel(hallucinator('test-model-v1'));
  const r = await reconstructDetail(textured(64, 64));
  assert.equal(r.applied, true);
  assert.equal(r.model, 'test-model-v1');
  assert.equal(detailModel()?.name, 'test-model-v1');
  setDetailModel(null);
});

// ── The bound ─────────────────────────────────────────────────────────────────

test('a model cannot write detail into a smudge', async () => {
  /*
   * THE TEST THIS FILE EXISTS FOR.
   *
   * A distant sign at the sensor is a few levels of variation. Ask a
   * super-resolution model what it says and it answers confidently, in crisp
   * letterforms, and is wrong. The ceiling follows the source's own local
   * contrast, so where the source has almost nothing there is almost nothing to
   * scale — and the invented glyph is scaled to almost nothing with it.
   */
  const src = smudge(96, 96);
  const invented = await hallucinator().run(src);

  const free = detail(invented);
  const held = detail(bound(src, invented, AI_DEFAULTS));

  assert.ok(free > detail(src) * 5, 'the stub did not hallucinate — the test proves nothing');

  /*
   * Stated against what the model WANTED, not against the source.
   *
   * The source's own detail here is a fraction of a level, so a ratio against it
   * is arithmetically unstable and says little. The meaningful claim is that
   * almost none of the invention survived: the model asked for a crisp glyph and
   * got back something imperceptible.
   */
  assert.ok(held < free * 0.12,
    `${held.toFixed(2)} of the model's ${free.toFixed(2)} survived — the glyph got through`);
  assert.ok(held < 3, `bounded output carries ${held.toFixed(2)} levels into a flat smudge`);
});

test('but it may sharpen texture that is genuinely there', async () => {
  /*
   * The other half. A bound that suppressed everything would be safe and
   * useless; the point is to pass through what the source supports.
   */
  const src = textured(96, 96);
  const out = bound(src, await hallucinator().run(src), AI_DEFAULTS);
  assert.ok(detail(out) > detail(src) * 1.02,
    `bounded output ${detail(out).toFixed(1)} vs source ${detail(src).toFixed(1)} — real texture was softened, `
    + 'which is what happened at maxGain 1.35 and is why the default is 2.0');
});

test('the ceiling scales with the source, not with the frame', async () => {
  // A textured wall gets a generous allowance and a flat sky almost none, in
  // the same photograph. One global number could not do both.
  const flat = smudge(80, 80);
  const rich = textured(80, 80);

  /*
   * Measured in absolute levels, not as a ratio. A ratio against a source with
   * almost no detail is huge for an imperceptible change and would read as a
   * failure; what matters is how much invented structure actually lands.
   */
  const survived = async (im: Pixels) => {
    const inv = await hallucinator().run(im);
    return detail(bound(im, inv, AI_DEFAULTS));
  };

  const inFlat = await survived(flat);
  const inRich = await survived(rich);
  assert.ok(inRich > inFlat * 8,
    `${inRich.toFixed(1)} landed on texture against ${inFlat.toFixed(1)} on a smudge — `
    + 'the flat area was given a textured area allowance');
});

test('maxGain is the dial that controls invention', () => {
  /*
   * Asserted as monotonicity rather than as a ratio between two arbitrary
   * settings. "More allowance lets more through, at every step" is the property
   * that makes the number a control; a specific ratio between 0.5 and 4 is a
   * fact about one test pattern and would have to be re-tuned whenever the
   * pattern changed.
   */
  const src = smudge(80, 80);
  const invented = grey(80, 80);
  for (let y = 0; y < 80; y++) {
    for (let x = 0; x < 80; x++) {
      const p = (y * 80 + x) * 4;
      const v = 120 + ((x % 6 < 2) ? 90 : -60);
      invented.data[p] = invented.data[p + 1] = invented.data[p + 2] = v;
    }
  }

  const at = (maxGain: number) => detail(bound(src, invented, { strength: 1, maxGain }));
  const steps = [0.5, 1, 2, 4, 8].map(at);
  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i] > steps[i - 1],
      `raising maxGain did not let more through: ${steps.map(v => v.toFixed(2)).join(' → ')}`);
  }
  assert.ok(steps[steps.length - 1] > steps[0] * 1.5, 'the dial barely moves anything');
});

test('the model cannot move tone, exposure or colour', async () => {
  /*
   * Only the fine band is blended; the base comes entirely from the source. So
   * a model cannot brighten a photograph, shift its white balance, or recolour
   * a face — the three ways an over-eager model most visibly ruins an image.
   */
  const src = textured(96, 96);
  const shifted: Pixels = { data: new Uint8ClampedArray(src.data), width: 96, height: 96 };
  for (let i = 0; i < shifted.data.length; i += 4) {
    shifted.data[i] += 60;        // much brighter
    shifted.data[i + 1] -= 30;    // and a heavy green/magenta shift
    shifted.data[i + 2] += 40;
  }

  const out = bound(src, shifted, { strength: 1, maxGain: 2 });
  const mean = (im: Pixels, c: number) => {
    let t = 0;
    for (let i = c; i < im.data.length; i += 4) t += im.data[i];
    return t / (im.width * im.height);
  };
  for (let c = 0; c < 3; c++) {
    assert.ok(Math.abs(mean(out, c) - mean(src, c)) < 4,
      `channel ${c} moved from ${mean(src, c).toFixed(1)} to ${mean(out, c).toFixed(1)}`);
  }
});

test('the edit is neutral, so a model cannot invent a colour cast', () => {
  // Applied equally to all three channels, which keeps it a luminance edit.
  // Letting a model move channels independently is where fringing comes from.
  const src = grey(64, 64, 130);
  const tinted: Pixels = { data: new Uint8ClampedArray(src.data), width: 64, height: 64 };
  for (let i = 0; i < tinted.data.length; i += 4) {
    tinted.data[i] += 80;         // pure red invention
  }
  const out = bound(src, tinted, { strength: 1, maxGain: 4 });
  for (let i = 0; i < out.data.length; i += 4) {
    assert.equal(out.data[i], out.data[i + 1], 'red and green diverged — a cast got in');
    assert.equal(out.data[i + 1], out.data[i + 2]);
  }
});

test('strength zero is a no-op', () => {
  const src = textured(64, 64);
  const out = bound(src, grey(64, 64, 200), { strength: 0, maxGain: 4 });
  for (let i = 0; i < out.data.length; i++) {
    assert.ok(Math.abs(out.data[i] - src.data[i]) <= 1, 'strength 0 still changed the image');
  }
});

test('the defaults are inside the safe range', () => {
  /*
   * Both were measured rather than chosen. Below about 1.5 `maxGain` softens
   * genuine texture, because the ceiling is compared against a mean and detail
   * has peaks; far above 2 a model can turn a smudge into a glyph. At strength 1
   * any systematic bias the model has becomes the image's bias.
   */
  assert.ok(AI_DEFAULTS.maxGain >= 1.5 && AI_DEFAULTS.maxGain <= 2.5, `maxGain ${AI_DEFAULTS.maxGain}`);
  assert.ok(AI_DEFAULTS.strength > 0 && AI_DEFAULTS.strength < 1, `strength ${AI_DEFAULTS.strength}`);
});
