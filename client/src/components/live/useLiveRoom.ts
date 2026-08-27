/**
 * The state of a broadcast, for whoever is looking at it.
 *
 * WHY ONE HOOK AND NOT TWO SCREENS
 * ────────────────────────────────
 * The host's screen and a viewer's screen listen to exactly the same four
 * events and keep exactly the same three pieces of state, and they used to do
 * it twice — two copies that had already drifted: the host's comment list had
 * no notion of who the host was, the viewer's had no heart total, and when the
 * server started sending avatars only one of them would have shown them.
 *
 * Two implementations of one thing is how a live screen ends up correct for
 * whoever was debugged last. This is the one implementation.
 *
 * WHAT IT DOES NOT OWN
 * ────────────────────
 * The media. That is LiveKit's, and both screens read it directly — a hook
 * that owned a MediaStream as well would re-render the whole screen every time
 * a comment arrived, which on a phone is a dropped frame per message.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { socket } from '@/lib/socket';
import type { LiveComment, LiveGiftEvent } from '@/types/live';
import { useHearts } from './LiveStage';

/** Enough scrollback for the overlay's six lines and a burst arriving at once. */
const KEEP = 40;

export interface LiveRoom {
  viewers: number;
  hearts: number;
  comments: LiveComment[];
  /** Somebody just arrived — for the host's toast. Cleared by the caller. */
  joined: { userId: string; name: string } | null;
  /** The host stopped. */
  ended: boolean;
  /** Floating hearts, already de-duplicated against your own taps. */
  heartAnim: { id: number; x: number }[];
  /** Coins sent as gifts so far, and how many gifts that was. */
  giftCoins: number;
  giftCount: number;
  /** Gifts currently flying across the screen. */
  giftAnim: (LiveGiftEvent & { key: number })[];
  say: (text: string) => void;
  sendHeart: () => void;
  /** Resolves with an error message when the gift could not be sent. */
  sendGift: (giftId: string) => Promise<string | null>;
  clearJoined: () => void;
}

/** Long enough to read who sent it; short enough not to sit on the video. */
const GIFT_MS = 4_000;

