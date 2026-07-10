import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useT } from '@/store/langStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

const ROLES = [
  { key: 'mafia',       icon: '🔫', team: 'mafia',   badge: '🔴' },
  { key: 'don',         icon: '♛',  team: 'mafia',   badge: '🔴' },
  { key: 'yakuza',      icon: '⚔️', team: 'mafia',   badge: '🔴' },
  { key: 'shogun',      icon: '👺', team: 'mafia',   badge: '🔴' },
  { key: 'citizen',     icon: '👤', team: 'town',    badge: '🔵' },
  { key: 'sheriff',     icon: '🔍', team: 'town',    badge: '🔵' },
  { key: 'doctor',      icon: '💊', team: 'town',    badge: '🔵' },
  { key: 'bodyguard',   icon: '🛡', team: 'town',    badge: '🔵' },
  { key: 'escort',      icon: '💃', team: 'town',    badge: '🔵' },
  { key: 'vigilante',   icon: '🔫', team: 'town',    badge: '🔵' },
  { key: 'tracker',     icon: '👁', team: 'town',    badge: '🔵' },
  { key: 'veteran',     icon: '🎖️', team: 'town',    badge: '🔵' },
  { key: 'mayor',       icon: '🏛', team: 'town',    badge: '🔵' },
  { key: 'maniac',      icon: '🌀', team: 'neutral', badge: '⚪' },
  { key: 'jester',      icon: '🃏', team: 'neutral', badge: '⚪' },
  { key: 'arsonist',    icon: '🔥', team: 'neutral', badge: '⚪' },
  { key: 'cult_leader', icon: '🕯️', team: 'cult',    badge: '🟣' },
  { key: 'cultist',     icon: '😶', team: 'cult',    badge: '🟣' },
] as const;

const PHASE_ICONS = ['🌙', '☀️', '🎤', '⚖️', '🛡', '💀'];

const TEAM_COLOR: Record<string, string> = {
  mafia:   'text-red-400',
  town:    'text-neon-cyan',
  neutral: 'text-white/50',
  cult:    'text-neon-purple',
};

const TABS = ['roles', 'phases', 'rules'] as const;
type Tab = typeof TABS[number];

export function HowToPlayModal({ open, onClose }: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>('roles');

  const TAB_LABELS: Record<Tab, string> = {
    roles: t.howToPlay.tabRoles,
    phases: t.howToPlay.tabPhases,
    rules: t.howToPlay.tabRules,
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm px-0 sm:px-4 pb-0"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
            style={{
              background: 'rgba(6,3,18,0.98)',
              border: '1px solid rgba(138,43,226,0.18)',
              boxShadow: '0 -8px 60px rgba(138,43,226,0.08)',
              maxHeight: '82vh',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/6 flex-shrink-0">
              <div>
                <p className="font-mono text-[12px] uppercase tracking-[0.25em] text-neon-purple/50 mb-0.5">Guide</p>
                <h2 className="font-display font-bold text-white text-base">How to Play</h2>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/60 transition-colors"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="flex gap-1 px-4 pt-3 pb-0 flex-shrink-0">
              {TABS.map(tabKey => (
                <button
                  key={tabKey}
                  onClick={() => setTab(tabKey)}
                  className="flex-1 py-1.5 rounded-lg font-mono text-[12px] uppercase tracking-wider transition-all"
                  style={{
                    background: tab === tabKey ? 'rgba(138,43,226,0.2)' : 'rgba(255,255,255,0.03)',
                    border: tab === tabKey ? '1px solid rgba(138,43,226,0.35)' : '1px solid rgba(255,255,255,0.07)',
                    color: tab === tabKey ? 'rgba(200,150,255,0.9)' : 'rgba(255,255,255,0.3)',
                  }}
                >
                  {TAB_LABELS[tabKey]}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {tab === 'roles' && (
                <div className="grid grid-cols-1 gap-2">
                  {ROLES.map((role, i) => (
                    <div
                      key={role.key}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <span className="text-xl w-7 text-center flex-shrink-0">{role.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-display font-bold text-white/85 text-sm">{t.howToPlay.roleNames[i]}</span>
                          <span className="text-xs">{role.badge}</span>
                        </div>
                        <p className={`font-mono text-[12px] mt-0.5 ${TEAM_COLOR[role.team]}/70`}>{t.howToPlay.roleDescs[i]}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'phases' && (
                <div className="flex flex-col gap-2">
                  {PHASE_ICONS.map((icon, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 px-3 py-3 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <span className="text-2xl flex-shrink-0 mt-0.5">{icon}</span>
                      <div>
                        <p className="font-display font-bold text-white/85 text-sm">{t.howToPlay.phaseNames[i]}</p>
                        <p className="font-mono text-[11px] text-white/45 mt-0.5">{t.howToPlay.phaseDescs[i]}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'rules' && (
                <div className="flex flex-col gap-2 pt-1">
                  {t.howToPlay.rules.map((rule, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 px-3 py-2.5 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <span className="font-mono text-neon-purple/60 text-sm flex-shrink-0 mt-0.5">•</span>
                      <p className="font-mono text-[12px] text-white/65 leading-relaxed">{rule}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
