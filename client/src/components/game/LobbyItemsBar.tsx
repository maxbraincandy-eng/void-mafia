/**
 * Items strip for the mafia lobby.
 *
 * The perks (invisibility, anonymous mask, room spotlight, XP booster) used to
 * live only inside the coin shop's "ნივთები" tab — four taps away from the one
 * place they actually matter. This puts them at the top of the lobby, where you
 * buy them and switch them on/off in place.
 *
 * Everything here is a thin client over the same server events the shop uses
 * (`perks:get` / `perks:buy` / `perks:configure`), so the two views can never
 * disagree about what you own.
 *
 * The invisibility chip is special: when the viewer is currently on the
 * spectator bench, flipping it must change what other people see RIGHT NOW, not
 * just the saved default. So it writes the default via `perks:configure` and
 * then applies it to the live session via `spectator:toggle_invisible`.
 */
import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import type { Res } from '@/types/index';

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

const EMOJI: Record<string, string> = { invisible: '🕵️', anon: '🎭', vip: '📡', xpboost: '⚡' };
const ACCENT: Record<string, string> = {
  invisible: '155,0,255', anon: '0,229,255', vip: '255,180,0', xpboost: '52,211,153',
};

export function LobbyItemsBar({
  isSpectator = false,
  liveInvisible = false,
  onCoinsChange,
}: {
  /** Viewer is on the spectator bench — enables the live invisibility toggle. */
  isSpectator?: boolean;
  /** Server truth for "you are invisible right now" (PlayerPublic.invisibleSpectator). */
  liveInvisible?: boolean;
  onCoinsChange?: (coins: number) => void;
}) {
  const [perks, setPerks] = useState<PerkState | null>(null);
  const [catalog, setCatalog] = useState<PerkDef[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      // No payload — the server handler is (cb)=>…, so send only the ack.
      const res = await emitWithAck<undefined, Res<{ perks: PerkState; catalog: PerkDef[] }>>('perks:get');
      if ('ok' in res && res.ok) { setPerks(res.data.perks); setCatalog(res.data.catalog); }
    } catch { /* leave prior state */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  // The message is a transient confirmation, not state worth keeping around.
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(id);
  }, [msg]);

  const buy = async (id: string) => {
    if (busy) return;
    setBusy(id); setMsg(null);
    try {
      const res = await emitWithAck<{ perkId: string }, Res<{ perks: PerkState; coins: number }>>('perks:buy', { perkId: id });
      if ('ok' in res && res.ok) {
        setPerks(res.data.perks);
        onCoinsChange?.(res.data.coins);
        setMsg('შეძენილია ✓');
      } else setMsg(('error' in res && res.error) || 'ვერ შესრულდა');
    } catch (e: any) { setMsg(e?.message ?? 'ვერ შესრულდა'); }
    finally { setBusy(null); }
  };

  const toggle = async (which: 'invisible' | 'anon', on: boolean) => {
    if (busy) return;
    setBusy(which); setMsg(null);
    try {
      const res = await emitWithAck<{ which: string; mode: string }, Res<{ perks: PerkState }>>(
        'perks:configure', { which, mode: on ? 'always' : 'off' });
      if ('ok' in res && res.ok) setPerks(res.data.perks);
      else { setMsg(('error' in res && res.error) || 'ვერ შესრულდა'); return; }

      // Saved default changed. If we're already watching, apply it to this
      // session too — otherwise the switch would only take effect on the next
      // room join, which reads as "it doesn't work".
      if (which === 'invisible' && isSpectator) {
        try { await emitWithAck<{ on: boolean }, any>('spectator:toggle_invisible', { on }); } catch { /* room may have ended */ }
      }
      setMsg(on ? 'ჩართულია ✓' : 'გამორთულია');
    } catch (e: any) { setMsg(e?.message ?? 'ვერ შესრულდა'); }
    finally { setBusy(null); }
  };

  if (!perks || catalog.length === 0) return null;

  const vipActive = perks.vipUntil != null && perks.vipUntil > Date.now();
  const activeCount =
    (perks.ownsInvisible && perks.invisibleMode === 'always' ? 1 : 0) +
    (perks.ownsAnon && perks.anonMode === 'always' ? 1 : 0) +
    (vipActive ? 1 : 0) +
    (perks.xpBoostGames > 0 ? 1 : 0);

  return (
    <div className="mb-2 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.03)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-3 py-2 flex items-center gap-2 text-left transition-colors"
        style={{ background: open ? 'rgba(255,255,255,0.04)' : 'transparent' }}
      >
        <span className="text-[14px]">🎒</span>
        <span className="font-mono text-[12px] uppercase tracking-wider text-white/60">ნივთები</span>
        {/* When collapsed, the badge is the only signal that something is on. */}
        {activeCount > 0 && (
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-md"
            style={{ background: 'rgba(52,211,153,0.14)', color: '#6ee7b7', border: '1px solid rgba(52,211,153,0.3)' }}>
            {activeCount} აქტიური
          </span>
        )}
        {isSpectator && liveInvisible && (
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-md"
            style={{ background: 'rgba(155,0,255,0.14)', color: '#d9b8ff', border: '1px solid rgba(155,0,255,0.32)' }}>
            უჩინარი
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] text-white/30">{open ? '▲' : '▼'}</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-2 pb-2 pt-1 flex flex-col gap-1.5">
              {catalog.map(item => {
                const accent = ACCENT[item.id] ?? '255,255,255';
                const owned = item.id === 'invisible' ? perks.ownsInvisible : item.id === 'anon' ? perks.ownsAnon : false;
                const on = item.id === 'invisible'
                  ? perks.invisibleMode === 'always'
                  : item.id === 'anon' ? perks.anonMode === 'always' : false;
                const live = item.id === 'invisible' && isSpectator && liveInvisible;
                const hoursLeft = vipActive ? Math.max(1, Math.ceil((perks.vipUntil! - Date.now()) / 3_600_000)) : 0;

                const status =
                  item.id === 'invisible' || item.id === 'anon'
                    ? (owned ? (on ? 'ჩართულია' : 'გამორთულია') : `${item.price} 🪙`)
                    : item.id === 'vip'
                      ? (vipActive ? `აქტიური · ${hoursLeft} სთ` : `${item.price} 🪙`)
                      : (perks.xpBoostGames > 0 ? `დარჩა ${perks.xpBoostGames} თამაში` : `${item.price} 🪙`);

                const lit = (owned && on) || live || (item.id === 'vip' && vipActive) || (item.id === 'xpboost' && perks.xpBoostGames > 0);

                return (
                  <div key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                    style={{
                      border: `1px solid rgba(${accent},${lit ? 0.34 : 0.12})`,
                      background: lit ? `rgba(${accent},0.10)` : 'rgba(255,255,255,0.02)',
                    }}>
                    <span className="text-[15px] shrink-0">{EMOJI[item.id] ?? '•'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[12px] text-white/85 truncate">{item.ka}</div>
                      <div className="font-mono text-[10px] truncate" style={{ color: lit ? `rgb(${accent})` : 'rgba(255,255,255,0.35)' }}>
                        {status}
                      </div>
                    </div>

                    {(item.id === 'invisible' || item.id === 'anon') && owned ? (
                      <button
                        onClick={() => toggle(item.id as 'invisible' | 'anon', !on)}
                        disabled={busy === item.id}
                        aria-pressed={on}
                        className="shrink-0 rounded-full transition-all active:scale-95 disabled:opacity-50"
                        style={{
                          width: 42, height: 24, padding: 2,
                          background: on ? `rgba(${accent},0.35)` : 'rgba(255,255,255,0.08)',
                          border: `1px solid rgba(${accent},${on ? 0.5 : 0.15})`,
                        }}
                      >
                        <span style={{
                          display: 'block', width: 18, height: 18, borderRadius: 999,
                          background: on ? `rgb(${accent})` : 'rgba(255,255,255,0.45)',
                          transform: `translateX(${on ? 18 : 0}px)`,
                          transition: 'transform 0.16s ease, background 0.16s ease',
                        }} />
                      </button>
                    ) : (
                      <button
                        onClick={() => buy(item.id)}
                        disabled={busy === item.id}
                        className="shrink-0 px-2.5 py-1 rounded-md font-mono text-[11px] font-bold transition-all active:scale-95 disabled:opacity-50"
                        style={{
                          border: `1px solid rgba(${accent},0.4)`,
                          background: `rgba(${accent},0.14)`,
                          color: `rgb(${accent})`,
                        }}
                      >
                        {busy === item.id ? '…' : (item.id === 'vip' && vipActive) || (item.id === 'xpboost' && perks.xpBoostGames > 0) ? 'კიდევ' : 'ყიდვა'}
                      </button>
                    )}
                  </div>
                );
              })}

              {msg && <p className="text-center font-mono text-[11px] text-amber-300 pt-0.5">{msg}</p>}
              {!isSpectator && perks.ownsInvisible && perks.invisibleMode === 'always' && (
                <p className="text-center font-mono text-[10px] text-white/30 leading-snug px-2">
                  უჩინარობა მოქმედებს მაშინ, როცა დამკვირვებელი ხარ.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
