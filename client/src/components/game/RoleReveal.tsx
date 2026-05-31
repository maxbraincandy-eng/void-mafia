import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { Role } from '@/types/index';

interface Props {
  role: Role | null;
}

const ROLE_GRADIENTS: Record<string, string> = {
  cyan:   'from-neon-cyan/20 via-void-100 to-void',
  pink:   'from-neon-pink/20 via-void-100 to-void',
  blue:   'from-neon-blue/20 via-void-100 to-void',
  green:  'from-neon-green/20 via-void-100 to-void',
  purple: 'from-neon-purple/20 via-void-100 to-void',
  yellow: 'from-yellow-400/20 via-void-100 to-void',
};

const ROLE_ICONS: Record<string, string> = {
  mafia:     '🔫',
  citizen:   '🏙',
  sheriff:   '🔍',
  doctor:    '💉',
  don:       '♛',
  maniac:    '🌀',
  jester:    '🃏',
  bodyguard: '🛡',
  spy:       '🕵️',
  escort:    '💃',
  vigilante: '⚖️',
};

export function RoleReveal({ role }: Props) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setFlipped(true), 700);
    return () => clearTimeout(t);
  }, []);

  if (!role) return null;

  const gradient = ROLE_GRADIENTS[role.color] ?? ROLE_GRADIENTS.cyan;
  const icon = ROLE_ICONS[role.key] ?? '◆';

  const glowStyle = {
    boxShadow: `0 0 60px ${role.glowColor}30, 0 0 120px ${role.glowColor}10, inset 0 0 40px ${role.glowColor}08`,
    borderColor: `${role.glowColor}40`,
  };

  const textGlowStyle = {
    textShadow: `0 0 20px ${role.glowColor}, 0 0 40px ${role.glowColor}60`,
  };

  return (
    <div className="flex flex-col items-center justify-center h-full py-8">
      <motion.p
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-xs font-display tracking-[0.3em] uppercase text-white/40 mb-6"
      >
        Your Role
      </motion.p>

      {/* 3D card flip wrapper */}
      <div style={{ perspective: '1200px' }}>
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
          style={{
            transformStyle: 'preserve-3d',
            position: 'relative',
            width: '256px',
            minHeight: '320px',
          }}
        >
          {/* Back face — question mark */}
          <div
            style={{ backfaceVisibility: 'hidden' }}
            className="absolute inset-0 w-full h-full rounded-3xl border border-white/10 bg-void-50 flex flex-col items-center justify-center gap-4"
          >
            <div
              className="absolute inset-0 rounded-3xl opacity-30 pointer-events-none"
              style={{ background: 'radial-gradient(circle at 50% 40%, rgba(155,0,255,0.4), transparent 70%)' }}
            />
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
              className="text-6xl relative z-10"
              style={{ textShadow: '0 0 30px rgba(155,0,255,0.8), 0 0 60px rgba(155,0,255,0.4)' }}
            >
              ?
            </motion.div>
            <p
              className="text-xs font-display tracking-[0.3em] uppercase relative z-10"
              style={{ color: 'rgba(155,0,255,0.6)' }}
            >
              Your Role
            </p>
          </div>

          {/* Front face — role card */}
          <div
            style={{
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              position: 'absolute',
              inset: 0,
            }}
          >
            <div
              style={glowStyle}
              className={clsx(
                'relative w-full h-full rounded-3xl border p-8 text-center overflow-hidden',
                `bg-gradient-to-b ${gradient}`,
              )}
            >
              {/* Background glow blob */}
              <div
                className="absolute inset-0 opacity-20 pointer-events-none"
                style={{ background: `radial-gradient(circle at 50% 30%, ${role.glowColor}60, transparent 70%)` }}
              />

              <div className="text-6xl mb-4 relative z-10">
                {icon}
              </div>

              <h2
                style={textGlowStyle}
                className="font-display text-3xl font-bold tracking-widest uppercase mb-1 relative z-10"
              >
                {role.name}
              </h2>

              <p className="text-xs font-mono uppercase tracking-widest text-white/50 mb-6 relative z-10">
                Team: {role.team}
              </p>

              <div className="space-y-3 relative z-10">
                <p className="text-sm text-white/70 leading-relaxed">{role.description}</p>
                <div className="border-t border-white/10 pt-3">
                  <p className="text-xs text-white/40 uppercase tracking-widest mb-1">Ability</p>
                  <p className="text-sm text-white/80">{role.ability}</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="mt-6 text-xs text-white/30 font-mono animate-pulse"
      >
        Game begins shortly…
      </motion.p>
    </div>
  );
}
