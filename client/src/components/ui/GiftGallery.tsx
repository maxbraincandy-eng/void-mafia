import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import type { PlayerGift, GiftDetail, Res } from '@/types/index';

const RARITY_COLOR: Record<string, string> = {
  common:    'rgba(255,255,255,0.12)',
  uncommon:  'rgba(0,229,255,0.18)',
  rare:      'rgba(155,0,255,0.25)',
  epic:      'rgba(255,0,204,0.32)',
  legendary: 'rgba(255,180,0,0.40)',
};
const RARITY_BORDER: Record<string, string> = {
  common:    'rgba(255,255,255,0.10)',
  uncommon:  'rgba(0,229,255,0.22)',
  rare:      'rgba(155,0,255,0.35)',
  epic:      'rgba(255,0,204,0.42)',
  legendary: 'rgba(255,180,0,0.55)',
};
const RARITY_TEXT: Record<string, string> = {
  common:    'text-white/50',
  uncommon:  'text-neon-cyan',
  rare:      'text-neon-purple',
  epic:      'text-neon-pink',
  legendary: 'text-amber-400',
};

function Stars({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={`text-[8px] ${i < n ? 'text-amber-400' : 'text-white/10'}`}>★</span>
      ))}
    </div>
  );
}

function GiftDetailModal({ gift, recipientId, onClose }: { gift: PlayerGift; recipientId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<GiftDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    emitWithAck<any, Res<GiftDetail>>('gifts:detail', { giftId: gift.giftId, recipientId })
      .then(res => { if (res.ok) setDetail(res.data); })
      .finally(() => setLoading(false));
  }, [gift.giftId, recipientId]);

  const borderColor = RARITY_BORDER[gift.giftRarity] ?? RARITY_BORDER.common;
  const bgColor     = RARITY_COLOR[gift.giftRarity]  ?? RARITY_COLOR.common;

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-3 pb-4 sm:pb-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-sm rounded-2xl p-5 relative"
        style={{ background: 'rgba(8,4,20,0.97)', border: `1px solid ${borderColor}`, boxShadow: `0 0 40px ${bgColor}` }}
        initial={{ y: 60, scale: 0.93 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 60, scale: 0.93 }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-3 right-3 text-white/30 hover:text-white/60 text-sm">✕</button>

        <div className="text-center mb-4">
          <div className="text-5xl mb-2">{gift.giftIcon}</div>
          <h3 className="font-display font-bold text-white text-base">{gift.giftName}</h3>
          <Stars n={gift.giftStars} />
          <span className={`font-mono text-[10px] uppercase tracking-widest mt-1 inline-block ${RARITY_TEXT[gift.giftRarity] ?? ''}`}>
            {gift.giftRarity}
          </span>
        </div>

        {loading && <p className="text-center text-white/30 font-mono text-xs py-4">Loading...</p>}

        {detail && (
          <div>
            {detail.description && (
              <p className="text-white/40 font-mono text-xs text-center mb-3">{detail.description}</p>
            )}
            <p className="font-mono text-[10px] uppercase tracking-widest text-white/30 mb-2">
              Sent by ({detail.totalSent})
            </p>
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {detail.senders.map((s, i) => (
                <div key={i} className="flex items-center gap-2.5 rounded-xl px-3 py-2"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-base flex-shrink-0 bg-white/5 overflow-hidden">
                    {s.senderAvatarUrl
                      ? <img src={s.senderAvatarUrl} alt="" className="w-full h-full object-cover" />
                      : <span>{s.senderAvatar}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-white/80 font-bold truncate">{s.senderUsername}</p>
                    {s.message && <p className="font-mono text-[10px] text-white/35 truncate italic">"{s.message}"</p>}
                    <p className="font-mono text-[9px] text-white/20">{new Date(s.sentAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
              {detail.senders.length === 0 && (
                <p className="text-white/20 font-mono text-xs text-center py-2">No sender info available.</p>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

interface Props {
  profileId: string;
}

export function GiftGallery({ profileId }: Props) {
  const [gifts, setGifts] = useState<PlayerGift[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PlayerGift | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await emitWithAck<any, Res<PlayerGift[]>>('gifts:player_gifts', { profileId });
      if (res.ok) setGifts(res.data);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => { load(); }, [load]);

  // Deduplicate by giftId — show the gift card once, even if received multiple times
  const uniqueGifts = gifts.reduce<PlayerGift[]>((acc, g) => {
    if (!acc.find(x => x.giftId === g.giftId)) acc.push(g);
    return acc;
  }, []);

  if (loading) return (
    <div className="py-6 text-center">
      <p className="text-white/20 font-mono text-xs">Loading gifts...</p>
    </div>
  );

  if (uniqueGifts.length === 0) return (
    <div className="py-6 text-center">
      <p className="text-white/15 font-mono text-xs">No gifts yet</p>
    </div>
  );

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {uniqueGifts.map(g => {
          const count = gifts.filter(x => x.giftId === g.giftId).length;
          return (
            <motion.button
              key={g.giftId}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setSelected(g)}
              className="relative rounded-xl p-3 flex flex-col items-center gap-1"
              style={{
                background: RARITY_COLOR[g.giftRarity] ?? RARITY_COLOR.common,
                border: `1px solid ${RARITY_BORDER[g.giftRarity] ?? RARITY_BORDER.common}`,
              }}
            >
              <span className="text-2xl">{g.giftIcon}</span>
              <span className="font-mono text-[9px] text-white/60 truncate max-w-full">{g.giftName}</span>
              <Stars n={g.giftStars} />
              {count > 1 && (
                <span className="absolute -top-1 -right-1 bg-neon-cyan text-void text-[8px] font-bold rounded-full min-w-[14px] h-3.5 flex items-center justify-center px-0.5">
                  ×{count}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence>
        {selected && (
          <GiftDetailModal gift={selected} recipientId={profileId} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </>
  );
}
