/**
 * Room FX overlay — entrance banners and thrown stickers.
 *
 * Both effects are server-broadcast (`room:entrance`, `room:sticker`), so what
 * you see here is what everyone else in the room sees at the same moment. The
 * layer is a fixed, pointer-events-none sheet above the lobby: it must never
 * swallow a tap meant for the Ready button underneath it.
 *
 * Both queues are hard-capped. A perk that can put things on other people's
 * screens is a griefing surface, so the server rate-limits the sending and this
 * caps the rendering — even a compromised client cannot paper over the lobby.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { socket } from '@/lib/socket';
import { ENTRANCE_COLORS, type EntranceStyle } from '@/constants/perks';

interface Entrance { key: number; name: string; avatar: string; avatarUrl: string | null; style: EntranceStyle }
interface Sticker { key: number; from: string; sticker: string; lane: number; drift: number }

const MAX_STICKERS = 8;
const ENTRANCE_MS = 2600;
const STICKER_MS = 2400;

let seq = 0;

export function RoomFxLayer() {
  const [entrances, setEntrances] = useState<Entrance[]>([]);
  const [stickers, setStickers] = useState<Sticker[]>([]);

  useEffect(() => {
    const onEntrance = (d: any) => {
      const style = (ENTRANCE_COLORS as any)[d?.style] ? d.style as EntranceStyle : 'neon';
      const key = ++seq;
      // Only ever one banner on screen: two at once are unreadable, and the
      // second arrival is the one worth showing.
      setEntrances([{ key, name: String(d?.name ?? ''), avatar: String(d?.avatar ?? '🙂'), avatarUrl: d?.avatarUrl ?? null, style }]);
      setTimeout(() => setEntrances(e => e.filter(x => x.key !== key)), ENTRANCE_MS);
    };
    const onSticker = (d: any) => {
      const key = ++seq;
      // Lane + drift are derived from the sequence number rather than random so
      // consecutive stickers spread out instead of clumping.
      const item: Sticker = {
        key, from: String(d?.from ?? ''), sticker: String(d?.sticker ?? '❓'),
        lane: 12 + ((key * 37) % 70),
        drift: ((key * 53) % 40) - 20,
      };
      setStickers(s => [...s.slice(-(MAX_STICKERS - 1)), item]);
      setTimeout(() => setStickers(s => s.filter(x => x.key !== key)), STICKER_MS);
    };
    socket.on('room:entrance' as any, onEntrance);
    socket.on('room:sticker' as any, onSticker);
    return () => {
      socket.off('room:entrance' as any, onEntrance);
      socket.off('room:sticker' as any, onSticker);
    };
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 60 }}>
      {/* ── Entrance banner ── */}
      <AnimatePresence>
        {entrances.map(e => {
          const c = ENTRANCE_COLORS[e.style];
          return (
            <motion.div
              key={e.key}
              initial={{ opacity: 0, y: -40, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -24, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              className="absolute left-1/2 top-[14%] -translate-x-1/2 w-[min(92vw,26rem)]"
            >
              <div className="rounded-2xl px-4 py-3 flex items-center gap-3 overflow-hidden relative"
                style={{
                  background: `linear-gradient(115deg, ${c.from}, ${c.to})`,
                  boxShadow: `0 10px 40px ${c.glow}, 0 0 0 1px rgba(255,255,255,0.14) inset`,
                }}>
                {/* Sweep: one pass of light across the banner. */}
                <motion.div
                  className="absolute inset-0"
                  initial={{ x: '-120%' }} animate={{ x: '120%' }}
                  transition={{ duration: 1.1, ease: 'easeInOut', delay: 0.15 }}
                  style={{ background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.32) 50%, transparent 65%)' }}
                />
                {e.avatarUrl
                  ? <img src={e.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0"
                      style={{ border: '2px solid rgba(255,255,255,0.5)' }} />
                  : <span className="text-2xl shrink-0">{e.avatar}</span>}
                <div className="min-w-0 relative">
                  <p className="font-display font-bold text-[15px] truncate" style={{ color: c.text }}>{e.name}</p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: c.text, opacity: 0.75 }}>
                    შემოვიდა
                  </p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* ── Thrown stickers ── */}
      <AnimatePresence>
        {stickers.map(s => (
          <motion.div
            key={s.key}
            initial={{ opacity: 0, y: 0, scale: 0.4 }}
            animate={{ opacity: [0, 1, 1, 0], y: -260, scale: [0.4, 1.25, 1.1, 0.95], x: s.drift }}
            exit={{ opacity: 0 }}
            transition={{ duration: STICKER_MS / 1000, ease: 'easeOut', times: [0, 0.18, 0.7, 1] }}
            className="absolute flex flex-col items-center"
            style={{ left: `${s.lane}%`, bottom: '18%' }}
          >
            <span style={{ fontSize: 44, filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.6))' }}>{s.sticker}</span>
            <span className="font-mono text-[10px] mt-0.5 px-1.5 py-0.5 rounded-md"
              style={{ background: 'rgba(0,0,0,0.45)', color: 'rgba(255,255,255,0.7)' }}>
              {s.from}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
