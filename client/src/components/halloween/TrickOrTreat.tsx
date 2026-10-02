/**
 * ტკბილეული თუ ხრიკი — a Halloween walk down a haunted street.
 *
 * Knock on door after door: most give candy, some give an amulet or a lantern,
 * and a ghost takes the whole bag unless an amulet stops it. Go home to bank
 * what you carry. The odds of a ghost behind the next door are always on the
 * screen, so every knock is a choice rather than a guess.
 *
 * The client decides nothing. It asks the server to knock and shows the door
 * it is told about; the next door is unknown to it until opened, unless a
 * lantern showed it — and that, too, came from the server.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { socket } from '@/lib/socket';
import { haptic } from '@/lib/haptics';

const ORANGE = '#ff8a1f';
const PURPLE = '#9b5cff';
const BG = '#0b0612';
const BAD = '#ff5d6c';

type DoorKind = 'candy' | 'treat' | 'amulet' | 'lantern' | 'cat' | 'ghost';
interface Door { kind: DoorKind; amount: number; saved?: boolean }
interface Walk {
  doors: Door[]; bag: number; amulet: boolean; peek: Door | null;
  status: 'walking' | 'home' | 'scared'; banked: number; sweet?: boolean;
}
type GearId = 'amulet' | 'lantern' | 'sweet';
interface Shop {
  gear: Record<GearId, { price: number; label: string; emoji: string; desc: string }>;
  extraWalk: { price: number; perDay: number };
  exchange: { step: number; coinsPerDay: number };
  cosmetics: Record<string, { price: number; label: string; emoji: string }>;
  prizes: { rank: number; coins: number; items: string[] }[];
}
interface State {
  season: { active: boolean; year: number };
  runsPerDay: number; runsLeft: number; resetAt: number;
  walk: Walk | null; nextGhost: number | null; last: Walk | null;
  total: number; best: number; walks: number;
  candy: number; extraWalksToday: number; coinsExchangedToday: number; owned: string[];
  shop: Shop;
}
interface BoardRow { rank: number; userId: string; username: string; total: number; best: number }

const ICON: Record<DoorKind, string> = {
  candy: '🍬', treat: '🍫', amulet: '🧿', lantern: '🎃', cat: '🐈‍⬛', ghost: '👻',
};
const doorIcon = (d: Door) => (d.saved ? '🛡️' : ICON[d.kind]);

function caption(d: Door): string {
  switch (d.kind) {
    case 'candy': return `+${d.amount} კანფეტი`;
    case 'treat': return `+${d.amount} — დიდი ტკბილეული!`;
    case 'amulet': return 'ამულეტი! ერთ მოჩვენებას მოგიგერიებს';
    case 'lantern': return 'ფარანი! შემდეგი კარი გაანათა';
    case 'cat': return 'შავი კატა… აქ არაფერია';
    case 'ghost': return d.saved ? 'მოჩვენება! ამულეტმა დაგიცვა' : 'მოჩვენება! ტომარა დაიცალა';
  }
}

export function TrickOrTreat({ onClose }: { onClose: () => void }) {
  const [st, setSt] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ door: Door; n: number } | null>(null);
  const [knocking, setKnocking] = useState(0);
  const [board, setBoard] = useState<{ top: BoardRow[]; me: BoardRow | null } | null>(null);
  const [rules, setRules] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [gear, setGear] = useState<GearId[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const pathRef = useRef<HTMLDivElement | null>(null);

  const act = useCallback((event: string, after?: (data: any) => void, payload: Record<string, unknown> = {}) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    socket.emit(event as any, payload, (res: any) => {
      setBusy(false);
      if (!res?.ok) { setError(res?.error ?? 'ვერ მოხერხდა.'); return; }
      setSt(res.data);
      after?.(res.data);
    });
  }, []);

  useEffect(() => { act('tot:state'); }, [act]);

  // Keep the newest door in view as the path grows.
  const doorsSeen = st?.walk?.doors.length ?? st?.last?.doors.length ?? 0;
  useEffect(() => {
    pathRef.current?.scrollTo({ left: pathRef.current.scrollWidth, behavior: 'smooth' });
  }, [doorsSeen]);

  const start = () => {
    haptic('selection'); setReveal(null);
    act('tot:start', () => setGear([]), { gear });
  };
  const toggleGear = (g: GearId) => setGear(cur => (cur.includes(g) ? cur.filter(x => x !== g) : [...cur, g]));
  const buyExtra = () => act('tot:extra', () => { haptic('success'); setNotice('+1 გასეირნება დღეს'); });
  const exchange = (candy: number) =>
    act('tot:exchange', d => { haptic('success'); setNotice(`+${d.coins} ქოინი ბალანსზე 🪙`); }, { candy });
  const buy = (item: string) =>
    act('tot:buy', () => { haptic('success'); setNotice('შენია! პროფილში ჩაიცვი ✨'); }, { item });
  const home = () => { haptic('selection'); act('tot:home'); };
  const knock = () => {
    if (busy) return;
    haptic('selection');
    setKnocking(k => k + 1);
    act('tot:knock', data => {
      const door: Door | undefined = data.door;
      if (!door) return;
      const walk: Walk | null = data.walk ?? data.last;
      setReveal({ door, n: walk?.doors.length ?? 0 });
      haptic(door.kind === 'ghost' && !door.saved ? 'error' : 'success');
    });
  };

  const openBoard = () => {
    socket.emit('tot:board' as any, {}, (res: any) => {
      if (res?.ok) setBoard(res.data);
      else setError(res?.error ?? 'ვერ ჩაიტვირთა.');
    });
  };

  const share = async (w: Walk) => {
    const path = w.doors.map(doorIcon).join('');
    const end = w.status === 'scared' ? '😱 შემაშინეს' : `🏠 ${w.banked} 🍬`;
    try {
      await navigator.clipboard.writeText(`🎃 ტკბილეული თუ ხრიკი\n${path}\n${end}\nvoidmafia.one`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { setError('ვერ დაკოპირდა'); }
  };

  if (!st) {
    return createPortal(
      <div className="fixed inset-0 z-[730] flex items-center justify-center" style={{ background: BG }}>
        <p className="font-mono text-[12px] text-white/50">{error ?? 'იტვირთება…'}</p>
      </div>,
      document.body,
    );
  }

  const walk = st.walk;
  const shown = walk ?? st.last;
  const ghostPct = st.nextGhost === null ? null : Math.round(st.nextGhost * 100);

  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[730] overflow-y-auto"
      style={{ background: `radial-gradient(120% 70% at 50% 0%, #2a1240 0%, ${BG} 60%)` }}>
      <Bats />
      <div className="relative min-h-full flex flex-col max-w-lg mx-auto px-4 pb-8">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 pt-5 pb-3">
          <button onClick={onClose} aria-label="დახურვა"
            className="w-11 h-11 rounded-full flex items-center justify-center text-white/70 flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)' }}>✕</button>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-[16px] truncate">ტკბილეული თუ ხრიკი</p>
            <p className="font-mono text-[10.5px] truncate" style={{ color: ORANGE }}>
              🎃 ჰელოუინი · დღეს {st.runsLeft}/{st.runsPerDay}
            </p>
          </div>
          <button onClick={() => setRules(r => !r)} aria-label="წესები" aria-expanded={rules}
            className="w-11 h-11 rounded-xl font-mono text-[14px] text-white/70 flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)' }}>?</button>
          <button onClick={() => setShopOpen(true)} aria-label="მაღაზია"
            className="w-11 h-11 rounded-xl text-[15px] flex-shrink-0"
            style={{ background: 'rgba(255,138,31,0.14)', border: '1px solid rgba(255,138,31,0.4)' }}>🛒</button>
          <button onClick={openBoard} aria-label="ლიდერბორდი"
            className="w-11 h-11 rounded-xl text-[15px] flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)' }}>🏆</button>
        </div>

        {/* ── Season standing ────────────────────────────────────────────── */}
        <div className="flex gap-2 pb-3">
          <Chip label="საფულე" value={`🍬 ${st.candy}`} accent onClick={() => setShopOpen(true)} />
          <Chip label="სეზონის ქულა" value={`${st.total}`} />
          <Chip label="საუკეთესო" value={`${st.best}`} />
        </div>

        <AnimatePresence>
          {rules && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden">
              <div className="rounded-2xl p-3.5 mb-3 font-mono text-[11.5px] leading-relaxed text-white/75"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <p>🚪 დააკაკუნე კარზე — ყოველ კარს მიღმა რაღაც არის.</p>
                <p>🍬 კანფეტი · 🍫 დიდი ტკბილეული — რაც შორს წახვალ, მით მეტი.</p>
                <p>🧿 ამულეტი — ერთ მოჩვენებას მოგიგერიებს.</p>
                <p>🎃 ფარანი — შემდეგ კარს გაანათებს.</p>
                <p>👻 მოჩვენება — ტომარას დაგიცლის. ყოველ კარზე უფრო ხშირია.</p>
                <p>🏠 სახლში წასვლა — ტომარა საფულეში და სეზონის ქულებში ჩაგეთვლება.</p>
                <p className="pt-1">🛒 კანფეტით იყიდე აღჭურვილობა გასეირნებისთვის, დამატებითი გასეირნება, გადაცვალე ქოინებში ან იყიდე ჰელოუინის ჩარჩო და სათაური.</p>
                <p>🏆 დახარჯვა ქულებს არ გიკლებს. სეზონის ბოლოს ტოპ 3 იღებს ქოინებს და ექსკლუზიურ ნივთებს.</p>
                <p className="pt-1 text-white/50">დღეში {st.runsPerDay} გასეირნება. ქუჩა იღება ყოველ შუაღამეს.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── The path so far ────────────────────────────────────────────── */}
        {shown && shown.doors.length > 0 && (
          <div ref={pathRef} className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}
            aria-label="გავლილი კარები">
            {shown.doors.map((d, i) => (
              <div key={i} title={caption(d)}
                className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-[17px]"
                style={{
                  background: d.kind === 'ghost' && !d.saved ? 'rgba(255,93,108,0.18)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${d.kind === 'ghost' && !d.saved ? 'rgba(255,93,108,0.5)' : 'rgba(255,255,255,0.1)'}`,
                }}>
                {doorIcon(d)}
              </div>
            ))}
          </div>
        )}

        {/* ── The door ───────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col items-center justify-center py-4 min-h-[260px]">
          {walk ? (
            <>
              <motion.div key={knocking}
                animate={knocking ? { rotate: [0, -3, 3, -2, 2, 0], x: [0, -4, 4, -2, 2, 0] } : {}}
                transition={{ duration: 0.45 }}
                className="relative rounded-t-[60px] rounded-b-xl flex flex-col items-center justify-center"
                style={{
                  width: 'min(56vw, 210px)', height: 'min(70vw, 260px)',
                  background: 'linear-gradient(180deg, #3a2210 0%, #24140a 100%)',
                  border: `3px solid ${walk.peek?.kind === 'ghost' ? BAD : '#5a3a1c'}`,
                  boxShadow: `0 0 50px ${walk.peek ? (walk.peek.kind === 'ghost' ? 'rgba(255,93,108,0.35)' : 'rgba(255,138,31,0.35)') : 'rgba(155,92,255,0.18)'}`,
                }}>
                <p className="font-mono text-[11px] text-white/45 absolute top-6">კარი #{walk.doors.length + 1}</p>
                {/* Closed, it is a question; lit by a lantern, it is the answer. */}
                <span className="leading-none select-none font-display font-black" aria-hidden
                  style={walk.peek ? { fontSize: 64 } : { fontSize: 88, color: 'rgba(255,255,255,0.16)', textShadow: '0 0 24px rgba(155,92,255,0.45)' }}>
                  {walk.peek ? doorIcon(walk.peek) : '?'}
                </span>
                <span className="absolute right-5 top-1/2 w-3 h-3 rounded-full" style={{ background: '#c9a24a' }} />
              </motion.div>

              <AnimatePresence mode="wait">
                {reveal && (
                  <motion.p key={`${reveal.n}-${knocking}`} role="status"
                    initial={{ opacity: 0, y: 8, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
                    className="font-display font-bold text-[15px] text-center pt-4"
                    style={{ color: reveal.door.kind === 'ghost' && !reveal.door.saved ? BAD : '#fff' }}>
                    {doorIcon(reveal.door)} {caption(reveal.door)}
                  </motion.p>
                )}
              </AnimatePresence>
            </>
          ) : (
            <Outcome st={st} busy={busy} onStart={start} onShare={share} copied={copied} reveal={reveal}
              gear={gear} onToggleGear={toggleGear} onBuyExtra={buyExtra} />
          )}
        </div>

        {error && <p className="font-mono text-[12px] text-center pb-2" style={{ color: BAD }}>{error}</p>}
        {notice && !shopOpen && <p className="font-mono text-[12px] text-center pb-2" style={{ color: ORANGE }} role="status">{notice}</p>}

        {/* ── The decision ───────────────────────────────────────────────── */}
        {walk && (
          <div className="space-y-3">
            <div className="flex items-center justify-between font-mono text-[13px]">
              <span className="text-white">🍬 ტომარაში: <b style={{ color: ORANGE }}>{walk.bag}</b></span>
              <span className="flex gap-3">
                {walk.sweet && <span className="text-white/80" title="ტკბილი ტომარა">🍭 +1</span>}
                {walk.amulet && <span className="text-white/80" title="ამულეტი">🧿 დაცული ხარ</span>}
              </span>
            </div>
            {walk.peek ? (
              <p className="font-mono text-[12px] text-center rounded-xl py-2"
                style={{ color: walk.peek.kind === 'ghost' ? BAD : ORANGE, background: 'rgba(255,255,255,0.04)' }}>
                🎃 ფარანმა გაანათა: შემდეგ კარს მიღმა {doorIcon(walk.peek)}
              </p>
            ) : ghostPct !== null && (
              <div>
                <div className="flex justify-between font-mono text-[11px] text-white/55 pb-1">
                  <span>👻 მოჩვენების შანსი შემდეგ კარზე</span>
                  <span style={{ color: ghostPct >= 35 ? BAD : ORANGE }}>{ghostPct}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${ghostPct}%`, background: `linear-gradient(90deg, ${ORANGE}, ${BAD})` }} />
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={knock} disabled={busy}
                className="flex-1 h-14 rounded-2xl font-display font-black text-[16px] disabled:opacity-60 active:scale-[0.98] transition-transform"
                style={{ background: `linear-gradient(135deg, ${ORANGE}, #e8590c)`, color: '#1a0b02' }}>
                🚪 დააკაკუნე
              </button>
              <button onClick={home} disabled={busy || walk.doors.length === 0}
                className="flex-1 h-14 rounded-2xl font-display font-bold text-[14px] text-white disabled:opacity-40 active:scale-[0.98] transition-transform"
                style={{ background: 'rgba(155,92,255,0.22)', border: `1px solid ${PURPLE}88` }}>
                🏠 სახლში · {walk.bag} 🍬
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Shop ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {shopOpen && (
          <ShopSheet st={st} busy={busy} error={error} notice={notice} onClose={() => { setShopOpen(false); setNotice(null); }}
            onExtra={buyExtra} onExchange={exchange} onBuy={buy} />
        )}
      </AnimatePresence>

      {/* ── Leaderboard ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {board && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[740] overflow-y-auto" style={{ background: '#07040d' }}
            onClick={() => setBoard(null)}>
            <div className="max-w-lg mx-auto px-5 py-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2 pb-4">
                <button onClick={() => setBoard(null)} aria-label="დახურვა"
                  className="w-11 h-11 rounded-full flex items-center justify-center text-white/70"
                  style={{ background: 'rgba(255,255,255,0.07)' }}>✕</button>
                <div>
                  <p className="font-display font-bold text-white text-[16px]">სეზონის ლიდერბორდი</p>
                  <p className="font-mono text-[10.5px]" style={{ color: ORANGE }}>სახლში მიტანილი კანფეტი</p>
                </div>
              </div>
              <Prizes prizes={st.shop.prizes} />
              {board.top.map(r => (
                <div key={r.userId} className="flex items-center gap-3 py-2.5"
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                    background: board.me?.userId === r.userId ? 'rgba(255,138,31,0.08)' : 'transparent',
                  }}>
                  <span className={`font-mono w-7 text-right ${r.rank <= 3 ? 'text-[16px]' : 'text-[12px] text-white/40'}`}>
                    {r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}
                  </span>
                  <span className="flex-1 font-display text-[14px] text-white truncate">{r.username}</span>
                  <span className="font-mono text-[11px] text-white/40">საუკ. {r.best}</span>
                  <span className="font-mono text-[13px] font-bold w-16 text-right" style={{ color: ORANGE }}>🍬 {r.total}</span>
                </div>
              ))}
              {board.top.length === 0 && (
                <p className="font-mono text-[12px] text-white/40 py-8 text-center">
                  ჯერ არავის მიუტანია კანფეტი სახლში — იყავი პირველი
                </p>
              )}
              {board.me && !board.top.some(r => r.userId === board.me!.userId) && (
                <p className="font-mono text-[12px] text-white/60 pt-4 text-center">
                  შენ ხარ #{board.me.rank} · 🍬 {board.me.total}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>,
    document.body,
  );
}

/** Between walks: how the last one ended, and what can be done now. */
function Outcome({ st, busy, onStart, onShare, copied, reveal, gear, onToggleGear, onBuyExtra }: {
  st: State; busy: boolean; onStart: () => void; onShare: (w: Walk) => void; copied: boolean;
  reveal: { door: Door } | null;
  gear: GearId[]; onToggleGear: (g: GearId) => void; onBuyExtra: () => void;
}) {
  const last = st.last;
  const cost = gear.reduce((sum, g) => sum + st.shop.gear[g].price, 0);
  const short = cost > st.candy;
  const extraLeft = st.shop.extraWalk.perDay - st.extraWalksToday;
  return (
    <div className="w-full text-center space-y-4">
      {last && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-4"
          style={{
            background: last.status === 'scared' ? 'rgba(255,93,108,0.08)' : 'rgba(255,138,31,0.08)',
            border: `1px solid ${last.status === 'scared' ? 'rgba(255,93,108,0.35)' : 'rgba(255,138,31,0.35)'}`,
          }}>
          <p className="text-[44px] leading-none pb-2" aria-hidden>{last.status === 'scared' ? '👻' : '🏠'}</p>
          <p className="font-display font-black text-white text-[18px]" role="status">
            {last.status === 'scared' ? 'მოჩვენებამ შეგაშინა!' : `სახლში მიიტანე ${last.banked} 🍬`}
          </p>
          <p className="font-mono text-[11.5px] text-white/55 pt-1">
            {last.status === 'scared'
              ? (reveal?.door.kind === 'ghost' ? 'ტომარა დაიცალა — შემდეგ ჯერზე ადრე წადი სახლში' : 'ტომარა დაიცალა')
              : `${last.doors.length} კარი გაიარე`}
          </p>
          <button onClick={() => onShare(last)}
            className="mt-3 px-4 h-10 rounded-xl font-mono text-[12px] text-white/85"
            style={{ background: 'rgba(255,255,255,0.08)' }}>
            {copied ? '✓ დაკოპირდა' : '📋 გააზიარე'}
          </button>
        </motion.div>
      )}

      {!st.season.active ? (
        <p className="font-mono text-[13px] text-white/60 py-6">ჰელოუინი დასრულდა — შემდეგ ოქტომბერს ისევ!</p>
      ) : st.runsLeft > 0 ? (
        <div className="space-y-2">
          {!last && (
            <>
              <p className="text-[56px] leading-none" aria-hidden>🎃</p>
              <p className="font-display font-bold text-white text-[17px]">ქუჩაში ბნელა. კარები გელოდება.</p>
              <p className="font-mono text-[11.5px] text-white/55 px-4">
                შეაგროვე კანფეტი, მოერიდე მოჩვენებებს და დროზე წადი სახლში.
              </p>
            </>
          )}
          <div className="text-left pt-1">
            <p className="font-mono text-[10.5px] text-white/45 pb-1.5">აღჭურვილობა ამ გასეირნებისთვის · საფულეში 🍬 {st.candy}</p>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(st.shop.gear) as GearId[]).map(g => {
                const def = st.shop.gear[g];
                const on = gear.includes(g);
                const cant = !on && cost + def.price > st.candy;
                return (
                  <button key={g} onClick={() => onToggleGear(g)} disabled={cant} aria-pressed={on} title={def.desc}
                    className="rounded-xl px-2 py-2 text-center disabled:opacity-35 transition-colors"
                    style={{
                      background: on ? 'rgba(255,138,31,0.18)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${on ? ORANGE : 'rgba(255,255,255,0.1)'}`,
                    }}>
                    <span className="block text-[20px] leading-none">{def.emoji}</span>
                    <span className="block font-display font-bold text-[11.5px] text-white pt-1 truncate">{def.label}</span>
                    <span className="block font-mono text-[10.5px]" style={{ color: ORANGE }}>🍬 {def.price}</span>
                  </button>
                );
              })}
            </div>
            {gear.length > 0 && (
              <p className="font-mono text-[10.5px] text-white/55 pt-1.5">
                {gear.map(g => st.shop.gear[g].desc).join(' · ')}
              </p>
            )}
          </div>
          <button onClick={onStart} disabled={busy || short}
            className="w-full h-14 rounded-2xl font-display font-black text-[16px] disabled:opacity-60 active:scale-[0.98] transition-transform"
            style={{ background: `linear-gradient(135deg, ${ORANGE}, #e8590c)`, color: '#1a0b02' }}>
            {last ? '🎃 კიდევ ერთი გასეირნება' : '🎃 გასეირნების დაწყება'}{cost > 0 ? ` · 🍬 ${cost}` : ''}
          </button>
          <p className="font-mono text-[11px] text-white/45">დღეს დარჩა {st.runsLeft}/{st.runsPerDay}</p>
        </div>
      ) : (
        <div className="py-2 space-y-1">
          <p className="font-display font-bold text-white text-[16px]">დღეისთვის ქუჩა დაიკეტა</p>
          <Countdown to={st.resetAt} />
          {extraLeft > 0 && (
            <button onClick={onBuyExtra} disabled={busy || st.candy < st.shop.extraWalk.price}
              className="mt-3 w-full h-12 rounded-2xl font-display font-bold text-[14px] text-white disabled:opacity-40"
              style={{ background: 'rgba(155,92,255,0.22)', border: `1px solid ${PURPLE}88` }}>
              ➕ დამატებითი გასეირნება · 🍬 {st.shop.extraWalk.price}
              <span className="font-mono text-[10.5px] text-white/55"> ({extraLeft} დარჩა)</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ label, value, accent, onClick }: { label: string; value: string; accent?: boolean; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className="flex-1 rounded-xl px-3 py-2 min-w-0 text-left disabled:cursor-default"
      style={{
        background: accent ? 'rgba(255,138,31,0.12)' : 'rgba(255,255,255,0.05)',
        border: `1px solid ${accent ? 'rgba(255,138,31,0.4)' : 'rgba(255,255,255,0.09)'}`,
      }}>
      <p className="font-mono text-[9.5px] text-white/45 truncate">{label}</p>
      <p className="font-display font-black text-[15px] truncate" style={{ color: accent ? ORANGE : '#fff' }}>{value}</p>
    </button>
  );
}

const ITEM_NAME: Record<string, string> = {
  title_halloween_champion_2026: 'სათაური „ჰელოუინის ჩემპიონი 2026"',
  frame_jack_o_lantern: 'ჩარჩო „ჯეკის ფარანი"',
  title_candy_king: 'სათაური „ტკბილეულის მეფე"',
};

/** What the season's top three are given. */
function Prizes({ prizes }: { prizes: Shop['prizes'] }) {
  return (
    <div className="rounded-2xl p-3 mb-4 space-y-1.5"
      style={{ background: 'rgba(255,138,31,0.07)', border: '1px solid rgba(255,138,31,0.3)' }}>
      <p className="font-mono text-[10.5px]" style={{ color: ORANGE }}>🎁 სეზონის პრიზები — 3 ნოემბრის შემდეგ</p>
      {prizes.map(p => (
        <p key={p.rank} className="font-mono text-[11.5px] text-white/80">
          {['🥇', '🥈', '🥉'][p.rank - 1]} 🪙 {p.coins} · {p.items.map(i => ITEM_NAME[i] ?? i).join(' + ')}
        </p>
      ))}
    </div>
  );
}

/** Where candy becomes something: more walks, coins, things to wear. */
function ShopSheet({ st, busy, error, notice, onClose, onExtra, onExchange, onBuy }: {
  st: State; busy: boolean; error: string | null; notice: string | null; onClose: () => void;
  onExtra: () => void; onExchange: (candy: number) => void; onBuy: (item: string) => void;
}) {
  const { step, coinsPerDay } = st.shop.exchange;
  const coinsLeft = Math.max(0, coinsPerDay - st.coinsExchangedToday);
  // Coins are 1:1 with candy, so the most that can go is the smaller of the
  // two, rounded down to a step.
  const maxCandy = Math.floor(Math.min(coinsLeft, st.candy) / step) * step;
  const [amount, setAmount] = useState(step);
  const amt = Math.min(Math.max(step, amount), Math.max(step, maxCandy));
  const extraLeft = st.shop.extraWalk.perDay - st.extraWalksToday;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[740] overflow-y-auto" style={{ background: '#07040d' }} onClick={onClose}>
      <div className="max-w-lg mx-auto px-5 py-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <button onClick={onClose} aria-label="დახურვა"
            className="w-11 h-11 rounded-full flex items-center justify-center text-white/70 flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.07)' }}>✕</button>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-[16px]">კანფეტის მაღაზია</p>
            <p className="font-mono text-[10.5px] text-white/50">დახარჯვა სეზონის ქულებს არ გიკლებს</p>
          </div>
          <span className="font-display font-black text-[18px]" style={{ color: ORANGE }}>🍬 {st.candy}</span>
        </div>

        {error && <p className="font-mono text-[12px] text-center" style={{ color: BAD }}>{error}</p>}
        {notice && <p className="font-mono text-[12px] text-center" style={{ color: ORANGE }} role="status">{notice}</p>}

        <Section title="🪙 ქოინებში გადაცვლა" sub={`${step} 🍬 = ${step} 🪙 · დღეს დარჩა ${coinsLeft}/${coinsPerDay} 🪙`}>
          {maxCandy >= step ? (
            <div className="flex items-center gap-2">
              <button onClick={() => setAmount(Math.max(step, amt - step))} disabled={amt <= step} aria-label="ნაკლები"
                className="w-11 h-11 rounded-xl text-white text-[18px] disabled:opacity-30" style={{ background: 'rgba(255,255,255,0.07)' }}>−</button>
              <div className="flex-1 text-center font-display font-black text-white text-[16px]">🍬 {amt} → 🪙 {amt}</div>
              <button onClick={() => setAmount(Math.min(maxCandy, amt + step))} disabled={amt >= maxCandy} aria-label="მეტი"
                className="w-11 h-11 rounded-xl text-white text-[18px] disabled:opacity-30" style={{ background: 'rgba(255,255,255,0.07)' }}>+</button>
              <button onClick={() => onExchange(amt)} disabled={busy}
                className="h-11 px-4 rounded-xl font-display font-bold text-[13px] disabled:opacity-50"
                style={{ background: `linear-gradient(135deg, ${ORANGE}, #e8590c)`, color: '#1a0b02' }}>გადაცვლა</button>
            </div>
          ) : (
            <p className="font-mono text-[11.5px] text-white/50">
              {coinsLeft === 0 ? 'დღევანდელი ლიმიტი ამოიწურა — ხვალ ისევ.' : `გადასაცვლელად მინიმუმ ${step} 🍬 გჭირდება.`}
            </p>
          )}
        </Section>

        <Section title="➕ დამატებითი გასეირნება" sub={`დღეში მაქსიმუმ ${st.shop.extraWalk.perDay} · დღეს დარჩა ${Math.max(0, extraLeft)}`}>
          <BuyRow emoji="🚶" label="+1 გასეირნება დღეს" price={st.shop.extraWalk.price}
            disabled={busy || extraLeft <= 0 || st.candy < st.shop.extraWalk.price} onBuy={onExtra}
            doneLabel={extraLeft <= 0 ? 'ლიმიტი' : undefined} />
        </Section>

        <Section title="🎒 აღჭურვილობა" sub="აირჩიე გასეირნების დაწყებისას">
          {(Object.keys(st.shop.gear) as GearId[]).map(g => {
            const d = st.shop.gear[g];
            return (
              <p key={g} className="font-mono text-[11.5px] text-white/75 py-0.5">
                {d.emoji} <b className="text-white">{d.label}</b> · 🍬 {d.price} — {d.desc}
              </p>
            );
          })}
        </Section>

        <Section title="✨ ჰელოუინის ნივთები" sub="სამუდამოდ რჩება პროფილში">
          {Object.entries(st.shop.cosmetics).map(([id, c]) => {
            const own = st.owned.includes(id);
            return (
              <BuyRow key={id} emoji={c.emoji} label={c.label} price={c.price}
                disabled={busy || own || st.candy < c.price} onBuy={() => onBuy(id)} doneLabel={own ? '✓ შენია' : undefined} />
            );
          })}
        </Section>

        <Prizes prizes={st.shop.prizes} />
      </div>
    </motion.div>
  );
}

function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-3.5 space-y-2"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
      <div>
        <p className="font-display font-bold text-white text-[14px]">{title}</p>
        <p className="font-mono text-[10.5px] text-white/45">{sub}</p>
      </div>
      {children}
    </div>
  );
}

function BuyRow({ emoji, label, price, disabled, onBuy, doneLabel }: {
  emoji: string; label: string; price: number; disabled: boolean; onBuy: () => void; doneLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[22px] w-8 text-center">{emoji}</span>
      <span className="flex-1 min-w-0 font-display text-[13px] text-white truncate">{label}</span>
      <button onClick={onBuy} disabled={disabled}
        className="h-10 px-3 rounded-xl font-display font-bold text-[12.5px] disabled:opacity-40 flex-shrink-0"
        style={{ background: doneLabel ? 'rgba(255,255,255,0.08)' : `linear-gradient(135deg, ${ORANGE}, #e8590c)`, color: doneLabel ? '#fff' : '#1a0b02' }}>
        {doneLabel ?? `🍬 ${price}`}
      </button>
    </div>
  );
}

/** When the street opens again. */
function Countdown({ to }: { to: number }) {
  const [left, setLeft] = useState(Math.max(0, to - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, to - Date.now())), 1000);
    return () => clearInterval(id);
  }, [to]);
  const pad = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(left / 3600000), m = Math.floor((left % 3600000) / 60000), s = Math.floor((left % 60000) / 1000);
  return <p className="font-mono text-[12px] text-white/55">ქუჩა გაიღება {pad(h)}:{pad(m)}:{pad(s)}-ში</p>;
}

/** A few bats drifting across the top. Decoration only, and still for reduced motion. */
function Bats() {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const bats = [
    { top: '7%', size: 16, dur: 18, delay: 0 },
    { top: '13%', size: 12, dur: 24, delay: 6 },
    { top: '4%', size: 10, dur: 30, delay: 12 },
  ];
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-40 overflow-hidden" aria-hidden>
      {bats.map((b, i) => (
        <motion.span key={i} className="absolute opacity-40" style={{ top: b.top, fontSize: b.size }}
          initial={{ x: '-10vw' }} animate={reduce ? {} : { x: '110vw' }}
          transition={{ duration: b.dur, delay: b.delay, repeat: Infinity, ease: 'linear' }}>
          🦇
        </motion.span>
      ))}
    </div>
  );
}

export default TrickOrTreat;
