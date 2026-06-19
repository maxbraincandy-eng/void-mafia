import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUnoStore } from '@/store/unoStore';
import { useUnoVoice } from '@/hooks/useUnoVoice';
import { UnoCardComponent, UnoCardBack, ColorChip } from './UnoCard';
import type { UnoPublicState, UnoCard, GameColor, UnoPlayerPublic } from '@/types/uno';
import { haptic } from '@/lib/haptics';

const UNO_ACCENT = '#a855f7';

// ── Color choice modal ───────────────────────────────────────────────────────
const COLORS: { color: GameColor; bg: string; label: string }[] = [
  { color: 'red',    bg: 'linear-gradient(135deg,#ff1a3a,#cc0022)', label: 'წ' },
  { color: 'blue',   bg: 'linear-gradient(135deg,#0057ff,#0033cc)', label: 'ლ' },
  { color: 'green',  bg: 'linear-gradient(135deg,#00c951,#008b35)', label: 'მ' },
  { color: 'yellow', bg: 'linear-gradient(135deg,#ffcc00,#cc9900)', label: 'ყ' },
];

const GLOW: Record<GameColor, string> = {
  red: 'rgba(255,26,58,0.7)', blue: 'rgba(0,87,255,0.7)',
  green: 'rgba(0,201,81,0.7)', yellow: 'rgba(255,204,0,0.7)',
};

const COLOR_BG: Record<string, string> = {
  red: 'linear-gradient(135deg,#ff1a3a,#cc0022)',
  blue: 'linear-gradient(135deg,#0057ff,#0033cc)',
  green: 'linear-gradient(135deg,#00c951,#008b35)',
  yellow: 'linear-gradient(135deg,#ffcc00,#cc9900)',
};
const COLOR_NAMES: Record<GameColor, string> = {
  red: 'წ', blue: 'ლ', green: 'მ', yellow: 'ყ',
};

