import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { emitWithAck, socket } from '@/lib/socket';
import type { GiftCatalogItem, Res } from '@/types/index';

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

function Stars({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={`text-[8px] ${i < n ? 'text-amber-400' : 'text-white/10'}`}>★</span>
      ))}
    </div>
  );
}

interface Props {
  recipientId: string;
  recipientName: string;
  onClose: () => void;
  onSuccess?: (newBalance: number) => void;
}

export function SendGiftModal({ recipientId, recipientName, onClose, onSuccess }: Props) {
  const [catalog, setCatalog]     = useState<GiftCatalogItem[]>([]);
  const [balance, setBalance]     = useState<number>(0);
  const [selected, setSelected]   = useState<GiftCatalogItem | null>(null);
  const [message, setMessage]     = useState('');
  const [loading, setLoading]     = useState(true);
  const [sending, setSending]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState(false);

  useEffect(() => {
    Promise.all([
      emitWithAck<null, Res<GiftCatalogItem[]>>('gifts:catalog'),
      emitWithAck<null, Res<{ coins: number }>>('coins:balance'),
    ]).then(([catRes, balRes]) => {
      if (catRes.ok)  setCatalog(catRes.data);
      if (balRes.ok)  setBalance(balRes.data.coins);
    }).finally(() => setLoading(false));

    const onCoinsUpdated = ({ coins }: { coins: number }) => setBalance(coins);
    socket.on('coins:updated' as any, onCoinsUpdated);
    return () => { socket.off('coins:updated' as any, onCoinsUpdated); };
  }, []);

  const handleSend = async () => {
    if (!selected) return;
    setError(null);
    setSending(true);
    try {
      const res = await emitWithAck<any, Res<{ newBalance: number }>>('coins:send_gift', {
        recipientId,
        giftId: selected.id,
        message,
      });
      if (!res.ok) { setError(res.error); setSending(false); return; }
      setBalance(res.data.newBalance);
      setSuccess(true);
      onSuccess?.(res.data.newBalance);
      setTimeout(onClose, 1600);
    } catch (e: any) {
      setError(e.message ?? 'Failed to send gift.');
      setSending(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-3 pb-4 sm:pb-0"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: 'rgba(8,4,20,0.98)', border: '1px solid rgba(255,255,255,0.07)' }}
        initial={{ y: 60, scale: 0.93 }} animate={{ y: 0, scale: 1 }} exit={{ y: 60, scale: 0.93 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-white/5">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest text-white/30">Send Gift to</p>
            <h3 className="font-display font-bold text-white text-sm">{recipientName}</h3>
          </div>
          <div className="text-right">
            <p className="font-mono text-[9px] text-white/30 uppercase tracking-widest">Balance</p>
            <p className="font-mono text-sm font-bold text-amber-400">{balance.toLocaleString()} 🪙</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {loading && <p className="text-white/30 font-mono text-xs text-center py-8">Loading catalog...</p>}

          {!loading && success && (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">{selected?.icon}</div>
              <p className="font-display font-bold text-neon-green text-base">Gift Sent!</p>
              <p className="text-white/40 font-mono text-xs mt-1">Balance: {balance.toLocaleString()} 🪙</p>
            </div>
          )}

          {!loading && !success && (
            <>
              {/* Gift grid */}
              <p className="font-mono text-[9px] uppercase tracking-widest text-white/30 mb-2">Choose a gift</p>
              <div className="grid grid-cols-3 gap-2 mb-4 max-h-52 overflow-y-auto pr-1">
                {catalog.map(g => {
                  const canAfford = balance >= g.price;
                  const isSelected = selected?.id === g.id;
                  return (
                    <button
                      key={g.id}
                      onClick={() => canAfford && setSelected(g)}
                      disabled={!canAfford}
                      className={`relative rounded-xl p-2.5 flex flex-col items-center gap-1 transition-all
                        ${!canAfford ? 'opacity-40 cursor-not-allowed' : ''}
                        ${isSelected ? 'ring-2 ring-neon-cyan' : ''}`}
                      style={{
                        background: RARITY_COLOR[g.rarity],
                        border: `1px solid ${isSelected ? 'rgba(0,229,255,0.7)' : RARITY_BORDER[g.rarity]}`,
                      }}
                    >
                      <span className="text-xl">{g.icon}</span>
                      <span className="font-mono text-[8px] text-white/60 truncate max-w-full">{g.name}</span>
                      <Stars n={g.stars} />
                      <span className={`font-mono text-[8px] font-bold ${RARITY_LABEL[g.rarity]}`}>
                        {g.price} 🪙
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Message */}
              {selected && (
                <div className="mb-4">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-white/30 mb-1.5">Message (optional)</p>
                  <input
                    type="text"
                    value={message}
                    onChange={e => setMessage(e.target.value.slice(0, 200))}
                    placeholder="Add a message..."
                    className="w-full rounded-xl px-3 py-2 bg-white/5 border border-white/10 text-white font-mono text-xs placeholder-white/20 focus:outline-none focus:border-neon-cyan/40"
                  />
                </div>
              )}

              {error && <p className="text-neon-red font-mono text-xs mb-3 text-center">{error}</p>}

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
                  {sending ? 'Sending...' : selected ? `Send for ${selected.price} 🪙` : 'Select a gift'}
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
