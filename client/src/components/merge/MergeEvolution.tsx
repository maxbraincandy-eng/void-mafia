// ── Merge Evolution ───────────────────────────────────────────────────
// A living laboratory rather than a menu: the organism breathes, reacts to
// touch, throws off particles when it drops something, and every purchase
// visibly changes it. Nothing here decides rewards — the server does; this
// file's job is to make what the server said FEEL like it happened.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import { useFullscreenOverlay } from '@/lib/overlayGuard';
import { useSocialStore } from '@/store/socialStore';
import { useAuthStore } from '@/store/authStore';
import { EvolutionCore, Chest, RES_ART, UpgradeGlyph, LabMotes, hueOf } from './art';

type ResKey = 'frag' | 'cell' | 'adna' | 'ncore' | 'energyCell' | 'particle' | 'crystal' | 'upgrade';
type ChestTier = 'common' | 'advanced' | 'legendary' | 'social';
type UpKey = 'energyCap' | 'chestQuality' | 'mergeSpeed' | 'rareChance' | 'appearance';
type Tab = 'lab' | 'merge' | 'chests' | 'shop' | 'upgrades' | 'board';

interface Profile {
  stage: number; xp: number; energy: number; energyMax: number; nextEnergyInMs: number;
  chestMeter: number; resources: Partial<Record<ResKey, number>>; chests: Partial<Record<ChestTier, number>>;
  upgrades: Partial<Record<UpKey, number>>; taps: number; merges: number; opened: number;
  socialAvailable: boolean; boosts: number;
}
interface Catalog {
  stages: Array<{ key: string; name: string; ka: string; needs: number }>;
  chain: ResKey[];
  res: Record<ResKey, { name: string; ka: string; tier: number }>;
  chests: Record<ChestTier, { name: string; ka: string }>;
  mergeCost: number;
  upgrades: Array<{ key: UpKey; name: string; ka: string; desc: string; max: number; costs: Array<Partial<Record<ResKey, number>>> }>;
  energy: { meterFull: number; meterPerTap: number; tapCost: number };
}
interface OpenResult {
  tier: ChestTier; boosted: boolean; rewards: Array<{ key: ResKey; amount: number }>; profile: Profile;
}
interface BoardRow {
  rank: number; userId: string; username: string; avatar: string; avatarUrl: string | null;
  stage: number; stageName: string; xp: number; merges: number; opened: number;
}

const unwrap = <T,>(r: any): T => { if (r?.ok === false || r?.error) throw new Error(r.error ?? 'შეცდომა'); return (r?.data ?? r) as T; };
const CHEST_COL: Record<ChestTier, string> = { common: '#8fb3ff', advanced: '#4dd4c4', legendary: '#ffd45a', social: '#ff6b8a' };

/** The app's coin, drawn to match the rest of the set rather than an emoji. */
function CoinMark({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} style={{ display: 'block', flexShrink: 0 }}>
      <circle cx="16" cy="16" r="13" fill="#c8901c" />
      <circle cx="16" cy="16" r="13" fill="none" stroke="#ffe9a8" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="9" fill="#ffd45a" />
      <path d="M16 9 l2.2 4.6 5 .7 -3.6 3.5 .9 5 -4.5-2.4 -4.5 2.4 .9-5 -3.6-3.5 5-.7z" fill="#8a5f0c" opacity="0.55" />
    </svg>
  );
}
function EnergyBolt({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} style={{ display: 'block' }}>
      <path d="M18 3 L8 18 h6 l-3 11 12-16 h-6z" fill="#5ce1a0" />
      <path d="M18 3 L8 18 h6" fill="none" stroke="#d8ffe9" strokeWidth="1.2" />
    </svg>
  );
}

/** A short-lived floating label, used for drops and merge results. */
interface Float { id: number; text: string; x: number; color: string }

