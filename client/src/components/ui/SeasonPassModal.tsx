import { motion, AnimatePresence } from 'framer-motion';
import { useT } from '@/store/langStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

const FREE_TIERS = [
  { tier: 1, reward: '🦉 ტიტული: "Void Wanderer"',   xp: 0 },
  { tier: 2, reward: '✨ XP Boost x1.5 (24 სთ)',       xp: 500 },
  { tier: 3, reward: '🖼 Avatar Frame: "Neon Void"',   xp: 1200 },
];

const PREMIUM_TIERS = [
  { tier: 4, reward: '🎭 Animated Title: "Void Legend"', xp: 2500 },
  { tier: 5, reward: '🪙 500 Coins',                     xp: 4000 },
  { tier: 6, reward: '🔮 Exclusive Avatar: "Phantom"',   xp: 6000 },
  { tier: 7, reward: '🏆 Badge: "Season 1 Veteran"',     xp: 10000 },
];

export function SeasonPassModal({ open, onClose }: Props) {
  const tr = useT();
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="sp-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90]"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
            onClick={onClose}
          />
          <motion.div
            key="sp-panel"
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed bottom-0 left-0 right-0 z-[100] flex flex-col rounded-t-3xl overflow-hidden"
            style={{
              maxHeight: '90vh',
              background: 'rgba(6,3,18,0.99)',
              border: '1px solid rgba(138,43,226,0.25)',
              borderBottom: 'none',
            }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/15" />
            </div>

            {/* Header */}
            <div className="px-5 pt-2 pb-4 flex-shrink-0 border-b border-white/5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[12px] font-mono uppercase tracking-[0.25em] text-neon-purple/50">Season Pass</span>
                    <span className="text-[12px] font-mono px-2 py-0.5 rounded-full uppercase tracking-widest"
                      style={{ background: 'rgba(138,43,226,0.15)', border: '1px solid rgba(138,43,226,0.3)', color: 'rgba(138,43,226,0.8)' }}>
                      {tr.uiMisc.soon}
                    </span>
                  </div>
                  <h2 className="font-display font-bold text-white/90 text-lg tracking-wide">Season 1</h2>
                  <p className="text-xs font-mono text-neon-purple/60 mt-0.5">Void Rising</p>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/60 mt-1"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
              {/* Free Pass */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-display font-bold uppercase tracking-widest text-white/50">Free Pass</span>
                  <div className="flex-1 h-px bg-white/5" />
                </div>
                <div className="space-y-2">
                  {FREE_TIERS.map(t => (
                    <div key={t.tier} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 font-mono text-xs font-bold text-white/40"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        {t.tier}
                      </div>
                      <span className="text-sm font-mono text-white/70 flex-1">{(tr.uiMisc as unknown as Record<string,string>)[`sp_${t.tier}`] ?? t.reward}</span>
                      {t.xp > 0 && (
                        <span className="text-[12px] font-mono text-white/25">{t.xp} XP</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Premium Pass */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-display font-bold uppercase tracking-widest text-neon-purple/60">Premium Pass</span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(138,43,226,0.15)' }} />
                  <span className="text-[12px] font-mono px-2 py-0.5 rounded-full text-neon-purple/50"
                    style={{ background: 'rgba(138,43,226,0.08)', border: '1px solid rgba(138,43,226,0.15)' }}>
                    🔒 {tr.uiMisc.soon}
                  </span>
                </div>
                <div className="space-y-2 opacity-40">
                  {PREMIUM_TIERS.map(t => (
                    <div key={t.tier} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                      style={{ background: 'rgba(138,43,226,0.05)', border: '1px solid rgba(138,43,226,0.12)' }}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 font-mono text-xs font-bold"
                        style={{ background: 'rgba(138,43,226,0.1)', border: '1px solid rgba(138,43,226,0.2)', color: 'rgba(138,43,226,0.7)' }}>
                        {t.tier}
                      </div>
                      <span className="text-sm font-mono text-white/70 flex-1">{(tr.uiMisc as unknown as Record<string,string>)[`sp_${t.tier}`] ?? t.reward}</span>
                      <span className="text-[12px] font-mono text-white/25">{t.xp} XP</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[12px] font-mono text-white/20 text-center pb-2">
                {tr.uiMisc.premiumSoon}
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
