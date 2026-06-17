import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useT } from '@/store/langStore';
import { useCheckersStore } from '@/store/checkersStore';
import { CheckersBoard } from './CheckersBoard';

export function CheckersGame() {
  const t = useT();
  const {
    match, selectedCell, isLoading,
    makeMove, resign, rematch, leaveMatch, sendChat, selectCell,
  } = useCheckersStore();

  const [chatInput, setChatInput] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [match?.chat]);

  if (!match) return null;

  const myColor = match.myColor;
  const isPlayer = myColor === 'red' || myColor === 'black';
  const isMyTurn = isPlayer && match.currentTurn === myColor;
  const isFinished = match.status === 'finished';

  const myCaptures = myColor === 'red' ? match.capturedByRed : myColor === 'black' ? match.capturedByBlack : 0;
  const theirCaptures = myColor === 'red' ? match.capturedByBlack : myColor === 'black' ? match.capturedByRed : 0;

  const turnLabel = isFinished
    ? match.winnerColor
      ? `${match.winnerColor === 'red' ? match.red.name : (match.black?.name ?? '?')} ${t.games.checkers.wins}`
      : t.games.checkers.draw
    : isMyTurn
      ? t.games.checkers.yourTurn
      : t.games.checkers.opponentTurn;

  const turnColor = isFinished ? '#c084fc' : isMyTurn ? '#00f5ff' : 'rgba(255,255,255,0.4)';

  async function handleSendChat() {
    const txt = chatInput.trim();
    if (!txt) return;
    setChatInput('');
    await sendChat(txt);
  }

  // From each player's perspective: "me" on the left, "opponent" on the right.
  // Spectators see red on the left and black on the right.
  const leftPlayer  = myColor === 'black' ? match.black : match.red;
  const rightPlayer = myColor === 'black' ? match.red   : (match.black ?? null);
  const leftColor   = myColor === 'black' ? 'black' : 'red';
  const rightColor  = myColor === 'black' ? 'red'   : 'black';
  const leftCap     = myColor === 'black' ? myCaptures   : (isPlayer ? myCaptures   : match.capturedByRed);
  const rightCap    = myColor === 'black' ? theirCaptures : (isPlayer ? theirCaptures : match.capturedByBlack);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: '#03000d' }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'rgba(155,0,255,0.2)', background: 'rgba(10,6,28,0.95)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg">♟</span>
          <div className="min-w-0">
            <p className="font-display font-bold text-white text-sm leading-tight">{t.games.checkers.title}</p>
            <p className="font-mono text-[10px] text-white/35">{match.code}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {match.status === 'waiting' && (
            <div className="font-mono text-[10px] text-white/40 px-2 py-1 rounded border border-white/10">
              {t.games.checkers.waitingForOpponent}
            </div>
          )}
          {isPlayer && match.status === 'active' && (
            <button
              onClick={resign}
              className="font-mono text-[10px] text-red-400/70 hover:text-red-400 px-2 py-1 rounded border border-red-500/20 hover:border-red-500/40 transition-colors"
            >
              {t.games.checkers.resign}
            </button>
          )}
          <button
            onClick={leaveMatch}
            className="font-mono text-[10px] text-white/35 hover:text-white/70 px-2 py-1 rounded border border-white/10 hover:border-white/25 transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden flex flex-col relative">
        {/* Player info bar — always shows "me" on left, opponent on right */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 gap-2">
          <PlayerBadge
            name={leftPlayer?.name ?? '?'}
            color={leftColor}
            active={match.currentTurn === leftColor && match.status === 'active'}
            captures={leftCap}
            isMe={isPlayer}
          />
          <div className="text-center flex-shrink-0">
            <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: turnColor }}>
              {turnLabel}
            </p>
          </div>
          <PlayerBadge
            name={rightPlayer?.name ?? '?'}
            color={rightColor}
            active={match.currentTurn === rightColor && match.status === 'active'}
            captures={rightCap}
            isMe={false}
            reversed
          />
        </div>

        {/* Board */}
        <div className="flex-1 flex items-center justify-center px-3 pb-2 min-h-0">
          <div style={{ width: '100%', maxWidth: 420 }}>
            {match.status === 'waiting' ? (
              <WaitingState code={match.code} />
            ) : (
              <CheckersBoard
                board={match.board}
                myColor={myColor}
                currentTurn={match.currentTurn}
                selectedCell={selectedCell}
                mustContinueFrom={match.mustContinueFrom}
                forcedCapture={match.settings.forcedCapture}
                onSelectCell={selectCell}
                onMove={(from, to) => makeMove(from, to)}
              />
            )}
          </div>
        </div>

        {/* Game over overlay */}
        <AnimatePresence>
          {isFinished && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center z-10"
              style={{ background: 'rgba(3,0,13,0.82)', backdropFilter: 'blur(4px)' }}
            >
              <div
                className="mx-4 px-8 py-6 rounded-2xl text-center space-y-4"
                style={{ background: 'rgba(20,10,40,0.95)', border: '1px solid rgba(155,0,255,0.35)' }}
              >
                <p className="font-mono text-[10px] uppercase tracking-widest text-white/30">
                  {t.games.checkers.gameOver}
                </p>
                <p
                  className="font-display text-2xl font-bold"
                  style={{ color: match.winnerColor === myColor ? '#00f5ff' : '#c084fc' }}
                >
                  {match.winnerColor
                    ? `${match.winnerColor === 'red' ? match.red.name : match.black?.name} ${t.games.checkers.wins}`
                    : t.games.checkers.draw}
                </p>
                <div className="flex gap-3 justify-center">
                  {isPlayer && (
                    <button
                      onClick={rematch}
                      disabled={isLoading}
                      className="px-5 py-2 rounded-xl font-display font-semibold text-sm uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
                      style={{ background: 'linear-gradient(135deg, rgba(155,0,255,0.4), rgba(0,245,255,0.25))', border: '1px solid rgba(155,0,255,0.4)', color: '#fff' }}
                    >
                      {t.games.checkers.rematch}
                    </button>
                  )}
                  <button
                    onClick={leaveMatch}
                    className="px-5 py-2 rounded-xl font-mono text-sm text-white/50 border border-white/15 hover:text-white/80 hover:border-white/30 transition-colors"
                  >
                    {t.games.checkers.backToGames}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat */}
        <div
          className="flex-shrink-0 border-t"
          style={{ borderColor: 'rgba(155,0,255,0.15)', maxHeight: 160 }}
        >
          <div ref={chatRef} className="overflow-y-auto px-3 py-2 space-y-1" style={{ maxHeight: 110 }}>
            {match.chat.length === 0 && (
              <p className="font-mono text-[10px] text-white/20 text-center py-2">{t.games.checkers.noMessages}</p>
            )}
            {match.chat.map((msg, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="font-mono text-[10px] text-white/35 flex-shrink-0 mt-0.5">{msg.senderName}</span>
                <span className="font-mono text-[11px] text-white/70 break-words min-w-0">{msg.text}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2 px-3 pb-3">
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSendChat(); }}
              placeholder={t.games.checkers.chatPlaceholder}
              maxLength={200}
              className="flex-1 bg-transparent font-mono text-xs text-white placeholder-white/20 outline-none border-b border-white/10 focus:border-white/30 transition-colors py-1"
            />
            <button
              onClick={handleSendChat}
              disabled={!chatInput.trim()}
              className="font-mono text-xs text-white/40 hover:text-white/70 transition-colors disabled:opacity-20 px-1"
            >
              ↵
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Piece swatch colors match those in CheckersBoard.tsx
const BADGE_COLORS = {
  red:   { bg: 'radial-gradient(circle at 35% 35%, #e74c3c, #c0392b)', ring: '#e74c3c' },
  black: { bg: 'radial-gradient(circle at 35% 35%, #f5d76e, #b8860b)',  ring: '#f5d76e' },
};

function PlayerBadge({
  name, color, active, captures, isMe, reversed,
}: {
  name: string;
  color: 'red' | 'black';
  active: boolean;
  captures: number;
  isMe: boolean;
  reversed?: boolean;
}) {
  const c = BADGE_COLORS[color];
  return (
    <div className={`flex items-center gap-2 min-w-0 ${reversed ? 'flex-row-reverse text-right' : ''}`}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: c.bg,
        boxShadow: active
          ? `0 0 0 2px #00f5ff, 0 0 10px rgba(0,245,255,0.5)`
          : `0 0 0 1px ${c.ring}44, 0 2px 4px rgba(0,0,0,0.4)`,
      }} />
      <div className="min-w-0">
        <p className="font-mono text-xs text-white truncate">
          {name}{isMe ? ' ✦' : ''}
        </p>
        <p className="font-mono text-[9px] text-white/30">{captures} cap.</p>
      </div>
    </div>
  );
}

function WaitingState({ code }: { code: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center text-4xl"
        style={{ background: 'rgba(155,0,255,0.08)', border: '2px solid rgba(155,0,255,0.2)' }}
      >
        ♟
      </div>
      <p className="font-mono text-sm text-white/40">{t.games.checkers.waitingForOpponent}</p>
      <button
        onClick={copy}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border font-mono text-sm transition-all active:scale-95"
        style={{ border: '1px solid rgba(155,0,255,0.4)', background: 'rgba(155,0,255,0.08)', color: '#c084fc' }}
      >
        <span>{code}</span>
        <span className="text-xs opacity-60">{copied ? '✓' : '⎘'}</span>
      </button>
      <p className="font-mono text-[10px] text-white/25">{t.games.checkers.shareCode}</p>
    </div>
  );
}
