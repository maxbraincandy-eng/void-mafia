import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phase } from '@/types/index';

interface Props {
  phase: Phase | null;
  onDone: () => void;
}

interface PhaseConfig {
  icon: string;
  label: string;
  color: string;
  bg: string;
}

const PHASE_CONFIG: Partial<Record<Phase, PhaseConfig>> = {
  night: {
    icon: '🌙',
    label: 'NIGHT FALLS',
    color: '#9b00ff',
    bg: 'from-[#0a0020]',
  },
  day: {
    icon: '☀️',
    label: 'DAWN BREAKS',
    color: '#00e5ff',
    bg: 'from-[#001a20]',
  },
  speech: {
    icon: '🎤',
    label: 'DEBATE BEGINS',
    color: '#00ff88',
    bg: 'from-[#001a0d]',
  },
  voting: {
    icon: '⚖️',
    label: 'TRIBUNAL',
    color: '#ff2d55',
    bg: 'from-[#1a0005]',
  },
  role_reveal: {
    icon: '🃏',
    label: 'ROLES REVEALED',
    color: '#9b00ff',
    bg: 'from-[#0a0020]',
  },
};

export function PhaseTransition({ phase, onDone }: Props) {
  useEffect(() => {
    if (!phase) return;
    // total visible time: 0.25s in + 1.0s hold + 0.4s out = 1.65s
    const t = setTimeout(onDone, 1650);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const config = phase ? PHASE_CONFIG[phase] : null;

  return (
    <AnimatePresence>
      {phase && config && (
        <motion.div
          key={phase}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1 }}
          transition={{
            enter: { duration: 0.25, ease: 'easeOut' },
            exit: { duration: 0.4, ease: 'easeIn' },
          }}
          className="fixed inset-0 z-[300] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,8,0.98)' }}
        >
          {/* Colored glow overlay — separate so base is always opaque */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(ellipse at 50% 45%, ${config.color}28 0%, transparent 60%)`,
              pointerEvents: 'none',
            }}
          />
          {/* Pulsing glow ring behind icon */}
          <div className="relative flex flex-col items-center gap-6">
            <div className="relative flex items-center justify-center">
              <motion.div
                animate={{
                  scale: [1, 1.6, 1],
                  opacity: [0.3, 0.6, 0.3],
                }}
                transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                className="absolute rounded-full"
                style={{
                  width: '8rem',
                  height: '8rem',
                  background: `radial-gradient(circle, ${config.color}60, transparent 70%)`,
                  filter: `blur(12px)`,
                }}
              />
              <div
                className="relative z-10 text-[6rem] leading-none select-none"
                style={{ filter: `drop-shadow(0 0 24px ${config.color})` }}
              >
                {config.icon}
              </div>
            </div>

            <motion.p
              initial={{ opacity: 0, letterSpacing: '0.1em' }}
              animate={{ opacity: 1, letterSpacing: '0.3em' }}
              transition={{ delay: 0.1, duration: 0.35 }}
              className="font-display text-4xl font-bold uppercase tracking-[0.3em]"
              style={{
                color: config.color,
                textShadow: `0 0 20px ${config.color}, 0 0 40px ${config.color}80`,
              }}
            >
              {config.label}
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
