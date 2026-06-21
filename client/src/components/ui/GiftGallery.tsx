import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { emitWithAck, socket } from '@/lib/socket';
import type { PlayerGift, GiftDetail, GiftTimelineEntry, GiftStats, PinnedGiftEntry, Res } from '@/types/index';

const RARITY_COLOR: Record<string, string> = {
  common:    'rgba(255,255,255,0.10)',
  uncommon:  'rgba(0,229,255,0.15)',
  rare:      'rgba(155,0,255,0.22)',
  epic:      'rgba(255,0,204,0.28)',
  legendary: 'rgba(255,180,0,0.35)',
};
const RARITY_BORDER: Record<string, string> = {
  common:    'rgba(255,255,255,0.10)',
  uncommon:  'rgba(0,229,255,0.22)',
  rare:      'rgba(155,0,255,0.35)',
  epic:      'rgba(255,0,204,0.42)',
  legendary: 'rgba(255,180,0,0.55)',
};
const RARITY_TEXT: Record<string, string> = {
  common: 'text-white/50', uncommon: 'text-neon-cyan', rare: 'text-neon-purple',
  epic:   'text-neon-pink', legendary: 'text-amber-400',
};
const RARITY_GLOW: Record<string, string> = {
  common:    'rgba(255,255,255,0.08)',
  uncommon:  'rgba(0,229,255,0.12)',
  rare:      'rgba(155,0,255,0.18)',
  epic:      'rgba(255,0,204,0.22)',
  legendary: 'rgba(255,180,0,0.32)',
};

function Stars({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={`text-[12px] ${i < n ? 'text-amber-400' : 'text-white/10'}`}>★</span>
      ))}
    </div>
  );
}

function Avatar({ avatar, avatarUrl, size = 8 }: { avatar: string; avatarUrl?: string | null; size?: number }) {
  const cls = `w-${size} h-${size} rounded-full flex-shrink-0 overflow-hidden bg-white/5 flex items-center justify-center text-sm`;
  return (
    <div className={cls}>
      {avatarUrl
        ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        : <span>{avatar}</span>}
    </div>
  );
}

// ── Gift Detail Modal ───────────────────────────────────────────────────────

