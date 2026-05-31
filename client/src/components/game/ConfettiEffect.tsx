import { useEffect, useRef } from 'react';

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  color: string;
  angle: number; spin: number;
  w: number; h: number;
  alpha: number;
}

interface Props {
  colors: string[];
  count?: number;
  duration?: number;
}

export function ConfettiEffect({ colors, count = 180, duration = 5000 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Burst from top-center with slight spread
    const particles: Particle[] = Array.from({ length: count }, () => {
      const angle = (Math.random() * Math.PI) - Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const speed = Math.random() * 14 + 6;
      return {
        x:     canvas.width * (0.35 + Math.random() * 0.30),
        y:     -20,
        vx:    Math.cos(angle) * speed,
        vy:    Math.sin(angle) * speed - 6,
        color: colors[Math.floor(Math.random() * colors.length)]!,
        angle: Math.random() * Math.PI * 2,
        spin:  (Math.random() - 0.5) * 0.3,
        w:     Math.random() * 10 + 5,
        h:     Math.random() * 5 + 3,
        alpha: 1,
      };
    });

    let start: number | null = null;
    let animId: number;

    function draw(ts: number) {
      if (!start) start = ts;
      const elapsed = ts - start;
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);

      let allGone = true;
      for (const p of particles) {
        p.vx *= 0.99;
        p.vy += 0.35;            // gravity
        p.x  += p.vx;
        p.y  += p.vy;
        p.angle += p.spin;

        // fade out last 30% of duration
        if (elapsed > duration * 0.65) {
          p.alpha = Math.max(0, p.alpha - 0.018);
        }

        if (p.alpha > 0.01) {
          allGone = false;
          ctx!.save();
          ctx!.translate(p.x, p.y);
          ctx!.rotate(p.angle);
          ctx!.globalAlpha = p.alpha;
          ctx!.fillStyle = p.color;
          ctx!.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx!.restore();
        }
      }

      if (!allGone && elapsed < duration + 2000) {
        animId = requestAnimationFrame(draw);
      }
    }

    animId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 55 }}
    />
  );
}
