/**
 * The photo pipeline, off the main thread.
 *
 * Enhancing a twelve-megapixel photo is around two and a half seconds of solid
 * arithmetic. On the main thread that is two and a half seconds during which
 * the page cannot paint, the spinner does not spin and a tap does nothing —
 * which reads as a crash, not as work in progress. Several people will press
 * the shutter again.
 *
 * The pipeline is pure functions over a pixel buffer, so it moves here almost
 * unchanged. The result comes back as a transferable, which hands over the
 * forty-eight megabytes by reference rather than copying them.
 *
 * The input is deliberately NOT transferred. Transferring would neuter the
 * caller's buffer, and the caller still needs it — that buffer is the original
 * the result screen shows when the compare button is held.
 */

import { enhance, type EnhanceOptions } from './photoPipeline';

interface Request {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  options: EnhanceOptions;
}

self.onmessage = (e: MessageEvent<Request>) => {
  const { data, width, height, options } = e.data;
  try {
    const out = enhance({ data, width, height }, options);
    (self as unknown as Worker).postMessage(
      { ok: true, data: out.data, width: out.width, height: out.height },
      [out.data.buffer as ArrayBuffer],
    );
  } catch (err: any) {
    (self as unknown as Worker).postMessage({ ok: false, error: String(err?.message ?? err) });
  }
};