function GiftDetailModal({
  gift, recipientId, canPin, isPinned, onClose, onPin, onUnpin, onHide,
}: {
  gift: PlayerGift; recipientId: string; canPin: boolean;
  isPinned: boolean; onClose: () => void;
  onPin: (giftId: string) => void; onUnpin: (giftId: string) => void;
  onHide?: (giftId: string) => void;
}) {
  const [detail, setDetail] = useState<GiftDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinLoading, setPinLoading] = useState(false);
  const [hideLoading, setHideLoading] = useState(false);
  const [hideConfirm, setHideConfirm] = useState(false);

  useEffect(() => {
    setLoading(true);
    emitWithAck<any, Res<GiftDetail>>('gifts:detail', { giftId: gift.giftId, recipientId })
      .then(res => { if (res.ok) setDetail(res.data); })
      .finally(() => setLoading(false));
  }, [gift.giftId, recipientId]);

  const handlePinToggle = async () => {
    setPinLoading(true);
    try {
      if (isPinned) {
        const res = await emitWithAck<any, Res<{}>>('gifts:unpin', { giftId: gift.giftId });
        if (res.ok) onUnpin(gift.giftId);
      } else {
        const res = await emitWithAck<any, Res<{}>>('gifts:pin', { giftId: gift.giftId });
        if (res.ok) onPin(gift.giftId);
      }
    } finally { setPinLoading(false); }
  };

  const handleHide = async () => {
    if (!hideConfirm) { setHideConfirm(true); return; }
    setHideLoading(true);
    try {
      const res = await emitWithAck<any, Res<{}>>('gifts:hide' as any, { giftId: gift.giftId });
      if (res.ok) { onHide?.(gift.giftId); onClose(); }
    } finally { setHideLoading(false); setHideConfirm(false); }
  };

  const borderColor = RARITY_BORDER[gift.giftRarity] ?? RARITY_BORDER.common;
  const bgColor     = RARITY_COLOR[gift.giftRarity]  ?? RARITY_COLOR.common;

  return (
    <motion.div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm px-3 pb-4 sm:pb-0"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-sm rounded-2xl p-5 relative"
        style={{ background: 'rgba(8,4,20,0.97)', border: `1px solid ${borderColor}`, boxShadow: `0 0 40px ${bgColor}` }}
        initial={{ y: 60, scale: 0.93 }} animate={{ y: 0, scale: 1 }} exit={{ y: 60, scale: 0.93 }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-3 right-3 text-white/30 hover:text-white/60 text-sm">✕</button>

        <div className="text-center mb-4">
          {gift.giftImageUrl
            ? <img src={gift.giftImageUrl} alt={gift.giftName} className="w-16 h-16 rounded-xl object-cover mx-auto mb-2" />
            : <div className="text-5xl mb-2">{gift.giftIcon}</div>}
          <h3 className="font-display font-bold text-white text-base">{gift.giftName}</h3>
          <Stars n={gift.giftStars} />
          <span className={`font-mono text-[12px] uppercase tracking-widest mt-1 inline-block ${RARITY_TEXT[gift.giftRarity] ?? ''}`}>
            {gift.giftRarity}
          </span>
        </div>

        {canPin && (
          <div className="flex gap-2 mb-3">
            <button
              onClick={handlePinToggle}
              disabled={pinLoading}
              className={`flex-1 py-2 rounded-xl font-mono text-[12px] uppercase tracking-widest border transition-all ${
                isPinned
                  ? 'bg-amber-400/10 border-amber-400/30 text-amber-400 hover:bg-amber-400/20'
                  : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white/70'
              }`}
            >
              {pinLoading ? '...' : isPinned ? '📌 Unpin' : '📌 Pin'}
            </button>
            <button
              onClick={handleHide}
              disabled={hideLoading}
              className={`flex-1 py-2 rounded-xl font-mono text-[12px] uppercase tracking-widest border transition-all ${
                hideConfirm
                  ? 'bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30'
                  : 'bg-white/3 border-white/8 text-white/25 hover:bg-white/8 hover:text-white/50'
              }`}
            >
              {hideLoading ? '...' : hideConfirm ? '✕ Confirm Hide' : '🗑 Hide Gift'}
            </button>
          </div>
        )}

        {loading && <p className="text-center text-white/30 font-mono text-xs py-4">Loading...</p>}

        {detail && (
          <div>
            {detail.description && (
              <p className="text-white/40 font-mono text-xs text-center mb-3">{detail.description}</p>
            )}
            <p className="font-mono text-[12px] uppercase tracking-widest text-white/30 mb-2">
              Sent by ({detail.totalSent})
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {detail.senders.map((s, i) => (
                <div key={i} className="flex items-center gap-2.5 rounded-xl px-3 py-2"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <Avatar avatar={s.senderAvatar} avatarUrl={s.senderAvatarUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-white/80 font-bold truncate">{s.senderUsername}</p>
                    {s.message && <p className="font-mono text-[12px] text-white/35 truncate italic">"{s.message}"</p>}
                    <p className="font-mono text-[12px] text-white/20">{new Date(s.sentAt).toLocaleDateString()}</p>
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

// ── Pinned Gifts Strip ──────────────────────────────────────────────────────

function PinnedGiftsStrip({ pinned, canManage, onUnpin }: {
  pinned: PinnedGiftEntry[]; canManage: boolean; onUnpin: (giftId: string) => void;
}) {
  if (pinned.length === 0) return null;
  return (
    <div className="mb-4">
      <p className="font-mono text-[12px] uppercase tracking-widest text-amber-400/50 mb-2">📌 Pinned Gifts</p>
      <div className="flex gap-2">
        {pinned.map(g => (
          <div
            key={g.giftId}
            className="relative flex-1 rounded-xl p-2.5 flex flex-col items-center gap-1 max-w-[80px]"
            style={{
              background: RARITY_COLOR[g.giftRarity] ?? RARITY_COLOR.common,
              border: `1px solid ${RARITY_BORDER[g.giftRarity] ?? RARITY_BORDER.common}`,
              boxShadow: `0 0 12px ${RARITY_GLOW[g.giftRarity] ?? RARITY_GLOW.common}`,
            }}
          >
            {g.giftImageUrl
              ? <img src={g.giftImageUrl} alt={g.giftName} className="w-8 h-8 rounded-lg object-cover" />
              : <span className="text-2xl">{g.giftIcon}</span>}
            <span className="font-mono text-[12px] text-white/50 truncate max-w-full text-center">{g.giftName}</span>
            <Stars n={g.giftStars} />
            {canManage && (
              <button
                onClick={() => onUnpin(g.giftId)}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white/10 text-white/40 hover:text-white/80 hover:bg-white/20 flex items-center justify-center text-[12px] transition-colors"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {canManage && pinned.length < 3 && (
          <div className="flex-1 rounded-xl border border-dashed border-white/10 flex items-center justify-center max-w-[80px] min-h-[70px]">
            <span className="text-white/15 text-xs">+</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Gift Stats Panel ────────────────────────────────────────────────────────

function GiftStatsPanel({ stats }: { stats: GiftStats }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[
        { label: 'Received',      value: stats.totalReceived,          color: 'text-neon-cyan' },
        { label: 'Sent',          value: stats.totalSent,              color: 'text-neon-purple' },
        { label: 'Coins Spent',   value: stats.totalSpent.toLocaleString(), color: 'text-amber-400' },
        { label: 'Legendary',     value: stats.legendaryReceivedCount, color: 'text-amber-400' },
        { label: 'Unique Recv',   value: stats.uniqueGiftTypesReceived, color: 'text-neon-green' },
        { label: 'Unique Sent',   value: stats.uniqueGiftTypesSent,    color: 'text-neon-pink' },
      ].map(s => (
        <div key={s.label} className="rounded-xl p-2.5 text-center"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className={`font-display font-bold text-lg ${s.color}`}>{s.value}</p>
          <p className="font-mono text-[12px] text-white/30 mt-0.5">{s.label}</p>
        </div>
      ))}
      {stats.mostReceivedGiftName && (
        <div className="col-span-2 rounded-xl p-2.5"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="font-mono text-[12px] text-white/25 uppercase tracking-wider mb-0.5">Most Received</p>
          <p className="font-mono text-xs text-white/70 font-bold">{stats.mostReceivedGiftName}</p>
        </div>
      )}
      {stats.mostSentGiftName && (
        <div className="col-span-2 rounded-xl p-2.5"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="font-mono text-[12px] text-white/25 uppercase tracking-wider mb-0.5">Most Sent</p>
          <p className="font-mono text-xs text-white/70 font-bold">{stats.mostSentGiftName}</p>
        </div>
      )}
    </div>
  );
}

// ── Timeline Row ────────────────────────────────────────────────────────────

function TimelineRow({ entry, viewerId }: { entry: GiftTimelineEntry; viewerId: string }) {
  const isSender = entry.senderId === viewerId;
  return (
    <div className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0">
      <Avatar avatar={entry.senderAvatar} avatarUrl={entry.senderAvatarUrl} size={7} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 flex-wrap">
          <span className={`font-mono text-[12px] font-bold ${isSender ? 'text-neon-cyan' : 'text-white/70'}`}>
            {entry.senderName}
          </span>
          <span className="font-mono text-[12px] text-white/25">→</span>
          <span className={`font-mono text-[12px] font-bold ${!isSender ? 'text-neon-cyan' : 'text-white/70'}`}>
            {entry.receiverName}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {entry.giftImageUrl
            ? <img src={entry.giftImageUrl} alt={entry.giftName} className="w-5 h-5 rounded object-cover flex-shrink-0" />
            : <span className="text-sm">{entry.giftIcon}</span>}
          <span className={`font-mono text-[12px] ${RARITY_TEXT[entry.giftRarity] ?? 'text-white/50'}`}>{entry.giftName}</span>
          {entry.message && (
            <span className="font-mono text-[12px] text-white/25 italic truncate max-w-[80px]">"{entry.message}"</span>
          )}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-mono text-[12px] text-white/20">{new Date(entry.createdAt).toLocaleDateString()}</p>
        <p className="font-mono text-[12px] text-amber-400/40">{entry.coinCost} 🪙</p>
      </div>
    </div>
  );
}

// ── Main GiftGallery ────────────────────────────────────────────────────────

type Tab = 'received' | 'sent' | 'timeline' | 'stats';

interface Props {
  profileId: string;
  viewerId?: string;
}

export function GiftGallery({ profileId, viewerId }: Props) {
  const [tab, setTab]           = useState<Tab>('received');
  const [received, setReceived] = useState<PlayerGift[]>([]);
  const [sent, setSent]         = useState<PlayerGift[]>([]);
  const [timeline, setTimeline] = useState<GiftTimelineEntry[]>([]);
  const [stats, setStats]       = useState<GiftStats | null>(null);
  const [pinned, setPinned]     = useState<PinnedGiftEntry[]>([]);
  const [selected, setSelected] = useState<PlayerGift | null>(null);
  const [hidden, setHidden]     = useState<Set<string>>(new Set());
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statsLoaded, setStatsLoaded]     = useState(false);
  const [timelineLoaded, setTimelineLoaded] = useState(false);
  const [sentLoaded, setSentLoaded]       = useState(false);

  const isOwn = viewerId === profileId;

  const loadReceived = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [recRes, pinnedRes] = await Promise.all([
        emitWithAck<any, Res<PlayerGift[]>>('gifts:player_gifts', { profileId }),
        emitWithAck<any, Res<PinnedGiftEntry[]>>('gifts:getPinned', { profileId }),
      ]);
      if (recRes.ok) setReceived(recRes.data);
      else setLoadError(!recRes.ok ? (recRes.error ?? 'Failed to load gifts.') : 'Failed to load gifts.');
      if (pinnedRes.ok) setPinned(pinnedRes.data);
    } catch {
      setLoadError('Could not connect — please try again.');
    } finally { setLoading(false); }
  }, [profileId]);

  const loadSent = useCallback(async () => {
    if (sentLoaded) return;
    const res = await emitWithAck<any, Res<PlayerGift[]>>('gifts:getSent', { profileId });
    if (res.ok) setSent(res.data);
    setSentLoaded(true);
  }, [profileId, sentLoaded]);

  const loadTimeline = useCallback(async () => {
    if (timelineLoaded) return;
    const res = await emitWithAck<any, Res<GiftTimelineEntry[]>>('gifts:getTimeline', { profileId });
    if (res.ok) setTimeline(res.data);
    setTimelineLoaded(true);
  }, [profileId, timelineLoaded]);

  const loadStats = useCallback(async () => {
    if (statsLoaded) return;
    const res = await emitWithAck<any, Res<GiftStats>>('gifts:getStats', { profileId });
    if (res.ok) setStats(res.data);
    setStatsLoaded(true);
  }, [profileId, statsLoaded]);

  useEffect(() => { loadReceived(); }, [loadReceived]);

  useEffect(() => {
    if (tab === 'sent')     loadSent();
    if (tab === 'timeline') loadTimeline();
    if (tab === 'stats')    loadStats();
  }, [tab, loadSent, loadTimeline, loadStats]);

  // Real-time: new gift received
  useEffect(() => {
    const handler = () => {
      loadReceived();
      setSentLoaded(false);
      setTimelineLoaded(false);
      setStatsLoaded(false);
    };
    socket.on('gifts:received' as any, handler);
    socket.on('gifts:sent' as any, handler);
    return () => {
      socket.off('gifts:received' as any, handler);
      socket.off('gifts:sent' as any, handler);
    };
  }, [loadReceived]);

  const handlePin = useCallback((giftId: string) => {
    const gift = received.find(g => g.giftId === giftId);
    if (!gift) return;
    setPinned(prev => [
      ...prev,
      { giftId: gift.giftId, giftName: gift.giftName, giftIcon: gift.giftIcon,
        giftImageUrl: gift.giftImageUrl, giftRarity: gift.giftRarity as any,
        giftStars: gift.giftStars, pinnedAt: Date.now() },
    ]);
  }, [received]);

  const handleUnpin = useCallback(async (giftId: string) => {
    if (isOwn) {
      const res = await emitWithAck<any, Res<{}>>('gifts:unpin', { giftId });
      if (!res.ok) return;
    }
    setPinned(prev => prev.filter(p => p.giftId !== giftId));
  }, [isOwn]);

  const handleHide = useCallback((giftId: string) => {
    setHidden(prev => new Set([...prev, giftId]));
    setPinned(prev => prev.filter(p => p.giftId !== giftId));
  }, []);

  // Deduplicate received by giftId for the grid (excluding hidden)
  const uniqueReceived = received.reduce<PlayerGift[]>((acc, g) => {
    if (!acc.find(x => x.giftId === g.giftId) && !hidden.has(g.giftId)) acc.push(g);
    return acc;
  }, []);

  // Deduplicate sent by giftId for the grid
  const uniqueSent = sent.reduce<PlayerGift[]>((acc, g) => {
    if (!acc.find(x => x.giftId === g.giftId)) acc.push(g);
    return acc;
  }, []);

  const pinnedIds = new Set(pinned.map(p => p.giftId));

  const tabLabel: Record<Tab, string> = {
    received: `Received${received.length > 0 ? ` (${uniqueReceived.length})` : ''}`,
    sent:     'Sent',
    timeline: 'Timeline',
    stats:    'Stats',
  };

  return (
    <>
      {/* Pinned strip */}
      <PinnedGiftsStrip pinned={pinned} canManage={isOwn} onUnpin={handleUnpin} />

      {/* Tabs */}
      <div className="flex gap-1 mb-3 rounded-xl overflow-hidden border border-white/6 bg-white/3 p-1">
        {(['received', 'sent', 'timeline', 'stats'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 rounded-lg font-mono text-[12px] uppercase tracking-wider transition-all ${
              tab === t
                ? 'bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/25'
                : 'text-white/25 hover:text-white/45'
            }`}
          >
            {tabLabel[t]}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>

          {/* ── Received ── */}
          {tab === 'received' && (
            <>
              {loading && <p className="text-white/20 font-mono text-xs text-center py-4">Loading...</p>}
              {!loading && loadError && (
                <div className="text-center py-4">
                  <p className="text-red-400/60 font-mono text-[12px] mb-2">{loadError}</p>
                  <button onClick={loadReceived} className="font-mono text-[12px] text-neon-cyan/60 hover:text-neon-cyan transition-colors">
                    Retry
                  </button>
                </div>
              )}
              {!loading && !loadError && uniqueReceived.length === 0 && (
                <p className="text-white/15 font-mono text-xs text-center py-6">No gifts received yet</p>
              )}
              {!loading && !loadError && uniqueReceived.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {uniqueReceived.map(g => {
                    const count = received.filter(x => x.giftId === g.giftId).length;
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
                          boxShadow: pinnedIds.has(g.giftId) ? `0 0 14px ${RARITY_GLOW[g.giftRarity] ?? RARITY_GLOW.common}` : undefined,
                        }}
                      >
                        {pinnedIds.has(g.giftId) && (
                          <span className="absolute top-1 left-1 text-[12px] text-amber-400/70">📌</span>
                        )}
                        {g.giftImageUrl
                          ? <img src={g.giftImageUrl} alt={g.giftName} className="w-9 h-9 rounded-lg object-cover" />
                          : <span className="text-2xl">{g.giftIcon}</span>}
                        <span className="font-mono text-[12px] text-white/60 truncate max-w-full">{g.giftName}</span>
                        <Stars n={g.giftStars} />
                        {count > 1 && (
                          <span className="absolute -top-1 -right-1 bg-neon-cyan text-void text-[12px] font-bold rounded-full min-w-[14px] h-3.5 flex items-center justify-center px-0.5">
                            ×{count}
                          </span>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ── Sent ── */}
          {tab === 'sent' && (
            <>
              {!sentLoaded && <p className="text-white/20 font-mono text-xs text-center py-4">Loading...</p>}
              {sentLoaded && uniqueSent.length === 0 && (
                <p className="text-white/15 font-mono text-xs text-center py-6">No gifts sent yet</p>
              )}
              {sentLoaded && uniqueSent.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {uniqueSent.map(g => {
                    const count = sent.filter(x => x.giftId === g.giftId).length;
                    const totalSpent = sent.filter(x => x.giftId === g.giftId).reduce((s, x) => s + x.coinCost, 0);
                    return (
                      <div
                        key={g.giftId}
                        className="relative rounded-xl p-3 flex flex-col items-center gap-1"
                        style={{
                          background: RARITY_COLOR[g.giftRarity] ?? RARITY_COLOR.common,
                          border: `1px solid ${RARITY_BORDER[g.giftRarity] ?? RARITY_BORDER.common}`,
                        }}
                      >
                        {g.giftImageUrl
                          ? <img src={g.giftImageUrl} alt={g.giftName} className="w-9 h-9 rounded-lg object-cover" />
                          : <span className="text-2xl">{g.giftIcon}</span>}
                        <span className="font-mono text-[12px] text-white/60 truncate max-w-full">{g.giftName}</span>
                        <Stars n={g.giftStars} />
                        <span className="font-mono text-[12px] text-amber-400/60">{totalSpent} 🪙</span>
                        {count > 1 && (
                          <span className="absolute -top-1 -right-1 bg-neon-purple text-white text-[12px] font-bold rounded-full min-w-[14px] h-3.5 flex items-center justify-center px-0.5">
                            ×{count}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ── Timeline ── */}
          {tab === 'timeline' && (
            <>
              {!timelineLoaded && <p className="text-white/20 font-mono text-xs text-center py-4">Loading...</p>}
              {timelineLoaded && timeline.length === 0 && (
                <p className="text-white/15 font-mono text-xs text-center py-6">No gift history yet</p>
              )}
              {timelineLoaded && timeline.length > 0 && (
                <div>
                  {timeline.map(entry => (
                    <TimelineRow key={entry.id} entry={entry} viewerId={profileId} />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Stats ── */}
          {tab === 'stats' && (
            <>
              {!statsLoaded && <p className="text-white/20 font-mono text-xs text-center py-4">Loading...</p>}
              {statsLoaded && stats && <GiftStatsPanel stats={stats} />}
              {statsLoaded && !stats && (
                <p className="text-white/15 font-mono text-xs text-center py-6">No stats available</p>
              )}
            </>
          )}

        </motion.div>
      </AnimatePresence>

      {/* Gift Detail Modal */}
      <AnimatePresence>
        {selected && (
          <GiftDetailModal
            gift={selected}
            recipientId={profileId}
            canPin={isOwn}
            isPinned={pinnedIds.has(selected.giftId)}
            onClose={() => setSelected(null)}
            onPin={handlePin}
            onUnpin={handleUnpin}
            onHide={isOwn ? handleHide : undefined}
          />
        )}
      </AnimatePresence>
    </>
  );
}
