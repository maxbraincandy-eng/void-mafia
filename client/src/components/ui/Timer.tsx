import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import clsx from 'clsx';

interface Props {
  seconds: number;
  max: number;
  size?: 'sm' | 'md' | 'lg';
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0
    ? `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : String(sec);
}

const CONFIGS = {
  sm: { r: 17, stroke: 2.5, box: 44, textClass: 'text-sm' },
  md: { r: 25, stroke: 3,   box: 60, textClass: 'text-xl' },
  lg: { r: 38, stroke: 4,   box: 88, textClass: 'text-3xl' },
};

function playTick(urgent: boolean) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = urgent ? 880 : 660;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => ctx.close();
  } catch { /* AudioContext not available */ }
}

export function Timer({ seconds, max, size = 'md' }: Props) {
  const prevSecondsRef = useRef(seconds);
  const pct = max > 0 ? Math.max(0, Math.min(1, seconds / max)) : 0;
  const isUrgent = pct < 0.25;

  useEffect(() => {
    const prev = prevSecondsRef.current;
    prevSecondsRef.current = seconds;
    // Tick for last 10 seconds, only when counting down
    if (seconds <= 10 && seconds > 0 && seconds < prev) {
      playTick(seconds <= 5);
    }
  }, [seconds]);
  const isWarning = pct < 0.5;

  const { r, stroke, box, textClass } = CONFIGS[size];
  const circumference = 2 * Math.PI * r;
  const dashOffset    = circumference * (1 - pct);

  const color      = isUrgent ? '#ff2d55' : isWarning ? '#fbbf24' : '#00ff88';
  const glowRadius = isUrgent ? 6 : 3;

  return (
    <div
      className="relative flex items-center justify-center select-none"
      style={{ width: box, height: box }}
    >
      {/* SVG ring */}
      <svg
        width={box}
        height={box}
        style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}
      >
        {/* Track */}
        <circle
          cx={box / 2}
          cy={box / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={stroke}
        />
        {/* Progress arc */}
        <motion.circle
          cx={box / 2}
          cy={box / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 0.9, ease: 'linear' }}
          style={{ filter: `drop-shadow(0 0 ${glowRadius}px ${color}99)` }}
        />
      </svg>

      {/* Center number */}
      <motion.span
        className={clsx('relative z-10 font-mono font-bold tabular-nums', textClass)}
        animate={isUrgent ? { scale: [1, 1.06, 1] } : { scale: 1 }}
        transition={isUrgent ? { repeat: Infinity, duration: 0.8 } : {}}
        style={{
          color,
          textShadow: isUrgent ? `0 0 10px ${color}` : undefined,
        }}
      >
        {fmt(seconds)}
      </motion.span>
    </div>
  );
}