export function MergeEvolution({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('lab');
  const [p, setP] = useState<Profile | null>(null);
  const [cat, setCat] = useState<Catalog | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [pulse, setPulse] = useState(1);
  const [floats, setFloats] = useState<Float[]>([]);
  const [burst, setBurst] = useState(0);
  const [opening, setOpening] = useState<{ tier: ChestTier; phase: number; res?: OpenResult } | null>(null);
  const [evolveFx, setEvolveFx] = useState(false);
  const [board, setBoard] = useState<BoardRow[] | null>(null);
  const [shop, setShop] = useState<{ coins: number; chests: Array<{ tier: ChestTier; coins: number; name: string }>; energyRefill: number } | null>(null);

  const floatId = useRef(0);
  const tapQueue = useRef(0);
  const flushT = useRef<number | null>(null);
  const openProfile = useSocialStore(s => s.openProfile);
  const myId = useAuthStore(s => s.profile?.id ?? s.uid);

  const hue = hueOf(p?.upgrades.appearance ?? 0);
  const stage = p?.stage ?? 0;
  const stageDef = cat?.stages[stage];
  const needUpgrades = stageDef?.needs ?? 0;
  const haveUpgrades = p?.resources.upgrade ?? 0;
  const canEvolve = !!p && stage < (cat?.stages.length ?? 6) - 1 && haveUpgrades >= needUpgrades && needUpgrades > 0;

  // ── load ──
  const load = useCallback(async () => {
    try {
      const r = unwrap<{ profile: Profile; catalog: Catalog }>(await emitWithAck('merge:state'));
      setP(r.profile); setCat(r.catalog);
    } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // energy ticks up on its own — reflect it without hammering the server
  useEffect(() => {
    const t = setInterval(() => {
      setP(prev => (prev && prev.energy < prev.energyMax ? { ...prev, nextEnergyInMs: Math.max(0, prev.nextEnergyInMs - 1000) } : prev));
    }, 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!p || p.energy >= p.energyMax || p.nextEnergyInMs > 0) return;
    const t = setTimeout(load, 400);       // a unit just matured — resync
    return () => clearTimeout(t);
  }, [p?.nextEnergyInMs, p?.energy, p?.energyMax, load, p]);

  const pushFloat = (text: string, color: string) => {
    const id = ++floatId.current;
    setFloats(f => [...f.slice(-6), { id, text, x: 40 + Math.random() * 20, color }]);
    setTimeout(() => setFloats(f => f.filter(x => x.id !== id)), 1100);
  };

  // ── tapping: batched so a fast tapper doesn't spam the socket ──
  const flushTaps = useCallback(async () => {
    const n = tapQueue.current;
    tapQueue.current = 0;
    flushT.current = null;
    if (n <= 0) return;
    try {
      const r = unwrap<any>(await emitWithAck('merge:tap', { count: Math.min(10, n) }));
      setP(r.profile);
      if (r.drop) {
        pushFloat(`+${r.drop.amount} ${cat?.res[r.drop.key as ResKey].ka ?? ''}`, '#8fe3ff');
        setBurst(b => b + 1);
      }
      if (r.chestEarned) pushFloat(`${cat?.chests[r.chestEarned as ChestTier].ka ?? 'ყუთი'}!`, CHEST_COL[r.chestEarned as ChestTier]);
    } catch (e: any) {
      if (!/ენერგია/.test(e.message)) setErr(e.message);
      else pushFloat('ენერგია ამოიწურა', '#ff8fa0');
      load();
    }
  }, [cat, load]);

  const onTapCore = () => {
    if (!p || p.energy < 1) { pushFloat('ენერგია ამოიწურა', '#ff8fa0'); return; }
    // optimistic feel: the organism reacts NOW, the server confirms in a moment
    setPulse(1.16);
    setTimeout(() => setPulse(1), 130);
    setP(prev => prev ? {
      ...prev,
      energy: Math.max(0, prev.energy - 1),
      chestMeter: Math.min(100, prev.chestMeter + (cat?.energy.meterPerTap ?? 7)),
    } : prev);
    tapQueue.current++;
    if (!flushT.current) flushT.current = window.setTimeout(flushTaps, 260);
  };

  // ── merge ──
  const doMerge = async (key: ResKey, all = false) => {
    if (busy) return;
    setBusy(true);
    try {
      const times = all ? Math.floor((p?.resources[key] ?? 0) / (cat?.mergeCost ?? 3)) : 1;
      const r = unwrap<any>(await emitWithAck('merge:merge', { key, times: Math.max(1, times) }));
      setP(r.profile);
      setBurst(b => b + 1);
      pushFloat(`+${r.made} ${cat?.res[r.to as ResKey].ka ?? ''}`, '#7ff0e0');
    } catch (e: any) { pushFloat(e.message, '#ff8fa0'); }
    finally { setBusy(false); }
  };

  // ── evolve ──
  const doEvolve = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = unwrap<any>(await emitWithAck('merge:evolve'));
      setEvolveFx(true);
      setTimeout(() => setEvolveFx(false), 2200);
      setP(r.profile);
      setTab('lab');
    } catch (e: any) { pushFloat(e.message, '#ff8fa0'); }
    finally { setBusy(false); }
  };

  // ── chest opening: a sequence, not a popup ──
  const openChest = async (tier: ChestTier) => {
    if (opening) return;
    setOpening({ tier, phase: 0 });
    try {
      const r = unwrap<OpenResult>(await emitWithAck('merge:open', { tier }));
      // phase 0 shake → 1 lid lifts → 2 rewards fly out
      setTimeout(() => setOpening(o => o ? { ...o, phase: 1, res: r } : o), 620);
      setTimeout(() => setOpening(o => o ? { ...o, phase: 2 } : o), 1180);
      setTimeout(() => setP(r.profile), 1200);
    } catch (e: any) {
      setOpening(null);
      pushFloat(e.message, '#ff8fa0');
    }
  };

  const claimSocial = async () => {
    try {
      const r = unwrap<any>(await emitWithAck('merge:social'));
      setP(r.profile);
      pushFloat('გაზიარების ყუთი მიღებულია', '#ff6b8a');
      setTab('chests');
    } catch (e: any) { pushFloat(e.message, '#ff8fa0'); }
  };

  const buyUpgrade = async (key: UpKey) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = unwrap<any>(await emitWithAck('merge:upgrade', { key }));
      setP(r.profile);
      pushFloat(`${cat?.upgrades.find(u => u.key === key)?.ka} → ${r.level}`, '#c9a6ff');
      setBurst(b => b + 1);
    } catch (e: any) { pushFloat(e.message, '#ff8fa0'); }
    finally { setBusy(false); }
  };

  const loadShop = async () => {
    setTab('shop');
    try { setShop(unwrap<any>(await emitWithAck('merge:shop'))); }
    catch (e: any) { setErr(e.message); }
  };
  const buyChest = async (tier: ChestTier) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = unwrap<any>(await emitWithAck('merge:buy_chest', { tier }));
      setP(r.profile);
      setShop(sh => sh ? { ...sh, coins: r.coins } : sh);
      pushFloat(`${cat?.chests[tier as ChestTier].ka} ნაყიდია`, CHEST_COL[tier]);
      setTab('chests');
    } catch (e: any) { pushFloat(e.message, '#ff8fa0'); }
    finally { setBusy(false); }
  };
  const buyEnergy = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = unwrap<any>(await emitWithAck('merge:buy_energy'));
      setP(r.profile);
      setShop(sh => sh ? { ...sh, coins: r.coins } : sh);
      pushFloat('ენერგია შევსებულია', '#5ce1a0');
    } catch (e: any) { pushFloat(e.message, '#ff8fa0'); }
    finally { setBusy(false); }
  };

  const loadBoard = async () => {
    setTab('board'); setBoard(null);
    try { setBoard(unwrap<BoardRow[]>(await emitWithAck('merge:board', { limit: 50 }))); }
    catch (e: any) { setErr(e.message); setBoard([]); }
  };

  // locks background scroll AND the app's swipe-to-navigate gesture
  useFullscreenOverlay();

  const resList = useMemo(() => {
    if (!p || !cat) return [];
    const order: ResKey[] = ['frag', 'cell', 'adna', 'ncore', 'particle', 'crystal', 'upgrade'];
    return order.filter(k => (p.resources[k] ?? 0) > 0).map(k => ({ key: k, n: p.resources[k] ?? 0 }));
  }, [p, cat]);

  const chestCount = p ? (Object.values(p.chests).reduce((a, b) => a + (b ?? 0), 0)) : 0;

  return createPortal(
    <div style={S.wrap}>
      <LabMotes hue={hue} />
      {/* lab grid floor */}
      <div style={{ ...S.grid, backgroundImage: `linear-gradient(${`hsla(${hue},90%,60%,.06)`} 1px, transparent 1px), linear-gradient(90deg, ${`hsla(${hue},90%,60%,.06)`} 1px, transparent 1px)` }} />

      <div style={S.inner}>
        {/* ── header ── */}
        <div style={S.header}>
          <button style={S.icon} onClick={onClose}>‹</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={S.title}>MERGE EVOLUTION</div>
            <div style={S.sub}>{stageDef?.ka ?? '—'} · დონე {stage + 1}/{cat?.stages.length ?? 6}</div>
          </div>
          {p && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: '"Space Grotesk",monospace', fontWeight: 800, fontSize: 15, color: `hsl(${hue},90%,72%)` }}>{p.xp.toLocaleString()}</div>
              <div style={{ fontSize: 9, color: '#7d86a0', letterSpacing: 1 }}>XP</div>
            </div>
          )}
        </div>

        {err && <div style={S.err} onClick={() => setErr(null)}>{err}</div>}

        {/* ── energy + chest meter ── */}
        {p && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div style={S.gauge}>
              <div style={{ display: 'flex', fontSize: 10.5, color: '#9fb0c8', marginBottom: 3 }}>
                <span style={{ flex: 1 }}>ენერგია</span>
                <span style={{ fontFamily: 'monospace' }}>{p.energy}/{p.energyMax}</span>
              </div>
              <div style={S.track}><div style={{ ...S.fill, width: `${(p.energy / p.energyMax) * 100}%`, background: 'linear-gradient(90deg,#5ce1a0,#8fe3ff)' }} /></div>
              {p.energy < p.energyMax && (
                <div style={{ fontSize: 9.5, color: '#6b7690', marginTop: 2 }}>+1 · {Math.ceil(p.nextEnergyInMs / 1000)}წმ</div>
              )}
            </div>
            <div style={S.gauge}>
              <div style={{ display: 'flex', fontSize: 10.5, color: '#9fb0c8', marginBottom: 3 }}>
                <span style={{ flex: 1 }}>ყუთის მზადყოფნა</span>
                <span style={{ fontFamily: 'monospace' }}>{p.chestMeter}%</span>
              </div>
              <div style={S.track}><div style={{ ...S.fill, width: `${p.chestMeter}%`, background: 'linear-gradient(90deg,#ffb020,#ffd45a)' }} /></div>
              {p.boosts > 0 && <div style={{ fontSize: 9.5, color: '#ffd45a', marginTop: 2 }}>⚡ {p.boosts} ტესტის ბონუსი მზადაა</div>}
            </div>
          </div>
        )}

        {/* ── tabs ── */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingBottom: 8 }}>
          {([['lab', 'ლაბორატორია'], ['merge', 'შერწყმა'], ['chests', `ყუთები${chestCount ? ` (${chestCount})` : ''}`], ['upgrades', 'გაუმჯობესება']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ ...S.chip, ...(tab === id ? { ...S.chipOn, borderColor: `hsl(${hue},90%,60%)` } : {}) }}>{label}</button>
          ))}
          <button onClick={loadShop} style={{ ...S.chip, ...(tab === 'shop' ? S.chipOn : {}) }}>🪙 მაღაზია</button>
          <button onClick={loadBoard} style={{ ...S.chip, ...(tab === 'board' ? S.chipOn : {}) }}>რეიტინგი</button>
        </div>

        <AnimatePresence mode="wait">
          {/* ── LAB ── */}
          {tab === 'lab' && (
            <motion.div key="lab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div style={S.stage}>
                {/* halo rings */}
                <div style={{ ...S.ring, borderColor: `hsla(${hue},95%,65%,.18)`, width: 268, height: 268 }} />
                <div style={{ ...S.ring, borderColor: `hsla(${hue},95%,65%,.1)`, width: 316, height: 316 }} />

                <motion.div
                  animate={{ scale: pulse, y: [0, -6, 0] }}
                  transition={{ scale: { duration: 0.13 }, y: { duration: 4.2, repeat: Infinity, ease: 'easeInOut' } }}
                  onPointerDown={onTapCore}
                  style={{ cursor: 'pointer', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}>
                  <EvolutionCore stage={stage} hue={hue} size={236} pulse={pulse} />
                </motion.div>

                {/* particle burst on a drop / merge / purchase */}
                <AnimatePresence>
                  {burst > 0 && (
                    <motion.div key={burst} style={S.burstWrap} initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.85 }}>
                      {Array.from({ length: 14 }, (_, i) => {
                        const a = (i / 14) * Math.PI * 2;
                        return (
                          <motion.span key={i} style={{ ...S.spark, background: `hsl(${(hue + i * 12) % 360},100%,72%)` }}
                            initial={{ x: 0, y: 0, opacity: 1 }}
                            animate={{ x: Math.cos(a) * 118, y: Math.sin(a) * 118, opacity: 0 }}
                            transition={{ duration: 0.8, ease: 'easeOut' }} />
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* floating labels */}
                <div style={S.floatWrap}>
                  <AnimatePresence>
                    {floats.map(f => (
                      <motion.div key={f.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: -48 }} exit={{ opacity: 0 }}
                        transition={{ duration: 1 }} style={{ ...S.float, left: `${f.x}%`, color: f.color }}>
                        {f.text}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              <div style={{ ...S.dim, textAlign: 'center' }}>შეეხე ორგანიზმს — ის იზრდება და რესურსს გამოყოფს</div>

              {canEvolve && (
                <motion.button animate={{ boxShadow: [`0 0 0 hsla(${hue},100%,60%,0)`, `0 0 26px hsla(${hue},100%,60%,.45)`, `0 0 0 hsla(${hue},100%,60%,0)`] }}
                  transition={{ duration: 2, repeat: Infinity }} onClick={doEvolve} disabled={busy}
                  style={{ ...S.evolveBtn, background: `linear-gradient(135deg, hsl(${hue},85%,52%), hsl(${(hue + 50) % 360},80%,45%))` }}>
                  ევოლუცია → {cat?.stages[stage + 1]?.ka}
                </motion.button>
              )}
              {!canEvolve && needUpgrades > 0 && (
                <div style={S.evolveNeed}>
                  შემდეგ დონემდე: <b style={{ color: '#ffd45a' }}>{haveUpgrades}/{needUpgrades}</b> {cat?.res.upgrade.ka}
                </div>
              )}

              {/* resources strip */}
              {resList.length > 0 && (
                <div style={S.resStrip}>
                  {resList.map(({ key, n }) => {
                    const A = RES_ART[key];
                    return (
                      <div key={key} style={S.resPill}>
                        <A size={30} />
                        <span style={{ fontFamily: '"Space Grotesk",monospace', fontWeight: 700, fontSize: 13 }}>{n}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* social chest */}
              <button onClick={claimSocial} disabled={!p?.socialAvailable}
                style={{ ...S.socialBtn, opacity: p?.socialAvailable ? 1 : 0.45 }}>
                <Chest tier="social" size={44} />
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ color: '#ff9fb4', fontWeight: 700, fontSize: 13.5 }}>გაზიარების ყუთი</div>
                  <div style={{ fontSize: 11, color: '#7d86a0' }}>
                    {p?.socialAvailable ? 'გააზიარე ევოლუცია და აიღე — დღეში ერთხელ' : 'დღეს უკვე აღებულია'}
                  </div>
                </div>
              </button>
            </motion.div>
          )}

          {/* ── MERGE ── */}
          {tab === 'merge' && cat && p && (
            <motion.div key="mg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ paddingBottom: 30 }}>
              <div style={{ ...S.dim, textAlign: 'left', paddingTop: 0 }}>
                {cat.mergeCost}x ერთი დონე → 1x შემდეგი. ბოლო რგოლი გაძლევს {cat.res.upgrade.ka}-ს, რომლითაც ევოლუცია ხდება.
              </div>
              {cat.chain.map((key, i) => {
                const have = p.resources[key] ?? 0;
                const to = i + 1 < cat.chain.length ? cat.chain[i + 1] : ('upgrade' as ResKey);
                const A = RES_ART[key], B = RES_ART[to];
                const can = Math.floor(have / cat.mergeCost);
                return (
                  <div key={key} style={{ ...S.mergeRow, opacity: can > 0 ? 1 : 0.55 }}>
                    <div style={{ position: 'relative' }}>
                      <A size={46} />
                      <span style={S.countBadge}>{have}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#e8edf7', fontWeight: 600 }}>{cat.res[key].ka}</div>
                      <div style={{ fontSize: 11, color: '#7d86a0' }}>{cat.mergeCost}x → 1x {cat.res[to].ka}</div>
                    </div>
                    <span style={{ color: '#4dd4c4', fontSize: 18 }}>→</span>
                    <B size={38} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <button disabled={can < 1 || busy} onClick={() => doMerge(key)} style={{ ...S.mergeBtn, opacity: can < 1 ? 0.4 : 1 }}>×1</button>
                      {can > 1 && <button disabled={busy} onClick={() => doMerge(key, true)} style={{ ...S.mergeBtn, background: 'rgba(77,212,196,.2)' }}>×{can}</button>}
                    </div>
                  </div>
                );
              })}
            </motion.div>
          )}

          {/* ── CHESTS ── */}
          {tab === 'chests' && cat && p && (
            <motion.div key="ch" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ paddingBottom: 30 }}>
              {p.boosts > 0 && (
                <div style={S.boostNote}>
                  ⚡ <b>{p.boosts}</b> დასრულებული ტესტი გელოდება — შემდეგი ყუთი ავტომატურად უფრო მაღალ დონეზე გაიხსნება
                </div>
              )}
              {(['legendary', 'social', 'advanced', 'common'] as ChestTier[]).map(t => {
                const n = p.chests[t] ?? 0;
                if (!n) return null;
                return (
                  <button key={t} onClick={() => openChest(t)} style={{ ...S.chestRow, borderColor: `${CHEST_COL[t]}55` }}>
                    <Chest tier={t} size={62} />
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ color: CHEST_COL[t], fontWeight: 700, fontSize: 14 }}>{cat.chests[t].ka}</div>
                      <div style={{ fontSize: 11, color: '#7d86a0' }}>დააჭირე გასახსნელად</div>
                    </div>
                    <span style={{ ...S.countBadge, position: 'static' }}>{n}</span>
                  </button>
                );
              })}
              {chestCount === 0 && (
                <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                  <Chest tier="common" size={84} />
                  <div style={{ ...S.dim, marginTop: 8 }}>ყუთი არ გაქვს — შეეხე ორგანიზმს, რომ მზადყოფნის ზოლი აივსოს</div>
                </div>
              )}
            </motion.div>
          )}

          {/* ── UPGRADES ── */}
          {tab === 'upgrades' && cat && p && (
            <motion.div key="up" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ paddingBottom: 30 }}>
              {cat.upgrades.map(u => {
                const lvl = p.upgrades[u.key] ?? 0;
                const maxed = lvl >= u.max;
                const cost = maxed ? {} : (u.costs[lvl] ?? {});
                const afford = Object.entries(cost).every(([k, n]) => (p.resources[k as ResKey] ?? 0) >= (n as number));
                return (
                  <div key={u.key} style={S.upRow}>
                    <UpgradeGlyph kind={u.key} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, color: '#e8edf7', fontWeight: 700 }}>{u.ka}</div>
                      <div style={{ fontSize: 11, color: '#7d86a0' }}>{u.desc}</div>
                      <div style={{ display: 'flex', gap: 3, marginTop: 5 }}>
                        {Array.from({ length: u.max }, (_, i) => (
                          <span key={i} style={{ width: 14, height: 4, borderRadius: 2, background: i < lvl ? `hsl(${hue},90%,62%)` : 'rgba(255,255,255,.12)' }} />
                        ))}
                      </div>
                      {!maxed && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          {Object.entries(cost).map(([k, n]) => {
                            const A = RES_ART[k as ResKey];
                            const enough = (p.resources[k as ResKey] ?? 0) >= (n as number);
                            return (
                              <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11.5, color: enough ? '#c9d3e6' : '#ff8fa0' }}>
                                <A size={18} />{n}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <button disabled={maxed || !afford || busy} onClick={() => buyUpgrade(u.key)}
                      style={{ ...S.buyBtn, opacity: maxed || !afford ? 0.4 : 1 }}>
                      {maxed ? 'MAX' : `${lvl + 1}`}
                    </button>
                  </div>
                );
              })}
            </motion.div>
          )}


          {/* ── SHOP: chests for the app's mafia coins ── */}
          {tab === 'shop' && cat && (
            <motion.div key="sh" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ paddingBottom: 30 }}>
              <div style={S.coinBar}>
                <CoinMark size={26} />
                <span style={{ flex: 1, fontSize: 12.5, color: '#9fb0c8' }}>ჩემი მონეტები</span>
                <span style={{ fontFamily: '"Space Grotesk",monospace', fontWeight: 800, fontSize: 18, color: '#ffd45a' }}>
                  {shop ? shop.coins.toLocaleString() : '…'}
                </span>
              </div>
              <div style={{ ...S.dim, textAlign: 'left', paddingTop: 4 }}>
                იგივე მონეტები, რაც აპლიკაციაში სხვაგან — ყუთი პირდაპირ ინვენტარში ჩაგივარდება.
              </div>

              {!shop ? <div style={S.dim}>იტვირთება…</div> : (
                <>
                  {shop.chests.map(item => {
                    const afford = shop.coins >= item.coins;
                    return (
                      <div key={item.tier} style={{ ...S.chestRow, borderColor: `${CHEST_COL[item.tier]}55`, cursor: 'default' }}>
                        <Chest tier={item.tier} size={58} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: CHEST_COL[item.tier], fontWeight: 700, fontSize: 14 }}>{item.name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <CoinMark size={15} />
                            <span style={{ fontSize: 12.5, color: afford ? '#e8edf7' : '#ff8fa0', fontFamily: '"Space Grotesk",monospace', fontWeight: 700 }}>
                              {item.coins.toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <button disabled={!afford || busy} onClick={() => buyChest(item.tier)}
                          style={{ ...S.buyCoinBtn, opacity: afford ? 1 : 0.4 }}>ყიდვა</button>
                      </div>
                    );
                  })}

                  <div style={{ ...S.chestRow, borderColor: 'rgba(92,225,160,.4)', cursor: 'default' }}>
                    <div style={S.energyIcon}><EnergyBolt size={34} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#5ce1a0', fontWeight: 700, fontSize: 14 }}>ენერგიის სრული შევსება</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <CoinMark size={15} />
                        <span style={{ fontSize: 12.5, color: shop.coins >= shop.energyRefill ? '#e8edf7' : '#ff8fa0', fontFamily: '"Space Grotesk",monospace', fontWeight: 700 }}>
                          {shop.energyRefill}
                        </span>
                        {p && <span style={{ fontSize: 11, color: '#7d86a0' }}>· ახლა {p.energy}/{p.energyMax}</span>}
                      </div>
                    </div>
                    <button disabled={busy || shop.coins < shop.energyRefill || (p ? p.energy >= p.energyMax : true)}
                      onClick={buyEnergy}
                      style={{ ...S.buyCoinBtn, borderColor: 'rgba(92,225,160,.5)', background: 'rgba(92,225,160,.14)', color: '#b8f5d4',
                        opacity: (shop.coins >= shop.energyRefill && p && p.energy < p.energyMax) ? 1 : 0.4 }}>
                      შევსება
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ── BOARD ── */}
          {tab === 'board' && (
            <motion.div key="bd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ paddingBottom: 30 }}>
              {!board ? <div style={S.dim}>იტვირთება…</div> : board.length === 0 ? <div style={S.dim}>ჯერ ცარიელია</div> : board.map(r => (
                <button key={r.userId} onClick={() => openProfile(r.userId)}
                  style={{ ...S.boardRow, borderColor: r.userId === myId ? `hsl(${hue},90%,60%)` : 'rgba(255,255,255,.07)' }}>
                  <span style={{ width: 26, fontWeight: 800, color: r.rank <= 3 ? '#ffd45a' : '#7d86a0' }}>{r.rank}</span>
                  <div style={S.avatar}>
                    {r.avatarUrl ? <img src={r.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span>{r.avatar || (r.username[0] ?? '?').toUpperCase()}</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <div style={{ fontSize: 13.5, color: '#e8edf7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.username}</div>
                    <div style={{ fontSize: 11, color: '#7d86a0' }}>{r.stageName} · {r.merges} შერწყმა</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: `hsl(${hue},90%,72%)`, fontFamily: '"Space Grotesk",monospace' }}>{r.xp.toLocaleString()}</div>
                    <div style={{ fontSize: 9, color: '#7d86a0' }}>XP</div>
                  </div>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── CHEST OPENING: full-screen sequence ── */}
      <AnimatePresence>
        {opening && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={S.openWrap}
            onClick={() => { if (opening.phase >= 2) { setOpening(null); } }}>
            <motion.div
              animate={opening.phase === 0
                ? { x: [0, -7, 7, -5, 5, 0], rotate: [0, -2, 2, -1, 1, 0] }
                : { scale: [1, 1.06, 1] }}
              transition={opening.phase === 0 ? { duration: 0.6, repeat: Infinity } : { duration: 0.5 }}>
              <Chest tier={opening.tier} size={190} open={opening.phase >= 1 ? 1 : 0} />
            </motion.div>

            {/* light column */}
            {opening.phase >= 1 && (
              <motion.div initial={{ opacity: 0, scaleY: 0.2 }} animate={{ opacity: [0, 0.8, 0.35], scaleY: 1 }}
                transition={{ duration: 0.9 }}
                style={{ ...S.beam, background: `linear-gradient(to top, ${CHEST_COL[opening.tier]}, transparent)` }} />
            )}

            {opening.phase >= 2 && opening.res && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={S.rewardPanel}>
                {opening.res.boosted && (
                  <div style={S.boostBadge}>⚡ ტესტის ბონუსი — ყუთი აიწია {opening.res.tier === 'advanced' ? 'გაუმჯობესებულამდე' : 'ლეგენდარულამდე'}</div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                  {opening.res.rewards.map((rw, i) => {
                    const A = RES_ART[rw.key];
                    return (
                      <motion.div key={rw.key} initial={{ opacity: 0, scale: 0.3, y: -40 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ delay: i * 0.09, type: 'spring', stiffness: 200 }} style={S.rewardItem}>
                        <A size={46} />
                        <span style={{ fontFamily: '"Space Grotesk",monospace', fontWeight: 800, fontSize: 14 }}>×{rw.amount}</span>
                        <span style={{ fontSize: 9.5, color: '#7d86a0', textAlign: 'center', lineHeight: 1.2 }}>{cat?.res[rw.key].ka}</span>
                      </motion.div>
                    );
                  })}
                </div>
                <div style={{ ...S.dim, marginTop: 12 }}>შეეხე გასაგრძელებლად</div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── EVOLUTION FLASH ── */}
      <AnimatePresence>
        {evolveFx && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0.9, 0] }} transition={{ duration: 2.2 }} style={S.evolveWrap}>
            <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: [0.4, 1.15, 1], opacity: 1 }} transition={{ duration: 1.1 }}>
              <EvolutionCore stage={stage} hue={hue} size={280} pulse={1.1} />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              style={{ textAlign: 'center', marginTop: 16 }}>
              <div style={{ fontSize: 12, letterSpacing: 3, color: '#7d86a0' }}>ევოლუცია დასრულდა</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: `hsl(${hue},95%,72%)` }}>{stageDef?.ka}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

const S: Record<string, any> = {
  // html/body are locked (`position: fixed; overflow: hidden`) so this container
  // must opt into scrolling itself: touchAction pan-y overrides the global
  // `* { touch-action: manipulation }`, and -webkit-overflow-scrolling gives the
  // momentum the rest of the app gets from #root.
  wrap: {
    position: 'fixed', inset: 0, zIndex: 72,
    background: 'radial-gradient(ellipse at 50% 18%, #0b1626 0%, #070912 55%, #05060c 100%)',
    overflowY: 'auto', overflowX: 'hidden',
    WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', touchAction: 'manipulation',
  },
  grid: { position: 'absolute', inset: 0, backgroundSize: '38px 38px', pointerEvents: 'none', maskImage: 'radial-gradient(ellipse at 50% 30%, #000 20%, transparent 78%)' },
  inner: { position: 'relative', maxWidth: 540, margin: '0 auto', padding: '14px 14px calc(env(safe-area-inset-bottom, 0px) + 72px)' },
  header: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, position: 'sticky', top: 0, zIndex: 6, background: 'rgba(7,9,18,.9)', backdropFilter: 'blur(10px)', padding: '8px 0' },
  icon: { width: 36, height: 36, borderRadius: 12, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', color: '#c9d3e6', fontSize: 22, lineHeight: 1 },
  title: { fontFamily: '"Space Grotesk",monospace', fontSize: 15.5, fontWeight: 800, color: '#fff', letterSpacing: 2 },
  sub: { fontSize: 11.5, color: '#7d86a0' },
  dim: { color: '#7d86a0', fontSize: 12.5, padding: '10px 0' },
  err: { padding: '9px 12px', borderRadius: 12, background: 'rgba(255,77,94,.14)', color: '#ff8fa0', fontSize: 13, marginBottom: 10 },
  gauge: { flex: 1, padding: '8px 10px', borderRadius: 14, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' },
  track: { height: 6, borderRadius: 4, background: 'rgba(255,255,255,.09)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, transition: 'width .3s' },
  chip: { padding: '7px 12px', borderRadius: 20, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', color: '#c9d3e6', fontSize: 12.5, whiteSpace: 'nowrap' },
  chipOn: { background: 'rgba(255,255,255,.1)', color: '#fff' },
  stage: { position: 'relative', height: 264, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderRadius: '50%', border: '1px solid', pointerEvents: 'none' },
  burstWrap: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, pointerEvents: 'none' },
  spark: { position: 'absolute', width: 6, height: 6, borderRadius: '50%' },
  floatWrap: { position: 'absolute', inset: 0, pointerEvents: 'none' },
  float: { position: 'absolute', top: '38%', fontFamily: '"Space Grotesk",monospace', fontWeight: 700, fontSize: 13, textShadow: '0 2px 10px rgba(0,0,0,.8)', whiteSpace: 'nowrap' },
  evolveBtn: { width: '100%', marginTop: 12, padding: '14px', borderRadius: 16, border: 'none', color: '#fff', fontWeight: 800, fontSize: 15 },
  evolveNeed: { marginTop: 12, padding: '11px 13px', borderRadius: 14, background: 'rgba(255,212,90,.08)', border: '1px solid rgba(255,212,90,.24)', color: '#e8edf7', fontSize: 13, textAlign: 'center' },
  resStrip: { display: 'flex', gap: 7, overflowX: 'auto', marginTop: 12, paddingBottom: 4, WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y', scrollbarWidth: 'none' },
  resPill: { display: 'flex', alignItems: 'center', gap: 5, padding: '5px 9px 5px 5px', borderRadius: 12, background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)', color: '#e8edf7', flexShrink: 0 },
  socialBtn: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', marginTop: 12, padding: '10px 13px', borderRadius: 16, border: '1px solid rgba(255,107,138,.35)', background: 'rgba(255,107,138,.07)' },
  mergeRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 16, background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.08)', marginTop: 8 },
  mergeBtn: { padding: '6px 11px', borderRadius: 10, border: '1px solid rgba(77,212,196,.4)', background: 'rgba(77,212,196,.12)', color: '#7ff0e0', fontWeight: 700, fontSize: 12.5 },
  countBadge: { position: 'absolute', right: -4, bottom: -4, minWidth: 20, padding: '1px 5px', borderRadius: 10, background: '#12172a', border: '1px solid rgba(255,255,255,.18)', color: '#e8edf7', fontSize: 11, fontWeight: 700, textAlign: 'center' },
  chestRow: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 13px', borderRadius: 16, border: '1px solid', background: 'rgba(255,255,255,.035)', marginTop: 8 },
  boostNote: { padding: '10px 12px', borderRadius: 14, background: 'rgba(255,212,90,.1)', border: '1px solid rgba(255,212,90,.3)', color: '#ffe9a8', fontSize: 12.5, lineHeight: 1.5, marginBottom: 6 },
  upRow: { display: 'flex', alignItems: 'flex-start', gap: 11, padding: '12px', borderRadius: 16, background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.08)', marginTop: 8 },
  buyBtn: { minWidth: 46, padding: '9px 0', borderRadius: 12, border: '1px solid rgba(163,113,247,.45)', background: 'rgba(163,113,247,.16)', color: '#d9c2ff', fontWeight: 800, fontSize: 13 },
  boardRow: { display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 10px', borderRadius: 14, border: '1px solid', background: 'rgba(255,255,255,.03)', marginBottom: 6 },
  avatar: { width: 32, height: 32, borderRadius: '50%', background: 'rgba(143,179,255,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c9d3e6', fontWeight: 700, flexShrink: 0, overflow: 'hidden', fontSize: 14 },
  coinBar: { display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px', borderRadius: 16, background: 'rgba(255,212,90,.08)', border: '1px solid rgba(255,212,90,.3)' },
  buyCoinBtn: { padding: '9px 15px', borderRadius: 12, border: '1px solid rgba(255,212,90,.5)', background: 'rgba(255,212,90,.16)', color: '#ffe9a8', fontWeight: 800, fontSize: 13 },
  energyIcon: { width: 58, height: 58, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(92,225,160,.1)', border: '1px solid rgba(92,225,160,.3)', flexShrink: 0 },
  openWrap: { position: 'fixed', inset: 0, zIndex: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(4,6,12,.92)', backdropFilter: 'blur(6px)', padding: 20 },
  beam: { position: 'absolute', top: '18%', width: 130, height: '34%', filter: 'blur(22px)', pointerEvents: 'none' },
  rewardPanel: { marginTop: 22, width: 'min(460px,94vw)', padding: 16, borderRadius: 20, background: 'rgba(12,16,30,.9)', border: '1px solid rgba(255,255,255,.12)' },
  rewardItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, width: 74, color: '#e8edf7' },
  boostBadge: { padding: '7px 10px', borderRadius: 12, background: 'rgba(255,212,90,.14)', border: '1px solid rgba(255,212,90,.4)', color: '#ffe9a8', fontSize: 12, textAlign: 'center', marginBottom: 12 },
  evolveWrap: { position: 'fixed', inset: 0, zIndex: 82, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(4,6,12,.9)', pointerEvents: 'none' },
};

export default MergeEvolution;
