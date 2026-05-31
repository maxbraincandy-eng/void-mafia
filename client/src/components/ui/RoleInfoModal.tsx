import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RoleKey } from '@/types/index';
import { useT } from '@/store/langStore';

interface RoleMeta {
  key: RoleKey;
  icon: string;
  team: 'town' | 'mafia' | 'neutral' | 'cult';
}

const ROLES_META: RoleMeta[] = [
  // TOWN
  { key: 'citizen',     icon: '🏙',  team: 'town' },
  { key: 'sheriff',     icon: '🔍',  team: 'town' },
  { key: 'doctor',      icon: '💉',  team: 'town' },
  { key: 'bodyguard',   icon: '🛡',  team: 'town' },
  { key: 'vigilante',   icon: '⚖️',  team: 'town' },
  { key: 'escort',      icon: '💃',  team: 'town' },
  { key: 'mayor',       icon: '👑',  team: 'town' },
  { key: 'tracker',     icon: '👁',  team: 'town' },
  { key: 'veteran',     icon: '🎖️',  team: 'town' },
  { key: 'spy',         icon: '🕵️',  team: 'town' },
  // MAFIA
  { key: 'mafia',       icon: '🔫',  team: 'mafia' },
  { key: 'don',         icon: '♛',   team: 'mafia' },
  { key: 'arsonist',    icon: '🔥',  team: 'mafia' },
  // NEUTRAL
  { key: 'maniac',      icon: '🌀',  team: 'neutral' },
  { key: 'jester',      icon: '🃏',  team: 'neutral' },
  // CULT
  { key: 'cult_leader', icon: '🕯️',  team: 'cult' },
  { key: 'cultist',     icon: '🔮',  team: 'cult' },
];

const TEAM_META = {
  town:    { color: 'text-neon-cyan',   border: 'border-neon-cyan/20',   bg: 'bg-neon-cyan/5'   },
  mafia:   { color: 'text-neon-pink',   border: 'border-neon-pink/20',   bg: 'bg-neon-pink/5'   },
  neutral: { color: 'text-neon-purple', border: 'border-neon-purple/20', bg: 'bg-neon-purple/5' },
  cult:    { color: 'text-fuchsia-400', border: 'border-fuchsia-400/20', bg: 'bg-fuchsia-400/5' },
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export function RoleInfoModal({ open, onClose }: Props) {
  const t = useT();
  const rg = t.roleGuide;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', damping: 24, stiffness: 320 }}
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-lg bg-[#0a0a0f] border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[90vh] flex flex-col"
            style={{ boxShadow: '0 -20px 60px rgba(0,0,0,0.8), 0 0 40px rgba(0,0,0,0.5)' }}
          >
            {/* Drag handle (mobile) */}
            <div className="w-10 h-1 bg-white/15 rounded-full mx-auto mt-3 mb-1 sm:hidden" />

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-4 border-b border-white/8 shrink-0">
              <div>
                <h2 className="font-display font-bold text-lg text-white tracking-widest uppercase">{rg.title}</h2>
                <p className="text-white/30 font-mono text-xs mt-0.5">{ROLES_META.length} {rg.subtitle}</p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:border-white/30 transition-all"
              >
                ✕
              </button>
            </div>

            {/* Scrollable role list */}
            <div className="overflow-y-auto flex-1 p-4 space-y-5">
              {(['town', 'mafia', 'neutral', 'cult'] as const).map(team => {
                const roles = ROLES_META.filter(r => r.team === team);
                const tm = TEAM_META[team];
                return (
                  <div key={team}>
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className={`font-display font-bold text-[11px] tracking-[0.2em] uppercase ${tm.color}`}>
                        {team.toUpperCase()}
                      </span>
                      <div className="flex-1 h-px bg-white/6" />
                      <span className="text-white/20 font-mono text-[10px]">{roles.length} roles</span>
                    </div>
                    <div className="space-y-1.5">
                      {roles.map(role => (
                        <RoleCard key={role.key} role={role} tm={tm} />
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Win conditions summary */}
              <div className="mt-2 p-4 rounded-2xl border border-white/6 bg-white/2">
                <p className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-3">{rg.winConditions}</p>
                <div className="space-y-2">
                  {[
                    { color: 'text-neon-cyan',   icon: '⚖️', label: 'Town',   desc: rg.winSummary.town },
                    { color: 'text-neon-pink',   icon: '🔫', label: 'Mafia',  desc: rg.winSummary.mafia },
                    { color: 'text-fuchsia-400', icon: '🕯️', label: 'Cult',   desc: rg.winSummary.cult },
                    { color: 'text-neon-purple', icon: '🌀', label: 'Maniac', desc: rg.winSummary.maniac },
                    { color: 'text-purple-400',  icon: '🃏', label: 'Jester', desc: rg.winSummary.jester },
                  ].map(w => (
                    <div key={w.label} className="flex items-start gap-2">
                      <span className="text-base shrink-0">{w.icon}</span>
                      <div>
                        <span className={`font-display font-bold text-xs ${w.color}`}>{w.label}: </span>
                        <span className="text-white/50 text-xs">{w.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function RoleCard({
  role,
  tm,
}: {
  role: RoleMeta;
  tm: typeof TEAM_META[keyof typeof TEAM_META];
}) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const i18n = (t.roleGuide.roles as Record<string, { desc: string; ability: string; win: string }>)[role.key];
  const name = (t.game.roles as Record<string, string>)[role.key] ?? role.key;

  return (
    <button
      type="button"
      onClick={() => setOpen(o => !o)}
      className={`w-full text-left rounded-xl border ${tm.border} ${tm.bg} p-3 transition-all hover:brightness-110 active:scale-[0.99]`}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl shrink-0">{role.icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`font-display font-semibold text-sm ${tm.color}`}>{name}</p>
          <p className="text-white/40 text-xs leading-snug truncate">{i18n?.desc ?? ''}</p>
        </div>
        <span className={`text-white/25 text-[10px] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-white/6 space-y-2.5 text-left">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-white/25 mb-0.5">{t.roleGuide.nightAbility}</p>
                <p className="text-white/70 text-xs leading-relaxed">{i18n?.ability ?? ''}</p>
              </div>
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-white/25 mb-0.5">{t.roleGuide.winCondition}</p>
                <p className={`text-xs font-medium ${tm.color}`}>{i18n?.win ?? ''}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}
