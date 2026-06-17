import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useT } from '@/store/langStore';
import { useLudoStore } from '@/store/ludoStore';
import { LudoBoard } from './LudoBoard';
import type { LudoColor } from '@/types/ludo';

export function LudoGame() {
  const t = useT();
  const {
    match, isLoading,
    leaveMatch, rollDice, movePiece, resign, rematch, sendChat,
  } = useLudoStore();

  const [chatInput, setChatInput] = useState('');
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [match?.chat]);

  // Track last rolled value for the dice animation
  useEffect(() => {
    if (match?.diceRoll != null) setLastRoll(match.diceRoll);
  }, [match?.diceRoll]);

  if (!match) return null;

  const myColor = match.myColor;
  const isPlayer = myColor === 'red' || myColor === 'blue';
  const isMyTurn = isPlayer && match.currentTurn === myColor;
  const isFinished = match.status === 'finished';
  const isWaiting = match.status === 'waiting';

  const canRoll  = isMyTurn && !match.diceRolled && !isFinished;
  const canMove  = isMyTurn && match.diceRolled && match.movablePieceIds.length > 0;

  const topPlayer    = myColor === 'blue' ? match.red   : (match.blue ?? null);
  const bottomPlayer = myColor === 'blue' ? match.blue! : match.red;
  const topColor: LudoColor    = myColor === 'blue' ? 'red'  : 'blue';
  const bottomColor: LudoColor = myColor === 'blue' ? 'blue' : 'red';

  function piecesFinished(color: LudoColor) {
    const side = color === 'red' ? match!.red : match!.blue;
    if (!side) return 0;
    return side.pieces.filter(p => p.pos === 57).length;
  }

  function piecesOnBoard(color: LudoColor) {
    const side = color === 'red' ? match!.red : match!.blue;
    if (!side) return 0;
    return side.pieces.filter(p => p.pos >= 0 && p.pos < 57).length;
  }

  const turnLabel = isFinished
    ? match.winnerColor
      ? `${match.winnerColor === 'red' ? match.red.name : (match.blue?.name ?? '?')} ${t.games.ludo.wins}`
      : t.games.ludo.draw
    : isWaiting
      ? t.games.ludo.waitingForOpponent
      : isMyTurn
        ? (match.diceRolled ? t.games.ludo.pickPiece : t.games.ludo.yourTurn)
        : t.games.ludo.opponentTurn;

  const turnColor = isFinished ? '#c084fc'
    : isMyTurn ? '#00f5ff'
    : 'rgba(255,255,255,0.4)';

  async function handleRoll() {
    if (!canRoll || isLoading) return;
    await rollDice();
  }

  async function handlePieceClick(color: LudoColor, pieceId: number) {
    if (!canMove) return;
    if (color !== myColor) return;
    await movePiece(pieceId);
  }

  async function handleSendChat() {
    const txt = chatInput.trim();
    if (!txt) return;
    setChatInput('');
    await sendChat(txt);
  }

  async function handleResign() {
    await resign();
    setShowResignConfirm(false);
  }

  const isWinner = isFinished && match.winnerColor === myColor;
  const isLoser  = isFinished && match.winnerColor && match.winnerColor !== myColor;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: '#03000d' }}
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: 'rgba(34,197,94,0.2)', background: 'rgba(10,6,28,0.95)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🎲</span>
          <div>
            <p className="font-display font-bold text-white text-sm leading-tight">{t.games.ludo.title}</p>
            <p className="font-mono text-[10px] text-white/35">{match.code}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isPlayer && !isFinished && (
            <button
              onClick={() => setShowResignConfirm(true)}
              className="px-2 py-1 rounded-lg font-mono text-[10px] text-white/40 border border-white/10 hover:text-red-400 hover:border-red-400/30 transition-colors"
            >
              {t.games.ludo.resign}
            </button>
          )}
          <button
            onClick={leaveMatch}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-white/40 hover:text-white/80 hover:bg-white/5 transition-colors"
          >✕</button>
        </div>
      </div>

      {/* ── Player banners ───────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex gap-2 px-3 py-2">
        <PlayerBadge
          name={topPlayer?.name ?? '—'}
          color={topColor}
          isActive={!isFinished && match.currentTurn === topColor}
          finished={piecesFinished(topColor)}
          onBoard={piecesOnBoard(topColor)}
          isYou={myColor === topColor}
          waiting={!topPlayer}
          t={t}
        />
        <PlayerBadge
          name={bottomPlayer.name}
          color={bottomColor}
          isActive={!isFinished && match.currentTurn === bottomColor}
          finished={piecesFinished(bottomColor)}
          onBoard={piecesOnBoard(bottomColor)}
          isYou={myColor === bottomColor}
          waiting={false}
          t={t}
        />
      </div>

      {/* ── Turn indicator ────────────────────────────────────────────── */}
      <div className="flex-shrink-0 text-center px-4 pb-1">
        <p className="font-mono text-xs font-bold" style={{ color: turnColor }}>{turnLabel}</p>
        {match.consecutiveSixes > 0 && !isFinished && (
          <p className="font-mono text-[9px] text-yellow-400/70">
            {match.consecutiveSixes === 2 ? t.games.ludo.twiceSix : ''}
          </p>
        )}
      </div>

      {/* ── Board ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-2 min-h-0 overflow-hidden">
        <LudoBoard match={match} onPieceClick={handlePieceClick} />
      </div>

      {/* ── Dice area ────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-center gap-4 px-4 py-2">
        {/* Dice display */}
        <DiceFace value={lastRoll} rolling={false} />

        {/* Roll button */}
        {canRoll && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleRoll}
            disabled={isLoading}
            className="px-6 py-2 rounded-xl font-mono text-sm font-bold uppercase tracking-wider transition-all disabled:opacity-40"
            style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#22c55e' }}
          >
            {t.games.ludo.rollDice}
          </motion.button>
        )}

        {/* Waiting for roll */}
        {!isMyTurn && !isFinished && !isWaiting && (
          <p className="font-mono text-xs text-white/30">{t.games.ludo.opponentRolling}</p>
        )}

        {/* Pick piece hint */}
        {canMove && (
          <p className="font-mono text-xs text-cyan-400 animate-pulse">{t.games.ludo.pickPiece}</p>
        )}
      </div>

      {/* ── Chat ─────────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 border-t"
        style={{ borderColor: 'rgba(34,197,94,0.12)', maxHeight: 160 }}
      >
        <div ref={chatRef} className="overflow-y-auto px-3 py-2 space-y-0.5" style={{ maxHeight: 110 }}>
          {match.chat.length === 0 && (
            <p className="font-mono text-[10px] text-white/20">{t.games.ludo.noMessages}</p>
          )}
          {match.chat.map(msg => (
            <div key={msg.id} className="flex gap-1.5 items-start">
              <span className="font-mono text-[10px] text-white/40 shrink-0">{msg.name}:</span>
              <span className="font-mono text-[10px] text-white/70 break-words">{msg.text}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2 px-3 pb-2">
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSendChat(); }}
            placeholder={t.games.ludo.chatPlaceholder}
            maxLength={300}
            className="flex-1 bg-transparent font-mono text-xs text-white placeholder-white/20 outline-none px-3 py-1.5 rounded-xl border border-white/10 focus:border-white/25 transition-colors"
          />
          <button
            onClick={handleSendChat}
            disabled={!chatInput.trim()}
            className="px-3 py-1.5 rounded-xl font-mono text-xs text-white/50 border border-white/10 hover:text-white/80 hover:border-white/25 transition-colors disabled:opacity-30"
          >↑</button>
        </div>
      </div>

      {/* ── Finished overlay ────────────────────────────────────────── */}
      <AnimatePresence>
        {isFinished && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center z-10"
            style={{ background: 'rgba(3,0,13,0.88)', backdropFilter: 'blur(4px)' }}
          >
            <div className="text-center px-8 space-y-4">
              <div className="text-5xl">
                {isWinner ? '🏆' : isLoser ? '💀' : '🎲'}
              </div>
              <p className="font-display font-bold text-2xl text-white">
                {match.winnerColor
                  ? (match.winnerColor === 'red' ? match.red.name : match.blue?.name ?? '?') + ' ' + t.games.ludo.wins
                  : t.games.ludo.draw}
              </p>
              {isPlayer && match.blue && (
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={rematch}
                    disabled={isLoading}
                    className="px-6 py-2 rounded-xl font-mono text-sm uppercase tracking-wider transition-all disabled:opacity-40"
                    style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#22c55e' }}
                  >
                    {t.games.ludo.rematch}
                  </button>
                  <button
                    onClick={leaveMatch}
                    className="px-6 py-2 rounded-xl font-mono text-sm uppercase tracking-wider"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)' }}
                  >
                    {t.games.ludo.backToGames}
                  </button>
                </div>
              )}
              {!isPlayer && (
                <button
                  onClick={leaveMatch}
                  className="px-6 py-2 rounded-xl font-mono text-sm uppercase tracking-wider"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)' }}
                >
                  {t.games.ludo.backToGames}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Resign confirm ───────────────────────────────────────────── */}
      <AnimatePresence>
        {showResignConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center z-20"
            style={{ background: 'rgba(3,0,13,0.85)' }}
          >
            <div
              className="mx-6 p-6 rounded-2xl space-y-4 text-center"
              style={{ background: 'rgba(10,6,28,0.98)', border: '1px solid rgba(255,45,85,0.3)' }}
            >
              <p className="font-mono text-sm text-white">{t.games.ludo.resignConfirm}</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={handleResign}
                  className="px-5 py-2 rounded-xl font-mono text-xs uppercase tracking-wider"
                  style={{ background: 'rgba(255,45,85,0.15)', border: '1px solid rgba(255,45,85,0.4)', color: '#ff2d55' }}
                >
                  {t.games.ludo.confirmResign}
                </button>
                <button
                  onClick={() => setShowResignConfirm(false)}
                  className="px-5 py-2 rounded-xl font-mono text-xs uppercase tracking-wider text-white/60 border border-white/15"
                >
                  {t.games.ludo.cancel}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function PlayerBadge({
  name, color, isActive, finished, onBoard, isYou, waiting, t,
}: {
  name: string; color: LudoColor; isActive: boolean;
  finished: number; onBoard: number; isYou: boolean; waiting: boolean; t: any;
}) {
  const isRed = color === 'red';
  const accent = isRed ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.3)';
  const accentBorder = isRed ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.4)';
  const accentText = isRed ? '#f87171' : '#60a5fa';

  return (
    <div
      className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl"
      style={{
        background: isActive ? accent : 'rgba(255,255,255,0.03)',
        border: `1px solid ${isActive ? accentBorder : 'rgba(255,255,255,0.07)'}`,
        transition: 'all 0.3s',
      }}
    >
      {/* Color dot */}
      <div
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ background: isRed ? '#ef4444' : '#3b82f6' }}
      />
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-white leading-tight truncate">
          {waiting ? <span className="text-white/30">{t.games.ludo.waiting}</span> : name}
          {isYou && <span className="ml-1 text-[9px] text-white/30">({t.games.ludo.you})</span>}
        </p>
        {!waiting && (
          <p className="font-mono text-[9px]" style={{ color: accentText }}>
            {finished}/4 {t.games.ludo.piecesHome} · {onBoard} {t.games.ludo.onBoard}
          </p>
        )}
      </div>
      {isActive && (
        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: accentText }} />
      )}
    </div>
  );
}

function DiceFace({ value }: { value: number | null; rolling: boolean }) {
  const dots: Record<number, [number, number][]> = {
    1: [[50, 50]],
    2: [[25, 25], [75, 75]],
    3: [[25, 25], [50, 50], [75, 75]],
    4: [[25, 25], [75, 25], [25, 75], [75, 75]],
    5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
    6: [[25, 20], [75, 20], [25, 50], [75, 50], [25, 80], [75, 80]],
  };

  const dotPositions = value ? dots[value] ?? [] : [];

  return (
    <div
      className="relative rounded-xl flex-shrink-0"
      style={{
        width: 48, height: 48,
        background: value ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.08)',
        border: `2px solid ${value ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.1)'}`,
        boxShadow: value ? '0 2px 12px rgba(255,255,255,0.15)' : 'none',
      }}
    >
      {dotPositions.map(([x, y], i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: 8, height: 8,
            background: '#1a1a2e',
            left: `calc(${x}% - 4px)`,
            top: `calc(${y}% - 4px)`,
          }}
        />
      ))}
      {!value && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-white/20 text-lg">?</span>
        </div>
      )}
    </div>
  );
}