function ColorChoiceModal({ onChoose }: { onChoose: (c: GameColor) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(3,0,13,0.85)', backdropFilter: 'blur(6px)' }}
    >
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        className="mx-4 w-full max-w-xs rounded-2xl overflow-hidden"
        style={{ background: 'rgba(15,8,35,0.98)', border: '1px solid rgba(168,85,247,0.4)' }}
      >
        <div className="px-5 py-4 text-center border-b" style={{ borderColor: 'rgba(168,85,247,0.15)' }}>
          <div className="text-2xl mb-1">🌈</div>
          <p className="font-mono text-xs text-white/50 uppercase tracking-wider">ფერის არჩევა</p>
        </div>
        <div className="grid grid-cols-2 gap-3 p-5">
          {COLORS.map(({ color, bg, label }) => (
            <button
              key={color}
              onClick={() => onChoose(color)}
              className="py-5 rounded-2xl font-mono text-2xl font-bold transition-all active:scale-90"
              style={{
                background: bg,
                border: '2px solid rgba(255,255,255,0.2)',
                color: color === 'yellow' ? '#1a0a00' : '#fff',
                boxShadow: `0 4px 20px ${GLOW[color]}`,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Direction indicator ──────────────────────────────────────────────────────
function DirectionArrow({ direction }: { direction: 1 | -1 }) {
  return (
    <motion.div
      animate={{ rotate: direction === 1 ? 0 : 180 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <span style={{ fontSize: 16, color: UNO_ACCENT }}>↻</span>
    </motion.div>
  );
}

// ── Player badge ─────────────────────────────────────────────────────────────
function PlayerBadge({
  player, isCurrent, isMe, speakingSocketIds,
}: {
  player: UnoPlayerPublic;
  isCurrent: boolean;
  isMe: boolean;
  speakingSocketIds: string[];
}) {
  const isSpeaking = speakingSocketIds.includes(player.socketId);

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
      style={{
        background: isCurrent ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.03)',
        border: isCurrent
          ? '1px solid rgba(168,85,247,0.5)'
          : isSpeaking
            ? '1px solid rgba(34,197,94,0.4)'
            : '1px solid rgba(255,255,255,0.06)',
        boxShadow: isCurrent ? `0 0 12px rgba(168,85,247,0.3)` : 'none',
      }}
    >
      {/* Avatar circle */}
      <div
        style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: isCurrent
            ? 'linear-gradient(135deg,rgba(168,85,247,0.5),rgba(0,245,255,0.3))'
            : 'rgba(255,255,255,0.08)',
          border: isSpeaking
            ? '2px solid #22c55e'
            : isCurrent
              ? '2px solid rgba(168,85,247,0.7)'
              : '1px solid rgba(255,255,255,0.1)',
          boxShadow: isSpeaking ? '0 0 10px rgba(34,197,94,0.5)' : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}
      >
        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 11, color: '#fff' }}>
          {player.nickname.charAt(0).toUpperCase()}
        </span>
        {isSpeaking && (
          <span style={{
            position: 'absolute', bottom: -2, right: -2,
            width: 8, height: 8, borderRadius: '50%',
            background: '#22c55e', boxShadow: '0 0 6px rgba(34,197,94,0.8)',
          }} />
        )}
      </div>

      {/* Name + card count */}
      <div className="flex-1 min-w-0">
        <p className="font-mono text-[11px] text-white truncate">
          {player.nickname}{isMe ? ' ✦' : ''}{isCurrent ? ' ▶' : ''}
        </p>
        {player.calledUno && player.cardCount === 1 && (
          <p className="font-mono text-[12px]" style={{ color: '#ff2d55' }}>UNO!</p>
        )}
      </div>

      {/* Card count */}
      <div
        className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
        style={{
          background: isCurrent ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${isCurrent ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.1)'}`,
        }}
      >
        <span className="font-mono text-xs font-bold" style={{ color: isCurrent ? UNO_ACCENT : 'rgba(255,255,255,0.5)' }}>
          {player.cardCount}
        </span>
      </div>

      {/* Connected dot */}
      <span style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        background: player.connected ? '#22c55e' : 'rgba(255,255,255,0.2)',
      }} />
    </div>
  );
}

// ── Discard pile display ─────────────────────────────────────────────────────
function DiscardPile({ topCard, currentColor }: { topCard: UnoCard | null; currentColor: string | null }) {
  if (!topCard) return (
    <div style={{
      width: 60, height: 84, borderRadius: 10,
      border: '2px dashed rgba(168,85,247,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ fontSize: 20, opacity: 0.3 }}>?</span>
    </div>
  );

  const displayColor = (topCard.type === 'wild' || topCard.type === 'wild4') ? (currentColor ?? topCard.color) : topCard.color;

  return (
    <motion.div
      key={topCard.id}
      initial={{ scale: 0.6, rotate: -15, opacity: 0 }}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
    >
      <UnoCardComponent card={{ ...topCard, color: displayColor as any }} size="md" />
    </motion.div>
  );
}

// ── Draw pile ────────────────────────────────────────────────────────────────
function DrawPile({ count, canDraw, pendingDraw, onDraw }: {
  count: number; canDraw: boolean; pendingDraw: number; onDraw: () => void;
}) {
  return (
    <motion.button
      onClick={canDraw ? onDraw : undefined}
      disabled={!canDraw}
      whileTap={canDraw ? { scale: 0.93 } : undefined}
      style={{
        cursor: canDraw ? 'pointer' : 'default',
        position: 'relative', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 4,
      }}
    >
      <div style={{ position: 'relative' }}>
        {/* Stacked cards effect */}
        {[6, 4, 2].map((offset, i) => (
          <div key={i} style={{
            position: 'absolute',
            top: -offset / 2, left: -offset / 2,
            width: 60, height: 84, borderRadius: 10,
            background: 'linear-gradient(135deg,#1a0540,#0a0220)',
            border: '2px solid rgba(168,85,247,0.25)',
            zIndex: i,
          }} />
        ))}
        <div style={{
          position: 'relative', zIndex: 4,
          width: 60, height: 84, borderRadius: 10,
          background: 'linear-gradient(135deg,#2d0b6b,#1a0540)',
          border: `2px solid ${canDraw ? 'rgba(168,85,247,0.8)' : 'rgba(168,85,247,0.3)'}`,
          boxShadow: canDraw ? `0 0 20px rgba(168,85,247,0.5)` : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{
            fontFamily: 'monospace', fontWeight: 900, fontSize: 22,
            color: UNO_ACCENT, textShadow: '0 0 12px rgba(168,85,247,0.8)',
          }}>U</span>
        </div>
      </div>
      {pendingDraw > 0 ? (
        <span className="font-mono text-xs font-bold" style={{ color: '#ff2d55' }}>+{pendingDraw}</span>
      ) : (
        <span className="font-mono text-[12px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{count}</span>
      )}
    </motion.button>
  );
}

// ── Waiting screen ────────────────────────────────────────────────────────────
function WaitingScreen({
  match, isHost, onStart,
}: {
  match: UnoPublicState; isHost: boolean; onStart: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard?.writeText(match.code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col items-center gap-5 pt-4 px-4">
      <div
        className="w-full rounded-2xl text-center py-6"
        style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)' }}
      >
        <p className="font-mono text-[12px] text-white/35 mb-1 uppercase tracking-wide">მოიწვიე მეგობრები</p>
        <p className="font-display font-bold text-4xl tracking-normal" style={{ color: UNO_ACCENT }}>
          {match.code}
        </p>
        <button
          onClick={copy}
          className="mt-3 px-4 py-1.5 rounded-xl font-mono text-xs transition-all active:scale-95"
          style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', color: '#c084fc' }}
        >
          {copied ? '✓ დაკოპირდა' : '⎘ კოდის კოპირება'}
        </button>
      </div>

      <div className="w-full space-y-2">
        {match.players.map((p) => (
          <div
            key={p.userId}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center font-mono text-xs font-bold"
              style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', color: UNO_ACCENT }}
            >
              {p.nickname.charAt(0).toUpperCase()}
            </div>
            <span className="font-mono text-xs text-white flex-1">{p.nickname}</span>
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: p.connected ? '#22c55e' : 'rgba(255,255,255,0.2)' }}
            />
          </div>
        ))}
        {match.players.length < match.settings.maxPlayers && (
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.08)' }}
          >
            <span className="font-mono text-[12px] text-white/20">{match.settings.maxPlayers - match.players.length} ადგილი თავისუფალია</span>
          </div>
        )}
      </div>

      <div className="text-center font-mono text-[12px] text-white/25">
        {match.players.length}/{match.settings.maxPlayers} მოთამაშე
      </div>

      {isHost ? (
        <button
          onClick={onStart}
          disabled={match.players.length < 2}
          className="w-full py-4 rounded-2xl font-display font-bold text-[15px] transition-all active:scale-95 disabled:opacity-40"
          style={{ background: 'rgba(168,85,247,0.18)', border: `1px solid ${UNO_ACCENT}45`, color: UNO_ACCENT }}
        >
          თამაშის დაწყება ▶
        </button>
      ) : (
        <div className="text-center font-mono text-xs text-white/30 py-2">
          ჰოსტი დაიწყებს თამაშს
        </div>
      )}
    </div>
  );
}

// ── Win screen ────────────────────────────────────────────────────────────────
function WinScreen({
  match, myUserId, isHost, onRematch, onLeave,
}: {
  match: UnoPublicState; myUserId: string; isHost: boolean;
  onRematch: () => void; onLeave: () => void;
}) {
  const winner = match.players.find(p => p.userId === match.winnerId);
  const isWinner = match.winnerId === myUserId;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center gap-5 pt-6 px-4 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 250, damping: 18, delay: 0.1 }}
        style={{
          width: 88, height: 88, borderRadius: '50%',
          background: isWinner
            ? 'linear-gradient(135deg,rgba(168,85,247,0.4),rgba(0,245,255,0.2))'
            : 'rgba(255,255,255,0.05)',
          border: `3px solid ${isWinner ? UNO_ACCENT : 'rgba(255,255,255,0.2)'}`,
          boxShadow: isWinner ? `0 0 40px rgba(168,85,247,0.5)` : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 44,
        }}
      >
        {isWinner ? '🏆' : '🃏'}
      </motion.div>

      <div>
        <p className="font-mono text-[12px] uppercase tracking-widest text-white/30 mb-2">
          {isWinner ? '🎉 გაიმარჯვე!' : 'გამარჯვებული'}
        </p>
        <p className="font-display font-bold text-3xl" style={{ color: isWinner ? UNO_ACCENT : '#fff' }}>
          {winner?.nickname ?? '?'}
        </p>
        <p className="font-mono text-xs text-white/30 mt-1">
          {isWinner ? 'შესანიშნავია!' : `${winner?.nickname ?? '?'} გაიმარჯვა`}
        </p>
      </div>

      {/* Final card counts */}
      <div className="w-full space-y-2">
        {[...match.players].sort((a, b) => a.cardCount - b.cardCount).map(p => (
          <div
            key={p.userId}
            className="flex items-center gap-3 px-3 py-2 rounded-xl"
            style={{ background: p.userId === match.winnerId ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${p.userId === match.winnerId ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.07)'}` }}
          >
            <span className="font-mono text-sm">{p.userId === match.winnerId ? '🥇' : '🃏'}</span>
            <span className="font-mono text-xs text-white flex-1 text-left">{p.nickname}</span>
            <span className="font-mono text-xs" style={{ color: p.userId === match.winnerId ? '#22c55e' : 'rgba(255,255,255,0.4)' }}>
              {p.userId === match.winnerId ? '0 კარტი' : `${p.cardCount} კარტი`}
            </span>
          </div>
        ))}
      </div>

      <div className="flex gap-3 w-full">
        {isHost && (
          <button
            onClick={onRematch}
            className="flex-1 py-3 rounded-2xl font-display font-bold text-sm transition-all active:scale-95"
            style={{ background: 'rgba(168,85,247,0.18)', border: `1px solid ${UNO_ACCENT}45`, color: UNO_ACCENT }}
          >
            თავიდან ▶
          </button>
        )}
        <button
          onClick={onLeave}
          className="flex-1 py-3 rounded-2xl font-mono text-sm transition-all active:scale-95"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)' }}
        >
          ← თამაშები
        </button>
      </div>
    </motion.div>
  );
}

