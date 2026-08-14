/**
 * Items strip for the mafia lobby.
 *
 * The perks used to live only inside the coin shop's "ნივთები" tab — four taps
 * away from the one place they actually matter. This puts them at the top of the
 * lobby, where you buy them and switch them on/off in place.
 *
 * Everything is a thin client over the same server events the shop uses
 * (`perks:get` / `perks:buy` / `perks:configure` / `perks:choose`), so the two
 * views can never disagree about what you own.
 *
 * Two perks need more than a switch, and both are handled here rather than by
 * sending the player elsewhere:
 *   invisibility — when you are already on the bench, flipping it must change
 *     what others see NOW, so it also fires `spectator:toggle_invisible`.
 *   room skin — only meaningful while you are host, so the picker is hidden
 *     otherwise instead of being shown as a dead control.
 */
import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import type { Res } from '@/types/index';
import {
  PERK_EMOJI, PERK_ACCENT, ENTRANCE_STYLES, ENTRANCE_LABEL, ROOM_SKINS, ROOM_SKIN_LABEL,
  VOICE_PRESETS, VOICE_LABEL, STICKERS,
  type PerkDef, type PerkState, type TogglePerk, type ChoicePerk,
} from '@/constants/perks';
import { setLiveKitVoiceMask } from '@/services/livekitVoice';

