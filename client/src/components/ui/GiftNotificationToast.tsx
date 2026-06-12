import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GiftReceivedNotification } from '@/types/index';

const RARITY_STYLES: Record<string, { border: string; glow: string; label: string }> = {
  common:    { border: 'rgba(255,255,255,0.18)', glow: 'rgba(255,255,255,0.08)', label: 'text-white/40' },
  uncommon:  { border: 'rgba(0,229,255,0.35)',   glow: 'rgba(0,229,255,0.12)',   label: 'text-neon-cyan/70' },
  rare:      { border: 'rgba(155,0,255,0.45)',   glow: 'rgba(155,0,255,0.18)',   label: 'text-purple-400' },
  epic:      { border: 'rgba(255,0,204,0.55)',   glow: 'rgba(255,0,204,0.22)',   label: 'text-pink-400' },
  legendary: { border: 'rgba(255,180,0,0.65)',   glow: 'rgba(255,180,0,0.32)',   label: 'text-yellow-400' },
};

interface Props {
  notification: GiftReceivedNotification | null;
  onDismiss: () => void;
}

export function GiftNotificationToast({ notification, onDismiss }: Props) {
  useEffect(() => {
    if (!notification) return;
    const id = setTimeout(onDismiss, 5000);
    return () => clearTimeout(id);
  }, [notification, onDismiss]);

  return (
    <AnimatePresence>
      {notification && (
        <motion.div
          key={`${notification.giftId}-${notification.senderName}`}
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 60 }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          className="fixed bottom-28 right-4 z-[80] cursor-pointer max-w-[260px]"
          onClick={onDismiss}
        >
          {(() => {
            const style = RARITY_STYLES[notification.giftRarity] ?? RARITY_STYLES.common;
            return (
              <div
                className="rounded-2xl backdrop-blur-2xl px-4 py-3 flex items-center gap-3"
                style={{
                  background: 'rgba(8,4,20,0.96)',
                  border: `1px solid ${style.border}`,
                  boxShadow: `0 0 30px ${style.glow}`,
                }}
              >
                {notification.giftImageUrl
                  ? <img src={notification.giftImageUrl} alt={notification.giftName} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                  : <span className="text-3xl flex-shrink-0">{notification.giftIcon}</span>}
                <div className="min-w-0">
                  <p className={`font-mono text-[9px] uppercase tracking-[0.15em] ${style.label}`}>
                    Gift received · {notification.giftRarity}
                  </p>
                  <p className="font-display text-sm font-bold text-white leading-tight">{notification.giftName}</p>
                  <p className="font-mono text-[10px] text-white/40 truncate mt-0.5">
                    from {notification.senderName}
                  </p>
                  {notification.message && (
                    <p className="font-mono text-[9px] text-white/25 truncate italic mt-0.5">
                      "{notification.message}"
                    </p>
                  )}
                </div>
              </div>
            );
          })()}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
