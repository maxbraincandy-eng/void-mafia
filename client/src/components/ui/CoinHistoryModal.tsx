import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import type { CoinTransaction, TxType } from '@/types/index';

type Res<T> = { ok: true; data: T } | { ok: false; error: string };

const TX_CONFIG: Partial<Record<TxType, { icon: string; positiveColor: string; negativeColor: string; bg: string; label: string }>> = {
  grant:         { icon: '🪙', positiveColor: 'text-amber-400',  negativeColor: 'text-amber-400',  bg: 'rgba(255,180,0,0.10)',   label: 'Granted' },
  deduct:        { icon: '↓',  positiveColor: 'text-red-400',    negativeColor: 'text-red-400',    bg: 'rgba(255,60,60,0.09)',   label: 'Deducted' },
  gift_sent:     { icon: '🎁', positiveColor: 'text-neon-pink',  negativeColor: 'text-neon-pink',  bg: 'rgba(255,0,204,0.09)',   label: 'Gift Sent' },
  gift_received: { icon: '🎁', positiveColor: 'text-neon-cyan',  negativeColor: 'text-neon-cyan',  bg: 'rgba(0,229,255,0.09)',   label: 'Gift' },
  daily_reward:  { icon: '☀️', positiveColor: 'text-yellow-400', negativeColor: 'text-yellow-400', bg: 'rgba(255,210,0,0.09)',   label: 'Daily Reward' },
  refund:        { icon: '↩',  positiveColor: 'text-neon-green', negativeColor: 'text-neon-green', bg: 'rgba(0,255,128,0.09)',   label: 'Refund' },
};

const FALLBACK_CFG = { icon: '·', positiveColor: 'text-white/50', negativeColor: 'text-white/50', bg: 'rgba(255,255,255,0.05)', label: '' };

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CoinHistoryModal({ open, onClose }: Props) {
  const [txs, setTxs]       = useState<CoinTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]    = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    emitWithAck<Record<string, never>, Res<CoinTransaction[]>>('coins:transactions', {})
      .then(res => {
        if (res.ok) {
          setTxs(res.data);
          if (res.data.length > 0) setBalance(res.data[0]!.balanceAfter);
        } else {
          setError(res.error);
        }
      })
      .catch(() => setError('Connection error — please try again.'))
      .finally(() => setLoading(false));
  }, [open]);

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
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
            style={{
              background: 'rgba(6,3,18,0.98)',
              border: '1px solid rgba(255,180,0,0.14)',
              boxShadow: '0 -8px 60px rgba(255,180,0,0.06)',
              maxHeight: '80vh',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/6 flex-shrink-0">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-amber-400/50 mb-0.5">Wallet</p>
                <div className="flex items-center gap-2">
                  <h2 className="font-display font-bold text-white text-base">Coin History</h2>
                  {balance !== null && (
                    <span
                      className="font-mono text-xs text-amber-400 px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(255,180,0,0.12)', border: '1px solid rgba(255,180,0,0.25)' }}
                    >
                      {balance.toLocaleString()} 🪙
                    </span>
                  )}
                </div>
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

            {/* Transaction list */}
            <div className="flex-1 overflow-y-auto">
              {loading && (
                <div className="flex justify-center py-12">
                  <div className="w-6 h-6 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                </div>
              )}

              {!loading && error && (
                <div className="text-center py-10">
                  <p className="font-mono text-sm text-red-400/60 mb-3">{error}</p>
                  <button
                    onClick={() => { setLoading(true); setError(null); }}
                    className="font-mono text-[10px] uppercase tracking-widest text-neon-cyan/60 hover:text-neon-cyan transition-colors"
                  >
                    Retry
                  </button>
                </div>
              )}

              {!loading && !error && txs.length === 0 && (
                <div className="text-center py-14">
                  <p className="text-4xl mb-3">🪙</p>
                  <p className="font-mono text-sm text-white/20">No transactions yet.</p>
                </div>
              )}

              {!loading && !error && txs.length > 0 && (
                <div>
                  {txs.map((tx, i) => {
                    const cfg = TX_CONFIG[tx.type] ?? FALLBACK_CFG;
                    const isPositive = tx.amount >= 0;
                    const amountColor = isPositive ? cfg.positiveColor : cfg.negativeColor;
                    return (
                      <div
                        key={tx.id}
                        className="flex items-center gap-3 px-4 py-3"
                        style={{ borderBottom: i < txs.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                      >
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                          style={{ background: cfg.bg, border: '1px solid rgba(255,255,255,0.07)' }}
                        >
                          {cfg.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-[11px] text-white/65 truncate leading-tight">
                            {tx.description || cfg.label}
                          </p>
                          <p className="font-mono text-[9px] text-white/22 mt-0.5">
                            {new Date(tx.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            <span className="mx-1 text-white/15">·</span>
                            <span className="text-amber-400/40">{tx.balanceAfter.toLocaleString()} 🪙</span>
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`font-display font-bold text-sm ${amountColor}`}>
                            {isPositive ? '+' : ''}{tx.amount.toLocaleString()}
                          </p>
                          <p className="font-mono text-[8px] text-white/20 uppercase tracking-wider mt-0.5">
                            {cfg.label || tx.type}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            {txs.length > 0 && (
              <div
                className="px-5 py-3 flex-shrink-0"
                style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
              >
                <p className="font-mono text-[9px] text-white/15 text-center">
                  Last {txs.length} transactions
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
