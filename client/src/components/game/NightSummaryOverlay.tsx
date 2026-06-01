import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NightSummary } from '@/types/index';

interface Props {
  summary: NightSummary | null;
  onDismiss: () => void;
}

const RARITY_COLORS: Record<string, string> = {
  eliminated: 'rgba(255,30,60,0.8)',
  saved:      'rgba(0,229,255,0.8)',
  quiet:      'rgba(255,255,255,0.5)',
};

export function NightSummaryOverlay({ summary, onDismiss }: Props) {
  useEffect(() => {
    if (!summary) return;
    const id = setTimeout(onDismiss, 5000);
    return () => clearTimeout(id);
  }, [summary, onDismiss]);

  return (
    <AnimatePresence>
      {summary && (
        <motion.div
          key="night-summary"
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-[55] w-full max-w-sm px-4 cursor-pointer"
          onClick={onDismiss}
        >
          <div
            className="rounded-2xl border border-white/10 bg-black/90 backdrop-blur-2xl px-5 py-4"
            style={{ boxShadow: '0 0 40px rgba(0,0,0,0.7), 0 0 1px rgba(255,255,255,0.08)' }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🌅</span>
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">
                Night {summary.day} Report
              </p>
            </div>

            {/* Stats row */}
            <div className="flex gap-3 mb-3">
              <div className="flex-1 rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-center">
                <p className="font-display text-lg font-bold text-white">{summary.totalTargeted}</p>
                <p className="font-mono text-[9px] text-white/35 uppercase tracking-wider mt-0.5">targeted</p>
              </div>
              {summary.saved && (
                <div className="flex-1 rounded-xl border border-neon-cyan/30 bg-neon-cyan/5 px-3 py-2 text-center">
                  <p className="font-display text-lg font-bold text-neon-cyan">1</p>
                  <p className="font-mono text-[9px] text-neon-cyan/60 uppercase tracking-wider mt-0.5">saved</p>
                </div>
              )}
              <div
                className="flex-1 rounded-xl px-3 py-2 text-center"
                style={{
                  border: summary.eliminated.length > 0 ? '1px solid rgba(255,30,60,0.35)' : '1px solid rgba(255,255,255,0.08)',
                  background: summary.eliminated.length > 0 ? 'rgba(255,30,60,0.06)' : 'rgba(255,255,255,0.03)',
                }}
              >
                <p
                  className="font-display text-lg font-bold"
                  style={{ color: summary.eliminated.length > 0 ? 'rgba(255,60,80,1)' : 'rgba(255,255,255,0.5)' }}
                >
                  {summary.eliminated.length}
                </p>
                <p className="font-mono text-[9px] uppercase tracking-wider mt-0.5"
                  style={{ color: summary.eliminated.length > 0 ? 'rgba(255,60,80,0.5)' : 'rgba(255,255,255,0.25)' }}
                >
                  eliminated
                </p>
              </div>
            </div>

            {/* Eliminated names */}
            {summary.eliminated.length > 0 && (
              <div className="space-y-1">
                {summary.eliminated.map((v, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-neon-red/8 border border-neon-red/20">
                    <span className="text-xs">💀</span>
                    <span className="font-mono text-[11px] text-white/80">{v.name}</span>
                  </div>
                ))}
              </div>
            )}

            {summary.eliminated.length === 0 && (
              <p className="font-mono text-[11px] text-white/30 text-center py-1">
                {summary.saved ? 'A protected soul survived.' : 'The night passed quietly.'}
              </p>
            )}

            <p className="font-mono text-[9px] text-white/15 text-center mt-2">tap to dismiss</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
