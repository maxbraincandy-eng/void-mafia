import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CoinPackage {
  id: string;
  coins: number;
  price: number;
  label: string;
  bonus: string;
}

const RARITY_GLOW: Record<number, string> = {
  0: 'rgba(255,255,255,0.06)',
  1: 'rgba(0,229,255,0.1)',
  2: 'rgba(155,0,255,0.15)',
  3: 'rgba(255,180,0,0.2)',
};

interface Props {
  open: boolean;
  onClose: () => void;
  profileId: string;
}

export function CoinShopModal({ open, onClose, profileId }: Props) {
  const [packages, setPackages] = useState<CoinPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/shop/packages')
      .then(r => r.json())
      .then(data => setPackages(data.packages ?? []))
      .catch(() => setError('Failed to load packages.'))
      .finally(() => setLoading(false));
  }, [open]);

  const handleBuy = async (pkg: CoinPackage) => {
    if (buying) return;
    setBuying(pkg.id);
    setError(null);
    try {
      const res = await fetch('/api/shop/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: pkg.id, profileId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? 'Checkout failed. Try again.');
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBuying(null);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="shop-backdrop"
            className="fixed inset-0 z-[150]"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            key="shop-panel"
            className="fixed inset-x-0 bottom-0 z-[160] rounded-t-3xl overflow-hidden"
            style={{
              background: 'rgba(6,3,18,0.98)',
              border: '1px solid rgba(255,180,0,0.15)',
              boxShadow: '0 -8px 60px rgba(255,180,0,0.08)',
              maxHeight: '90vh',
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            <div className="overflow-y-auto max-h-[88vh] pb-8">
              {/* Header */}
              <div className="sticky top-0 z-10 flex items-center justify-between px-5 pt-5 pb-4"
                style={{ background: 'rgba(6,3,18,0.96)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xl">🪙</span>
                    <h2 className="font-display text-lg font-bold text-amber-400 tracking-widest uppercase">
                      Coin Shop
                    </h2>
                  </div>
                  <p className="font-mono text-[10px] text-white/25 tracking-widest">
                    Buy coins to send gifts
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/60 transition-colors"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  ✕
                </button>
              </div>

              <div className="px-4 pt-4 space-y-3">
                {/* Trust indicators */}
                <div className="flex items-center justify-center gap-4 pb-1">
                  {['🔒 Secure', '⚡ Instant', '💳 Stripe'].map(t => (
                    <span key={t} className="font-mono text-[9px] text-white/25 uppercase tracking-widest">{t}</span>
                  ))}
                </div>

                {loading && (
                  <div className="py-12 text-center text-white/30 font-mono text-sm">Loading packages…</div>
                )}

                {error && (
                  <div className="py-4 text-center text-neon-red font-mono text-xs">{error}</div>
                )}

                {!loading && packages.map((pkg, i) => (
                  <motion.button
                    key={pkg.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    onClick={() => handleBuy(pkg)}
                    disabled={!!buying}
                    className="w-full text-left rounded-2xl p-4 transition-all active:scale-[0.98] disabled:opacity-50"
                    style={{
                      background: i === 2 ? 'rgba(155,0,255,0.06)' : 'rgba(255,255,255,0.03)',
                      border: i === 2
                        ? '1px solid rgba(155,0,255,0.3)'
                        : i === 3
                        ? '1px solid rgba(255,180,0,0.25)'
                        : '1px solid rgba(255,255,255,0.07)',
                      boxShadow: RARITY_GLOW[i] ? `0 0 24px ${RARITY_GLOW[i]}` : undefined,
                    }}
                  >
                    <div className="flex items-center gap-4">
                      {/* Coin icon */}
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl"
                        style={{
                          background: i >= 2
                            ? 'linear-gradient(135deg, rgba(255,180,0,0.15), rgba(155,0,255,0.15))'
                            : 'rgba(255,255,255,0.04)',
                          border: i >= 2 ? '1px solid rgba(255,180,0,0.2)' : '1px solid rgba(255,255,255,0.06)',
                        }}
                      >
                        🪙
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-display text-base font-bold text-white">{pkg.label}</p>
                          {pkg.bonus && (
                            <span className="font-mono text-[8px] uppercase tracking-widest px-1.5 py-0.5 rounded-full text-amber-400"
                              style={{ background: 'rgba(255,180,0,0.1)', border: '1px solid rgba(255,180,0,0.2)' }}>
                              {pkg.bonus}
                            </span>
                          )}
                          {i === 2 && (
                            <span className="font-mono text-[8px] uppercase tracking-widest px-1.5 py-0.5 rounded-full text-neon-purple"
                              style={{ background: 'rgba(155,0,255,0.1)', border: '1px solid rgba(155,0,255,0.25)' }}>
                              Popular
                            </span>
                          )}
                        </div>
                        <p className="font-mono text-xs text-white/35 mt-0.5">
                          {(pkg.coins).toLocaleString()} coins
                          {pkg.bonus ? ' including bonus' : ''}
                        </p>
                      </div>

                      {/* Price */}
                      <div className="text-right flex-shrink-0">
                        {buying === pkg.id ? (
                          <div className="w-5 h-5 border-2 border-amber-400/40 border-t-amber-400 rounded-full animate-spin" />
                        ) : (
                          <p className="font-display text-lg font-bold text-amber-400">
                            ${(pkg.price / 100).toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.button>
                ))}

                {/* Disclaimer */}
                <p className="text-center font-mono text-[9px] text-white/15 leading-relaxed pt-2 px-2">
                  Coins are non-refundable and cannot be exchanged for real money.
                  Purchases are processed securely via Stripe.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
