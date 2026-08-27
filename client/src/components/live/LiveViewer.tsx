/**
 * Watching somebody's broadcast.
 *
 * The same screen the host sees, with the controls swapped: they get a mic and
 * an end button, a viewer gets a comment box and a heart. Both are built from
 * `LiveStage` and `useLiveRoom` for that reason — two implementations of one
 * screen is how the comment overlay ends up in a different place depending on
 * who you are, and how one side ends up with a feature the other never got.
 *
 * LEAVING IS TOLD, NOT INFERRED
 * ─────────────────────────────
 * The viewer count is what a host is watching while they talk, so it has to
 * fall when somebody goes. Closing this tells the server; closing the tab is
 * caught by the disconnect handler. Both matter — a count that only ever goes
 * up is worse than no count at all.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { socket } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { useLivekitRoomVoice, useLiveKitGate } from '@/hooks/useLivekitVoice';
import { getLiveKitRemoteVideo } from '@/services/livekitVoice';
import type { LiveSession } from '@/types/live';
import { LiveStage, LiveComments, HeartBurst, LiveStat } from './LiveStage';
import { useLiveRoom } from './useLiveRoom';
import { LiveGiftPicker, LiveGiftBurst, GiftButton, useGiftPicker } from './LiveGiftUI';

const RED = '#ff2d55';
const GOLD = '#ffcc33';

export function LiveViewer({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const profile = useAuthStore(s => s.profile);
  const myId = profile?.id ?? '';
  const { enabled: lkEnabled } = useLiveKitGate();

  const [session, setSession] = useState<LiveSession | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  const room = useLiveRoom({
    sessionId,
    hostId: session?.hostId ?? null,
    myId,
    initial: {
      viewers: session?.viewers, hearts: session?.totalHearts,
      giftCoins: session?.giftCoins, giftCount: session?.giftCount,
    },
  });

  const gifts = useGiftPicker(room.sendGift);

  /*
   * What this account can spend.
   *
   * Kept here rather than read from a global store because the picker greys out
   * what you cannot afford, and being told "not enough coins" by the server
   * after tapping feels like a broken app even when it is being exactly right.
   * `coins:updated` lands after every gift, so it stays true while sending.
   */
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    socket.emit('coins:balance' as any, (res: any) => {
      if (typeof res?.data?.coins === 'number') setBalance(res.data.coins);
    });
    const onCoins = (d: any) => { if (typeof d?.coins === 'number') setBalance(d.coins); };
    socket.on('coins:updated' as any, onCoins);
    return () => { socket.off('coins:updated' as any, onCoins); };
  }, []);

  // Join once, and tell the server when we go.
  useEffect(() => {
    socket.emit('live:join' as any, { sessionId }, (res: any) => {
      if (!res?.ok) { setError(res?.error ?? 'ეთერი ვერ მოიძებნა'); return; }
      setSession(res.data);
    });
    return () => { socket.emit('live:leave' as any, { sessionId }, () => {}); };
  }, [sessionId]);

  const voice = useLivekitRoomVoice({
    roomId: session ? session.room : null,
    identity: myId || null,
    active: lkEnabled && !!session && !room.ended,
    // A viewer listens. The host is the only publisher in the room.
    listenOnly: true,
  });

  /*
   * The host's video, out of the LiveKit subscription map.
   *
   * Keyed on `voice.rev`, which bumps the moment a remote track is subscribed
   * or dropped — so the picture appears as soon as it arrives rather than up to
   * half a second later, and disappears the moment the host stops rather than
   * freezing on a last frame. The map is keyed by LiveKit identity, which is
   * the profile id, which is what `hostId` is.
   */
  const [stream, setStream] = useState<MediaStream | null>(null);
  useEffect(() => {
    if (!session) { setStream(null); return; }
    setStream(getLiveKitRemoteVideo().get(session.hostId) ?? null);
  }, [session?.hostId, voice.rev]);

  /*
   * Muting is a local decision about your own speaker.
   *
   * Somebody watching in a lecture wants the picture without the sound, and
   * their only option was leaving. Nothing is told to the server: the host's
   * viewer count should not fall because one person turned the volume down.
   */
  const audioRef = useRef<HTMLVideoElement | null>(null);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    room.say(text);
    setDraft('');
  };

  const canType = !room.ended && !error;

  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[700] flex flex-col" style={{ background: '#05030c' }}>

      <LiveStage stream={stream} muted={muted} videoRef={audioRef} />

      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-center gap-1.5 px-4 pt-4">
          <span className="px-2 py-1 rounded-lg font-mono font-bold text-[11px] text-white flex-shrink-0" style={{ background: RED }}>LIVE</span>
          <LiveStat icon="👁" value={room.viewers} />
          {room.hearts > 0 && <LiveStat icon="❤️" value={room.hearts} tint={`${RED}55`} />}
          {room.giftCoins > 0 && <LiveStat icon="🎁" value={room.giftCoins} tint={`${GOLD}66`} />}
          <span className="flex-1 min-w-0">
            <span className="block font-display font-bold text-white text-[13px] truncate">{session?.hostName ?? ''}</span>
            <span className="block font-mono text-[10.5px] text-white/50 truncate">{session?.title ?? ''}</span>
          </span>
          <button onClick={() => setMuted(m => !m)} aria-label={muted ? 'ხმის ჩართვა' : 'დადუმება'}
            className="w-9 h-9 rounded-full flex items-center justify-center text-[15px] flex-shrink-0"
            style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.16)' }}>
            {muted ? '🔇' : '🔊'}
          </button>
          <button onClick={onClose} aria-label="დახურვა"
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 flex-shrink-0"
            style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.16)' }}>✕</button>
        </div>

        {error && <p className="mx-auto mt-6 font-mono text-[12px]" style={{ color: '#ff8a92' }}>{error}</p>}

        {/* Connecting and connected-but-no-picture are different problems, and
            "კამერა…" forever is the unhelpful version of both. */}
        {!error && !room.ended && !stream && (
          <p className="mx-auto mt-6 font-mono text-[11.5px] text-white/40">
            {voice.connected ? 'ჰოსტის კამერას ველოდებით…' : 'ვუერთდებით ეთერს…'}
          </p>
        )}

        <div className="mt-auto">
          <LiveComments comments={room.comments} />
          <div className="flex items-center gap-2 px-4 pb-6 pt-3">
            <div className="flex-1 min-w-0 flex items-center rounded-full pr-1"
              style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.18)' }}>
              <input
                value={draft} onChange={e => setDraft(e.target.value.slice(0, 200))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
                placeholder="დაწერე კომენტარი…"
                disabled={!canType}
                enterKeyHint="send"
                className="flex-1 min-w-0 bg-transparent px-4 py-2.5 font-mono text-[12px] text-white outline-none disabled:opacity-40"
              />
              {/*
                * A visible send button.
                *
                * This was Enter-only, and on a phone that is not a send key —
                * it is whatever the keyboard decided, usually a newline. People
                * typed a comment, pressed the only thing that looked like it
                * would work, and watched nothing happen. `enterKeyHint` asks
                * the keyboard nicely; the button does not have to ask.
                */}
              <button onClick={send} disabled={!canType || !draft.trim()} aria-label="გაგზავნა"
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
                style={{
                  background: draft.trim() && canType ? RED : 'rgba(255,255,255,0.08)',
                  opacity: canType ? 1 : 0.4,
                }}>
                <SendMark dim={!draft.trim() || !canType} />
              </button>
            </div>
            <GiftButton onClick={gifts.show} disabled={room.ended} />
            <button onClick={room.sendHeart} disabled={room.ended} aria-label="გული"
              className="w-11 h-11 rounded-full flex items-center justify-center text-[19px] flex-shrink-0 transition-transform active:scale-90 disabled:opacity-40"
              style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${RED}66` }}>❤️</button>
          </div>
        </div>

        <HeartBurst hearts={room.heartAnim} />
      </div>

      {/* A gift crosses the middle at size, because it cost somebody coins and
          the entire point of sending one is that the host notices. */}
      <LiveGiftBurst gifts={room.giftAnim} />

      <AnimatePresence>
        {gifts.open && (
          <LiveGiftPicker balance={balance} busy={gifts.busy} error={gifts.error}
            onPick={g => gifts.pick(g)} onClose={gifts.hide} />
        )}
      </AnimatePresence>

      {/* The host stopped. Say so rather than leaving a frozen last frame. */}
      <AnimatePresence>
        {room.ended && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="absolute inset-0 z-[705] flex flex-col items-center justify-center px-8 text-center"
            style={{ background: 'rgba(5,3,12,0.92)' }}>
            <p className="text-5xl mb-3">📡</p>
            <p className="font-display font-black text-white" style={{ fontSize: 21 }}>ეთერი დასრულდა</p>
            <p className="font-mono text-[12px] text-white/45 mt-1.5">{session?.hostName ?? ''}</p>
            <button onClick={onClose} className="mt-7 px-8 py-3 rounded-2xl font-display font-bold text-white text-[14px]"
              style={{ background: RED }}>დახურვა</button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>,
    document.body,
  );
}

/** Drawn rather than ➤: that glyph is a different shape on every platform. */
function SendMark({ dim }: { dim?: boolean }) {
  const c = dim ? 'rgba(255,255,255,0.45)' : '#fff';
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden style={{ display: 'block' }}>
      <path d="M3.6 11.4 20 4l-7.4 16.4-1.9-6.6-7.1-2.4Z" fill={c} />
    </svg>
  );
}