export function LobbyItemsBar({
  isSpectator = false,
  liveInvisible = false,
  isHost = false,
  onCoinsChange,
}: {
  /** Viewer is on the spectator bench — enables the live invisibility toggle. */
  isSpectator?: boolean;
  /** Server truth for "you are invisible right now" (PlayerPublic.invisibleSpectator). */
  liveInvisible?: boolean;
  /** Only the host can dress the room, so only the host gets the picker. */
  isHost?: boolean;
  onCoinsChange?: (coins: number) => void;
}) {
  const [perks, setPerks] = useState<PerkState | null>(null);
  const [catalog, setCatalog] = useState<PerkDef[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [stickersLeft, setStickersLeft] = useState<number | null>(null);

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
        setExpanded(id);           // reveal the new controls straight away
      } else setMsg(('error' in res && res.error) || 'ვერ შესრულდა');
    } catch (e: any) { setMsg(e?.message ?? 'ვერ შესრულდა'); }
    finally { setBusy(null); }
  };

  const toggle = async (which: TogglePerk, on: boolean) => {
    if (busy) return;
    setBusy(which); setMsg(null);
    try {
      const res = await emitWithAck<{ which: string; mode: string }, Res<{ perks: PerkState }>>(
        'perks:configure', { which, mode: on ? 'always' : 'off' });
      if (!('ok' in res && res.ok)) { setMsg(('error' in res && res.error) || 'ვერ შესრულდა'); return; }
      setPerks(res.data.perks);

      // Saved default changed. If we're already watching, apply it to this
      // session too — otherwise the switch would only take effect on the next
      // room join, which reads as "it doesn't work".
      if (which === 'invisible' && isSpectator) {
        try { await emitWithAck<{ on: boolean }, any>('spectator:toggle_invisible', { on }); } catch { /* room may have ended */ }
      }
      // The mask lives in this browser's audio graph — nothing else can apply it.
      if (which === 'voicemask') {
        void setLiveKitVoiceMask(on ? res.data.perks.voiceMaskPreset : null);
      }
      setMsg(on ? 'ჩართულია ✓' : 'გამორთულია');
    } catch (e: any) { setMsg(e?.message ?? 'ვერ შესრულდა'); }
    finally { setBusy(null); }
  };

  const choose = async (which: ChoicePerk, value: string) => {
    if (busy) return;
    setBusy(which); setMsg(null);
    try {
      const res = await emitWithAck<{ which: string; value: string }, Res<{ perks: PerkState }>>(
        'perks:choose', { which, value });
      if (!('ok' in res && res.ok)) { setMsg(('error' in res && res.error) || 'ვერ შესრულდა'); return; }
      setPerks(res.data.perks);
      if (which === 'voicemask' && res.data.perks.voiceMaskMode === 'always') {
        void setLiveKitVoiceMask(res.data.perks.voiceMaskPreset);
      }
    } catch (e: any) { setMsg(e?.message ?? 'ვერ შესრულდა'); }
    finally { setBusy(null); }
  };

  const throwSticker = async (sticker: string) => {
    if (busy) return;
    setBusy('stickers');
    try {
      const res = await emitWithAck<{ sticker: string }, Res<{ left: number }>>('room:sticker', { sticker });
      if ('ok' in res && res.ok) {
        setStickersLeft(res.data.left);
        setPerks(p => (p ? { ...p, stickers: res.data.left } : p));
      } else setMsg(('error' in res && res.error) || 'ვერ შესრულდა');
    } catch (e: any) { setMsg(e?.message ?? 'ვერ შესრულდა'); }
    finally { setBusy(null); }
  };

  if (!perks || catalog.length === 0) return null;

  const now = Date.now();
  const vipActive = perks.vipUntil != null && perks.vipUntil > now;
  const magnetActive = perks.coinMagnetUntil != null && perks.coinMagnetUntil > now;
  const stickerCount = stickersLeft ?? perks.stickers;

  const activeCount =
    (perks.ownsInvisible && perks.invisibleMode === 'always' ? 1 : 0) +
    (perks.ownsAnon && perks.anonMode === 'always' ? 1 : 0) +
    (perks.ownsEntrance && perks.entranceMode === 'always' ? 1 : 0) +
    (perks.ownsVoiceMask && perks.voiceMaskMode === 'always' ? 1 : 0) +
    (vipActive ? 1 : 0) + (magnetActive ? 1 : 0) +
    (perks.xpBoostGames > 0 ? 1 : 0) + (stickerCount > 0 ? 1 : 0);

  const owned = (id: string): boolean => ({
    invisible: perks.ownsInvisible, anon: perks.ownsAnon, entrance: perks.ownsEntrance,
    roomskin: perks.ownsRoomSkin, voicemask: perks.ownsVoiceMask, notebook: perks.ownsNotebook,
  } as Record<string, boolean>)[id] ?? false;

  const isOn = (id: string): boolean => ({
    invisible: perks.invisibleMode === 'always', anon: perks.anonMode === 'always',
    entrance: perks.entranceMode === 'always', voicemask: perks.voiceMaskMode === 'always',
  } as Record<string, boolean>)[id] ?? false;

  const hours = (until: number | null) => Math.max(1, Math.ceil(((until ?? 0) - now) / 3_600_000));

  const statusOf = (item: PerkDef): string => {
    switch (item.id) {
      case 'invisible': case 'anon': case 'entrance': case 'voicemask':
        return owned(item.id) ? (isOn(item.id) ? 'ჩართულია' : 'გამორთულია') : `${item.price} 🪙`;
      case 'roomskin':
        return perks.ownsRoomSkin ? ROOM_SKIN_LABEL[perks.roomSkin] : `${item.price} 🪙`;
      case 'notebook':
        return perks.ownsNotebook ? 'გახსნილია' : `${item.price} 🪙`;
      case 'vip':
        return vipActive ? `აქტიური · ${hours(perks.vipUntil)} სთ` : `${item.price} 🪙`;
      case 'coinmagnet':
        return magnetActive ? `+25% · ${hours(perks.coinMagnetUntil)} სთ` : `${item.price} 🪙`;
      case 'xpboost':
        return perks.xpBoostGames > 0 ? `დარჩა ${perks.xpBoostGames} თამაში` : `${item.price} 🪙`;
      case 'stickers':
        return stickerCount > 0 ? `დარჩა ${stickerCount}` : `${item.price} 🪙`;
      case 'postboost':
        return perks.postBoosts > 0 ? `დარჩა ${perks.postBoosts}` : `${item.price} 🪙`;
      default:
        return `${item.price} 🪙`;
    }
  };

  const isLit = (item: PerkDef): boolean => {
    switch (item.id) {
      case 'invisible': return isOn('invisible') || (isSpectator && liveInvisible);
      case 'anon': case 'entrance': case 'voicemask': return owned(item.id) && isOn(item.id);
      case 'roomskin': return perks.ownsRoomSkin && perks.roomSkin !== 'default';
      case 'notebook': return perks.ownsNotebook;
      case 'vip': return vipActive;
      case 'coinmagnet': return magnetActive;
      case 'xpboost': return perks.xpBoostGames > 0;
      case 'stickers': return stickerCount > 0;
      case 'postboost': return perks.postBoosts > 0;
      default: return false;
    }
  };

  /** Which extra panel (if any) this item reveals when tapped. */
  const panelOf = (id: string): 'entrance' | 'roomskin' | 'voicemask' | 'stickers' | null => {
    if (id === 'entrance' && perks.ownsEntrance) return 'entrance';
    if (id === 'roomskin' && perks.ownsRoomSkin) return 'roomskin';
    if (id === 'voicemask' && perks.ownsVoiceMask) return 'voicemask';
    if (id === 'stickers' && stickerCount > 0) return 'stickers';
    return null;
  };

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
                const accent = PERK_ACCENT[item.id] ?? '255,255,255';
                const lit = isLit(item);
                const isToggle = ['invisible', 'anon', 'entrance', 'voicemask'].includes(item.id);
                const canToggle = isToggle && owned(item.id);
                const panel = panelOf(item.id);
                const showPanel = expanded === item.id && panel;
                // The room skin only does anything for the host; saying so beats
                // showing a picker that quietly changes nothing.
                const hostOnlyNote = item.id === 'roomskin' && perks.ownsRoomSkin && !isHost;

                return (
                  <div key={item.id} className="rounded-lg overflow-hidden"
                    style={{
                      border: `1px solid rgba(${accent},${lit ? 0.34 : 0.12})`,
                      background: lit ? `rgba(${accent},0.10)` : 'rgba(255,255,255,0.02)',
                    }}>
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <span className="text-[15px] shrink-0">{PERK_EMOJI[item.id] ?? '•'}</span>
                      <button
                        className="min-w-0 flex-1 text-left"
                        onClick={() => panel && setExpanded(e => (e === item.id ? null : item.id))}
                      >
                        <div className="font-mono text-[12px] text-white/85 truncate flex items-center gap-1">
                          {item.ka}
                          {panel && <span className="text-white/25 text-[10px]">{showPanel ? '▲' : '▼'}</span>}
                        </div>
                        <div className="font-mono text-[10px] truncate" style={{ color: lit ? `rgb(${accent})` : 'rgba(255,255,255,0.35)' }}>
                          {statusOf(item)}
                        </div>
                      </button>

                      {canToggle ? (
                        <button
                          onClick={() => toggle(item.id as TogglePerk, !isOn(item.id))}
                          disabled={busy === item.id}
                          aria-pressed={isOn(item.id)}
                          className="shrink-0 rounded-full transition-all active:scale-95 disabled:opacity-50"
                          style={{
                            width: 42, height: 24, padding: 2,
                            background: isOn(item.id) ? `rgba(${accent},0.35)` : 'rgba(255,255,255,0.08)',
                            border: `1px solid rgba(${accent},${isOn(item.id) ? 0.5 : 0.15})`,
                          }}
                        >
                          <span style={{
                            display: 'block', width: 18, height: 18, borderRadius: 999,
                            background: isOn(item.id) ? `rgb(${accent})` : 'rgba(255,255,255,0.45)',
                            transform: `translateX(${isOn(item.id) ? 18 : 0}px)`,
                            transition: 'transform 0.16s ease, background 0.16s ease',
                          }} />
                        </button>
                      ) : owned(item.id) ? (
                        // Own-once perks with no switch (skin, notebook) just report it.
                        <span className="shrink-0 font-mono text-[11px] px-2 py-1 rounded-md"
                          style={{ border: `1px solid rgba(${accent},0.3)`, color: `rgb(${accent})` }}>✓</span>
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
                          {busy === item.id ? '…'
                            : (item.kind === 'duration' || item.kind === 'consumable') && lit ? 'კიდევ' : 'ყიდვა'}
                        </button>
                      )}
                    </div>

                    {hostOnlyNote && (
                      <p className="px-2 pb-1.5 font-mono text-[10px] text-white/30">
                        მოქმედებს მაშინ, როცა ოთახის ჰოსტი ხარ.
                      </p>
                    )}

                    <AnimatePresence initial={false}>
                      {showPanel && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }} style={{ overflow: 'hidden' }}
                        >
                          <div className="px-2 pb-2 pt-0.5 flex flex-wrap gap-1">
                            {panel === 'entrance' && ENTRANCE_STYLES.map(s => (
                              <Chip key={s} accent={accent} active={perks.entranceStyle === s}
                                onClick={() => choose('entrance', s)}>{ENTRANCE_LABEL[s]}</Chip>
                            ))}
                            {panel === 'roomskin' && ROOM_SKINS.map(s => (
                              <Chip key={s} accent={accent} active={perks.roomSkin === s}
                                onClick={() => choose('roomskin', s)}>{ROOM_SKIN_LABEL[s]}</Chip>
                            ))}
                            {panel === 'voicemask' && VOICE_PRESETS.map(s => (
                              <Chip key={s} accent={accent} active={perks.voiceMaskPreset === s}
                                onClick={() => choose('voicemask', s)}>{VOICE_LABEL[s]}</Chip>
                            ))}
                            {panel === 'stickers' && STICKERS.map(s => (
                              <button key={s} onClick={() => throwSticker(s)} disabled={busy === 'stickers'}
                                className="w-9 h-9 rounded-lg text-[19px] transition-all active:scale-90 disabled:opacity-40"
                                style={{ border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)' }}>
                                {s}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
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

function Chip({ accent, active, onClick, children }: {
  accent: string; active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick}
      className="px-2.5 py-1 rounded-md font-mono text-[11px] transition-all active:scale-95"
      style={{
        border: `1px solid rgba(${accent},${active ? 0.5 : 0.14})`,
        background: active ? `rgba(${accent},0.18)` : 'rgba(255,255,255,0.03)',
        color: active ? `rgb(${accent})` : 'rgba(255,255,255,0.5)',
      }}>
      {children}
    </button>
  );
}
