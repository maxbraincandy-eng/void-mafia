/**
 * The falling-glyph backdrop behind the M.A.R.S. terminal.
 *
 * Canvas rather than DOM: this is hundreds of glyphs repainting every frame,
 * and as elements it would thrash layout on a phone. It draws a translucent
 * black rect over the previous frame instead of clearing, which is what leaves
 * the fading trail behind each column — cheaper than tracking per-glyph alpha.
 *
 * It throttles itself to ~24fps, stops entirely when the tab is hidden, and
 * renders one static frame when the user asks for reduced motion.
 */
import { useEffect, useRef } from 'react';

const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<>/\\|=+*#$%&@';

export function MatrixRain({ color = '#39ff6a', opacity = 0.16 }: { color?: string; opacity?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    // Capped device pixel ratio: at 3x this is 9x the fill cost for a
    // background nobody is reading.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const FONT = 15;

    let cols = 0;
    let drops: number[] = [];
    let raf = 0;
    let last = 0;
    let running = true;

    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${FONT}px ui-monospace, monospace`;
      ctx.textBaseline = 'top';
      const next = Math.ceil(w / FONT);
      // Preserve existing column positions on resize so the rain doesn't
      // visibly restart when the mobile URL bar collapses.
      drops = Array.from({ length: next }, (_, i) => drops[i] ?? Math.random() * -40);
      cols = next;
      ctx.clearRect(0, 0, w, h);
    };

    const glyph = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

    const frame = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      if (now - last < 42) return;        // ~24fps is plenty for falling text
      last = now;

      const w = canvas.clientWidth, h = canvas.clientHeight;
      // The trail: paint over, don't clear.
      ctx.fillStyle = 'rgba(0,8,4,0.10)';
      ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < cols; i++) {
        const x = i * FONT;
        const y = drops[i] * FONT;
        // Lead glyph is brighter than its tail.
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.9;
        ctx.fillText(glyph(), x, y);
        ctx.globalAlpha = 0.35;
        ctx.fillText(glyph(), x, y - FONT * 2);
        drops[i]++;
        if (y > h && Math.random() > 0.975) drops[i] = Math.random() * -20;
      }
      ctx.globalAlpha = 1;
    };

    const still = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < Math.ceil(h / FONT); j += 3) ctx.fillText(glyph(), i * FONT, j * FONT);
      }
      ctx.globalAlpha = 1;
    };

    const onVisibility = () => {
      if (document.hidden) { running = false; cancelAnimationFrame(raf); }
      else if (!reduced) { running = true; raf = requestAnimationFrame(frame); }
    };

    const ro = new ResizeObserver(() => { resize(); if (reduced) still(); });
    ro.observe(canvas);
    resize();

    if (reduced) still();
    else raf = requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [color]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity }}
    />
  );
}