export function useLiveRoom(opts: {
  sessionId: string | null;
  hostId: string | null;
  myId: string;
  /** The counts the session came back with, so nothing starts at zero. */
  initial?: { viewers?: number; hearts?: number; giftCoins?: number; giftCount?: number };
}): LiveRoom {
  const { sessionId, hostId, myId } = opts;

  const [viewers, setViewers] = useState(opts.initial?.viewers ?? 0);
  const [hearts, setHearts] = useState(opts.initial?.hearts ?? 0);
  const [giftCoins, setGiftCoins] = useState(opts.initial?.giftCoins ?? 0);
  const [giftCount, setGiftCount] = useState(opts.initial?.giftCount ?? 0);
  const [giftAnim, setGiftAnim] = useState<(LiveGiftEvent & { key: number })[]>([]);
  const nextGiftKey = useRef(0);
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [joined, setJoined] = useState<{ userId: string; name: string } | null>(null);
  const [ended, setEnded] = useState(false);
  const { hearts: heartAnim, burst } = useHearts();

  // Read inside the socket handlers, which are registered once per session.
  const hostRef = useRef(hostId); hostRef.current = hostId;
  const meRef = useRef(myId); meRef.current = myId;

  useEffect(() => {
    if (!sessionId) return;
    setEnded(false);

    const mine = (d: any) => d?.sessionId === sessionId;

    const onViewers = (d: any) => {
      if (!mine(d)) return;
      setViewers(d.viewers ?? 0);
      if (d.joined?.name && d.joined.userId !== meRef.current) setJoined(d.joined);
    };

    const onComment = (d: any) => {
      if (!mine(d)) return;
      const line: LiveComment = {
        id: `${d.userId}_${d.at}`,
        userId: d.userId, name: d.name, avatar: d.avatar, avatarUrl: d.avatarUrl,
        text: d.text, at: d.at,
        isHost: !!hostRef.current && d.userId === hostRef.current,
      };
      setComments(c => {
        /*
         * Your own line is already on screen, drawn the moment you pressed send
         * — waiting for the round trip on a train is the difference between a
         * chat that works and one that feels broken. The echo replaces it
         * rather than doubling it.
         */
        const pendingIdx = d.userId === meRef.current
          ? c.findIndex(x => x.pending && x.text === d.text)
          : -1;
        if (pendingIdx >= 0) {
          const next = c.slice();
          next[pendingIdx] = line;
          return next;
        }
        return [...c.slice(-KEEP), line];
      });
    };

    const onHeart = (d: any) => {
      if (!mine(d)) return;
      if (typeof d.hearts === 'number') setHearts(d.hearts);
      // Your own tap already drew one. Drawing it again on the echo is a
      // double heart for every tap, which reads as a stutter.
      if (d.userId !== meRef.current) burst();
    };

    /*
     * A gift, drawn for everybody including the sender.
     *
     * Unlike a heart, this is NOT de-duplicated against your own tap: a gift is
     * a moment the room shares and the sender is part of the room. Their own
     * rose flying up with their name on it is the point of having sent it, and
     * the optimism is deliberately not local — a gift that appears and then
     * turns out not to have been paid for would be the worst kind of wrong.
     */
    const onGift = (d: any) => {
      if (!mine(d)) return;
      if (typeof d.giftCoins === 'number') setGiftCoins(d.giftCoins);
      if (typeof d.giftCount === 'number') setGiftCount(d.giftCount);
      const key = nextGiftKey.current++;
      setGiftAnim(g => [...g.slice(-5), { ...(d as LiveGiftEvent), key }]);
      setTimeout(() => setGiftAnim(g => g.filter(x => x.key !== key)), GIFT_MS);
    };

    const onEnded = (d: any) => { if (mine(d)) setEnded(true); };

    socket.on('live:viewers' as any, onViewers);
    socket.on('live:comment' as any, onComment);
    socket.on('live:hearted' as any, onHeart);
    socket.on('live:gifted' as any, onGift);
    socket.on('live:ended' as any, onEnded);
    return () => {
      socket.off('live:viewers' as any, onViewers);
      socket.off('live:comment' as any, onComment);
      socket.off('live:hearted' as any, onHeart);
      socket.off('live:gifted' as any, onGift);
      socket.off('live:ended' as any, onEnded);
    };
  }, [sessionId, burst]);

  const say = useCallback((raw: string) => {
    const text = raw.trim().slice(0, 200);
    if (!text || !sessionId) return;
    socket.emit('live:comment' as any, { sessionId, text });
    // Optimistic, and marked so the echo can find and replace it.
    setComments(c => [...c.slice(-KEEP), {
      id: `pending_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId: meRef.current, name: '', text, at: Date.now(),
      isHost: !!hostRef.current && meRef.current === hostRef.current,
      pending: true,
    }]);
  }, [sessionId]);

  const sendHeart = useCallback(() => {
    if (!sessionId) return;
    burst();                                       // yours shows instantly
    setHearts(h => h + 1);                         // and the server's number lands over it
    socket.emit('live:heart' as any, { sessionId });
  }, [sessionId, burst]);

  /*
   * A gift is the one thing on this screen that spends money, so it is the one
   * thing that waits for an answer.
   *
   * Hearts and comments are optimistic because a lost one costs nobody
   * anything. A rose drawn optimistically and then not paid for would be the
   * app lying about a transaction — so nothing is drawn until the server says
   * it happened, and the two things that will actually go wrong (a stream that
   * just ended, a balance that just ran out) come back as words to show.
   */
  const sendGift = useCallback((giftId: string): Promise<string | null> => {
    if (!sessionId) return Promise.resolve('ეთერი აღარ არის');
    return new Promise(resolve => {
      const t = setTimeout(() => resolve('ვერ გაიგზავნა'), 6000);
      socket.emit('live:gift' as any, { sessionId, giftId }, (res: any) => {
        clearTimeout(t);
        resolve(res?.ok ? null : (res?.error ?? 'ვერ გაიგზავნა'));
      });
    });
  }, [sessionId]);

  const clearJoined = useCallback(() => setJoined(null), []);

  return {
    viewers, hearts, comments, joined, ended, heartAnim,
    giftCoins, giftCount, giftAnim,
    say, sendHeart, sendGift, clearJoined,
  };
}
