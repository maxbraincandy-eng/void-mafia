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
import { createPortal } from 'react-dom';
import {
  openCamera, captureFrame, captureBurst, applyDigitalZoom, setOpticalZoom, setTorch,
  pixelsToDataUrl, pixelsToBlob, mirrorPixels, savePhoto, megapixels, enhanceOffThread,
  type Facing, type CaptureCapabilities,
} from '@/lib/cameraCapture';
import { stackFrames, NATURAL, ZOOMED, type Pixels } from '@/lib/photoPipeline';

const ACCENT = '#4a76c4';
const GOLD = '#ffcc33';

/** The steps the zoom control snaps to. Beyond 4× a crop stops being worth it. */
const ZOOM_STOPS = [1, 1.5, 2, 3, 4];

/** Frames to average on the low-light path. Long enough to help, short enough not to smear. */
const BURST = 5;

type Phase = 'live' | 'working' | 'result';

interface Result {
  enhanced: Pixels;
  original: Pixels;
  source: string;
  stacked: boolean;
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
  const [lowLight, setLowLight] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

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
      let pixels: Pixels;
      let source: string;
      let stacked = false;

      if (lowLight) {
        /*
         * Averaging a burst is the only step in the whole pipeline that adds
         * information rather than trading it away: noise is random and the
         * scene is not. It runs on video frames because `takePhoto` is far too
         * slow to fire five times — so it is a deliberate trade of resolution
         * for cleanliness, offered as a toggle rather than guessed at.
         */
        pixels = stackFrames(await captureBurst(video, BURST));
        source = `${BURST}× კადრი`;
        stacked = true;
      } else {
        const shot = await captureFrame(track, video);
        pixels = shot.pixels;
        source = shot.source === 'photo' ? 'სენსორი' : shot.source === 'frame' ? 'კადრი' : 'ვიდეო';
      }

      pixels = applyDigitalZoom(pixels, zoom, opticallyZoomed);
      // The preview is mirrored because that is what a mirror does; the sensor
      // does not mirror, so without this a selfie comes out flipped relative to
      // what was on screen.
      if (facing === 'user') pixels = mirrorPixels(pixels);

      const digitallyZoomed = zoom > 1 && !opticallyZoomed;
      // Off the main thread, so the spinner keeps spinning while a
      // twelve-megapixel photo is worked on. A frozen screen reads as a crash.
      const enhanced = await enhanceOffThread(pixels, digitallyZoomed ? ZOOMED : NATURAL);

      setResult({ enhanced, original: pixels, source, stacked });
      setShowOriginal(false);
      setSaved(null);
      setPhase('result');
    } catch {
      setError('სურათი ვერ გადაიღო');
      setPhase('live');
    }
  }, [phase, caps, zoom, facing, lowLight]);

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
             * Named for what it does, not for how. "ღამის რეჟიმი" would promise
             * a night mode; this averages a burst, which helps in dim light and
             * smears anything that moves. The label says the trade.
             */
            <button onClick={() => setLowLight(v => !v)}
              className="px-3 h-9 rounded-full flex items-center gap-1.5 font-mono text-[11px] flex-shrink-0"
              style={{
                background: lowLight ? `${ACCENT}44` : 'rgba(0,0,0,0.5)',
                border: `1px solid ${lowLight ? ACCENT : 'rgba(255,255,255,0.16)'}`,
                color: lowLight ? '#cfe0ff' : 'rgba(255,255,255,0.6)',
              }}>🌙 ბნელი</button>
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
              {result.stacked && (
                <span className="px-2.5 py-1 rounded-lg font-mono text-[10.5px]"
                  style={{ background: 'rgba(0,0,0,0.55)', border: `1px solid ${GOLD}66`, color: '#ffe6a0' }}>
                  ხმაური ↓
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

              <button onClick={() => void save()}
                className="flex-1 h-12 rounded-2xl font-display font-bold text-white text-[14px]"
                style={{ background: ACCENT, boxShadow: `0 8px 26px ${ACCENT}55` }}>
                {saved ?? 'შენახვა'}
              </button>
            </div>
          </div>
        )}
      </div>

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
