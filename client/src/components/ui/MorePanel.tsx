import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocialStore } from '@/store/socialStore';
import { SettingsPanel } from '@/pages/SettingsPanel';

interface MenuItem {
  icon: React.ReactNode;
  label: string;
  description: string;
  comingSoon?: boolean;
  onClick?: () => void;
}

function MenuRow({ item }: { item: MenuItem }) {
  return (
    <button
      onClick={item.onClick}
      disabled={item.comingSoon}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group disabled:cursor-default"
      style={{
        background: item.comingSoon ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.03)',
      }}
      onMouseEnter={e => { if (!item.comingSoon) (e.currentTarget as HTMLElement).style.background = 'rgba(138,43,226,0.08)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = item.comingSoon ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.03)'; }}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          background: item.comingSoon
            ? 'rgba(255,255,255,0.04)'
            : 'linear-gradient(135deg, rgba(138,43,226,0.25), rgba(0,255,255,0.1))',
          border: item.comingSoon ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(138,43,226,0.3)',
        }}
      >
        <span className={item.comingSoon ? 'opacity-30' : 'opacity-80'}>
          {item.icon}
        </span>
      </div>
      <div className="flex-1 text-left min-w-0">
        <p className={`text-sm font-display font-bold tracking-wide ${item.comingSoon ? 'text-white/25' : 'text-white/80'}`}>
          {item.label}
        </p>
        <p className={`text-[10px] font-mono mt-0.5 ${item.comingSoon ? 'text-white/15' : 'text-white/35'}`}>
          {item.description}
        </p>
      </div>
      {item.comingSoon && (
        <span
          className="text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-md flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          soon
        </span>
      )}
      {!item.comingSoon && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="text-neon-purple/30 group-hover:text-neon-purple/60 transition-colors flex-shrink-0">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )}
    </button>
  );
}

export function MorePanel() {
  const { morePanelOpen, closeMoreMenu } = useSocialStore();
  const [showSettings, setShowSettings] = useState(false);

  const items: MenuItem[] = [
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neon-cyan">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
      label: 'How to Play',
      description: 'Rules, roles & game guide',
      comingSoon: true,
    },
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neon-purple">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ),
      label: 'Achievements',
      description: 'Track your milestones',
      comingSoon: true,
    },
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neon-pink">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        </svg>
      ),
      label: 'Season Pass',
      description: 'Rewards & battle pass',
      comingSoon: true,
    },
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-400">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.07 4.93a10 10 0 0 1 1.414 14.142M4.93 4.93A10 10 0 0 0 3.516 19.07" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07M8.46 8.46a5 5 0 0 0 0 7.07" />
        </svg>
      ),
      label: 'Settings',
      description: 'Audio, notifications & more',
      onClick: () => { closeMoreMenu(); setTimeout(() => setShowSettings(true), 250); },
    },
  ];

  return (
    <>
    <AnimatePresence>
      {morePanelOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="more-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[70]"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={closeMoreMenu}
          />

          {/* Panel */}
          <motion.div
            key="more-panel"
            initial={{ x: '-100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed top-0 left-0 bottom-0 z-[80] flex flex-col"
            style={{
              width: 'min(300px, 85vw)',
              background: 'rgba(6, 3, 18, 0.98)',
              borderRight: '1px solid rgba(138,43,226,0.2)',
              boxShadow: '8px 0 40px rgba(0,0,0,0.6), 2px 0 16px rgba(138,43,226,0.08)',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 pt-12 pb-4"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
            >
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-neon-purple/50 mb-0.5">
                  Menu
                </p>
                <h2 className="font-display font-bold text-white/80 text-base tracking-wide">
                  VOID MAFIA
                </h2>
              </div>
              <button
                onClick={closeMoreMenu}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/60 transition-colors"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
              {items.map(item => (
                <MenuRow key={item.label} item={item} />
              ))}
            </div>

            {/* Footer */}
            <div
              className="px-4 py-4"
              style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
            >
              <p className="font-mono text-[9px] text-white/15 text-center tracking-widest uppercase">
                v0.1 · Void Mafia
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
    <SettingsPanel open={showSettings} onClose={() => setShowSettings(false)} />
    </>
  );
}
