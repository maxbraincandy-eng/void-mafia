import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import clsx from 'clsx';
import { SFX } from '@/lib/audioEngine';

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

export function Timer({ seconds, max, size = 'md' }: Props) {
  const prevSecondsRef = useRef(seconds);
  const urgencyTriggeredRef = useRef(false);
  const pct = max > 0 ? Math.max(0, Math.min(1, seconds / max)) : 0;
  const isUrgent = seconds <= 10 && seconds > 0;

  useEffect(() => {
    const prev = prevSecondsRef.current;
    prevSecondsRef.current = seconds;
    if (seconds <= 10 && seconds > 0 && seconds < prev) {
      SFX.tick(seconds <= 5);
    }
    // Trigger once when dropping to 10
    if (seconds <= 10 && seconds > 0 && prev > 10 && !urgencyTriggeredRef.current) {
      urgencyTriggeredRef.current = true;
      navigator.vibrate?.(50);
    }
    if (seconds > 10) urgencyTriggeredRef.current = false;
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
        animate={isUrgent ? { scale: [1, 1.08, 1] } : { scale: 1 }}
        transition={isUrgent ? { repeat: Infinity, duration: 0.45 } : {}}
        style={{
          color,
          textShadow: isUrgent ? `0 0 14px ${color}` : undefined,
        }}
      >
        {fmt(seconds)}
      </motion.span>
    </div>
  );
}
