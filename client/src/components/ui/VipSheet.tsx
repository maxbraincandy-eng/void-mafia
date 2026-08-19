import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useVipPerks, useMyTier } from '@/store/vipStore';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';

/**
 * What the badge buys — the pitch.
 *
 * Every row here comes from the server, which generates the list from the same
 * table it enforces (server vipService.ts). Nothing is written down twice, so
 * this sheet cannot promise a limit that is not actually granted — the failure
 * mode of every hand-written pricing page.
 *
 * There is no BUY button yet, on purpose. Payments are not wired up, and a
 * button that does nothing teaches people that buttons here do nothing. It says
 * how to get one today, which is the truth.
 */
export function VipSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const perks = useVipPerks();
  const tier = useMyTier();
  const mine = tier !== 'free';

  if (!open) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="vip-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
      >
        <motion.div
          initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          onClick={e => e.stopPropagation()}
          className="w-full sm:max-w-md max-h-[86vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl"
          style={{
            background: 'linear-gradient(170deg, #17102b 0%, #0d0a17 60%, #0a0810 100%)',
            border: '1px solid rgba(167,139,250,0.28)',
            boxShadow: '0 -8px 60px rgba(124,58,237,0.28)',
          }}
        >
          {/* Header */}
          <div className="px-5 pt-5 pb-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <VerifiedBadge size={22} tone="staff" />
              <h2 className="font-display font-bold text-white" style={{ fontSize: 21 }}>ვერიფიკაცია</h2>
            </div>
            <p className="font-mono text-white/40" style={{ fontSize: 12, lineHeight: 1.5 }}>
              {mine
                ? 'ეს ყველაფერი უკვე შენია 💠'
                : 'ლურჯი ნიშანი და ყველაფერი, რაც მას მოჰყვება'}
            </p>
          </div>

          {/* The table. Three columns rather than a tick-list, because "what do
              I have now" is the question a tick-list cannot answer. */}
          <div className="px-3 pb-3">
            <div
              className="rounded-2xl overflow-hidden"
              style={{ border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <div
                className="grid items-center px-3 py-2"
                style={{ gridTemplateColumns: '1fr 74px 84px', background: 'rgba(255,255,255,0.03)' }}
              >
                <span className="font-mono text-white/30" style={{ fontSize: 10 }} />
                <span className="font-mono text-white/30 text-center" style={{ fontSize: 10 }}>უფასო</span>
                <span className="font-mono text-center" style={{ fontSize: 10, color: '#a78bfa' }}>ვერიფიც.</span>
              </div>

              {perks.length === 0 && (
                <div className="px-3 py-6 text-center">
                  <p className="font-mono text-white/25" style={{ fontSize: 11 }}>იტვირთება…</p>
                </div>
              )}

              {perks.map((p, i) => (
                <div
                  key={p.title}
                  className="grid items-center px-3 py-2.5"
                  style={{
                    gridTemplateColumns: '1fr 74px 84px',
                    borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <span className="font-display text-white/85 min-w-0 pr-2" style={{ fontSize: 12.5, lineHeight: 1.25 }}>
                    <span style={{ marginRight: 6 }}>{p.icon}</span>{p.title}
                  </span>
                  <span className="font-mono text-white/32 text-center" style={{ fontSize: 10.5, lineHeight: 1.25 }}>{p.free}</span>
                  <span
                    className="font-mono text-center rounded-lg py-1"
                    style={{ fontSize: 10.5, lineHeight: 1.25, color: '#c4b5fd', background: 'rgba(167,139,250,0.1)' }}
                  >{p.vip}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 pb-6 pt-1">
            {perks.length === 0 ? null : mine ? (
              <button
                onClick={onClose}
                className="w-full py-3 rounded-2xl font-display font-bold active:scale-[0.98]"
                style={{ fontSize: 14, background: 'rgba(167,139,250,0.16)', color: '#c4b5fd', border: '1px solid rgba(167,139,250,0.35)' }}
              >კარგი</button>
            ) : (
              <>
                <p className="font-mono text-white/35 text-center mb-3" style={{ fontSize: 11, lineHeight: 1.6 }}>
                  გამოწერა ჯერ არ არის ჩართული.<br />
                  ვერიფიკაციას ამჟამად ადმინისტრაცია ანიჭებს.
                </p>
                <button
                  onClick={onClose}
                  className="w-full py-3 rounded-2xl font-display font-bold active:scale-[0.98]"
                  style={{ fontSize: 14, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.1)' }}
                >დახურვა</button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
