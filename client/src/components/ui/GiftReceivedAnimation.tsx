import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GiftReceivedNotification } from '@/types/index';

const RARITY_CONFIG: Record<string, { glow: string; border: string; label: string; particles: string[] }> = {
  common:    { glow: 'rgba(255,255,255,0.12)', border: 'rgba(255,255,255,0.2)',  label: 'text-white/60',   particles: ['✦','✧','·','◦'] },
  uncommon:  { glow: 'rgba(0,229,255,0.25)',   border: 'rgba(0,229,255,0.4)',    label: 'text-neon-cyan',  particles: ['✦','◈','✧','◦'] },
  rare:      { glow: 'rgba(155,0,255,0.35)',   border: 'rgba(155,0,255,0.5)',    label: 'text-purple-400', particles: ['✦','★','◈','✧'] },
  epic:      { glow: 'rgba(255,0,204,0.4)',    border: 'rgba(255,0,204,0.6)',    label: 'text-pink-400',   particles: ['✦','★','◆','✧'] },
  legendary: { glow: 'rgba(255,180,0,0.5)',    border: 'rgba(255,180,0,0.75)',   label: 'text-yellow-400', particles: ['✦','★','◆','♦'] },
};

const PARTICLE_COUNT = 18;

function Particle({ char, dx, dy, fontSize }: { char: string; dx: number; dy: number; fontSize: number }) {
  return (
    <motion.span
      className="absolute text-white/60 pointer-events-none select-none"
      style={{ fontSize }}
      initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
      animate={{ opacity: [0, 1, 0], scale: [0, 1.2, 0], x: dx, y: dy }}
      transition={{ duration: 1.8 + Math.random() * 0.8, delay: Math.random() * 0.6, ease: 'easeOut' }}
    >
      {char}
    </motion.span>
  );
}

interface Props {
  notification: GiftReceivedNotification | null;
  onDismiss: () => void;
}

export function GiftReceivedAnimation({ notification, onDismiss }: Props) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!notification) return;
    timerRef.current = setTimeout(onDismiss, 4200);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [notification, onDismiss]);

  const cfg = RARITY_CONFIG[notification?.giftRarity ?? 'common'] ?? RARITY_CONFIG.common!;

  const particles = notification
    ? Array.from({ length: PARTICLE_COUNT }, (_, i) => {
        const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
        const dist = 80 + Math.random() * 120;
        return {
          char: cfg.particles[i % cfg.particles.length]!,
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist,
          fontSize: 12 + Math.random() * 14,
        };
      })
    : [];

  return (
    <AnimatePresence>
      {notification && (
        <motion.div
          key={`${notification.giftId}-${notification.senderName}`}
          className="fixed inset-0 z-[200] flex items-center justify-center cursor-pointer"
          style={{ background: 'rgba(3,0,13,0.88)', backdropFilter: 'blur(12px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={onDismiss}
        >
          {/* Background glow orb */}
          <motion.div
            className="absolute rounded-full pointer-events-none"
            style={{ width: 320, height: 320, background: `radial-gradient(ellipse, ${cfg.glow} 0%, transparent 70%)` }}
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: [0.3, 1.4, 1.1], opacity: [0, 0.8, 0.5] }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />

          <div className="relative flex flex-col items-center gap-5 px-8">
            {/* Particles */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {particles.map((p, i) => (
                <Particle
                  key={i}
                  char={p.char}
                  dx={p.dx}
                  dy={p.dy}
                  fontSize={p.fontSize}
                />
              ))}
            </div>

            {/* Label */}
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4 }}
              className={`font-mono text-[12px] uppercase tracking-[0.3em] ${cfg.label}`}
            >
              Gift Received
            </motion.div>

            {/* Gift image / icon */}
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: [0, 1.25, 1], rotate: ['-20deg', '5deg', '0deg'] }}
              transition={{ type: 'spring', stiffness: 280, damping: 18, delay: 0.1 }}
              className="relative"
            >
              <div
                className="w-28 h-28 rounded-3xl flex items-center justify-center overflow-hidden"
                style={{
                  background: 'rgba(8,4,20,0.9)',
                  border: `2px solid ${cfg.border}`,
                  boxShadow: `0 0 40px ${cfg.glow}, 0 0 80px ${cfg.glow}`,
                }}
              >
                {notification.giftImageUrl
                  ? <img src={notification.giftImageUrl} alt={notification.giftName} className="w-full h-full object-cover" />
                  : <span className="text-6xl">{notification.giftIcon}</span>
                }
              </div>

              {/* Rarity badge */}
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 }}
                className={`absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full font-mono text-[12px] uppercase tracking-widest ${cfg.label}`}
                style={{ background: 'rgba(8,4,20,0.95)', border: `1px solid ${cfg.border}` }}
              >
                {notification.giftRarity}
              </motion.div>
            </motion.div>

            {/* Gift name */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="text-center"
            >
              <p className="font-display text-2xl font-bold text-white tracking-wide leading-tight">
                {notification.giftName}
              </p>
              <p className="font-mono text-sm text-white/40 mt-1.5">
                from <span className="text-white/70 font-semibold">{notification.senderName}</span>
              </p>
              {notification.message && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="font-mono text-[11px] text-white/30 mt-2 italic max-w-[220px] text-center leading-relaxed"
                >
                  "{notification.message}"
                </motion.p>
              )}
            </motion.div>

            {/* Tap to dismiss */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.3 }}
              transition={{ delay: 1.5 }}
              className="font-mono text-[12px] uppercase tracking-[0.25em] text-white/30"
            >
              tap to dismiss
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
