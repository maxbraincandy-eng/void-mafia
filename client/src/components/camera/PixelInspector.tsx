/**
 * Looking at the actual pixels.
 *
 * WHY THIS IS NOT DECORATION
 * ──────────────────────────
 * The directive this camera is being built to says not to spend time on
 * interface while the pipeline is weak, and it is right. This is not interface;
 * it is the instrument. Every claim about detail, noise or sharpness that has
 * been made so far was settled by measuring against synthetic ground truth,
 * which is rigorous and cannot answer the only question that finally matters:
 * how does a real photo of a real scene compare to the phone in the other hand.
 *
 * So this loads our output beside a reference — the original frame, or an
 * imported shot from another camera — and shows both at the same framing, at
 * magnifications where individual pixels are visible.
 *
 * TWO DECISIONS THAT MAKE IT HONEST
 * ─────────────────────────────────
 * Sampling is nearest-neighbour above 1×. A smoothed magnification makes
 * everything look better and makes a soft image look like a sharp one seen
 * through glass — which is exactly the confusion this exists to remove.
 *
 * Framing is normalised, not pixel-locked. Two cameras hand back different
 * resolutions, and the interesting question is "at the same field of view, who
 * resolved more", not "whose pixel grid is denser". Both panels show the same
 * fraction of their own frame, so a higher-resolution image legitimately shows
 * more detail in the same window — which is the comparison worth making.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';

const ACCENT = '#4a76c4';

/** Fraction of the frame's width visible. 1 is the whole photo. */
const FOV_STOPS: { label: string; fov: number }[] = [
  { label: 'FIT', fov: 1 },
  { label: '2×', fov: 0.5 },
  { label: '4×', fov: 0.25 },
  { label: '8×', fov: 0.125 },
];

export interface InspectPane {
  label: string;
  /** Anything an <img> accepts. */
  src: string;
}

type Mode = 'split' | 'side';

export function PixelInspector({ panes, note, onClose }: {
  panes: InspectPane[];
  /**
   * What shot these panes came from — zoom, frames, reconstruction.
   *
   * Added after a comparison was made at 1× and read as though it tested the
   * zoom pipeline. The right-hand pane's label does say which it is, but a
   * label that has to be noticed is a label that will not be, and a benchmark
   * nobody can tell the conditions of is not a benchmark.
   */
  note?: string;
  onClose: () => void;
}) {
  const [images, setImages] = useState<(HTMLImageElement | null)[]>([]);
  const [extra, setExtra] = useState<InspectPane[]>([]);
  const [mode, setMode] = useState<Mode>('side');
  const [fov, setFov] = useState(0.25);
  // Normalised centre of the visible window, so panels of different sizes stay
  // in step.
  const [centre, setCentre] = useState({ x: 0.5, y: 0.5 });
  const [divider, setDivider] = useState(0.5);

  const all = [...panes, ...extra];

  useEffect(() => {
    let dead = false;
    Promise.all(all.map(p => new Promise<HTMLImageElement | null>(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = p.src;
    }))).then(loaded => { if (!dead) setImages(loaded); });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all.map(p => p.src).join('|')]);

  const importReference = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    setExtra(e => [...e, { label: file.name.slice(0, 18) || 'reference', src: url }]);
  }, []);

  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[740] flex flex-col" style={{ background: '#07060c' }}>

      {/* ── Controls ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-3 pt-3 pb-2 flex-wrap">
        <button onClick={onClose} aria-label="დახურვა"
          className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)' }}>✕</button>

        {FOV_STOPS.map(s => (
          <button key={s.label} onClick={() => setFov(s.fov)}
            className="px-2.5 h-8 rounded-lg font-mono text-[11px] flex-shrink-0"
            style={{
              background: fov === s.fov ? ACCENT : 'rgba(255,255,255,0.06)',
              border: `1px solid ${fov === s.fov ? ACCENT : 'rgba(255,255,255,0.13)'}`,
              color: '#fff',
            }}>{s.label}</button>
        ))}

        <span className="w-2" />

        <button onClick={() => setMode(m => (m === 'side' ? 'split' : 'side'))}
          className="px-2.5 h-8 rounded-lg font-mono text-[11px] text-white/70 flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.13)' }}>
          {mode === 'side' ? 'გვერდიგვერდ' : 'გაყოფილი'}
        </button>

        <label className="px-2.5 h-8 rounded-lg font-mono text-[11px] text-white/70 flex-shrink-0 flex items-center cursor-pointer"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.13)' }}>
          + ეტალონი
          {/*
            * Importing a reference is the whole point: a photo of the same
            * scene from the camera being measured against, loaded from the
            * gallery and put next to ours at the same framing.
            */}
          <input type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) importReference(f); }} />
        </label>
      </div>

      {note && (
        <p className="px-3 pb-1.5 font-mono text-[10.5px]" style={{ color: '#8fb0dd' }}>{note}</p>
      )}

      {/* ── Panels ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 px-2 pb-2">
        {mode === 'side' ? (
          <div className="flex gap-2 h-full">
            {all.map((p, i) => (
              <Panel key={p.label + i} pane={p} img={images[i] ?? null}
                fov={fov} centre={centre} onPan={setCentre} />
            ))}
          </div>
        ) : (
          <SplitPanel panes={all.slice(0, 2)} images={images} fov={fov}
            centre={centre} onPan={setCentre} divider={divider} onDivider={setDivider} />
        )}
      </div>
    </motion.div>,
    document.body,
  );
}

/**
 * One image, drawn at the shared framing.
 *
 * Nearest-neighbour above 1×, so a pixel is drawn as a square and softness is
 * visible as softness rather than being smoothed into looking deliberate.
 */
function Panel({ pane, img, fov, centre, onPan }: {
  pane: InspectPane;
  img: HTMLImageElement | null;
  fov: number;
  centre: { x: number; y: number };
  onPan: (c: { x: number; y: number }) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !img) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // The source window: `fov` of the image's width, centred, with the height
    // following the canvas's aspect so nothing is stretched.
    const sw = img.naturalWidth * fov;
    const sh = sw * (canvas.height / canvas.width);
    const sx = centre.x * img.naturalWidth - sw / 2;
    const sy = centre.y * img.naturalHeight - sh / 2;

    // Above 1:1 the point is to see pixels, not a pleasant enlargement.
    ctx.imageSmoothingEnabled = (canvas.width / sw) < 1.5;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  }, [img, fov, centre]);

  const down = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, cx: centre.x, cy: centre.y };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    const canvas = ref.current;
    if (!d || !canvas || !img) return;
    const rect = canvas.getBoundingClientRect();
    // Panning is in normalised units so every panel moves together, whatever
    // resolution each of them happens to be.
    onPan({
      x: clamp01(d.cx - ((e.clientX - d.x) / rect.width) * fov),
      y: clamp01(d.cy - ((e.clientY - d.y) / rect.height) * fov * (rect.height / rect.width) * (img.naturalWidth / img.naturalHeight)),
    });
  };
  const up = () => { drag.current = null; };

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <p className="font-mono text-[10px] text-white/45 mb-1 truncate">
        {pane.label}{img ? ` · ${img.naturalWidth}×${img.naturalHeight}` : ' · …'}
      </p>
      <canvas ref={ref}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        className="flex-1 min-h-0 w-full rounded-lg"
        style={{ background: '#000', border: '1px solid rgba(255,255,255,0.1)', touchAction: 'none', cursor: 'grab' }} />
    </div>
  );
}

