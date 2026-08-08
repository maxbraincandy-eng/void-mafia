import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PROFILE_BACKGROUNDS, NAME_COLORS, NAME_COLOR_PRICES, RARITY_COLOR, RARITY_LABEL, nameColorGlow, nameColorUI } from '@/constants/cosmetics';
import { SPACE_THEME_DEFS, itemIdForTheme } from '@/constants/spaceThemes';
import { emitWithAck } from '@/lib/socket';
import { isNativeApp } from '@/lib/platform';
import { useAuthStore } from '@/store/authStore';
import { useNameColorStore } from '@/store/nameColorStore';
import type { PlayerCosmetics, Res } from '@/types/index';

interface CoinPackage {
  id: string;
  coins: number;
  price: number;
  label: string;
  bonus: string;
}

// Mirrors server perkService PerkState / PerkDef.
interface PerkState {
  ownsInvisible: boolean; invisibleMode: 'off' | 'always';
  ownsAnon: boolean; anonMode: 'off' | 'always';
  vipUntil: number | null; xpBoostGames: number;
}
interface PerkDef {
  id: 'invisible' | 'anon' | 'vip' | 'xpboost';
  name: string; ka: string; desc: string; price: number;
  kind: 'toggle' | 'duration' | 'consumable'; hours?: number; units?: number;
}
const PERK_EMOJI: Record<string, string> = { invisible: '🕵️', anon: '🎭', vip: '📡', xpboost: '⚡' };

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
  coins?: number | null;
  onCoinsChange?: (newBalance: number) => void;
}

