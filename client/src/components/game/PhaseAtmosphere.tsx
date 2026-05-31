import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { Phase } from '@/types/index';

interface Star { x: number; y: number; r: number; delay: number; dur: number }

function generateStars(n: number): Star[] {
  return Array.from({ length: n }, () => ({
    x: Math.random() * 100,
    y: Math.random() * 60,
    r: Math.random() * 1.2 + 0.3,
    delay: Math.random() * 4,
    dur: Math.random() * 3 + 2.5,
  }));
}

const STARS = generateStars(60);

function NightLayer() {
  return (
    <div className="absolute inset-0">
      {/* Dark purple veil */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 160% 80% at 50% -10%, rgba(28,0,80,0.55) 0%, rgba(8,0,30,0.30) 55%, transparent 80%)',
        }}
      />
      {/* Star field */}
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice">
        {STARS.map((s, i) => (
          <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r} fill="rgba(200,200,255,0.7)">
            <animate
              attributeName="opacity"
              values="0.2;0.9;0.2"
              dur={`${s.dur}s`}
              begin={`${s.delay}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}
      </svg>
    </div>
  );
}

const OVERLAYS: Partial<Record<Phase, string>> = {
  day:
    'radial-gradient(ellipse 140% 60% at 50% -5%, rgba(0,90,120,0.18) 0%, transparent 70%)',
  speech:
    'radial-gradient(ellipse 140% 60% at 50% -5%, rgba(0,120,70,0.14) 0%, transparent 70%)',
  voting:
    'radial-gradient(ellipse 200% 80% at 50% 50%, rgba(110,0,25,0.22) 0%, transparent 65%),' +
    'radial-gradient(ellipse 100% 40% at 0% 50%, rgba(90,0,15,0.12) 0%, transparent 60%),' +
    'radial-gradient(ellipse 100% 40% at 100% 50%, rgba(90,0,15,0.12) 0%, transparent 60%)',
  role_reveal:
    'radial-gradient(ellipse 140% 60% at 50% -5%, rgba(90,0,200,0.20) 0%, transparent 70%)',
};

interface Props { phase: Phase }

export function PhaseAtmosphere({ phase }: Props) {
  return (
    <AnimatePresence mode="sync">
      {phase === 'night' ? (
        <motion.div
          key="night"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.4 }}
          className="fixed inset-0 pointer-events-none"
          style={{ zIndex: 0 }}
        >
          <NightLayer />
        </motion.div>
      ) : OVERLAYS[phase] ? (
        <motion.div
          key={phase}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2 }}
          className="fixed inset-0 pointer-events-none"
          style={{ background: OVERLAYS[phase], zIndex: 0 }}
        />
      ) : null}
    </AnimatePresence>
  );
}
