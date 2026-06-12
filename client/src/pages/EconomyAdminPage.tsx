import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { emitWithAck, socket } from '@/lib/socket';
import { useGameStore } from '@/store/gameStore';
import type { GiftCatalogItem, CoinTransaction, PlayerProfilePublic, Res } from '@/types/index';

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
const RARITY_COLOR: Record<string, string> = {
  common: 'text-white/50', uncommon: 'text-neon-cyan', rare: 'text-neon-purple',
  epic: 'text-neon-pink', legendary: 'text-amber-400',
};
const TX_TYPE_LABEL: Record<string, string> = {
  grant: '+ Grant', deduct: '− Deduct', gift_sent: '↑ Sent', gift_received: '↓ Received',
  daily_reward: '☀ Daily', refund: '↩ Refund',
};
const TX_COLOR: Record<string, string> = {
  grant: 'text-neon-green', deduct: 'text-neon-red', gift_sent: 'text-white/50',
  gift_received: 'text-neon-cyan', daily_reward: 'text-amber-400', refund: 'text-neon-purple',
};

function Stars({ n, size = 'text-[10px]' }: { n: number; size?: string }) {
  return (
    <span className={size}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={i < n ? 'text-amber-400' : 'text-white/10'}>★</span>
      ))}
    </span>
  );
}

// ── Gift Form ─────────────────────────────────────────────────────────────

interface GiftFormProps {
  initial?: GiftCatalogItem | null;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
}

