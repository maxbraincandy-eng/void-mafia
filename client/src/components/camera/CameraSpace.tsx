/**
 * The camera.
 *
 * WHAT MAKES THIS DIFFERENT FROM THE ONE THE BROWSER GIVES YOU
 * ───────────────────────────────────────────────────────────
 * Two things, and only one of them is the processing.
 *
 * The first is that the shutter takes a real still — `ImageCapture.takePhoto()`
 * at sensor resolution — rather than screenshotting the preview. That is the
 * difference between a twelve-megapixel photo and a one-megapixel one, and no
 * amount of enhancement afterwards makes up for skipping it.
 *
 * The second is `photoPipeline`: local contrast, edge acutance, chroma
 * denoise. Arithmetic, not a model. It is deliberately not called AI anywhere
 * in the interface, because it does not invent detail and a camera that claims
 * to is lying to the person holding it.
 *
 * THE COMPARISON IS THE HONEST PART
 * ─────────────────────────────────
 * Every "enhance" button in every app is unfalsifiable — something changes, it
 * looks different, and nobody can say whether it is better. So the result
 * screen holds the original and shows it on press. If the processing is not
 * doing anything worth having, that button is where it becomes obvious, and it
 * should be.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal, flushSync } from 'react-dom';
import {
  openCamera, captureForMerge, applyDigitalZoom, setOpticalZoom, setTorch,
  pixelsToDataUrl, pixelsToBlob, mirrorPixels, savePhoto, megapixels, processOffThread,
  acquirePool, releasePool,
  type Facing, type CaptureCapabilities,
} from '@/lib/cameraCapture';
import { capability } from '@/lib/deviceTier';
import { selectFrames, framesForZoom } from '@/lib/frameQuality';
import { lanczosResize, crop, zoomRect } from '@/lib/photoPipeline';
import { NATURAL, ZOOMED, type Pixels } from '@/lib/photoPipeline';
import { MAX_HONEST_SCALE } from '@/lib/superResolve';
import { PixelInspector } from './PixelInspector';

const ACCENT = '#4a76c4';

/**
 * What an ordinary camera app would have produced.
 *
 * Crop to the zoom factor, resize back up, and stop — the three steps this
 * whole engine exists as an alternative to. Kept so the inspector can put the
 * two side by side.
 *
 * Deliberately NOT a strawman. It resizes with the same Lanczos kernel the real
 * path uses rather than something cheap, so what the comparison shows is the
 * value of multi-frame reconstruction and not the value of a better resampler.
 * If the computational result cannot beat a competently-made digital zoom, that
 * is worth finding out here rather than being told by somebody holding a phone.
 */
function plainDigitalZoom(frame: Pixels, zoom: number, mirror: boolean, targetW: number): Pixels {
  const r = zoomRect(frame.width, frame.height, zoom);
  const cut = crop(frame, r.x, r.y, r.w, r.h);
  // Matched to the computational result's size so the comparison is about
  // detail alone. Different output sizes would let the one with more pixels
  // look better for having more pixels, which is not the question.
  const h = Math.round(cut.height * (targetW / cut.width));
  const out = lanczosResize(cut, targetW, h);
  return mirror ? mirrorPixels(out) : out;
}
const GOLD = '#ffcc33';

/** The steps the zoom control snaps to. Beyond 4× a crop stops being worth it. */
const ZOOM_STOPS = [1, 1.5, 2, 3, 4];

/*
 * How many frames each mode asks for, and how long it may spend collecting them.
 *
 * One frame is a plain still: fastest, full resolution, and in good light the
 * better answer. Five is the merged mode — enough for a real drop in noise
 * without asking somebody to hold a phone still for a week.
 *
 * The budget is what keeps the merged mode honest on a slow device: rather
 * than taking however long five stills take, it collects what it can and merges
 * that.
 */
const FRAMES_FAST = 1;

type Phase = 'live' | 'working' | 'result';

interface Result {
  enhanced: Pixels;
  original: Pixels;
  source: string;
  /** How many frames actually went into it, after any were dropped. */
  merged: number;
  /** 0..1 — how much of the burst agreed. Low means the scene was moving. */
  agreement: number;
  /** Reconstruction factor, or 0 when the burst could not support one. */
  reconstructed: number;
  /** Frames thrown out for being blurred or badly exposed. */
  rejected: number;
  /** True while this is the provisional single frame, not the fused result. */
  provisional: boolean;
  /** Ordinary crop-and-resize from the same source, for the benchmark pane. */
  plain: Pixels | null;
  /** The zoom the shot was actually taken at. */
  shotZoom: number;
}

