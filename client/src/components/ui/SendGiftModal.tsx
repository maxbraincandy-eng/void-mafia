import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { emitWithAck, socket } from '@/lib/socket';
import type { GiftCatalogItem, GiftRarity, Res } from '@/types/index';

const RARITY_COLOR: Record<string, string> = {
  common:    'rgba(255,255,255,0.08)',
  uncommon:  'rgba(0,229,255,0.12)',
  rare:      'rgba(155,0,255,0.18)',
  epic:      'rgba(255,0,204,0.22)',
  legendary: 'rgba(255,180,0,0.28)',
};
const RARITY_BORDER: Record<string, string> = {
  common:    'rgba(255,255,255,0.10)',
  uncommon:  'rgba(0,229,255,0.25)',
  rare:      'rgba(155,0,255,0.35)',
  epic:      'rgba(255,0,204,0.42)',
  legendary: 'rgba(255,180,0,0.55)',
};
const RARITY_LABEL: Record<string, string> = {
  common: 'text-white/50', uncommon: 'text-neon-cyan', rare: 'text-neon-purple',
  epic: 'text-neon-pink', legendary: 'text-amber-400',
};
const RARITY_GLOW: Record<string, string> = {
  common:    'rgba(255,255,255,0.08)',
  uncommon:  'rgba(0,229,255,0.15)',
  rare:      'rgba(155,0,255,0.2)',
  epic:      'rgba(255,0,204,0.25)',
  legendary: 'rgba(255,180,0,0.35)',
};

const CATEGORIES = ['all', 'symbols', 'weapons', 'romantic', 'luxury', 'cyber', 'mafia', 'seasonal'];
const RARITIES: Array<GiftRarity | 'all'> = ['all', 'common', 'uncommon', 'rare', 'epic', 'legendary'];

function Stars({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={`text-[12px] ${i < n ? 'text-amber-400' : 'text-white/10'}`}>★</span>
      ))}
    </div>
  );
}

interface Props {
  recipientId: string;
  recipientName: string;
  recipientAvatar?: string;
  recipientAvatarUrl?: string | null;
  onClose: () => void;
  onSuccess?: (newBalance: number) => void;
}

