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

      {/* Card */}
      <motion.div
        initial={{ rotateY: 90, opacity: 0 }}
        animate={{ rotateY: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        style={glowStyle}
        className={clsx(
          'relative w-64 rounded-3xl border p-8 text-center overflow-hidden',
          `bg-gradient-to-b ${gradient}`,
        )}
      >
        {/* Background glow blob */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{ background: `radial-gradient(circle at 50% 30%, ${role.glowColor}60, transparent 70%)` }}
        />

        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
          className="text-6xl mb-4 relative z-10"
        >
          {icon}
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          style={textGlowStyle}
          className="font-display text-3xl font-bold tracking-widest uppercase mb-1 relative z-10"
        >
          {role.name}
        </motion.h2>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-xs font-mono uppercase tracking-widest text-white/50 mb-6 relative z-10"
        >
          Team: {role.team}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
          className="space-y-3 relative z-10"
        >
          <p className="text-sm text-white/70 leading-relaxed">{role.description}</p>
          <div className="border-t border-white/10 pt-3">
            <p className="text-xs text-white/40 uppercase tracking-widest mb-1">Ability</p>
            <p className="text-sm text-white/80">{role.ability}</p>
          </div>
        </motion.div>
      </motion.div>

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
