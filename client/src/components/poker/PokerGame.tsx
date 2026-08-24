import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { haptic } from '@/lib/haptics';
import { useAuthStore } from '@/store/authStore';
import { usePokerStore } from '@/store/pokerStore';
import { GameInviteButton } from '@/components/social/GameInviteButton';
import { useLiveKitGate, useLivekitRoomVoice } from '@/hooks/useLivekitVoice';
import { getLiveKitSpeaking } from '@/services/livekitVoice';
import { LiveKitVoiceBarView } from '@/components/game/LiveKitVoiceBar';
import { VoiceDisguiseButton } from '@/components/game/VoiceDisguiseButton';
import { PokerCard } from './PokerCard';
import type { PokerSeatView, PokerTableView } from '@/types/poker';

/**
 * სოციალური პოკერი — the table.
 *
 * DESIGN NOTES
 * ────────────
 * Deliberately not a casino. No gold, no felt-green baize, no coin showers, no
 * "JACKPOT". The palette is the app's own slate and cyan, the chips are drawn
 * as plain counters, and the vocabulary is social throughout — Play, Join
 * Table, Play Chips. That is a product decision and a compliance one at the
 * same time: the words a product uses are how everybody, players and reviewers
 * alike, decides what it is.
 *
 * LAYOUT
 * ──────
 * Seats sit on an ellipse, rotated so that the viewer is always at the bottom.
 * Everything scales from one measured container rather than from viewport
 * units, because `100vh` on a phone includes the URL bar that is not there —
 * that is what put the bottom of the Joker table off the screen.
 *
 * VOICE
 * ─────
 * One LiveKit room per table (`poker_<tableId>`), joined for as long as the
 * table is open, with the app's voice changer available like everywhere else.
 * Watchers join listen-only: someone who is not in the hand should not be able
 * to talk into it. Speaking rings are drawn from LiveKit's active-speaker list,
 * which is keyed by profile id — the same id a seat carries — so no extra
 * plumbing is needed to know who is talking.
 *
 * WHAT THIS COMPONENT DOES NOT DO
 * ───────────────────────────────
 * Decide anything. It renders `table` and calls `act()`. It does not know who
 * is winning, what a hand is worth, whether a raise is legal, or what is in
 * anybody else's hand — `youCan` comes from the server and opponents' cards are
 * not in the payload at all.
 */

const ACCENT = '#38bdf8';