/**
 * Two images through one window, with a draggable seam.
 *
 * The comparison that settles arguments: the same region of the same scene,
 * cut down the middle. Differences in sharpness that are invisible side by side
 * are obvious across a seam.
 */
function SplitPanel({ panes, images, fov, centre, onPan, divider, onDivider }: {
  panes: InspectPane[];
  images: (HTMLImageElement | null)[];
  fov: number;
  centre: { x: number; y: number };
  onPan: (c: { x: number; y: number }) => void;
  divider: number;
  onDivider: (d: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const mode = useRef<'pan' | 'seam' | null>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const seam = Math.round(canvas.width * divider);

    images.slice(0, 2).forEach((img, i) => {
      if (!img) return;
      const sw = img.naturalWidth * fov;
      const sh = sw * (canvas.height / canvas.width);
      const sx = centre.x * img.naturalWidth - sw / 2;
      const sy = centre.y * img.naturalHeight - sh / 2;

      ctx.save();
      ctx.beginPath();
      if (i === 0) ctx.rect(0, 0, seam, canvas.height);
      else ctx.rect(seam, 0, canvas.width - seam, canvas.height);
      ctx.clip();
      ctx.imageSmoothingEnabled = (canvas.width / sw) < 1.5;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    });

    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(seam, 0);
    ctx.lineTo(seam, canvas.height);
    ctx.stroke();
  }, [images, fov, centre, divider]);

  const down = (e: React.PointerEvent) => {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const at = (e.clientX - rect.left) / rect.width;
    // Grabbing near the seam moves the seam; anywhere else pans both images.
    mode.current = Math.abs(at - divider) < 0.06 ? 'seam' : 'pan';
    drag.current = { x: e.clientX, y: e.clientY, cx: centre.x, cy: centre.y };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const canvas = ref.current;
    const d = drag.current;
    if (!canvas || !d || !mode.current) return;
    const rect = canvas.getBoundingClientRect();
    if (mode.current === 'seam') {
      onDivider(clamp01((e.clientX - rect.left) / rect.width));
    } else {
      onPan({
        x: clamp01(d.cx - ((e.clientX - d.x) / rect.width) * fov),
        y: clamp01(d.cy - ((e.clientY - d.y) / rect.height) * fov * (rect.height / rect.width)),
      });
    }
  };
  const up = () => { mode.current = null; drag.current = null; };

  return (
    <div className="h-full flex flex-col">
      <p className="font-mono text-[10px] text-white/45 mb-1 truncate">
        {panes[0]?.label} <span style={{ color: ACCENT }}>│</span> {panes[1]?.label ?? '—'}
      </p>
      <canvas ref={ref}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        className="flex-1 min-h-0 w-full rounded-lg"
        style={{ background: '#000', border: '1px solid rgba(255,255,255,0.1)', touchAction: 'none', cursor: 'grab' }} />
    </div>
  );
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