export function CoinShopModal({ open, onClose, profileId, coins: propCoins, onCoinsChange }: Props) {
  const [shopTab, setShopTab] = useState<'coins' | 'items' | 'backgrounds' | 'names' | 'spaces'>('coins');
  const [packages, setPackages] = useState<CoinPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Backgrounds tab state
  const [buyingBg, setBuyingBg] = useState<string | null>(null);
  const [bgMsg, setBgMsg] = useState<string | null>(null);
  // Name colors tab state
  const [busyNc, setBusyNc] = useState<string | null>(null);
  const [ncMsg, setNcMsg] = useState<string | null>(null);
  // Space themes tab state
  const [busySp, setBusySp] = useState<string | null>(null);
  const [spMsg, setSpMsg] = useState<string | null>(null);
  // Items (perks) tab state
  const [perks, setPerks] = useState<PerkState | null>(null);
  const [perkCatalog, setPerkCatalog] = useState<PerkDef[]>([]);
  const [perkBusy, setPerkBusy] = useState<string | null>(null);
  const [perkMsg, setPerkMsg] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState<'invisible' | 'anon' | null>(null);
  const profile = useAuthStore(s => s.profile);
  // Inside the native app, Stripe/card checkout for digital goods is not allowed
  // by Google Play / Apple. Store billing (RevenueCat) is wired separately; until
  // it's live the coin-buying tab shows an "in-app purchases coming" state here.
  const native = isNativeApp();
  const unlockedItems = profile?.cosmetics?.unlockedItems ?? [];
  const equippedNameColor = profile?.cosmetics?.equippedNameColor ?? null;

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/shop/packages')
      .then(r => r.json())
      .then(data => setPackages(data.packages ?? []))
      .catch(() => setError('Failed to load packages.'))
      .finally(() => setLoading(false));
  }, [open]);

  // ── Items (perks) tab ──────────────────────────────────────────────
  const loadPerks = async () => {
    try {
      // No payload — server handler is (cb)=>…, so emitWithAck must send only the ack.
      const res = await emitWithAck<undefined, Res<{ perks: PerkState; catalog: PerkDef[] }>>('perks:get');
      if ('ok' in res && res.ok) { setPerks(res.data.perks); setPerkCatalog(res.data.catalog); }
    } catch { /* leave prior state */ }
  };
  useEffect(() => { if (open && shopTab === 'items') loadPerks(); }, [open, shopTab]);

  const buyPerk = async (perkId: string) => {
    if (perkBusy) return;
    setPerkBusy(perkId); setPerkMsg(null);
    try {
      const res = await emitWithAck<{ perkId: string }, Res<{ perks: PerkState; coins: number }>>('perks:buy', { perkId });
      if ('ok' in res && res.ok) {
        setPerks(res.data.perks);
        onCoinsChange?.(res.data.coins);
        setPerkMsg('შეძენილია ✓');
      } else setPerkMsg(('error' in res && res.error) || 'ვერ შესრულდა');
    } catch (e: any) { setPerkMsg(e?.message ?? 'ვერ შესრულდა'); }
    finally { setPerkBusy(null); }
  };

  const configurePerk = async (which: 'invisible' | 'anon', mode: 'off' | 'always') => {
    try {
      const res = await emitWithAck<{ which: string; mode: string }, Res<{ perks: PerkState }>>('perks:configure', { which, mode });
      if ('ok' in res && res.ok) setPerks(res.data.perks);
    } catch { /* ignore */ }
    setConfiguring(null);
  };

  const handleBuy = async (pkg: CoinPackage) => {
    // Never route to Stripe from inside the native app (store-policy violation).
    if (native) return;
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

  const handleBuyBackground = async (itemId: string) => {
    if (buyingBg) return;
    setBuyingBg(itemId);
    setBgMsg(null);
    try {
      const res = await emitWithAck<{ itemId: string }, Res<{ cosmetics: PlayerCosmetics; newBalance: number }>>(
        'cosmetics:buy_item' as any, { itemId },
      );
      if (res.ok) {
        useAuthStore.setState(s => s.profile
          ? { profile: { ...s.profile!, cosmetics: res.data.cosmetics } }
          : s,
        );
        onCoinsChange?.(res.data.newBalance);
        setBgMsg('Purchased! Equip it from your Profile > Wallpapers tab.');
      } else {
        setBgMsg((res as any).error ?? 'Purchase failed.');
      }
    } finally {
      setBuyingBg(null);
      setTimeout(() => setBgMsg(null), 5000);
    }
  };

  const handleBuyNameColor = async (itemId: string) => {
    if (busyNc) return;
    setBusyNc(itemId);
    setNcMsg(null);
    try {
      const res = await emitWithAck<{ itemId: string }, Res<{ cosmetics: PlayerCosmetics; newBalance: number }>>(
        'cosmetics:buy_item' as any, { itemId },
      );
      if (res.ok) {
        useAuthStore.setState(s => s.profile ? { profile: { ...s.profile!, cosmetics: res.data.cosmetics } } : s);
        onCoinsChange?.(res.data.newBalance);
        setNcMsg('Purchased! Tap "Equip" to wear it.');
      } else {
        setNcMsg((res as any).error ?? 'Purchase failed.');
      }
    } finally {
      setBusyNc(null);
      setTimeout(() => setNcMsg(null), 5000);
    }
  };

  const handleBuySpaceTheme = async (itemId: string) => {
    if (busySp) return;
    setBusySp(itemId);
    setSpMsg(null);
    try {
      const res = await emitWithAck<{ itemId: string }, Res<{ cosmetics: PlayerCosmetics; newBalance: number }>>(
        'cosmetics:buy_item' as any, { itemId },
      );
      if (res.ok) {
        useAuthStore.setState(s => s.profile ? { profile: { ...s.profile!, cosmetics: res.data.cosmetics } } : s);
        onCoinsChange?.(res.data.newBalance);
        setSpMsg('Purchased! Apply it from a space via the 🎨 button.');
      } else {
        setSpMsg((res as any).error ?? 'Purchase failed.');
      }
    } finally {
      setBusySp(null);
      setTimeout(() => setSpMsg(null), 5000);
    }
  };

  const handleEquipNameColor = async (itemId: string | null) => {
    if (busyNc) return;
    setBusyNc(itemId ?? '__off');
    setNcMsg(null);
    try {
      const res = await emitWithAck<{ type: string; itemId: string | null }, Res<PlayerCosmetics>>(
        'cosmetics:equip' as any, { type: 'name_color', itemId },
      );
      if (res.ok) {
        useAuthStore.setState(s => s.profile ? { profile: { ...s.profile!, cosmetics: res.data } } : s);
        if (profile?.id) useNameColorStore.getState().setLocal(profile.id, itemId);
        setNcMsg(itemId ? 'Equipped!' : 'Name color removed.');
      } else {
        setNcMsg((res as any).error ?? 'Could not equip.');
      }
    } finally {
      setBusyNc(null);
      setTimeout(() => setNcMsg(null), 4000);
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
              <div className="sticky top-0 z-10 px-5 pt-5 pb-0"
                style={{ background: 'rgba(6,3,18,0.96)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xl">🪙</span>
                      <h2 className="font-display text-lg font-bold text-amber-400 tracking-widest uppercase">
                        Coin Shop
                      </h2>
                    </div>
                    {propCoins != null && (
                      <p className="font-mono text-[12px] text-amber-400/50 tracking-widest">
                        Balance: {propCoins.toLocaleString()} coins
                      </p>
                    )}
                  </div>
                  <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/60 transition-colors"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    ✕
                  </button>
                </div>
                {/* Tabs */}
                <div className="flex gap-1 pb-3 flex-wrap">
                  {[
                    { id: 'coins', label: 'Buy Coins' },
                    { id: 'items', label: 'ნივთები' },
                    { id: 'backgrounds', label: 'Backgrounds' },
                    { id: 'names', label: 'Name Colors' },
                    { id: 'spaces', label: 'Spaces' },
                  ].map(t => (
                    <button key={t.id}
                      onClick={() => setShopTab(t.id as any)}
                      className={`px-3 py-1.5 rounded-lg font-mono text-[12px] uppercase tracking-wider transition-all ${shopTab === t.id ? 'bg-amber-400/15 text-amber-400 border border-amber-400/30' : 'text-white/30 hover:text-white/50'}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="px-4 pt-4 space-y-3">
                {/* ── Buy Coins tab ── */}
                {/* Inside the native app: store billing (Google Play / Apple) is
                    required for digital goods, so the Stripe list is hidden and a
                    placeholder shows until RevenueCat is wired. Cosmetic tabs
                    below (bought with already-owned coins) still work in-app. */}
                {shopTab === 'coins' && native && (
                <div className="py-10 px-4 text-center space-y-3">
                  <div className="text-4xl">🪙</div>
                  <p className="font-display text-base font-bold text-amber-400">In-app purchases</p>
                  <p className="font-mono text-[13px] text-white/40 leading-relaxed">
                    Buying coins in the app will use secure store billing (Google Play / App Store).
                    This is being set up — check back soon.
                  </p>
                </div>
                )}

                {shopTab === 'coins' && !native && (
                <>
                {/* Trust indicators */}
                <div className="flex items-center justify-center gap-4 pb-1">
                  {['🔒 Secure', '⚡ Instant', '💳 Stripe'].map(t => (
                    <span key={t} className="font-mono text-[12px] text-white/25 uppercase tracking-widest">{t}</span>
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
                            <span className="font-mono text-[12px] uppercase tracking-widest px-1.5 py-0.5 rounded-full text-amber-400"
                              style={{ background: 'rgba(255,180,0,0.1)', border: '1px solid rgba(255,180,0,0.2)' }}>
                              {pkg.bonus}
                            </span>
                          )}
                          {i === 2 && (
                            <span className="font-mono text-[12px] uppercase tracking-widest px-1.5 py-0.5 rounded-full text-neon-purple"
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
                <p className="text-center font-mono text-[12px] text-white/15 leading-relaxed pt-2 px-2">
                  Coins are non-refundable and cannot be exchanged for real money.
                  Purchases are processed securely via Stripe.
                </p>
                </>
                )}

                {/* ── Items (perks) tab ── */}
                {shopTab === 'items' && (
                <div className="space-y-2">
                  <p className="font-mono text-[12px] text-white/30 tracking-widest text-center pb-1">
                    სპეციალური შესაძლებლობები
                  </p>
                  {perkMsg && <p className="text-center font-mono text-[12px] text-amber-300 pb-1">{perkMsg}</p>}
                  {perkCatalog.length === 0 && <p className="text-center font-mono text-[12px] text-white/25 py-6">იტვირთება…</p>}
                  {perkCatalog.map(item => {
                    const owned = item.id === 'invisible' ? perks?.ownsInvisible : item.id === 'anon' ? perks?.ownsAnon : false;
                    const isToggle = item.kind === 'toggle';
                    const mode = item.id === 'invisible' ? perks?.invisibleMode : item.id === 'anon' ? perks?.anonMode : 'off';
                    const vipActive = item.id === 'vip' && perks?.vipUntil != null && perks.vipUntil > Date.now();
                    const boostLeft = item.id === 'xpboost' ? (perks?.xpBoostGames ?? 0) : 0;
                    // status line under the name: what the player currently has
                    const status =
                      isToggle && owned ? (mode === 'always' ? '✓ ჩართულია' : 'შეძენილია · გამორთულია')
                      : vipActive ? `აქტიურია კიდევ ${Math.max(1, Math.ceil((perks!.vipUntil! - Date.now()) / 3_600_000))} სთ`
                      : boostLeft > 0 ? `დარჩა ${boostLeft} თამაში`
                      : item.desc;
                    return (
                      <div key={item.id} className="rounded-2xl p-3"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="flex items-start gap-3">
                          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                            style={{ background: 'rgba(155,0,255,0.12)', border: '1px solid rgba(155,0,255,0.25)' }}>
                            {PERK_EMOJI[item.id]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-display font-bold text-white text-[14px] leading-tight">{item.ka}</p>
                              {isToggle && owned && (
                                <span className="font-mono text-[9px] px-1.5 py-0.5 rounded"
                                  style={{ background: 'rgba(0,255,136,0.12)', color: '#5ce1a0' }}>OWNED</span>
                              )}
                            </div>
                            <p className="font-mono text-[11px] text-white/45 mt-0.5 leading-snug">{status}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2.5">
                          {/* Toggles: buy once, then Configure. Consumables/duration: (re)buy. */}
                          {isToggle && owned ? (
                            <button onClick={() => setConfiguring(item.id as 'invisible' | 'anon')}
                              className="flex-1 py-2 rounded-xl font-mono text-[12px] font-bold transition-all active:scale-[0.98]"
                              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e8edf7' }}>
                              Configure
                            </button>
                          ) : (
                            <button onClick={() => buyPerk(item.id)} disabled={perkBusy === item.id}
                              className="flex-1 py-2 rounded-xl font-mono text-[12px] font-bold transition-all active:scale-[0.98] disabled:opacity-50"
                              style={{ background: 'rgba(250,204,21,0.14)', border: '1px solid rgba(250,204,21,0.4)', color: '#facc15' }}>
                              {perkBusy === item.id ? '…' : `${item.price} 🪙${(vipActive || boostLeft > 0) ? ' · კიდევ' : ''}`}
                            </button>
                          )}
                        </div>
                        {/* Configure dialog (Yes = always on / No = off) */}
                        {configuring === item.id && (
                          <div className="mt-2 flex gap-2">
                            <button onClick={() => configurePerk(item.id as 'invisible' | 'anon', 'always')}
                              className="flex-1 py-2 rounded-lg font-mono text-[12px] font-bold"
                              style={{ background: 'rgba(0,255,136,0.14)', border: '1px solid rgba(0,255,136,0.35)', color: '#5ce1a0' }}>
                              ყოველთვის ჩართე
                            </button>
                            <button onClick={() => configurePerk(item.id as 'invisible' | 'anon', 'off')}
                              className="flex-1 py-2 rounded-lg font-mono text-[12px] font-bold"
                              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#e8edf7' }}>
                              გამორთე
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <p className="font-mono text-[10px] text-white/25 leading-relaxed pt-1 text-center">
                    უჩინარობა/ანონიმურობა ერთხელ იყიდება, მერე ჩართე/გამორთე „Configure"-ით. პროჟექტორი და ბუსტერი ხელახლა იყიდება.
                  </p>
                </div>
                )}

                {/* ── Backgrounds tab ── */}
                {shopTab === 'backgrounds' && (
                <div className="space-y-2">
                  <p className="font-mono text-[12px] text-white/30 tracking-widest text-center pb-1">
                    Full-bleed backgrounds for your profile page
                  </p>
                  {bgMsg && (
                    <p className="text-center font-mono text-xs text-neon-green/70 py-1">{bgMsg}</p>
                  )}
                  {PROFILE_BACKGROUNDS.map(bg => {
                    const isOwned = unlockedItems.includes(bg.id);
                    const isBuying = buyingBg === bg.id;
                    return (
                      <div key={bg.id}
                        className="flex items-center gap-3 rounded-xl p-3 border transition-all"
                        style={isOwned
                          ? { borderColor: `${bg.accent}30`, background: `${bg.accent}06` }
                          : { borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}
                      >
                        <div className="w-12 h-12 rounded-xl shrink-0 border border-white/10" style={{ background: bg.css }} />
                        <div className="flex-1 min-w-0">
                          <p className="font-display font-bold text-sm text-white/90 truncate">{bg.name}</p>
                          <p className="font-mono text-[12px] uppercase tracking-wider" style={{ color: RARITY_COLOR[bg.rarity] }}>
                            {RARITY_LABEL[bg.rarity]}
                          </p>
                          {isOwned ? (
                            <p className="font-mono text-[12px] text-neon-green/60">Owned</p>
                          ) : (
                            <p className="font-mono text-[12px] text-amber-400/70 font-bold">
                              {bg.price === 0 ? 'Free' : `${bg.price} coins`}
                            </p>
                          )}
                        </div>
                        {isOwned ? (
                          <div className="shrink-0 px-2.5 py-1 rounded-lg font-mono text-[12px] text-neon-green/60 border border-neon-green/20">
                            Owned
                          </div>
                        ) : (
                          <button
                            disabled={isBuying || !!buyingBg || bg.price === 0}
                            onClick={() => bg.price > 0 && handleBuyBackground(bg.id)}
                            className="shrink-0 px-2.5 py-1.5 rounded-lg font-mono text-[12px] font-bold transition-all disabled:opacity-40"
                            style={{ background: 'rgba(255,180,0,0.1)', color: 'rgba(255,180,0,0.85)', border: '1px solid rgba(255,180,0,0.25)' }}
                          >
                            {isBuying ? '...' : bg.price === 0 ? 'Free' : 'Buy'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                  <p className="text-center font-mono text-[12px] text-white/15 leading-relaxed pt-2 px-2">
                    Profile backgrounds are permanent unlocks. Equip from Profile &gt; Wallpapers tab.
                  </p>
                </div>
                )}

                {/* ── Name Colors tab ── */}
                {shopTab === 'names' && (
                <div className="space-y-2">
                  <p className="font-mono text-[12px] text-white/30 tracking-widest text-center pb-1">
                    Your name color shows everywhere — feed, chat, lounge &amp; games
                  </p>
                  {/* Live preview */}
                  <div className="flex items-center justify-center gap-2 py-2 mb-1 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span className="font-mono text-[12px] text-white/25 uppercase tracking-widest">Preview</span>
                    <span className="font-display font-bold text-base"
                      style={{
                        color: NAME_COLORS.find(n => n.id === equippedNameColor)?.color ?? 'rgba(255,255,255,0.85)',
                        textShadow: nameColorGlow(NAME_COLORS.find(n => n.id === equippedNameColor)?.color ?? null),
                      }}>
                      {profile?.username ?? 'You'}
                    </span>
                  </div>
                  {ncMsg && <p className="text-center font-mono text-xs text-neon-green/70 py-1">{ncMsg}</p>}
                  {equippedNameColor && (
                    <button
                      onClick={() => handleEquipNameColor(null)}
                      disabled={!!busyNc}
                      className="w-full py-1.5 rounded-lg font-mono text-[12px] text-white/40 hover:text-white/60 border border-white/10 transition-all disabled:opacity-40"
                    >
                      {busyNc === '__off' ? '...' : 'Remove name color'}
                    </button>
                  )}
                  {NAME_COLORS.map(nc => {
                    const isOwned = unlockedItems.includes(nc.id);
                    const isEquipped = equippedNameColor === nc.id;
                    const price = NAME_COLOR_PRICES[nc.id];
                    const isBusy = busyNc === nc.id;
                    return (
                      <div key={nc.id}
                        className="flex items-center gap-3 rounded-xl p-3 border transition-all"
                        style={isEquipped
                          ? { borderColor: `${nameColorUI(nc.color)}80`, background: `${nameColorUI(nc.color)}12`, boxShadow: `0 0 16px ${nameColorUI(nc.color)}22` }
                          : isOwned
                          ? { borderColor: `${nameColorUI(nc.color)}30`, background: `${nameColorUI(nc.color)}08` }
                          : { borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}
                      >
                        <div className="w-10 h-10 rounded-full shrink-0 border border-white/10" style={{ background: nc.color, boxShadow: `0 0 10px ${nameColorUI(nc.color)}66` }} />
                        <div className="flex-1 min-w-0">
                          <p className="font-display font-bold text-sm truncate" style={{ color: nameColorUI(nc.color) }}>{nc.name}</p>
                          <p className="font-mono text-[12px] uppercase tracking-wider" style={{ color: RARITY_COLOR[nc.rarity] }}>
                            {RARITY_LABEL[nc.rarity]}
                          </p>
                          {!isOwned && (
                            <p className="font-mono text-[12px] text-amber-400/70 font-bold">
                              {price != null ? `${price} coins` : 'Level unlock'}
                            </p>
                          )}
                        </div>
                        {isEquipped ? (
                          <div className="shrink-0 px-2.5 py-1 rounded-lg font-mono text-[12px] border" style={{ color: nameColorUI(nc.color), borderColor: `${nameColorUI(nc.color)}40` }}>
                            Equipped
                          </div>
                        ) : isOwned ? (
                          <button
                            disabled={!!busyNc}
                            onClick={() => handleEquipNameColor(nc.id)}
                            className="shrink-0 px-2.5 py-1.5 rounded-lg font-mono text-[12px] font-bold transition-all disabled:opacity-40"
                            style={{ background: `${nameColorUI(nc.color)}1a`, color: nameColorUI(nc.color), border: `1px solid ${nameColorUI(nc.color)}40` }}
                          >
                            {isBusy ? '...' : 'Equip'}
                          </button>
                        ) : price != null ? (
                          <button
                            disabled={!!busyNc}
                            onClick={() => handleBuyNameColor(nc.id)}
                            className="shrink-0 px-2.5 py-1.5 rounded-lg font-mono text-[12px] font-bold transition-all disabled:opacity-40"
                            style={{ background: 'rgba(255,180,0,0.1)', color: 'rgba(255,180,0,0.85)', border: '1px solid rgba(255,180,0,0.25)' }}
                          >
                            {isBusy ? '...' : 'Buy'}
                          </button>
                        ) : (
                          <div className="shrink-0 px-2.5 py-1 rounded-lg font-mono text-[12px] text-white/25 border border-white/10">
                            Locked
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <p className="text-center font-mono text-[12px] text-white/15 leading-relaxed pt-2 px-2">
                    Name colors are permanent unlocks. Cyan &amp; Purple unlock at level 3.
                  </p>
                </div>
                )}

                {/* ── Space Themes tab ── */}
                {shopTab === 'spaces' && (
                <div className="space-y-2">
                  <p className="font-mono text-[12px] text-white/30 tracking-widest text-center pb-1">
                    Visual themes for the VOID LOUNGE &amp; your spaces
                  </p>
                  {spMsg && <p className="text-center font-mono text-xs text-neon-green/70 py-1">{spMsg}</p>}
                  {SPACE_THEME_DEFS.map(th => {
                    const itemId = itemIdForTheme(th.id);
                    const isOwned = th.price === 0 || unlockedItems.includes(itemId);
                    const isBusy = busySp === itemId;
                    return (
                      <div key={th.id}
                        className="flex items-center gap-3 rounded-xl p-3 border transition-all"
                        style={isOwned
                          ? { borderColor: `${th.accent}30`, background: `${th.accent}08` }
                          : { borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}
                      >
                        <div className="w-14 h-12 rounded-lg shrink-0 border border-white/10" style={{ background: th.bg }} />
                        <div className="flex-1 min-w-0">
                          <p className="font-display font-bold text-sm truncate" style={{ color: th.accent }}>{th.name}</p>
                          <p className="font-mono text-[12px] uppercase tracking-wider" style={{ color: RARITY_COLOR[th.rarity] }}>
                            {RARITY_LABEL[th.rarity]}
                          </p>
                          {!isOwned && (
                            <p className="font-mono text-[12px] text-amber-400/70 font-bold">{th.price} coins</p>
                          )}
                        </div>
                        {isOwned ? (
                          <div className="shrink-0 px-2.5 py-1 rounded-lg font-mono text-[12px]" style={{ color: th.accent, border: `1px solid ${th.accent}40` }}>
                            {th.price === 0 ? 'Default' : 'Owned'}
                          </div>
                        ) : (
                          <button
                            disabled={!!busySp}
                            onClick={() => handleBuySpaceTheme(itemId)}
                            className="shrink-0 px-2.5 py-1.5 rounded-lg font-mono text-[12px] font-bold transition-all disabled:opacity-40"
                            style={{ background: 'rgba(255,180,0,0.1)', color: 'rgba(255,180,0,0.85)', border: '1px solid rgba(255,180,0,0.25)' }}
                          >
                            {isBusy ? '...' : 'Buy'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                  <p className="text-center font-mono text-[12px] text-white/15 leading-relaxed pt-2 px-2">
                    Apply a theme inside any space you own via the 🎨 button. Everyone in the room sees it.
                  </p>
                </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