export function SendGiftModal({ recipientId, recipientName, recipientAvatar, recipientAvatarUrl, onClose, onSuccess }: Props) {
  const [catalog, setCatalog]           = useState<GiftCatalogItem[]>([]);
  const [balance, setBalance]           = useState<number>(0);
  const [selected, setSelected]         = useState<GiftCatalogItem | null>(null);
  const [message, setMessage]           = useState('');
  const [loading, setLoading]           = useState(true);
  const [sending, setSending]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [success, setSuccess]           = useState(false);
  const [filterCat, setFilterCat]       = useState<string>('all');
  const [filterRarity, setFilterRarity] = useState<string>('all');
  const [affordableOnly, setAffordable] = useState(false);
  const [seasonalOnly, setSeasonalOnly] = useState(false);

  useEffect(() => {
    Promise.all([
      emitWithAck<null, Res<GiftCatalogItem[]>>('gifts:catalog'),
      emitWithAck<null, Res<{ coins: number }>>('coins:balance'),
    ]).then(([catRes, balRes]) => {
      if (catRes.ok) setCatalog(catRes.data);
      if (balRes.ok) setBalance(balRes.data.coins);
    }).finally(() => setLoading(false));

    const onCoinsUpdated = ({ coins }: { coins: number }) => setBalance(coins);
    socket.on('coins:updated' as any, onCoinsUpdated);
    return () => { socket.off('coins:updated' as any, onCoinsUpdated); };
  }, []);

  const hasSeasonalGifts = useMemo(() => catalog.some(g => g.isCurrentSeason), [catalog]);

  const filtered = useMemo(() => {
    return catalog.filter(g => {
      if (filterCat !== 'all' && g.category !== filterCat) return false;
      if (filterRarity !== 'all' && g.rarity !== filterRarity) return false;
      if (affordableOnly && balance < g.price) return false;
      if (seasonalOnly && !g.isCurrentSeason) return false;
      return true;
    });
  }, [catalog, filterCat, filterRarity, affordableOnly, seasonalOnly, balance]);

  const handleSend = async () => {
    if (!selected || sending) return;
    setError(null);
    setSending(true);
    try {
      const res = await emitWithAck<any, Res<{ newBalance: number }>>('coins:send_gift', {
        recipientId,
        giftId: selected.id,
        message: message.slice(0, 120),
      });
      if (!res.ok) { setError(res.error); setSending(false); return; }
      setBalance(res.data.newBalance);
      setSuccess(true);
      onSuccess?.(res.data.newBalance);
      setTimeout(onClose, 1800);
    } catch (e: any) {
      setError(e.message ?? 'Failed to send gift.');
      setSending(false);
    }
  };

  const rarityGlow = selected ? RARITY_GLOW[selected.rarity] ?? RARITY_GLOW.common : undefined;
  const rarityBorder = selected ? RARITY_BORDER[selected.rarity] ?? RARITY_BORDER.common : 'rgba(255,255,255,0.07)';

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm px-3 pb-4 sm:pb-0"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: 'rgba(8,4,20,0.98)', border: `1px solid ${rarityBorder}`, boxShadow: rarityGlow ? `0 0 40px ${rarityGlow}` : undefined }}
        initial={{ y: 60, scale: 0.93 }} animate={{ y: 0, scale: 1 }} exit={{ y: 60, scale: 0.93 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-white/5 flex items-center justify-center text-base flex-shrink-0">
              {recipientAvatarUrl
                ? <img src={recipientAvatarUrl} alt="" className="w-full h-full object-cover" />
                : <span>{recipientAvatar ?? '?'}</span>}
            </div>
            <div>
              <p className="font-mono text-[12px] uppercase tracking-widest text-white/30">Send Gift to</p>
              <h3 className="font-display font-bold text-white text-sm leading-tight">{recipientName}</h3>
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono text-[12px] text-white/30 uppercase tracking-widest">Balance</p>
            <p className="font-mono text-sm font-bold text-amber-400">{balance.toLocaleString()} 🪙</p>
          </div>
        </div>

        <div className="px-5 py-3">
          {/* Seasonal banner */}
          {!loading && !success && hasSeasonalGifts && (
            <button
              onClick={() => setSeasonalOnly(v => !v)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl mb-3 text-left transition-all"
              style={{
                background: seasonalOnly ? 'rgba(255,180,0,0.12)' : 'rgba(255,180,0,0.06)',
                border: `1px solid ${seasonalOnly ? 'rgba(255,180,0,0.35)' : 'rgba(255,180,0,0.15)'}`,
              }}
            >
              <span className="text-base">✨</span>
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[12px] uppercase tracking-widest text-amber-400/80">
                  Seasonal gifts available
                </p>
                <p className="font-mono text-[12px] text-white/30">Tap to {seasonalOnly ? 'show all' : 'show only seasonal'}</p>
              </div>
              <span className={`font-mono text-[12px] uppercase tracking-widest px-1.5 py-0.5 rounded-full ${seasonalOnly ? 'text-amber-400 bg-amber-400/15 border border-amber-400/30' : 'text-white/25 border border-white/10'}`}>
                {seasonalOnly ? 'on' : 'off'}
              </span>
            </button>
          )}

          {loading && <p className="text-white/30 font-mono text-xs text-center py-8">Loading catalog...</p>}

          {!loading && success && (
            <div className="text-center py-8">
              {selected?.imageUrl
                ? <img src={selected.imageUrl} alt={selected.name} className="w-16 h-16 rounded-xl object-cover mx-auto mb-2" />
                : <div className="text-5xl mb-2">{selected?.icon}</div>}
              <p className="font-display font-bold text-neon-green text-base">Gift Sent!</p>
              <p className="font-mono text-xs text-white/40 mt-1">
                {selected?.name} → {recipientName}
              </p>
              <p className="font-mono text-[12px] text-amber-400/60 mt-1">Balance: {balance.toLocaleString()} 🪙</p>
            </div>
          )}

          {!loading && !success && (
            <>
              {/* Filters row */}
              <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                {/* Category scroll */}
                <div className="flex gap-1 overflow-x-auto flex-1 pb-0.5 scrollbar-none">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setFilterCat(cat)}
                      className={`px-2 py-0.5 rounded-md font-mono text-[12px] uppercase tracking-wider whitespace-nowrap transition-all flex-shrink-0 ${
                        filterCat === cat
                          ? 'bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/30'
                          : 'text-white/30 border border-white/8 hover:text-white/50'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                {/* Affordable toggle */}
                <button
                  onClick={() => setAffordable(v => !v)}
                  className={`px-2 py-0.5 rounded-md font-mono text-[12px] uppercase tracking-wider whitespace-nowrap transition-all flex-shrink-0 border ${
                    affordableOnly
                      ? 'bg-amber-400/15 text-amber-400 border-amber-400/30'
                      : 'text-white/25 border-white/8 hover:text-white/40'
                  }`}
                >
                  💰 Afford
                </button>
              </div>

              {/* Rarity filter pills */}
              <div className="flex gap-1 mb-3 overflow-x-auto pb-0.5 scrollbar-none">
                {RARITIES.map(r => (
                  <button
                    key={r}
                    onClick={() => setFilterRarity(r)}
                    className={`px-2 py-0.5 rounded-full font-mono text-[12px] uppercase tracking-wider whitespace-nowrap transition-all flex-shrink-0 border ${
                      filterRarity === r
                        ? r === 'all'
                          ? 'bg-white/10 text-white/70 border-white/20'
                          : `border-[${RARITY_BORDER[r]}] ${RARITY_LABEL[r]}`
                        : 'text-white/20 border-white/6 hover:text-white/35'
                    }`}
                    style={filterRarity === r && r !== 'all' ? {
                      background: RARITY_COLOR[r],
                      borderColor: RARITY_BORDER[r],
                    } : undefined}
                  >
                    {r}
                  </button>
                ))}
              </div>

              {/* Selected gift preview */}
              <AnimatePresence mode="wait">
                {selected && (
                  <motion.div
                    key={selected.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="rounded-xl p-3 mb-3 flex items-center gap-3"
                    style={{
                      background: RARITY_COLOR[selected.rarity],
                      border: `1px solid ${RARITY_BORDER[selected.rarity]}`,
                      boxShadow: `0 0 20px ${RARITY_GLOW[selected.rarity]}`,
                    }}
                  >
                    {selected.imageUrl
                      ? <img src={selected.imageUrl} alt={selected.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      : <span className="text-3xl flex-shrink-0">{selected.icon}</span>}
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-bold text-white text-sm">{selected.name}</p>
                      <p className="font-mono text-[12px] text-white/40 truncate">{selected.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Stars n={selected.stars} />
                        <span className={`font-mono text-[12px] uppercase tracking-wider ${RARITY_LABEL[selected.rarity]}`}>
                          {selected.rarity}
                        </span>
                        {selected.limitedEdition && (
                          <span className="font-mono text-[12px] text-neon-red/70 border border-neon-red/20 px-1 rounded">LIMITED</span>
                        )}
                        {selected.isCurrentSeason && (
                          <span className="font-mono text-[12px] text-amber-400/70 border border-amber-400/20 px-1 rounded">✨ SEASONAL</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-mono text-sm font-bold text-amber-400">{selected.price.toLocaleString()}</p>
                      <p className="font-mono text-[12px] text-white/30">coins</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Gift grid */}
              <p className="font-mono text-[12px] uppercase tracking-widest text-white/25 mb-2">
                Choose a gift {filtered.length > 0 && `(${filtered.length})`}
              </p>
              <div className="grid grid-cols-3 gap-1.5 mb-3 max-h-44 overflow-y-auto pr-0.5">
                {filtered.length === 0 && (
                  <div className="col-span-3 text-center py-4 text-white/20 font-mono text-xs">No gifts match filters</div>
                )}
                {filtered.map(g => {
                  const canAfford = balance >= g.price;
                  const isSelected = selected?.id === g.id;
                  return (
                    <button
                      key={g.id}
                      onClick={() => { if (canAfford) setSelected(g); }}
                      disabled={!canAfford}
                      className={`relative rounded-xl p-2 flex flex-col items-center gap-0.5 transition-all
                        ${!canAfford ? 'opacity-35 cursor-not-allowed' : 'hover:scale-105 active:scale-95 cursor-pointer'}
                        ${isSelected ? 'ring-2 ring-neon-cyan' : ''}`}
                      style={{
                        background: RARITY_COLOR[g.rarity],
                        border: `1px solid ${isSelected ? 'rgba(0,229,255,0.7)' : RARITY_BORDER[g.rarity]}`,
                      }}
                    >
                      {g.imageUrl
                        ? <img src={g.imageUrl} alt={g.name} className="w-8 h-8 rounded-md object-cover" />
                        : <span className="text-xl">{g.icon}</span>}
                      <span className="font-mono text-[12px] text-white/60 truncate max-w-full">{g.name}</span>
                      <Stars n={g.stars} />
                      <span className={`font-mono text-[12px] font-bold ${RARITY_LABEL[g.rarity]}`}>
                        {g.price} 🪙
                      </span>
                      {g.limitedEdition && (
                        <span className="absolute top-0.5 right-0.5 font-mono text-[6px] text-neon-red/80 bg-neon-red/10 px-0.5 rounded">LTD</span>
                      )}
                      {g.isCurrentSeason && !g.limitedEdition && (
                        <span className="absolute top-0.5 right-0.5 text-[12px]">✨</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Message */}
              {selected && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-mono text-[12px] uppercase tracking-widest text-white/30">Message (optional)</p>
                    <span className="font-mono text-[12px] text-white/20">{message.length}/120</span>
                  </div>
                  <input
                    type="text"
                    value={message}
                    onChange={e => setMessage(e.target.value.slice(0, 120))}
                    placeholder="Add a message..."
                    className="w-full rounded-xl px-3 py-2 bg-white/5 border border-white/10 text-white font-mono text-xs placeholder-white/20 focus:outline-none focus:border-neon-cyan/40"
                  />
                </div>
              )}

              {error && <p className="text-neon-red font-mono text-xs mb-2.5 text-center">{error}</p>}

              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/40 font-mono text-xs uppercase tracking-widest hover:border-white/20 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  disabled={!selected || sending}
                  className="flex-1 py-2.5 rounded-xl font-mono text-xs uppercase tracking-widest font-bold transition-all
                    disabled:opacity-40 disabled:cursor-not-allowed
                    bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20"
                >
                  {sending ? 'Sending...' : selected ? `Send ${selected.price} 🪙` : 'Select a gift'}
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
