import { AnimatePresence, motion } from 'framer-motion';
import { useT } from '@/store/langStore';

const ROLES = [
  { key: 'citizen',   icon: '🏙', team: 'town',    color: '#00e5ff' },
  { key: 'sheriff',   icon: '🔍', team: 'town',    color: '#00e5ff' },
  { key: 'doctor',    icon: '💉', team: 'town',    color: '#00e5ff' },
  { key: 'bodyguard', icon: '🛡', team: 'town',    color: '#00e5ff' },
  { key: 'spy',       icon: '🕵', team: 'town',    color: '#00e5ff' },
  { key: 'vigilante', icon: '⚡', team: 'town',    color: '#00e5ff' },
  { key: 'escort',    icon: '💃', team: 'town',    color: '#00e5ff' },
  { key: 'mafia',     icon: '🔫', team: 'mafia',   color: '#ff2d55' },
  { key: 'don',       icon: '👑', team: 'mafia',   color: '#ff2d55' },
  { key: 'maniac',    icon: '🪓', team: 'neutral', color: '#9b00ff' },
  { key: 'jester',    icon: '🃏', team: 'neutral', color: '#9b00ff' },
] as const;

interface Props {
  open: boolean;
  onClose: () => void;
}

export function RoleInfoModal({ open, onClose }: Props) {
  const t = useT() as any;
  const roles = t.roleGuide?.roles ?? {};

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-neon-purple/30"
            style={{ background: 'rgba(8,4,20,0.97)', backdropFilter: 'blur(20px)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between px-5 py-4 border-b border-white/8"
              style={{ background: 'rgba(8,4,20,0.97)' }}>
              <h2 className="font-display text-lg font-bold text-white tracking-widest uppercase">
                📖 {t.roleGuide?.title ?? 'Role Guide'}
              </h2>
              <button onClick={onClose} className="text-white/40 hover:text-white text-xl transition-colors">✕</button>
            </div>

            <div className="p-4 space-y-3">
              {ROLES.map(role => {
                const info = roles[role.key];
                if (!info) return null;
                return (
                  <div key={role.key} className="rounded-xl p-3 border"
                    style={{ borderColor: `${role.color}25`, background: `${role.color}08` }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{role.icon}</span>
                      <span className="font-display font-bold text-sm tracking-wider uppercase"
                        style={{ color: role.color }}>{info.name ?? role.key}</span>
                      <span className="ml-auto text-[10px] font-mono uppercase tracking-widest"
                        style={{ color: `${role.color}80` }}>
                        {role.team}
                      </span>
                    </div>
                    {info.ability && (
                      <p className="text-xs text-white/60 font-mono leading-relaxed">{info.ability}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
