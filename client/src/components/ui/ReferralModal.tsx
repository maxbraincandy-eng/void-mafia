import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { emitWithAck } from '@/lib/socket';
import type { Res } from '@/types/index';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ReferralModal({ open, onClose }: Props) {
  const { profile } = useAuthStore();
  const [copied, setCopied] = useState(false);
  const [referralCount, setReferralCount] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !profile?.friendCode) return;
    emitWithAck<void, Res<number>>('profile:referral_count' as any)
      .then(res => { if (res.ok) setReferralCount(res.data); })
      .catch(() => {});
  }, [open, profile?.friendCode]);

  const referralLink = profile?.friendCode
    ? `https://voidmafia.one/?ref=${profile.friendCode}`
    : '';

  const handleCopy = () => {
    if (!referralLink) return;
    navigator.clipboard?.writeText(referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="ref-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90]"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={onClose}
          />
          <motion.div
            key="ref-panel"
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            className="fixed bottom-0 left-0 right-0 z-[100] rounded-t-2xl"
            style={{
              background: 'rgba(6,3,18,0.98)',
              border: '1px solid rgba(138,43,226,0.2)',
              borderBottom: 'none',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
              paddingBottom: 'env(safe-area-inset-bottom, 16px)',
            }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-9 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-2 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div>
                <h2 className="font-display font-bold text-white/85 text-base tracking-wide">Invite Friends</h2>
                <p className="text-[10px] font-mono text-white/35 mt-0.5">Earn 250 coins for every friend you invite</p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/60 transition-colors"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="px-5 py-5 space-y-4">
              {/* Stats row */}
              <div className="flex gap-3">
                <div
                  className="flex-1 rounded-xl p-3 text-center"
                  style={{ background: 'rgba(155,0,255,0.1)', border: '1px solid rgba(155,0,255,0.25)' }}
                >
                  <p className="text-xl font-display font-bold" style={{ color: '#c084fc' }}>
                    {referralCount ?? '—'}
                  </p>
                  <p className="text-[9px] font-mono text-white/35 uppercase tracking-widest mt-0.5">Friends Invited</p>
                </div>
                <div
                  className="flex-1 rounded-xl p-3 text-center"
                  style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.2)' }}
                >
                  <p className="text-xl font-display font-bold" style={{ color: '#00ff88' }}>
                    {referralCount != null ? referralCount * 250 : '—'}
                  </p>
                  <p className="text-[9px] font-mono text-white/35 uppercase tracking-widest mt-0.5">Coins Earned</p>
                </div>
              </div>

              {/* Link row */}
              <div>
                <p className="text-[9px] font-mono text-white/30 uppercase tracking-widest mb-2">Your Referral Link</p>
                <div className="flex items-center gap-2">
                  <p
                    className="flex-1 text-[11px] font-mono text-white/45 truncate px-3 py-2.5 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    {referralLink}
                  </p>
                  <button
                    onClick={handleCopy}
                    className="px-4 py-2.5 rounded-xl font-mono text-[11px] font-bold transition-all flex-shrink-0"
                    style={copied ? {
                      background: 'rgba(0,255,136,0.15)',
                      border: '1px solid rgba(0,255,136,0.4)',
                      color: '#00ff88',
                    } : {
                      background: 'rgba(155,0,255,0.18)',
                      border: '1px solid rgba(155,0,255,0.4)',
                      color: '#c084fc',
                    }}
                  >
                    {copied ? '✓ Copied!' : 'Copy Link'}
                  </button>
                </div>
              </div>

              {/* How it works */}
              <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-[9px] font-mono text-white/30 uppercase tracking-widest mb-2">How it works</p>
                <div className="space-y-1.5">
                  {[
                    '1. Share your link with friends',
                    '2. They sign up using your link',
                    '3. You both get 250 coins instantly',
                  ].map(step => (
                    <p key={step} className="text-[11px] font-mono text-white/45">{step}</p>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
