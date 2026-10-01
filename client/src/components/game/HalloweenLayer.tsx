/**
 * Halloween in a Mafia room: decoration behind the table, and an effect when
 * night falls. Shown only in the season (lib/halloween), and never in the way:
 * every layer is pointer-events: none, the ambient part sits behind the content
 * like PhaseAtmosphere does, and with reduced motion nothing moves.
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Phase } from '@/types/index';
import { NIGHTISH } from './PhaseAtmosphere';

const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function HalloweenLayer({ phase, fullMoon = false }: { phase: Phase; fullMoon?: boolean }) {
  const night = NIGHTISH.includes(phase);
  const still = reducedMotion();

  // The swarm plays once each time night falls, not on every re-render of it.
  const prevNight = useRef(night);
  const [swarm, setSwarm] = useState(0);
  useEffect(() => {
    if (night && !prevNight.current && !still) setSwarm(s => s + 1);
    prevNight.current = night;
  }, [night, still]);

  return (
    <>
      {/* ── Ambient: behind the table ─────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }} aria-hidden>
        <Cobweb corner="left" />
        <Cobweb corner="right" />

        <span className="absolute bottom-3 left-2 text-[26px] select-none"
          style={{ filter: 'drop-shadow(0 0 10px rgba(255,138,31,0.55))', opacity: 0.75 }}>🎃</span>
        <span className="absolute bottom-3 right-2 text-[20px] select-none"
          style={{ filter: 'drop-shadow(0 0 8px rgba(255,138,31,0.5))', opacity: 0.6 }}>🎃</span>

        <AnimatePresence>
          {night && (
            <motion.div key="hw-night" className="absolute inset-0"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.6 }}>
              {/* A blood moon over the town — or, on the werewolf's nights,
                  a great full moon. Low and faint either way: the top of the
                  screen is where the phase text is, and the moon sits behind. */}
              {fullMoon ? (
                <div className="absolute rounded-full"
                  style={{
                    top: '30%', right: '-6%', width: 150, height: 150,
                    background: 'radial-gradient(circle at 40% 38%, #fff8e6 0%, #ffe2a8 45%, #f2b65a 80%, #c9822a 100%)',
                    boxShadow: '0 0 90px 30px rgba(255,214,140,0.25)',
                    opacity: 0.42,
                  }} />
              ) : (
                <div className="absolute rounded-full"
                  style={{
                    top: '38%', right: '5%', width: 58, height: 58,
                    background: 'radial-gradient(circle at 38% 36%, #ffd2a6 0%, #ff8a3d 38%, #c2281a 78%, #7a0f0a 100%)',
                    boxShadow: '0 0 50px 14px rgba(255,90,40,0.22)',
                    opacity: 0.55,
                  }} />
              )}
              {/* Fog drifting along the bottom. */}
              <motion.div className="absolute left-[-20%] right-[-20%] bottom-0 h-44"
                style={{ background: 'radial-gradient(60% 100% at 50% 100%, rgba(190,170,220,0.16), transparent 70%)' }}
                animate={still ? {} : { x: ['-6%', '6%', '-6%'] }}
                transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }} />
              {!still && <Bat top="16%" size={18} duration={14} delay={2} />}
              {!still && <Bat top="27%" size={13} duration={19} delay={9} />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Night falls: a swarm, above everything, for two seconds ───── */}
      <AnimatePresence>
        {swarm > 0 && <Swarm key={swarm} onDone={() => setSwarm(0)} />}
      </AnimatePresence>
    </>
  );
}

function Bat({ top, size, duration, delay }: { top: string; size: number; duration: number; delay: number }) {
  return (
    <motion.span className="absolute select-none" style={{ top, fontSize: size, opacity: 0.55 }}
      initial={{ x: '-12vw', y: 0 }}
      animate={{ x: '112vw', y: [0, -14, 6, -10, 0] }}
      transition={{ duration, delay, repeat: Infinity, repeatDelay: 6, ease: 'linear' }}>
      🦇
    </motion.span>
  );
}

/** Bats bursting across the screen and a red flicker, as night falls. */
function Swarm({ onDone }: { onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2400); return () => clearTimeout(t); }, [onDone]);
  const bats = Array.from({ length: 11 }, (_, i) => ({
    y: 18 + ((i * 37) % 60),
    size: 14 + ((i * 7) % 16),
    delay: (i % 6) * 0.11,
  }));
  return (
    // Above PhaseTransition (z 300), which covers the screen at this exact moment.
    <motion.div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 310 }} aria-hidden
      initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="absolute inset-0"
        style={{ background: 'radial-gradient(120% 80% at 50% 50%, rgba(200,30,20,0.0), rgba(120,0,0,0.35))' }}
        initial={{ opacity: 0 }} animate={{ opacity: [0, 0.9, 0.2, 0.6, 0] }} transition={{ duration: 1.4 }} />
      {bats.map((b, i) => (
        <motion.span key={i} className="absolute select-none" style={{ top: `${b.y}%`, fontSize: b.size }}
          initial={{ x: '-15vw', y: 40, opacity: 0 }}
          animate={{ x: '115vw', y: -60, opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.7, delay: b.delay, ease: 'easeIn' }}>
          🦇
        </motion.span>
      ))}
    </motion.div>
  );
}

/** A cobweb drawn in the top corner. */
function Cobweb({ corner }: { corner: 'left' | 'right' }) {
  return (
    <svg className="absolute top-0" width="92" height="92" viewBox="0 0 120 120"
      style={{ [corner]: 0, opacity: 0.15, transform: corner === 'right' ? 'scaleX(-1)' : undefined } as React.CSSProperties}>
      <g stroke="#e8e0ff" strokeWidth="0.9" fill="none">
        {/* spokes from the corner */}
        <path d="M0 0 L118 8 M0 0 L104 52 M0 0 L76 88 M0 0 L44 112 M0 0 L8 118" />
        {/* rings, sagging between spokes */}
        <path d="M24 2 Q22 12 21 10 Q18 19 15 23 Q12 26 9 27 Q6 25 2 24" />
        <path d="M52 4 Q48 22 46 23 Q40 38 33 45 Q27 51 19 54 Q12 53 4 52" />
        <path d="M84 6 Q77 33 74 37 Q64 58 54 66 Q42 76 29 80 Q18 81 6 81" />
        <path d="M112 8 Q104 44 100 50 Q87 78 72 88 Q57 99 40 106 Q24 108 8 110" />
      </g>
      <g transform="translate(70 62)">
        <line x1="0" y1="-62" x2="0" y2="-4" stroke="#e8e0ff" strokeWidth="0.6" />
        <circle r="4" fill="#1a1022" stroke="#e8e0ff" strokeWidth="0.8" />
      </g>
    </svg>
  );
}

export default HalloweenLayer;
