/**
 * A real microphone meter.
 *
 * The recording bar used to animate a row of bars on a timer — a decoration
 * that moved whether or not the microphone was hearing anything. That is worse
 * than no meter: it tells you the recording is fine when it may be silent, and
 * on a phone where the level turns out too low it hides the one thing that
 * would have explained it.
 *
 * These bars follow the actual input. If metering is unavailable the component
 * renders nothing rather than pretending.
 */
import { useEffect, useRef, useState } from 'react';

export function MicLevel({
  level, bars = 18, color = '#f87171', dim = 'rgba(255,255,255,0.18)', height = 20,
}: {
  /** Current loudness, 0…1, or null when the platform will not report it. */
  level: () => number | null;
  bars?: number;
  color?: string;
  dim?: string;
  height?: number;
}) {
  const [history, setHistory] = useState<number[]>(() => Array(bars).fill(0));
  const [available, setAvailable] = useState(true);
  const raf = useRef<number | null>(null);
  const last = useRef(0);

  useEffect(() => {
    let alive = true;
    const tick = (t: number) => {
      if (!alive) return;
      // ~20 fps is plenty for a level meter and costs nothing on a phone.
      if (t - last.current > 50) {
        last.current = t;
        const v = level();
        if (v === null) { setAvailable(false); return; }
        // Loudness by ear is closer to a root than a straight amplitude, and
        // speech peaks land around 0.2 — so scale it up to fill the meter.
        const shown = Math.min(1, Math.sqrt(v) * 2.2);
        setHistory(h => [...h.slice(1), shown]);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { alive = false; if (raf.current) cancelAnimationFrame(raf.current); };
  }, [level]);

  if (!available) return null;

  return (
    <div className="flex items-end gap-px flex-1" style={{ height }} aria-hidden>
      {history.map((v, i) => (
        <div key={i} className="flex-1 rounded-full transition-[height] duration-75"
          style={{
            height: `${Math.max(8, v * 100)}%`,
            background: v > 0.04 ? color : dim,
            opacity: v > 0.04 ? 0.55 + v * 0.45 : 1,
          }} />
      ))}
    </div>
  );
}