function chips(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

const ACTION_LABEL: Record<string, string> = {
  fold: 'პასი', check: 'გატარება', call: 'დაძახება',
  raise: 'აწევა', allIn: 'ალინი', 'post-blind': 'ბლაინდი', 'post-ante': 'ანტე',
};

const PHASE_LABEL: Record<string, string> = {
  STARTING: 'დარიგება', PRE_FLOP: 'პრეფლოპი', FLOP: 'ფლოპი', TURN: 'თერნი',
  RIVER: 'რივერი', SHOWDOWN: 'გახსნა', SETTLEMENT: 'ანგარიშსწორება', COMPLETE: 'დასრულდა',
};

// ─── Seat geometry ───────────────────────────────────────────────────────────

/**
 * Where a seat sits on the felt.
 *
 * `slot` is the seat's position *relative to the viewer*, so the person holding
 * the phone is always at the bottom and everyone else is arranged clockwise
 * from there. Nobody should have to work out which of nine avatars is them.
 */
/**
 * How big a seat is allowed to be, given how many of them there are.
 *
 * Twelve avatars at six-handed size do not fit round a phone — they overlap
 * each other long before they reach the board. So the seat shrinks with the
 * count rather than the table growing, which is the only one of the two a
 * 390px screen allows.
 */
function seatMetrics(maxSeats: number, compact: boolean) {
  const avatar = maxSeats <= 6 ? (compact ? 44 : 52)
               : maxSeats <= 9 ? (compact ? 38 : 46)
               : (compact ? 32 : 38);
  return {
    avatar,
    card: (maxSeats <= 9 ? 'xs' : 'xs') as 'xs',
    // The block is the avatar plus the name, the stack, and the cards above it.
    block: { w: avatar + 26, h: avatar + (maxSeats <= 9 ? 44 : 36) },
  };
}

/**
 * A short felt — a phone on its side, mostly.
 *
 * Below this the seats put their cards beside the avatar instead of above it,
 * which is worth about fifty pixels of height per seat and is the difference
 * between a table and six avatars fighting the board for the same pixels.
 */
const isTight = (h: number) => h < 400;

/** The felt's radii. Seats sit on this same ring, so they hug the rim. */
function feltRadii(w: number, h: number, maxSeats = 6) {
  const { block } = seatMetrics(maxSeats, w < 380);
  return {
    rx: Math.max(60, w / 2 - block.w * 0.55),
    // The seat block sits above the avatar (two mini cards, then the name), so
    // the vertical inset has to clear the whole block or the top seat's cards
    // slide under the header.
    ry: Math.max(70, h / 2 - (isTight(h) ? block.h * 0.62 : block.h * 0.80)),
  };
}

function seatPosition(slot: number, total: number, w: number, h: number) {
  const angle = (Math.PI / 2) + (slot / total) * Math.PI * 2;  // start at bottom
  const { rx, ry } = feltRadii(w, h, total);
  return {
    left: w / 2 + Math.cos(angle) * rx,
    top: h / 2 + Math.sin(angle) * ry,
    /*
     * Which way this seat is short of room.
     *
     * At the top and bottom of the ring the scarce axis is vertical, so the
     * cards go beside the avatar. At the sides it is horizontal — the board is
     * right there — so they stay above it. One rule for both would fix one
     * collision by causing the other, which is exactly what happened.
     */
    endOn: Math.abs(Math.cos(angle)) < 0.5,
  };
}

/**
 * Is the phone on its side?
 *
 * Measured from `visualViewport` where it exists, because a phone's
 * `innerHeight` includes a URL bar that is not on the screen — the same trap
 * that put the bottom of the Joker table below the fold.
 */
function useLandscape(): boolean {
  const [landscape, setLandscape] = useState(false);
  useEffect(() => {
    const measure = () => {
      const w = window.visualViewport?.width ?? window.innerWidth;
      const h = window.visualViewport?.height ?? window.innerHeight;
      setLandscape(w > h * 1.3 && h < 560);
    };
    measure();
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, []);
  return landscape;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PokerGame() {
  const profile = useAuthStore(s => s.profile);
  const {
    table, compliance, chat, lastSettlement, closedReason, error,
    sit, sitOut, rebuy, leave, act, sendChat, clearError, dismissClosed,
    addBot, clearBots,
  } = usePokerStore();

  // Owner-only testing aids. The server enforces this; the flag only decides
  // whether the controls are worth drawing.
  const isOwner = profile?.moderatorLevel === 'owner';

  const [now, setNow] = useState(Date.now());
  const [raiseTo, setRaiseTo] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());

  const landscape = useLandscape();
  const feltRef = useRef<HTMLDivElement>(null);
  const [felt, setFelt] = useState({ w: 320, h: 380 });

  // Measure the felt rather than trusting viewport units: a phone's 100vh
  // includes a URL bar that is not on screen, which is how a table ends up with
  // its bottom row cut off.
  useEffect(() => {
    const el = feltRef.current;
    if (!el) return;
    const measure = () => setFelt({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.visualViewport?.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.visualViewport?.removeEventListener('resize', measure); };
  }, [table?.id, landscape]);

  // One ticker for every countdown on screen — and for the speaking ring, which
  // LiveKit exposes as a plain set rather than as an event stream.
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      const live = getLiveKitSpeaking();
      setSpeaking(prev => {
        if (prev.size === live.size && [...live].every(x => prev.has(x))) return prev;
        return new Set(live);
      });
    }, 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { if (!error) return; const id = setTimeout(clearError, 2600); return () => clearTimeout(id); }, [error, clearError]);

  const hand = table?.hand ?? null;
  const you = table?.seats.find(s => s.seat === table.yourSeat) ?? null;

  /*
   * Voice: one room per table, for as long as the table is open.
   *
   * `listenOnly` for watchers — a person who is not in the hand can hear it but
   * cannot talk into it. Note the room is NOT tied to a hand: conversation at a
   * table does not stop because a hand ended, and rejoining a LiveKit room
   * every thirty seconds would be both slow and unpleasant.
   */
  const { enabled: livekitEnabled } = useLiveKitGate();
  const voice = useLivekitRoomVoice({
    roomId: table ? `poker_${table.id}` : null,
    identity: profile?.id ?? null,
    active: livekitEnabled && !!table && table.status !== 'closed',
    listenOnly: table?.yourSeat === null || table?.yourSeat === undefined,
  });
  const youCan = table?.youCan ?? null;
  const isYourTurn = Boolean(youCan);

  // Reset the raise slider whenever the legal range moves under it, so the
  // number on screen is always one the server would accept.
  useEffect(() => {
    if (youCan?.canRaise) setRaiseTo(prev => {
      const clamped = Math.min(Math.max(prev, youCan.minRaiseTo), youCan.maxRaiseTo);
      return prev === 0 || prev < youCan.minRaiseTo || prev > youCan.maxRaiseTo ? youCan.minRaiseTo : clamped;
    });
  }, [youCan?.minRaiseTo, youCan?.maxRaiseTo, youCan?.canRaise, hand?.handId]);

  const secondsLeft = hand?.actingDeadline ? Math.max(0, (hand.actingDeadline - now) / 1000) : null;
  const clockFraction = secondsLeft !== null && table
    ? Math.max(0, Math.min(1, secondsLeft / table.config.actionSeconds))
    : 0;

  /** Seats in viewer-relative order, with empty chairs included. */
  const slots = useMemo(() => {
    if (!table) return [];
    const total = table.maxSeats;
    const mine = table.yourSeat ?? 0;
    return Array.from({ length: total }, (_, offset) => {
      const seatNo = (mine + offset) % total;
      return { seatNo, slot: offset, seat: table.seats.find(s => s.seat === seatNo) ?? null };
    });
  }, [table?.seats, table?.maxSeats, table?.yourSeat]);

  if (!table) return null;

  const doAct = (type: 'fold' | 'check' | 'call' | 'raise' | 'allIn', amount?: number) => {
    haptic('tap');
    void act(type, amount);
  };

  const body = (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex flex-col"
      style={{
        background: 'radial-gradient(120% 80% at 50% 0%, #101a2c 0%, #070b14 55%, #05070d 100%)',
        paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06] shrink-0">
        <button
          onClick={() => setConfirmLeave(true)}
          className="w-9 h-9 rounded-xl grid place-items-center text-white/60 hover:text-white transition-colors"
          style={{ background: 'rgba(255,255,255,0.05)' }}
          aria-label="გასვლა"
        >
          ✕
        </button>

        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-white text-sm truncate leading-tight">{table.name}</p>
          <p className="font-mono text-[10px] text-white/35 tracking-wider truncate whitespace-nowrap">
            {table.code} · {table.config.smallBlind}/{table.config.bigBlind}
            {hand ? ` · #${hand.handNo} · ${PHASE_LABEL[hand.phase] ?? hand.phase}` : ' · ლოდინი'}
          </p>
        </div>

        {livekitEnabled && (
          <button
            onClick={() => {
              haptic('tap');
              // Safari will not start remote audio until a gesture has touched
              // it, so the first tap on the mic doubles as that gesture.
              voice.unlockAudio();
              if (table.yourSeat !== null) voice.toggleMic();
              else setChatOpen(true);
            }}
            className="w-9 h-9 rounded-xl grid place-items-center transition-colors relative"
            style={{
              background: voice.micEnabled ? 'rgba(34,211,107,0.18)' : 'rgba(255,255,255,0.05)',
              color: voice.micEnabled ? '#22d36b' : 'rgba(255,255,255,0.6)',
            }}
            aria-label={voice.micEnabled ? 'მიკროფონის გამორთვა' : 'მიკროფონის ჩართვა'}
          >
            {voice.micEnabled ? '🎙' : '🔇'}
            {voice.status === 'connecting' && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ background: '#f5c542' }} />
            )}
          </button>
        )}

        <GameInviteButton game="poker" code={table.code} compact />

        <button
          onClick={() => setChatOpen(v => !v)}
          className="w-9 h-9 rounded-xl grid place-items-center text-white/60 hover:text-white transition-colors relative"
          style={{ background: chatOpen ? `${ACCENT}22` : 'rgba(255,255,255,0.05)' }}
          aria-label="ჩატი"
        >
          💬
          {chat.length > 0 && !chatOpen && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ background: ACCENT }} />
          )}
        </button>
      </div>

      {/*
        On its side the felt and the controls sit next to each other. Stacking
        them leaves the table about 150px tall, which is not a table — it is the
        board and six avatars fighting for the same pixels.
      */}
      <div className={`flex-1 min-h-0 flex ${landscape ? 'flex-row' : 'flex-col'}`}>

      {/* ── Felt ───────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 min-w-0 relative px-2" ref={feltRef}>
        {/* The table itself */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
            width: feltRadii(felt.w, felt.h, table.maxSeats).rx * 2,
            height: feltRadii(felt.w, felt.h, table.maxSeats).ry * 2,
            // A stadium rather than an ellipse: on a tall phone an ellipse of
            // these proportions reads as a big oval, not as a table.
            borderRadius: Math.min(
              feltRadii(felt.w, felt.h, table.maxSeats).rx,
              feltRadii(felt.w, felt.h, table.maxSeats).ry,
            ),
            background: 'radial-gradient(ellipse at 50% 35%, #16324a 0%, #0e2135 60%, #0a1626 100%)',
            border: '1px solid rgba(56,189,248,0.16)',
            boxShadow: 'inset 0 2px 30px rgba(0,0,0,0.6), 0 0 60px rgba(56,189,248,0.05)',
          }}
        />

        {/* Board + pot */}
        <div
          className="absolute flex flex-col items-center gap-2"
          style={{
            left: '50%', top: '50%',
            transform: 'translate(-50%,-50%)',
            width: feltRadii(felt.w, felt.h, table.maxSeats).rx * 1.7,
          }}
        >
          {hand && (
            <>
              <div className="flex gap-1 justify-center">
                {hand.board.map((card, i) => (
                  <PokerCard
                    key={`${card}-${i}`}
                    card={card}
                    // Five community cards have to fit between the side seats,
                    // so the board sizes itself off the felt rather than off a
                    // breakpoint someone picked for a phone they owned.
                    size={felt.w < 344 ? 'xs' : felt.h < 400 || felt.w < 360 ? 'sm' : 'md'}
                    animate
                    index={i}
                  />
                ))}
                {hand.board.length === 0 && (
                  <p className="font-mono text-[11px] text-white/25 tracking-widest py-6">— პრეფლოპი —</p>
                )}
              </div>

              <div
                className="px-3 py-1 rounded-full font-mono text-xs"
                style={{ background: 'rgba(0,0,0,0.42)', border: '1px solid rgba(56,189,248,0.22)', color: ACCENT }}
              >
                ბანკი {chips(hand.pot)}
              </div>

              <AnimatePresence>
                {lastSettlement && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="px-3 py-1.5 rounded-2xl text-center"
                    style={{
                      // Narrow on purpose: a wide banner in the middle of the
                      // felt sits on top of the hands that were just revealed,
                      // which is the one moment everybody wants to look at them.
                      maxWidth: 210,
                      background: 'rgba(6,12,22,0.94)',
                      border: '1px solid rgba(56,189,248,0.28)', backdropFilter: 'blur(8px)',
                    }}
                  >
                    {lastSettlement.payouts.map((payout, i) => {
                      const winner = table.seats.find(s => s.playerId === payout.playerId);
                      const shown = lastSettlement.showdown.find(s => s.playerId === payout.playerId);
                      return (
                        <p key={i} className="font-display text-sm text-white leading-snug">
                          <span style={{ color: ACCENT }}>{winner?.name ?? 'მოთამაშე'}</span>
                          {' +'}{chips(payout.amount)}
                          {shown && (
                            <span className="block text-white/45 font-mono text-[10px] mt-0.5 truncate">{shown.description}</span>
                          )}
                        </p>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          {!hand && (
            <div className="text-center">
              <p className="font-display text-white/70 text-sm">
                {table.seats.length < 2 ? 'ველოდებით მოთამაშეებს' : 'შემდეგი დარიგება იწყება…'}
              </p>
              <p className="font-mono text-[11px] text-white/30 mt-1">{table.seats.length}/{table.maxSeats}</p>
            </div>
          )}
        </div>

        {/* Seats */}
        {slots.map(({ seatNo, slot, seat }) => {
          const pos = seatPosition(slot, table.maxSeats, felt.w, felt.h);
          const tight = isTight(felt.h) && pos.endOn;
          return (
            <div
              key={seatNo}
              className="absolute"
              style={{ left: pos.left, top: pos.top, transform: 'translate(-50%,-50%)' }}
            >
              {seat
                ? <Seat
                    seat={seat}
                    isYou={seat.playerId === profile?.id}
                    compact={felt.w < 380 || isTight(felt.h)}
                    maxSeats={table.maxSeats}
                    tight={tight}
                    speaking={speaking.has(seat.playerId)}
                    clock={seat.isActing ? clockFraction : null}
                  />
                : <EmptyChair
                    size={seatMetrics(table.maxSeats, felt.w < 380 || isTight(felt.h)).avatar}
                    seatNo={seatNo}
                    canSit={table.yourSeat === null && table.status !== 'closed'}
                    buyIn={table.config.buyIn}
                    onSit={() => { haptic('tap'); void sit(seatNo); }}
                  />}
            </div>
          );
        })}

      </div>

      {/* ── Action bar ─────────────────────────────────────────────────── */}
      <div
        className={landscape
          ? 'shrink-0 w-[248px] px-3 py-2 border-l border-white/[0.06] flex flex-col justify-center gap-2 overflow-y-auto'
          : 'shrink-0 px-3 pb-2 pt-1 border-t border-white/[0.06]'}
      >
        {you?.cards && you.cards.length > 0 && (
          <div className="flex items-end justify-center gap-1.5 mb-2">
            {you.cards.map((card, i) => (
              <PokerCard
                key={card}
                card={card}
                size={landscape || felt.h < 400 ? 'md' : 'lg'}
                animate
                index={i}
                dimmed={you.folded}
              />
            ))}
            <div className="ml-2 text-left">
              <p className="font-mono text-[10px] text-white/35 uppercase tracking-widest">შენი ჩიპები</p>
              <p className="font-display font-bold text-white text-lg leading-tight">{chips(you.stack)}</p>
            </div>
          </div>
        )}

        {isYourTurn && youCan ? (
          <ActionControls
            youCan={youCan}
            raiseTo={raiseTo}
            setRaiseTo={setRaiseTo}
            bigBlind={table.config.bigBlind}
            pot={hand?.pot ?? 0}
            secondsLeft={secondsLeft}
            onAct={doAct}
          />
        ) : (
          <IdleControls
            table={table}
            you={you}
            onSit={() => {
              const free = Array.from({ length: table.maxSeats }, (_, i) => i)
                .find(i => !table.seats.some(s => s.seat === i));
              if (free !== undefined) void sit(free);
            }}
            onSitOut={out => void sitOut(out)}
            onRebuy={() => void rebuy()}
            onNotice={() => setNoticeOpen(true)}
            isOwner={isOwner}
            onAddBot={() => { haptic('tap'); void addBot(); }}
            onClearBots={() => { haptic('tap'); void clearBots(); }}
            hasBots={table.seats.some(s => s.playerId.startsWith('bot_'))}
          />
        )}
      </div>

      </div>

      {/* ── Chat ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="absolute inset-x-0 bottom-0 z-10 rounded-t-3xl flex flex-col"
            style={{
              maxHeight: '58%', background: 'rgba(8,13,24,0.97)',
              border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <p className="font-display font-bold text-white text-sm">ხმა და ჩატი</p>
              <button onClick={() => setChatOpen(false)} className="text-white/40 text-lg px-2">✕</button>
            </div>

            {livekitEnabled && (
              <div className="px-4 py-3 border-b border-white/[0.06] space-y-2">
                <LiveKitVoiceBarView voice={voice} />
                <div className="flex items-center gap-2">
                  <VoiceDisguiseButton compact />
                  {table.yourSeat === null && (
                    <span className="font-mono text-[10px] text-white/35">მხოლოდ მოსმენა — დაჯექი, რომ ილაპარაკო</span>
                  )}
                </div>
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5">
              {chat.length === 0 && <p className="font-mono text-[11px] text-white/25 py-6 text-center">ჯერ არაფერია</p>}
              {chat.map((message, i) => (
                <p key={i} className="text-[13px] text-white/80 leading-snug break-words">
                  <span style={{ color: ACCENT }} className="font-semibold">{message.name}</span>
                  <span className="text-white/30"> · </span>
                  {message.text}
                </p>
              ))}
            </div>
            <div className="flex gap-2 p-3 border-t border-white/[0.06]">
              <input
                value={chatDraft}
                onChange={e => setChatDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && chatDraft.trim()) { void sendChat(chatDraft); setChatDraft(''); }
                }}
                placeholder="დაწერე…"
                maxLength={200}
                className="flex-1 bg-white/[0.04] rounded-xl px-3 py-2.5 text-[14px] text-white placeholder-white/25 outline-none border border-white/10 focus:border-white/25 transition-colors"
              />
              <button
                onClick={() => { if (chatDraft.trim()) { void sendChat(chatDraft); setChatDraft(''); } }}
                disabled={!chatDraft.trim()}
                className="px-5 rounded-xl font-display font-bold text-sm text-black disabled:opacity-30 transition-opacity"
                style={{ background: ACCENT }}
              >
                გაგზავნა
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Overlays ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl font-mono text-xs z-20"
            style={{ top: 60, background: 'rgba(220,38,38,0.92)', color: '#fff' }}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {noticeOpen && compliance && (
        <Sheet onClose={() => setNoticeOpen(false)} title="სოციალური პოკერი">
          <p className="text-[13px] leading-relaxed text-white/75">{compliance.notice.noticeLong}</p>
          <div className="mt-4 space-y-1.5">
            {([
              ['ფულადი ღირებულება', compliance.facts.chipsHaveCashValue],
              ['შევსება', compliance.facts.depositEnabled],
              ['გატანა', compliance.facts.withdrawalEnabled],
              ['ჩიპების გადაცემა', compliance.facts.playerToPlayerTransferEnabled],
              ['გადაცვლა', compliance.facts.redemptionEnabled],
              ['ფულზე თამაში', compliance.facts.realMoneyWagering],
            ] as [string, boolean][]).map(([label, enabled]) => (
              <div key={label} className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-white/45">{label}</span>
                <span className="font-mono text-[11px]" style={{ color: enabled ? '#f87171' : '#4ade80' }}>
                  {enabled ? 'ჩართული' : 'გამორთული'}
                </span>
              </div>
            ))}
          </div>
        </Sheet>
      )}

      {closedReason && (
        <Sheet onClose={dismissClosed} title="მაგიდა დაიხურა">
          <p className="text-[13px] text-white/70">
            {closedReason === 'host_left' ? 'ჰოსტმა დატოვა მაგიდა.' : 'მაგიდა აღარ არის აქტიური.'}
          </p>
          <button
            onClick={dismissClosed}
            className="mt-4 w-full py-3 rounded-2xl font-display font-bold text-black"
            style={{ background: ACCENT }}
          >
            კარგი
          </button>
        </Sheet>
      )}

      {confirmLeave && (
        <Sheet onClose={() => setConfirmLeave(false)} title="დატოვებ მაგიდას?">
          <p className="text-[13px] text-white/60">
            {you ? 'მიმდინარე დარიგებაში პასი ჩაითვლება.' : 'შეგიძლია მოგვიანებით დაბრუნდე.'}
          </p>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setConfirmLeave(false)}
              className="flex-1 py-3 rounded-2xl font-display text-sm text-white/70 bg-white/[0.06]"
            >
              დარჩენა
            </button>
            <button
              onClick={() => { setConfirmLeave(false); void leave(); }}
              className="flex-1 py-3 rounded-2xl font-display font-bold text-sm text-white"
              style={{ background: 'rgba(220,38,38,0.85)' }}
            >
              გასვლა
            </button>
          </div>
        </Sheet>
      )}
    </motion.div>
  );

  return createPortal(body, document.body);
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

/**
 * The letter in an empty avatar.
 *
 * Not `.toUpperCase()`. Georgian has had an uppercase since Unicode 11
 * (Mtavruli, U+1C90 and up) and `'ლ'.toUpperCase()` duly returns 'Ლ' — a
 * codepoint almost no font ships, so the avatar renders as a tofu box while
 * every other Georgian string on the screen is fine. Uppercase only where
 * uppercasing means something.
 */
function initial(name: string): string {
  const first = [...name.trim()][0] ?? '?';
  return /[a-z]/i.test(first) ? first.toUpperCase() : first;
}

function Seat({ seat, isYou, compact, maxSeats, tight, speaking, clock }: {
  seat: PokerSeatView; isYou: boolean; compact: boolean; maxSeats: number;
  tight: boolean; speaking: boolean; clock: number | null;
}) {
  const size = seatMetrics(maxSeats, compact).avatar;
  const crowded = maxSeats > 9;
  const dim = seat.folded || seat.sittingOut;

  /*
   * Opponents' cards: a count, never a face. The server does not send them.
   *
   * At ten and twelve seats the pairs are dropped entirely. Twelve card blocks
   * round a 390px ring run off both edges of the screen, and they were only
   * ever saying "this player is still in the hand" — which the dimmed seat
   * already says. A hand that is actually revealed at showdown still shows.
   */
  const showBacks = seat.inHand && !isYou && !seat.folded && !crowded;
  const miniCards = (showBacks || (seat.cards && !isYou)) ? (
    <div className={tight ? 'flex -space-x-3 mr-1' : 'flex -space-x-3 mb-1'}>
      {Array.from({ length: seat.cards ? seat.cards.length : seat.cardCount }, (_, i) =>
        seat.cards
          ? <PokerCard key={i} card={seat.cards[i]} size="xs" />
          : <PokerCard key={i} faceDown size="xs" />)}
    </div>
  ) : null;

  const avatar = (
    <div className="relative">
        <div
          className="rounded-full grid place-items-center font-display font-bold text-white overflow-hidden"
          style={{
            width: size, height: size,
            background: 'linear-gradient(145deg,#1e293b,#0f172a)',
            border: seat.isActing ? `2px solid ${ACCENT}` : '1.5px solid rgba(255,255,255,0.10)',
            // Two rings can be true at once — it is your turn AND you are
            // talking — so speaking gets the outer glow and the turn keeps the
            // border. Sharing one channel would hide whichever lost.
            boxShadow: [
              seat.isActing ? `0 0 16px ${ACCENT}55` : '',
              speaking ? '0 0 0 3px rgba(34,211,107,0.85), 0 0 18px rgba(34,211,107,0.45)' : '',
            ].filter(Boolean).join(', ') || undefined,
            fontSize: size * 0.36,
          }}
        >
          {seat.avatarUrl
            ? <img src={seat.avatarUrl} alt="" className="w-full h-full object-cover" />
            : (seat.avatar || initial(seat.name))}
        </div>

        {/* Action clock, drawn as a ring so it reads without a number. */}
        {clock !== null && (
          <svg
            className="absolute inset-0 pointer-events-none -rotate-90"
            width={size} height={size} viewBox={`0 0 ${size} ${size}`}
          >
            <circle
              cx={size / 2} cy={size / 2} r={size / 2 - 1.5}
              fill="none" stroke={clock < 0.25 ? '#f87171' : ACCENT} strokeWidth={2.5}
              strokeDasharray={Math.PI * (size - 3)}
              strokeDashoffset={Math.PI * (size - 3) * (1 - clock)}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 240ms linear' }}
            />
          </svg>
        )}

        {seat.isButton && (
          <span
            className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full grid place-items-center font-mono font-bold text-[9px] text-black"
            style={{ background: '#e2e8f0' }}
          >
            D
          </span>
        )}
        {!seat.connected && (
          <span className="absolute -top-0.5 -left-0.5 w-3 h-3 rounded-full" style={{ background: '#f59e0b' }} />
        )}
    </div>
  );

  return (
    <div
      className="flex flex-col items-center"
      style={{ width: tight ? size + 62 : size + 34, opacity: dim ? 0.45 : 1 }}
    >
      {tight
        ? <div className="flex items-center">{miniCards}{avatar}</div>
        : <>{miniCards}{avatar}</>}

      <p
        className="font-display truncate max-w-full mt-0.5 leading-tight text-white/75"
        style={{ fontSize: crowded ? 9 : 10 }}
      >
        {isYou ? 'შენ' : seat.name}
      </p>
      <p
        className="font-mono leading-tight"
        style={{ fontSize: crowded ? 9 : 10, color: seat.allIn ? '#f59e0b' : 'rgba(255,255,255,0.4)' }}
      >
        {seat.allIn ? 'ALL IN' : chips(seat.stack)}
      </p>

      {seat.committedThisStreet > 0 && (
        <div
          className="mt-0.5 px-1.5 py-0.5 rounded-full font-mono text-[9px]"
          style={{ background: 'rgba(56,189,248,0.14)', color: ACCENT }}
        >
          {chips(seat.committedThisStreet)}
        </div>
      )}
      {seat.handRank && (
        <p
          className="font-mono text-[9px] text-white/50 mt-0.5 text-center leading-tight truncate w-full"
          title={seat.handRank}
        >
          {seat.handRank}
        </p>
      )}
    </div>
  );
}

function EmptyChair({ seatNo, size, canSit, buyIn, onSit }: {
  seatNo: number; size: number; canSit: boolean; buyIn: number; onSit: () => void;
}) {
  return (
    <button
      onClick={canSit ? onSit : undefined}
      disabled={!canSit}
      className="rounded-full grid place-items-center transition-all active:scale-95 disabled:cursor-default"
      style={{
        width: size, height: size,
        background: canSit ? 'rgba(56,189,248,0.08)' : 'rgba(255,255,255,0.02)',
        border: canSit ? `1.5px dashed ${ACCENT}66` : '1.5px dashed rgba(255,255,255,0.08)',
      }}
      aria-label={`ადგილი ${seatNo + 1}`}
    >
      <span className="font-mono text-[9px]" style={{ color: canSit ? ACCENT : 'rgba(255,255,255,0.2)' }}>
        {canSit ? `+${chips(buyIn)}` : '—'}
      </span>
    </button>
  );
}

function ActionControls({ youCan, raiseTo, setRaiseTo, bigBlind, pot, secondsLeft, onAct }: {
  youCan: NonNullable<PokerTableView['youCan']>;
  raiseTo: number;
  setRaiseTo: (n: number) => void;
  bigBlind: number;
  pot: number;
  secondsLeft: number | null;
  onAct: (type: 'fold' | 'check' | 'call' | 'raise' | 'allIn', amount?: number) => void;
}) {
  const canSlide = youCan.canRaise && youCan.maxRaiseTo > youCan.minRaiseTo;

  /** Pot-relative shortcuts, clamped to what the server would accept. */
  const preset = (fraction: number) => {
    const target = Math.round(youCan.minRaiseTo + pot * fraction);
    setRaiseTo(Math.min(Math.max(target, youCan.minRaiseTo), youCan.maxRaiseTo));
  };

  return (
    <div className="space-y-2">
      {youCan.canRaise && (
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {([['½', 0.5], ['¾', 0.75], ['ბანკი', 1]] as [string, number][]).map(([label, fraction]) => (
              <button
                key={label}
                onClick={() => preset(fraction)}
                disabled={!canSlide}
                className="px-2 py-1.5 rounded-lg font-mono text-[10px] disabled:opacity-30"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)' }}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={youCan.minRaiseTo}
            max={youCan.maxRaiseTo}
            step={Math.max(1, Math.round(bigBlind / 2))}
            value={raiseTo}
            disabled={!canSlide}
            onChange={e => setRaiseTo(Number(e.target.value))}
            className="flex-1 accent-sky-400 disabled:opacity-30"
          />
          <span className="font-mono text-xs w-14 text-right" style={{ color: ACCENT }}>{chips(raiseTo)}</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onAct('fold')}
          disabled={!youCan.canFold}
          className="flex-1 py-3.5 rounded-2xl font-display font-bold text-sm text-white/80 disabled:opacity-25 transition-all active:scale-[0.97]"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          {ACTION_LABEL.fold}
        </button>

        {youCan.canCheck ? (
          <button
            onClick={() => onAct('check')}
            className="flex-1 py-3.5 rounded-2xl font-display font-bold text-sm text-white transition-all active:scale-[0.97]"
            style={{ background: 'rgba(255,255,255,0.10)' }}
          >
            {ACTION_LABEL.check}
          </button>
        ) : (
          <button
            onClick={() => onAct('call')}
            disabled={!youCan.canCall}
            className="flex-1 py-3.5 rounded-2xl font-display font-bold text-sm text-white disabled:opacity-25 transition-all active:scale-[0.97]"
            style={{ background: 'rgba(255,255,255,0.10)' }}
          >
            {ACTION_LABEL.call} {chips(youCan.callAmount)}
          </button>
        )}

        {youCan.canRaise ? (
          <button
            onClick={() => onAct('raise', raiseTo)}
            className="flex-1 py-3.5 rounded-2xl font-display font-bold text-sm text-black transition-all active:scale-[0.97]"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, #6366f1)` }}
          >
            {ACTION_LABEL.raise} {chips(raiseTo)}
          </button>
        ) : (
          <button
            onClick={() => onAct('allIn')}
            disabled={!youCan.canAllIn}
            className="flex-1 py-3.5 rounded-2xl font-display font-bold text-sm text-black disabled:opacity-25 transition-all active:scale-[0.97]"
            style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}
          >
            {ACTION_LABEL.allIn}
          </button>
        )}
      </div>

      {secondsLeft !== null && (
        <div className="h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(0, Math.min(100, (secondsLeft / 25) * 100))}%`,
              background: secondsLeft < 6 ? '#f87171' : ACCENT,
              transition: 'width 240ms linear',
            }}
          />
        </div>
      )}
    </div>
  );
}

function IdleControls({
  table, you, onSit, onSitOut, onRebuy, onNotice, isOwner, onAddBot, onClearBots, hasBots,
}: {
  table: PokerTableView;
  you: PokerSeatView | null;
  onSit: () => void;
  onSitOut: (out: boolean) => void;
  onRebuy: () => void;
  onNotice: () => void;
  isOwner: boolean;
  onAddBot: () => void;
  onClearBots: () => void;
  hasBots: boolean;
}) {
  const tableFull = table.seats.length >= table.maxSeats;

  return (
    <>
    {/*
      Testing aids, owner only.
      A new game cannot be tested by one person, and "get five friends online"
      is not a test plan. Bots say what they are, and nothing they do counts.
    */}
    {isOwner && (
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={onAddBot}
          disabled={tableFull}
          className="flex-1 py-2 rounded-xl font-mono text-[11px] disabled:opacity-30"
          style={{ background: 'rgba(168,85,247,0.14)', border: '1px solid rgba(168,85,247,0.4)', color: '#c4a2ff' }}
        >
          🤖 ტესტ-ბოტის დამატება
        </button>
        {hasBots && (
          <button
            onClick={onClearBots}
            className="px-3 py-2 rounded-xl font-mono text-[11px]"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.55)' }}
          >
            გასუფთავება
          </button>
        )}
      </div>
    )}
    <div className="flex items-center gap-2">
      {!you && (
        <button
          onClick={onSit}
          disabled={tableFull}
          className="flex-1 py-3 rounded-2xl font-display font-bold text-sm text-black disabled:opacity-30"
          style={{ background: ACCENT }}
        >
          {tableFull ? 'მაგიდა სავსეა' : 'დაჯექი'}
        </button>
      )}

      {you && you.stack === 0 && (
        <button
          onClick={onRebuy}
          className="flex-1 py-3 rounded-2xl font-display font-bold text-sm text-black"
          style={{ background: ACCENT }}
        >
          ჩიპების აღდგენა
        </button>
      )}

      {you && you.stack > 0 && (
        <button
          onClick={() => onSitOut(!you.sittingOut)}
          className="flex-1 py-3 rounded-2xl font-display text-sm text-white/70"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          {you.sittingOut ? 'თამაშის გაგრძელება' : 'პაუზა'}
        </button>
      )}

      <button
        onClick={onNotice}
        className="px-4 py-3 rounded-2xl font-mono text-[10px] text-white/40"
        style={{ background: 'rgba(255,255,255,0.04)' }}
      >
        ინფო
      </button>
    </div>
    </>
  );
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }} />
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md rounded-t-3xl p-5"
        style={{
          background: 'rgba(10,15,26,0.98)', border: '1px solid rgba(255,255,255,0.08)',
          paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
        }}
      >
        <p className="font-display font-bold text-white text-base mb-3">{title}</p>
        {children}
      </motion.div>
    </div>
  );
}