// ── Chat panel ────────────────────────────────────────────────────────────────
function ChatPanel({
  match, myUserId, myNickname, onClose, onSend,
}: {
  match: UnoPublicState; myUserId: string; myNickname: string;
  onClose: () => void; onSend: (t: string) => void;
}) {
  const [text, setText] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [match.chat]);

  function send() {
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
  }

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="absolute bottom-0 left-0 right-0 flex flex-col rounded-t-2xl"
      style={{ background: 'rgba(8,4,20,0.97)', border: '1px solid rgba(168,85,247,0.2)', maxHeight: '55vh', zIndex: 30 }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(168,85,247,0.1)' }}>
        <span className="font-mono text-xs text-white/50">ჩათი</span>
        <button onClick={onClose} className="text-white/40 text-sm">✕</button>
      </div>
      <div ref={chatRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-1" style={{ maxHeight: '30vh' }}>
        {match.chat.length === 0 ? (
          <p className="font-mono text-xs text-white/20 text-center py-4">ჩათი ცარიელია</p>
        ) : match.chat.map((msg, i) => (
          <div key={i} className="flex gap-2 text-xs font-mono">
            <span style={{ color: UNO_ACCENT }}>{msg.nickname}:</span>
            <span className="text-white/70 flex-1 break-words">{msg.text}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2 px-4 py-3 border-t" style={{ borderColor: 'rgba(168,85,247,0.1)' }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send(); }}
          placeholder="დაწერე შეტყობინება…"
          className="flex-1 bg-transparent text-xs text-white font-mono outline-none placeholder-white/20 px-3 py-2 rounded-xl border border-white/10 focus:border-white/25"
        />
        <button
          onClick={send}
          className="px-3 py-2 rounded-xl text-xs font-mono transition-all active:scale-95"
          style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', color: UNO_ACCENT }}
        >→</button>
      </div>
    </motion.div>
  );
}

// ── Main UnoGame component ───────────────────────────────────────────────────
export function UnoGame() {
  const {
    match, leaveMatch, startMatch, playCard: storePlayCard,
    drawCard: storeDrawCard, callUno: storeCallUno, rematch: storeRematch,
    sendChat, error, clearError,
  } = useUnoStore();

  const voice = useUnoVoice();
  const [chatOpen, setChatOpen] = useState(false);
  const [pendingWildCard, setPendingWildCard] = useState<UnoCard | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  // Auto-join voice when match is entered
  useEffect(() => {
    if (!match) return;
    const isPlayer = match.players.some(p => p.userId === match.myUserId);
    if (isPlayer) voice.joinVoice(match.id);
    else voice.joinListen(match.id);
    return () => { voice.leave(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.id]);

  // Leave voice when finished
  useEffect(() => {
    if (match?.status === 'finished') voice.leave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.status]);

  const myUserId = match?.myUserId ?? '';
  const myNickname = match?.players.find(p => p.userId === myUserId)?.nickname ?? 'Player';
  const isHost = match?.hostId === myUserId;
  const isMyTurn = match?.currentPlayerId === myUserId;
  const myCardCount = match?.myHand.length ?? 0;
  const hasCalledUno = match?.players.find(p => p.userId === myUserId)?.calledUno ?? false;

  const handleCardClick = useCallback((card: UnoCard) => {
    if (!isMyTurn || !match) return;

    if (selectedCardId === card.id) {
      // Second tap on same card — try to play it
      if (card.type === 'wild' || card.type === 'wild4') {
        haptic('tap');
        setPendingWildCard(card);
        setSelectedCardId(null);
      } else {
        haptic('success');
        storePlayCard(card.id);
        setSelectedCardId(null);
      }
    } else {
      haptic('selection');
      setSelectedCardId(card.id);
    }
  }, [isMyTurn, match, selectedCardId, storePlayCard]);

  const handleColorChoice = useCallback((color: GameColor) => {
    if (!pendingWildCard) return;
    haptic('success');
    storePlayCard(pendingWildCard.id, color);
    setPendingWildCard(null);
    setSelectedCardId(null);
  }, [pendingWildCard, storePlayCard]);

  const handleDraw = useCallback(() => {
    if (!isMyTurn) return;
    haptic('tap');
    storeDrawCard();
    setSelectedCardId(null);
  }, [isMyTurn, storeDrawCard]);

  const handleCallUno = useCallback(() => {
    storeCallUno();
  }, [storeCallUno]);

  if (!match) return null;

  const currentPlayerInfo = match.players.find(p => p.userId === match.currentPlayerId);
  const isActive = match.status === 'active';
  const isWaiting = match.status === 'waiting';
  const isFinished = match.status === 'finished';

  // Determine which cards are playable
  const top = match.topDiscard;
  const cc = match.currentColor;
  const playableSet = new Set<string>();

  if (isMyTurn && isActive && top) {
    for (const card of match.myHand) {
      // Wild always playable (unless pending draw and stacking disabled)
      if (card.type === 'wild' || card.type === 'wild4') {
        if (match.pendingDrawCount > 0) {
          if (match.settings.stackingEnabled && card.type === 'wild4') playableSet.add(card.id);
        } else {
          playableSet.add(card.id);
        }
        continue;
      }
      if (match.pendingDrawCount > 0 && match.settings.stackingEnabled) {
        // Can only stack draw2 on draw2 (wild4 stacking is handled above)
        if (top.type === 'draw2' && card.type === 'draw2') playableSet.add(card.id);
        continue;
      }
      if (match.pendingDrawCount > 0 && !match.settings.stackingEnabled) continue;

      // Normal: match color or match type/value
      if (card.color === cc) { playableSet.add(card.id); continue; }
      if (card.type === top.type && card.type !== 'number') { playableSet.add(card.id); continue; }
      if (card.type === 'number' && top.type === 'number' && card.value === top.value) playableSet.add(card.id);
    }
  }

  const showUnoButton = isMyTurn && isActive && myCardCount === 1 && !hasCalledUno;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{ background: '#03000d' }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center gap-3 px-4 border-b flex-shrink-0"
        style={{ borderColor: 'rgba(168,85,247,0.15)', background: 'rgba(168,85,247,0.05)', paddingTop: 'max(12px, env(safe-area-inset-top, 0px))', paddingBottom: 12 }}
      >
        <button
          onClick={() => leaveMatch()}
          className="w-11 h-11 flex items-center justify-center rounded-lg transition-all active:scale-90 flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
        >←</button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base">🃏</span>
            <span className="font-display font-bold text-sm" style={{ color: UNO_ACCENT }}>UNO</span>
            {isActive && (
              <>
                <DirectionArrow direction={match.direction} />
                {match.currentColor && <ColorChip color={match.currentColor} />}
                {match.pendingDrawCount > 0 && (
                  <span className="font-mono text-xs font-bold" style={{ color: '#ff2d55' }}>
                    სტეკი: +{match.pendingDrawCount}
                  </span>
                )}
              </>
            )}
          </div>
          <p className="font-mono text-[12px] text-white/30 mt-0.5">
            {isWaiting ? `კოდი: ${match.code}` :
             isActive ? (isMyTurn ? '▶ შენი სვლაა' : `${currentPlayerInfo?.nickname ?? '?'}-ს სვლა`) :
             isFinished ? 'თამაში დასრულდა' : match.code}
          </p>
        </div>

        {/* Voice status + PTT */}
        {voice.joined && (
          <button
            onPointerDown={() => voice.startTalk(match.id)}
            onPointerUp={() => voice.stopTalk(match.id)}
            onPointerLeave={() => voice.stopTalk(match.id)}
            className="w-11 h-11 flex items-center justify-center rounded-lg transition-all select-none"
            style={{
              background: voice.isTalking ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.05)',
              border: voice.isTalking ? '1px solid rgba(34,197,94,0.6)' : '1px solid rgba(255,255,255,0.1)',
              color: voice.isTalking ? '#22c55e' : 'rgba(255,255,255,0.4)',
              touchAction: 'none',
            }}
            title="Hold to Talk"
          >🎤</button>
        )}

        <button
          onClick={() => setChatOpen(o => !o)}
          className="relative w-11 h-11 flex items-center justify-center rounded-lg transition-all active:scale-90"
          style={{
            background: 'rgba(168,85,247,0.1)',
            border: `1px solid ${chatOpen ? UNO_ACCENT + '50' : 'rgba(168,85,247,0.25)'}`,
            color: chatOpen ? UNO_ACCENT : 'rgba(255,255,255,0.4)',
          }}
        >
          💬
          {match.chat.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-purple-500" />
          )}
        </button>
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            onClick={clearError}
            className="mx-4 mt-2 px-3 py-2 rounded-xl text-xs font-mono cursor-pointer flex-shrink-0"
            style={{ background: 'rgba(255,45,85,0.1)', border: '1px solid rgba(255,45,85,0.3)', color: '#ff2d55' }}
          >
            {error} ✕
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main content ── */}
      <div className="flex-1 overflow-hidden flex flex-col relative min-h-0">
        {/* ── Waiting ── */}
        {isWaiting && (
          <div className="flex-1 overflow-y-auto">
            <WaitingScreen match={match} isHost={isHost} onStart={startMatch} />
          </div>
        )}

        {/* ── Active game ── */}
        {isActive && (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {/* Player list — scrollable row */}
            <div className="flex-shrink-0 px-3 pt-2 pb-1 overflow-x-auto">
              <div className="flex gap-2 min-w-max">
                {match.players.map(p => (
                  <div key={p.userId} style={{ minWidth: 140, maxWidth: 170 }}>
                    <PlayerBadge
                      player={p}
                      isCurrent={p.userId === match.currentPlayerId}
                      isMe={p.userId === myUserId}
                      speakingSocketIds={voice.speakingSocketIds}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Turn status */}
            <AnimatePresence>
              {isMyTurn && (
                <motion.div
                  key="my-turn"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mx-3 mb-1 py-1.5 rounded-xl text-center font-mono text-xs font-bold"
                  style={{
                    background: 'rgba(168,85,247,0.12)',
                    border: '1px solid rgba(168,85,247,0.3)',
                    color: UNO_ACCENT,
                  }}
                >
                  {match.pendingDrawCount > 0
                    ? `სტეკი: +${match.pendingDrawCount} — სტეკი ან კარტის აღება`
                    : '▶ შენი სვლაა — დადე ან აიღე კარტი'}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Table area — discard + draw */}
            <div className="flex-shrink-0 flex items-center justify-center gap-8 py-3 px-4">
              <DiscardPile topCard={match.topDiscard} currentColor={match.currentColor} />

              <DrawPile
                count={match.deckSize}
                canDraw={isMyTurn}
                pendingDraw={match.pendingDrawCount}
                onDraw={handleDraw}
              />
            </div>

            {/* Spectator count */}
            {match.spectatorCount > 0 && (
              <p className="text-center font-mono text-[12px] text-white/20 pb-1">
                👁 {match.spectatorCount} მაყურებელი
              </p>
            )}

            {/* My hand */}
            <div className="flex-1 flex flex-col justify-end pb-4 min-h-0">
              {/* UNO button — big and pulsing */}
              <AnimatePresence>
                {showUnoButton && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: [1, 1.05, 1], opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ repeat: Infinity, duration: 0.8 }}
                    className="flex justify-center mb-3"
                  >
                    <button
                      onClick={handleCallUno}
                      className="px-8 py-3 rounded-2xl font-display font-black text-2xl tracking-widest transition-all active:scale-95"
                      style={{
                        background: 'linear-gradient(135deg,#ff1a3a,#ff7700)',
                        border: '3px solid rgba(255,255,255,0.3)',
                        color: '#fff',
                        boxShadow: '0 0 30px rgba(255,26,58,0.7), 0 4px 20px rgba(0,0,0,0.4)',
                        textShadow: '0 0 15px rgba(255,255,255,0.5)',
                      }}
                    >
                      UNO!
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Hand label */}
              <div className="flex items-center justify-between px-4 mb-2">
                <p className="font-mono text-[12px] text-white/30 uppercase tracking-wide">
                  ჩემი კარტები ({myCardCount})
                </p>
                {isMyTurn && selectedCardId && (
                  <p className="font-mono text-[12px]" style={{ color: UNO_ACCENT }}>
                    ↑ კვლავ დააჭირე სათამაშოდ
                  </p>
                )}
              </div>

              {/* Hand scroll */}
              <div className="overflow-x-auto pb-2 px-3" style={{ scrollbarWidth: 'none' }}>
                <div className="flex gap-2 min-w-max">
                  {match.myHand.length === 0 ? (
                    <p className="font-mono text-xs text-white/20 px-2">კარტები არ გაქვს</p>
                  ) : (
                    match.myHand.map(card => (
                      <UnoCardComponent
                        key={card.id}
                        card={card}
                        size="md"
                        selected={selectedCardId === card.id}
                        playable={playableSet.has(card.id)}
                        onClick={isMyTurn ? () => handleCardClick(card) : undefined}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Finished ── */}
        {isFinished && (
          <div className="flex-1 overflow-y-auto">
            <WinScreen
              match={match}
              myUserId={myUserId}
              isHost={isHost}
              onRematch={storeRematch}
              onLeave={leaveMatch}
            />
          </div>
        )}

        {/* ── Color choice modal ── */}
        <AnimatePresence>
          {pendingWildCard && (
            <ColorChoiceModal onChoose={handleColorChoice} />
          )}
        </AnimatePresence>

        {/* ── Chat panel ── */}
        <AnimatePresence>
          {chatOpen && (
            <ChatPanel
              match={match}
              myUserId={myUserId}
              myNickname={myNickname}
              onClose={() => setChatOpen(false)}
              onSend={t => sendChat(t, myNickname)}
            />
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