function GiftForm({ initial, onSave, onCancel }: GiftFormProps) {
  const [name, setName]         = useState(initial?.name ?? '');
  const [description, setDesc]  = useState(initial?.description ?? '');
  const [icon, setIcon]         = useState(initial?.icon ?? '🎁');
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '');
  const [rarity, setRarity]     = useState<string>(initial?.rarity ?? 'common');
  const [stars, setStars]       = useState(initial?.stars ?? 1);
  const [price, setPrice]       = useState(String(initial?.price ?? 100));
  const [active, setActive]     = useState(initial?.active ?? true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Only image files are supported.'); return; }
    if (file.size > 300_000) { setError('Image must be under 300KB.'); return; }
    const reader = new FileReader();
    reader.onload = ev => setImageUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await onSave({ name, description, icon, imageUrl, rarity, stars, price: parseInt(price, 10) || 0, active });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 p-4 space-y-3 bg-white/3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="font-mono text-[9px] text-white/30 uppercase tracking-widest block mb-1">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={40}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-neon-cyan/40" />
        </div>
        <div>
          <label className="font-mono text-[9px] text-white/30 uppercase tracking-widest block mb-1">Icon (emoji)</label>
          <input value={icon} onChange={e => setIcon(e.target.value)} maxLength={4}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-lg text-center focus:outline-none focus:border-neon-cyan/40" />
        </div>
      </div>

      {/* PNG image upload */}
      <div>
        <label className="font-mono text-[9px] text-white/30 uppercase tracking-widest block mb-1">
          Custom Image (PNG/JPG — overrides emoji)
        </label>
        <div className="flex items-center gap-3">
          {imageUrl && (
            <div className="relative w-12 h-12 rounded-lg border border-white/10 overflow-hidden flex-shrink-0">
              <img src={imageUrl} alt="" className="w-full h-full object-cover" />
              <button onClick={() => setImageUrl('')}
                className="absolute top-0 right-0 w-4 h-4 bg-black/70 text-white/60 text-[8px] flex items-center justify-center hover:text-white">✕</button>
            </div>
          )}
          <label className="flex-1 cursor-pointer px-3 py-2 rounded-lg border border-dashed border-white/15 bg-white/3 text-white/30 font-mono text-[10px] text-center hover:border-neon-cyan/30 hover:text-neon-cyan/60 transition-colors">
            {imageUrl ? 'Replace image' : '+ Upload image'}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageFile} className="hidden" />
          </label>
        </div>
      </div>

      <div>
        <label className="font-mono text-[9px] text-white/30 uppercase tracking-widest block mb-1">Description</label>
        <input value={description} onChange={e => setDesc(e.target.value)} maxLength={120}
          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-neon-cyan/40" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="font-mono text-[9px] text-white/30 uppercase tracking-widest block mb-1">Rarity</label>
          <select value={rarity} onChange={e => setRarity(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-void border border-white/10 text-white font-mono text-xs focus:outline-none">
            {RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="font-mono text-[9px] text-white/30 uppercase tracking-widest block mb-1">Stars (1–5)</label>
          <input type="number" min={1} max={5} value={stars} onChange={e => setStars(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-neon-cyan/40" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="font-mono text-[9px] text-white/30 uppercase tracking-widest block mb-1">Price (coins)</label>
          <input type="number" min={0} value={price} onChange={e => setPrice(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-neon-cyan/40" />
        </div>
        <div className="flex flex-col justify-end">
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => setActive(a => !a)}
              className={`w-10 h-5 rounded-full transition-colors relative ${active ? 'bg-neon-green/40' : 'bg-white/10'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${active ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="font-mono text-[9px] text-white/40 uppercase tracking-widest">Active</span>
          </label>
        </div>
      </div>

      {error && <p className="text-neon-red font-mono text-xs">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="flex-1 py-2 rounded-lg border border-white/10 text-white/40 font-mono text-xs uppercase tracking-widest hover:border-white/20 transition-colors">
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex-1 py-2 rounded-lg bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan font-mono text-xs uppercase tracking-widest font-bold hover:bg-neon-cyan/20 transition-colors disabled:opacity-40">
          {saving ? 'Saving...' : initial ? 'Update' : 'Create'}
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

type Tab = 'catalog' | 'grants' | 'transactions';

export function EconomyAdminPage() {
  const addToast = useGameStore(s => s.addToast);
  const [tab, setTab]           = useState<Tab>('catalog');
  const [catalog, setCatalog]   = useState<GiftCatalogItem[]>([]);
  const [txs, setTxs]           = useState<CoinTransaction[]>([]);
  const [loading, setLoading]   = useState(false);
  const [editing, setEditing]   = useState<GiftCatalogItem | null | 'new'>('new' as any);
  const [showForm, setShowForm] = useState(false);

  // Grant/deduct state
  const [targetCode, setTargetCode]  = useState('');
  const [targetPlayer, setTarget]    = useState<PlayerProfilePublic | null>(null);
  const [grantAmount, setGrantAmt]   = useState('');
  const [grantDesc, setGrantDesc]    = useState('');
  const [grantMode, setGrantMode]    = useState<'grant' | 'deduct'>('grant');
  const [grantBusy, setGrantBusy]    = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    const res = await emitWithAck<null, Res<GiftCatalogItem[]>>('owner:gift_catalog_all');
    if (res.ok) setCatalog(res.data);
    setLoading(false);
  }, []);

  const loadTxs = useCallback(async () => {
    setLoading(true);
    const res = await emitWithAck<null, Res<CoinTransaction[]>>('owner:all_transactions');
    if (res.ok) setTxs(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 'catalog')      loadCatalog();
    if (tab === 'transactions') loadTxs();
  }, [tab, loadCatalog, loadTxs]);

  const lookupPlayer = async () => {
    if (!targetCode.trim()) return;
    setLookupBusy(true);
    try {
      const res = await emitWithAck<any, Res<PlayerProfilePublic>>('player:find_by_code', { friendCode: targetCode.trim() });
      if (res.ok) { setTarget(res.data); }
      else { addToast(res.error, 'error'); setTarget(null); }
    } finally { setLookupBusy(false); }
  };

  const doGrant = async () => {
    if (!targetPlayer) return;
    const amount = parseInt(grantAmount, 10);
    if (!amount || amount <= 0) { addToast('Enter a valid amount.', 'error'); return; }
    setGrantBusy(true);
    try {
      const event = grantMode === 'grant' ? 'owner:coins_grant' : 'owner:coins_deduct';
      const res = await emitWithAck<any, Res<{ newBalance: number }>>(event, {
        targetProfileId: targetPlayer.id,
        amount,
        description: grantDesc || (grantMode === 'grant' ? 'Owner grant' : 'Owner deduction'),
      });
      if (res.ok) {
        addToast(`Done. ${targetPlayer.username}'s new balance: ${res.data.newBalance} 🪙`, 'success');
        setGrantAmt('');
        setGrantDesc('');
      } else {
        addToast(res.error, 'error');
      }
    } finally { setGrantBusy(false); }
  };

  const handleGiftSave = async (data: any) => {
    if (editing && editing !== 'new' && typeof editing === 'object') {
      const res = await emitWithAck<any, Res<GiftCatalogItem>>('owner:gift_update', { giftId: editing.id, ...data });
      if (!res.ok) throw new Error(res.error);
      addToast('Gift updated.', 'success');
    } else {
      const res = await emitWithAck<any, Res<GiftCatalogItem>>('owner:gift_create', data);
      if (!res.ok) throw new Error(res.error);
      addToast('Gift created.', 'success');
    }
    setShowForm(false);
    setEditing(null);
    loadCatalog();
  };

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'catalog',      label: 'Gift Catalog',   icon: '🎁' },
    { id: 'grants',       label: 'Coins',          icon: '🪙' },
    { id: 'transactions', label: 'Transactions',   icon: '📋' },
  ];

  return (
    <motion.div
      key="economy"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="min-h-screen bg-void px-4 pb-8"
      style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top, 1.5rem))' }}
    >
      {/* Header */}
      <div className="mb-5">
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-amber-400/60 mb-0.5">Owner Panel</p>
        <h1 className="font-display font-bold text-white text-xl tracking-wide">Economy Admin</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 rounded-xl p-1 bg-white/3 border border-white/5">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 rounded-lg font-mono text-[10px] uppercase tracking-widest transition-all ${
              tab === t.id ? 'bg-amber-400/15 text-amber-400 border border-amber-400/25' : 'text-white/30 hover:text-white/50'
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Catalog ── */}
      {tab === 'catalog' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-white/30">
              {catalog.length} gifts
            </p>
            <button
              onClick={() => { setEditing('new' as any); setShowForm(true); }}
              className="px-3 py-1.5 rounded-lg bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan font-mono text-[10px] uppercase tracking-widest hover:bg-neon-cyan/20"
            >
              + New Gift
            </button>
          </div>

          <AnimatePresence>
            {showForm && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mb-4">
                <GiftForm
                  initial={editing !== 'new' && typeof editing === 'object' ? editing : null}
                  onSave={handleGiftSave}
                  onCancel={() => { setShowForm(false); setEditing(null); }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {loading && <p className="text-white/20 font-mono text-xs text-center py-8">Loading...</p>}

          <div className="space-y-2">
            {catalog.map(g => (
              <div key={g.id} className="rounded-xl border border-white/6 p-3 flex items-center gap-3"
                style={{ background: 'rgba(255,255,255,0.02)' }}>
                {g.imageUrl
                  ? <img src={g.imageUrl} alt={g.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                  : <span className="text-2xl flex-shrink-0">{g.icon}</span>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-white/80 font-bold">{g.name}</span>
                    <Stars n={g.stars} />
                    <span className={`font-mono text-[9px] uppercase ${RARITY_COLOR[g.rarity]}`}>{g.rarity}</span>
                    {!g.active && <span className="font-mono text-[9px] text-white/25 bg-white/5 px-1.5 rounded">inactive</span>}
                  </div>
                  <p className="font-mono text-[10px] text-amber-400">{g.price} 🪙</p>
                </div>
                <button
                  onClick={() => { setEditing(g); setShowForm(true); }}
                  className="px-2.5 py-1 rounded-lg border border-white/10 text-white/40 font-mono text-[9px] uppercase hover:border-white/20 transition-colors">
                  Edit
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Grants ── */}
      {tab === 'grants' && (
        <div className="space-y-4">
          {/* Player lookup */}
          <div className="rounded-xl border border-white/10 p-4">
            <p className="font-mono text-[9px] uppercase tracking-widest text-white/30 mb-3">Find Player by Friend Code</p>
            <div className="flex gap-2">
              <input
                value={targetCode}
                onChange={e => setTargetCode(e.target.value.toUpperCase())}
                placeholder="FRIEND CODE"
                className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-xs placeholder-white/20 focus:outline-none focus:border-neon-cyan/40 uppercase"
                onKeyDown={e => e.key === 'Enter' && lookupPlayer()}
              />
              <button onClick={lookupPlayer} disabled={lookupBusy}
                className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 font-mono text-xs uppercase tracking-widest hover:border-white/20 disabled:opacity-40">
                {lookupBusy ? '...' : 'Find'}
              </button>
            </div>

            {targetPlayer && (
              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                className="mt-3 flex items-center gap-2.5 rounded-lg px-3 py-2 bg-white/4 border border-white/8">
                <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-base overflow-hidden">
                  {targetPlayer.avatarUrl
                    ? <img src={targetPlayer.avatarUrl} alt="" className="w-full h-full object-cover" />
                    : <span>{targetPlayer.avatar}</span>}
                </div>
                <div>
                  <p className="font-mono text-xs text-white font-bold">{targetPlayer.username}</p>
                  <p className="font-mono text-[9px] text-white/30">#{targetPlayer.publicId}</p>
                </div>
              </motion.div>
            )}
          </div>

          {/* Grant / deduct */}
          {targetPlayer && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-amber-400/20 p-4 bg-amber-400/4">
              <p className="font-mono text-[9px] uppercase tracking-widest text-amber-400/60 mb-3">
                Adjust coins for {targetPlayer.username}
              </p>

              <div className="flex gap-1 mb-3 rounded-lg p-1 bg-black/20 border border-white/5">
                {(['grant', 'deduct'] as const).map(m => (
                  <button key={m} onClick={() => setGrantMode(m)}
                    className={`flex-1 py-1.5 rounded font-mono text-[10px] uppercase tracking-widest transition-all ${
                      grantMode === m
                        ? m === 'grant' ? 'bg-neon-green/15 text-neon-green border border-neon-green/25' : 'bg-neon-red/15 text-neon-red border border-neon-red/25'
                        : 'text-white/30'
                    }`}>
                    {m === 'grant' ? '+ Grant' : '− Deduct'}
                  </button>
                ))}
              </div>

              <div className="space-y-2 mb-3">
                <input type="number" min={1} value={grantAmount} onChange={e => setGrantAmt(e.target.value)}
                  placeholder="Amount"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-xs placeholder-white/20 focus:outline-none focus:border-amber-400/40" />
                <input value={grantDesc} onChange={e => setGrantDesc(e.target.value)} maxLength={120}
                  placeholder="Reason / description"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-xs placeholder-white/20 focus:outline-none focus:border-amber-400/40" />
              </div>

              <button onClick={doGrant} disabled={grantBusy || !grantAmount}
                className={`w-full py-2.5 rounded-lg font-mono text-xs uppercase tracking-widest font-bold transition-all disabled:opacity-40
                  ${grantMode === 'grant' ? 'bg-neon-green/10 border border-neon-green/30 text-neon-green hover:bg-neon-green/20' : 'bg-neon-red/10 border border-neon-red/30 text-neon-red hover:bg-neon-red/20'}`}>
                {grantBusy ? 'Processing...' : grantMode === 'grant' ? `Grant ${grantAmount || '?'} coins` : `Deduct ${grantAmount || '?'} coins`}
              </button>
            </motion.div>
          )}
        </div>
      )}

      {/* ── Transactions ── */}
      {tab === 'transactions' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-white/30">Last 500 transactions</p>
            <button onClick={loadTxs} className="px-3 py-1.5 rounded-lg border border-white/10 text-white/40 font-mono text-[10px] uppercase hover:border-white/20">
              Refresh
            </button>
          </div>

          {loading && <p className="text-white/20 font-mono text-xs text-center py-8">Loading...</p>}

          <div className="space-y-1.5">
            {txs.map(tx => (
              <div key={tx.id} className="rounded-lg px-3 py-2 flex items-center gap-2"
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <span className={`font-mono text-[9px] uppercase tracking-widest min-w-[70px] ${TX_COLOR[tx.type] ?? 'text-white/40'}`}>
                  {TX_TYPE_LABEL[tx.type] ?? tx.type}
                </span>
                <span className={`font-mono text-xs font-bold min-w-[50px] text-right ${tx.amount >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
                  {tx.amount >= 0 ? '+' : ''}{tx.amount}
                </span>
                <span className="font-mono text-[9px] text-white/25 min-w-[50px]">→ {tx.balanceAfter}</span>
                <span className="font-mono text-[9px] text-white/35 flex-1 truncate">{tx.description}</span>
                <span className="font-mono text-[9px] text-white/20">{new Date(tx.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
            {txs.length === 0 && !loading && (
              <p className="text-white/20 font-mono text-xs text-center py-8">No transactions yet.</p>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