export function CameraSpace({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);

  const [phase, setPhase] = useState<Phase>('live');
  const [facing, setFacing] = useState<Facing>('environment');
  const [caps, setCaps] = useState<CaptureCapabilities | null>(null);
  const [zoom, setZoom] = useState(1);
  const [torchOn, setTorchOn] = useState(false);
  const [mergeMode, setMergeMode] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [inspect, setInspect] = useState(false);
  /*
   * Measured once. Core count and memory do not change while a camera screen
   * is open, and they decide how much evidence a shot is worth collecting —
   * fourteen frames on a phone that can chew through them, three on one that
   * cannot.
   */
  const cap = useRef(capability()).current;

  /*
   * The worker pool lives as long as this screen does. Starting workers costs
   * tens of milliseconds and a burst would pay it several times per shot;
   * leaking them would run the phone out of threads by the twentieth photo.
   */
  useEffect(() => { acquirePool(); return () => releasePool(); }, []);

  // ── The stream ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let dead = false;
    setError(null);

    openCamera(facing)
      .then(({ stream, track, capabilities }) => {
        if (dead) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        trackRef.current = track;
        setCaps(capabilities);
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((e: any) => {
        if (dead) return;
        setError(
          /NotAllowed|Permission/i.test(String(e?.name ?? e?.message))
            ? 'კამერაზე წვდომა დაბლოკილია — ბრაუზერის პარამეტრებში ჩართე'
            : 'კამერა ვერ გაიხსნა',
        );
      });

    return () => {
      dead = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      trackRef.current = null;
    };
  }, [facing]);

  // Zoom the sensor where it can be zoomed. `setOpticalZoom` says whether it
  // took; when it did not, the crop at capture time is the zoom.
  useEffect(() => {
    const track = trackRef.current;
    if (track && caps?.zoom) void setOpticalZoom(track, zoom);
  }, [zoom, caps]);

  useEffect(() => {
    const track = trackRef.current;
    if (track && caps?.torch) void setTorch(track, torchOn);
  }, [torchOn, caps]);

  // Turning the torch off on the way out — a light left on after the screen
  // closes is the kind of bug people notice in their pocket.
  useEffect(() => () => {
    const track = trackRef.current;
    if (track) void setTorch(track, false);
  }, []);

  // ── The shutter ─────────────────────────────────────────────────────────────
  const shoot = useCallback(async () => {
    const track = trackRef.current;
    const video = videoRef.current;
    if (!track || !video || phase !== 'live') return;

    setPhase('working');
    // A frame for the browser to paint the working state before the main thread
    // disappears into the pipeline for a second or two.
    await new Promise(r => requestAnimationFrame(() => r(null)));

    try {
      const opticallyZoomed = !!caps?.zoom && zoom > 1;
      /*
       * More frames the further in the zoom goes. Reconstruction onto a finer
       * grid needs the burst to have sampled enough distinct sub-pixel phases
       * to fill it; at 1× there is no finer grid and the frames buy noise
       * reduction alone, which saturates quickly.
       */
      const want = mergeMode ? framesForZoom(zoom, cap.frames) : FRAMES_FAST;

      /*
       * The burst, at whatever resolution this device can burst at. On a phone
       * where `takePhoto` is quick that is several full-resolution stills — as
       * close to HDR+ as a browser reaches. Where it is not, it is video
       * frames: smaller, but many, which for a dim scene is the better trade.
       */
      const shot = await captureForMerge(track, video, want, cap.burstBudgetMs);
      let frames = shot.frames;

      // Zoom and mirror every frame before merging, not after: the merge
      // aligns them against each other, and it can only do that while they
      // are all in the same geometry.
      /*
       * Zoom, and the one decision that makes computational zoom worth having.
       *
       * The ordinary implementation crops to the zoom factor and enlarges: the
       * pixels are thrown away and an interpolator is asked to invent them back.
       *
       * Here the crop is the same — it has to be, or the photograph is not
       * framed where the viewfinder said — but nothing enlarges it. The burst is
       * reconstructed onto a grid twice as fine instead, so the resolution comes
       * back from measurements several frames actually made rather than from a
       * kernel guessing between the ones that survived.
       *
       * The crop must NOT be enlarged first. Reconstructing already-interpolated
       * frames smears the sub-pixel differences into each other before the stage
       * that exists to exploit them ever sees them.
       */
      const digitallyZoomed = zoom > 1 && !opticallyZoomed;
      const useSR = cap.superResolve && digitallyZoomed && frames.length > 1 && zoom >= MAX_HONEST_SCALE;

      frames = frames.map(f => {
        let p = applyDigitalZoom(f, zoom, opticallyZoomed, { cropOnly: useSR });
        if (facing === 'user') p = mirrorPixels(p);
        return p;
      });

      /*
       * Throw out the frames that would make the merge worse.
       *
       * The merge already drops frames it cannot align — a lurch, a subject
       * that turned. That tests whether a frame can be REGISTERED and says
       * nothing about whether it is any good: a frame caught mid-shake aligns
       * perfectly well and is simply blurred, and merging it spreads that blur
       * across every pixel. At fourteen frames the odds one of them is that
       * frame are no longer small.
       */
      const picked = selectFrames(frames);
      const usable = picked.keep.map(i => frames[i]);

      /*
       * Stage one, on screen immediately: the sharpest frame the burst caught.
       *
       * The full pipeline is several seconds on a large burst. Showing nothing
       * for that long reads as a hang, and showing a spinner only says "wait".
       * This is the photograph, already better than the viewfinder, replaced by
       * the fused version the moment it exists.
       */
      const sharpest = picked.scores.reduce((a, b) => (b.sharpness > a.sharpness ? b : a));

      /*
       * `flushSync`, and it is not optional here.
       *
       * A plain setState schedules a normal-priority update, and the very next
       * line hands the main thread back to the pipeline — so React, given the
       * choice between committing and letting the work proceed, defers. Measured
       * across a whole shot, the provisional frame was on screen for exactly
       * zero milliseconds: the state was set, the render never happened, and the
       * only thing anybody saw was the finished photo four seconds later.
       *
       * This forces the commit, and the double frame afterwards lets the browser
       * actually paint it — `requestAnimationFrame` fires BEFORE paint, so a
       * single one returns to the heavy work while the screen is still blank.
       */
      flushSync(() => {
        setResult({
          enhanced: frames[sharpest.index], original: frames[sharpest.index],
          source: shot.source === 'photo' ? 'სენსორი' : 'ვიდეო',
          merged: 1, agreement: 1, reconstructed: 0, rejected: picked.rejected.length,
          provisional: true, plain: null, shotZoom: zoom,
        });
        setPhase('result');
      });
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))));
      /*
       * Merging and enhancing both happen off the main thread. Between them
       * this is several seconds on a large photo, and several seconds on the
       * main thread is a spinner that does not turn and taps that do nothing,
       * which reads as a crash rather than as work.
       */
      const { pixels: enhanced, report, sr } = await processOffThread(
        usable, digitallyZoomed ? ZOOMED : NATURAL, { superResolve: useSR },
      );

      const used = usable.length - ((report?.dropped ?? sr?.dropped) ?? 0);
      const refIdx = report?.reference ?? sr?.reference ?? 0;
      setResult({
        enhanced,
        original: usable[refIdx] ?? usable[0],
        source: shot.source === 'photo' ? 'სენსორი' : 'ვიდეო',
        merged: used,
        agreement: report?.agreement ?? 1,
        /*
         * Only claimed when it happened AND the burst actually had the
         * sub-pixel spread to support it. A steady hand, or stabilisation that
         * cancelled the tremor, means the frames re-measured the same phases
         * and there was nothing extra to recover — saying otherwise would be
         * the overclaim the whole pipeline is built to avoid.
         */
        reconstructed: sr && sr.phaseDiversity > 0.25 ? sr.scale : 0,
        rejected: picked.rejected.length,
        provisional: false,
        /*
         * Plain crop-and-resize from the same source, kept for the inspector.
         *
         * Without it every claim on this screen is unfalsifiable: the compare
         * button shows processed against unprocessed, which is not the question.
         * The question is whether this beats what an ordinary camera app would
         * have produced from the identical frame, and this is that image.
         */
        plain: digitallyZoomed ? plainDigitalZoom(shot.frames[refIdx] ?? shot.frames[0], zoom, facing === 'user', enhanced.width) : null,
        shotZoom: zoom,
      });
      setShowOriginal(false);
      setSaved(null);
      setPhase('result');
    } catch {
      setError('სურათი ვერ გადაიღო');
      setPhase('live');
    }
  }, [phase, caps, zoom, facing, mergeMode, cap]);

  const save = useCallback(async () => {
    if (!result) return;
    const blob = await pixelsToBlob(result.enhanced, 0.94);
    if (!blob) return;
    const how = await savePhoto(blob, `void-${Date.now()}.jpg`);
    setSaved(how === 'shared' ? 'შენახულია' : 'ჩამოიტვირთა');
    setTimeout(() => setSaved(null), 2600);
  }, [result]);

  const shown = result ? (showOriginal ? result.original : result.enhanced) : null;

  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[720] flex flex-col" style={{ background: '#05030c' }}>

      {/* ── Viewfinder ─────────────────────────────────────────────────────── */}
      <div className="absolute inset-0" style={{ background: '#000' }}>
        <video
          ref={videoRef} autoPlay playsInline muted
          className="absolute inset-0 w-full h-full"
          style={{
            objectFit: 'cover',
            // The digital-zoom preview only: when the sensor is doing the
            // zooming the frame is already zoomed and scaling it again would
            // double it.
            transform: `${facing === 'user' ? 'scaleX(-1)' : ''} ${caps?.zoom ? '' : `scale(${zoom})`}`.trim(),
            opacity: phase === 'result' ? 0 : 1,
          }}
        />

        {shown && phase === 'result' && (
          <img src={pixelsToDataUrl(shown, 0.9)} alt=""
            className="absolute inset-0 w-full h-full" style={{ objectFit: 'contain' }} />
        )}
        {result?.provisional && phase === 'result' && (
          /*
           * The provisional frame is a real photograph, not a placeholder — it
           * is the sharpest frame the burst caught. Saying so is the difference
           * between "here is your picture, it is about to get better" and a
           * screen that appears to change its mind.
           */
          <div className="absolute inset-x-0 bottom-0 flex justify-center pb-2 pointer-events-none" style={{ zIndex: 5 }}>
            <span className="px-3 py-1.5 rounded-full font-mono text-[10.5px] text-white"
              style={{ background: 'rgba(0,0,0,0.65)', border: `1px solid ${ACCENT}66` }}>
              საუკეთესო კადრი · ვამუშავებ დანარჩენს…
            </span>
          </div>
        )}
      </div>

      <div className="relative z-10 flex flex-col h-full">
        {/* ── Top bar ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-4 pt-4">
          <button onClick={onClose} aria-label="დახურვა"
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/75 flex-shrink-0"
            style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.16)' }}>✕</button>

          <span className="flex-1" />

          {phase !== 'result' && caps?.torch && (
            <button onClick={() => setTorchOn(t => !t)} aria-label="ფარანი"
              className="w-9 h-9 rounded-full flex items-center justify-center text-[15px] flex-shrink-0"
              style={{
                background: torchOn ? `${GOLD}33` : 'rgba(0,0,0,0.5)',
                border: `1px solid ${torchOn ? GOLD : 'rgba(255,255,255,0.16)'}`,
              }}>⚡</button>
          )}

          {phase !== 'result' && (
            /*
             * On by default, because it is the whole point of this camera.
             *
             * Named for the trade rather than for the mechanism. "ღამის რეჟიმი"
             * would promise a night mode; this takes several frames and merges
             * them, which costs a couple of seconds and buys a cleaner, more
             * detailed photo. Turning it off gives a single fast still, which
             * in bright light is barely worse and is instant.
             */
            <button onClick={() => setMergeMode(v => !v)}
              className="px-3 h-9 rounded-full flex items-center gap-1.5 font-mono text-[11px] flex-shrink-0"
              style={{
                background: mergeMode ? `${ACCENT}44` : 'rgba(0,0,0,0.5)',
                border: `1px solid ${mergeMode ? ACCENT : 'rgba(255,255,255,0.16)'}`,
                color: mergeMode ? '#cfe0ff' : 'rgba(255,255,255,0.6)',
              }}>{mergeMode ? '✦ ხარისხი' : '⚡ სწრაფი'}</button>
          )}
        </div>

        {error && (
          <p className="mx-auto mt-6 px-5 font-mono text-[12px] text-center" style={{ color: '#ff8a92' }}>{error}</p>
        )}

        <span className="flex-1" />

        {/* ── Zoom ─────────────────────────────────────────────────────────── */}
        {phase === 'live' && !error && (
          <div className="flex justify-center gap-1.5 pb-4">
            {ZOOM_STOPS.map(z => (
              <button key={z} onClick={() => setZoom(z)}
                className="rounded-full font-mono transition-all"
                style={{
                  width: zoom === z ? 44 : 36, height: zoom === z ? 44 : 36,
                  fontSize: zoom === z ? 12 : 11,
                  background: zoom === z ? ACCENT : 'rgba(0,0,0,0.55)',
                  border: `1px solid ${zoom === z ? ACCENT : 'rgba(255,255,255,0.18)'}`,
                  color: '#fff',
                }}>{z}×</button>
            ))}
          </div>
        )}

        {/* ── Shutter row ──────────────────────────────────────────────────── */}
        {phase !== 'result' && (
          <div className="flex items-center justify-between px-8 pb-10">
            <span style={{ width: 52 }}>
              {caps && (
                /*
                 * Which capture path ran, in the corner. Not decoration: the
                 * gap between a sensor still and a video frame is most of the
                 * quality on this screen, and when somebody reports that photos
                 * look soft, this is the first thing worth knowing.
                 */
                <span className="font-mono text-[9.5px] text-white/35 leading-tight block">
                  {caps.stills ? 'სენსორი' : 'ვიდეო'}
                  {caps.zoom ? <><br />ოპტიკური ზუმი</> : null}
                </span>
              )}
            </span>

            <button onClick={() => void shoot()} disabled={phase === 'working' || !!error}
              aria-label="გადაღება"
              className="rounded-full flex items-center justify-center transition-transform active:scale-95 disabled:opacity-50"
              style={{ width: 76, height: 76, background: 'rgba(255,255,255,0.14)', border: '3px solid #fff' }}>
              <span style={{
                width: 60, height: 60, borderRadius: '50%',
                background: phase === 'working' ? ACCENT : '#fff',
                transition: 'background 160ms',
              }} />
            </button>

            <button onClick={() => setFacing(f => (f === 'user' ? 'environment' : 'user'))}
              aria-label="კამერის შეცვლა" disabled={phase === 'working'}
              className="rounded-full flex items-center justify-center text-[19px] disabled:opacity-40"
              style={{ width: 52, height: 52, background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.18)' }}>🔄</button>
          </div>
        )}

        {/* ── Result ───────────────────────────────────────────────────────── */}
        {phase === 'result' && result && (
          <div className="pb-10 px-5">
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="px-2.5 py-1 rounded-lg font-mono text-[10.5px] text-white"
                style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.16)' }}>
                {megapixels(result.enhanced)} MP
              </span>
              <span className="px-2.5 py-1 rounded-lg font-mono text-[10.5px]"
                style={{ background: 'rgba(0,0,0,0.55)', border: `1px solid ${ACCENT}66`, color: '#cfe0ff' }}>
                {result.source}
              </span>
              {result.merged > 1 && (
                /*
                 * How many frames actually made it in, not how many were asked
                 * for. A burst where three of five were dropped for motion did
                 * less than one where all five merged, and saying "5×" in both
                 * cases would be the readout lying about the photo.
                 */
                <span className="px-2.5 py-1 rounded-lg font-mono text-[10.5px]"
                  style={{ background: 'rgba(0,0,0,0.55)', border: `1px solid ${GOLD}66`, color: '#ffe6a0' }}>
                  {result.merged}× შერწყმა
                </span>
              )}
              {result.reconstructed > 1 && (
                /*
                 * Said only when the burst genuinely carried the sub-pixel
                 * spread to support it — `reconstructed` is already 0 when it
                 * did not. "Reconstruction" here means measurements from
                 * several frames placed on a finer grid, not a model inventing
                 * detail, and the wording stays on the right side of that.
                 */
                <span className="px-2.5 py-1 rounded-lg font-mono text-[10.5px]"
                  style={{ background: 'rgba(0,0,0,0.55)', border: `1px solid ${ACCENT}88`, color: '#cfe0ff' }}>
                  {result.reconstructed}× აღდგენა
                </span>
              )}
              {result.rejected > 0 && (
                // Frames the burst collected and then threw out for being
                // blurred or badly exposed. Worth saying: it explains why a
                // fourteen-frame burst reports as nine.
                <span className="px-2.5 py-1 rounded-lg font-mono text-[10.5px]"
                  style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.55)' }}>
                  −{result.rejected} სუსტი
                </span>
              )}
              {result.merged > 1 && result.agreement < 0.5 && (
                // The scene moved, so most of the burst was rejected and this is
                // closer to a single frame than to a merge. Worth admitting.
                <span className="px-2.5 py-1 rounded-lg font-mono text-[10.5px]"
                  style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.55)' }}>
                  მოძრაობა
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => { setResult(null); setPhase('live'); }}
                className="px-4 h-12 rounded-2xl font-mono text-[12px] text-white/70 flex-shrink-0"
                style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.16)' }}>
                თავიდან
              </button>

              {/*
                * Hold to see the original.
                *
                * The one control on this screen that can prove the processing is
                * worth having — and, just as usefully, prove when it is not.
                */}
              <button
                onPointerDown={() => setShowOriginal(true)}
                onPointerUp={() => setShowOriginal(false)}
                onPointerLeave={() => setShowOriginal(false)}
                className="px-4 h-12 rounded-2xl font-mono text-[12px] flex-shrink-0"
                style={{
                  background: showOriginal ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.5)',
                  border: '1px solid rgba(255,255,255,0.16)',
                  color: showOriginal ? '#fff' : 'rgba(255,255,255,0.7)',
                }}>
                {showOriginal ? 'ორიგინალი' : 'შედარება'}
              </button>

              {/*
                * The instrument, not a feature. Holding "შედარება" flips the
                * whole frame; this opens the same two images at 800% with a
                * seam, which is where a difference in resolved detail either
                * exists or does not.
                */}
              <button onClick={() => setInspect(true)} aria-label="პიქსელები"
                className="w-12 h-12 rounded-2xl font-mono text-[11px] text-white/70 flex-shrink-0"
                style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.16)' }}>1:1</button>

              <button onClick={() => void save()}
                className="flex-1 h-12 rounded-2xl font-display font-bold text-white text-[14px]"
                style={{ background: ACCENT, boxShadow: `0 8px 26px ${ACCENT}55` }}>
                {saved ?? 'შენახვა'}
              </button>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {inspect && result && (
          <PixelInspector onClose={() => setInspect(false)}
            note={
              result.plain
                ? `${result.shotZoom}× ზუმი · ${result.merged} კადრი` +
                  (result.reconstructed > 1 ? ` · ${result.reconstructed}× აღდგენა` : ' · აღდგენის გარეშე')
                : `1× — ზუმი არ გამოყენებულა, ეს მარჯვნივ ორიგინალია და არა ციფრული ზუმი`
            }
            panes={[
            { label: 'გამოთვლითი ზუმი', src: pixelsToDataUrl(result.enhanced, 0.98) },
            /*
             * The benchmark. At 1× there is no digital zoom to compare against,
             * so the pane is the unprocessed frame; zoomed, it is crop-and-
             * resize from the same source — what an ordinary camera app would
             * have handed back.
             */
            result.plain
              ? { label: 'ჩვეულებრივი ციფრული ზუმი', src: pixelsToDataUrl(result.plain, 0.98) }
              : { label: 'ორიგინალი', src: pixelsToDataUrl(result.original, 0.98) },
          ]} />
        )}
      </AnimatePresence>

      {/* ── Working ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {phase === 'working' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[725] flex flex-col items-center justify-center"
            style={{ background: 'rgba(5,3,12,0.75)' }}>
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
              style={{
                width: 34, height: 34, borderRadius: '50%',
                border: `2.5px solid ${ACCENT}33`, borderTopColor: ACCENT,
              }} />
            <p className="font-mono text-[11.5px] text-white/55 mt-4">მუშავდება…</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>,
    document.body,
  );
}

export default CameraSpace;
