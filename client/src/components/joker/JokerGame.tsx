import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useT } from '@/store/langStore';
import { useJokerStore } from '@/store/jokerStore';
import { JokerCard, rankLabel } from './JokerCard';
import type { Card, JokerPlayerPublic, Suit } from '@/types/joker';

const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };

export function JokerGame() {
  const t = useT();
  const {
    match, myHand, selectedCard,
    startMatch, declare: declareAction, playCard, resign, rematch, leaveMatch, sendChat, selectCard,
    isLoading,
  } = useJokerStore();

  const [chatInput, setChatInput] = useState('');
  const [showScoreboard, setShowScoreboard] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [match?.chat]);

  if (!match) return null;

  const myId = match.myPlayerId;
  const mySeat = match.mySeatIndex;
  const isPlayer = myId !== null;
  const isSpectator = !isPlayer;
  const cardCount = match.roundPlan[match.currentRoundIndex] ?? 0;
  const isMyDeclTurn = isPlayer && match.status === 'declaration' &&
    match.players.find(p => p.id === myId)?.seatIndex === match.currentDeclarationSeat;
  const myDeclaration = myId ? (match.declarations[myId] ?? null) : null;
  const isMyPlayTurn = isPlayer && match.status === 'playing' && mySeat === match.currentPlaySeat;
  const isFinished = match.status === 'finished';
  const isCreator = isPlayer && mySeat === 0;

  // Determine playable cards when it's our turn
  const playableSet = useMemo(() => {
    if (!isMyPlayTurn || myHand.length === 0) return new Set<string>();
    const trick = match.currentTrick;
    if (trick.length === 0) {
      // Leading — any card
      return new Set(myHand.map(c => cardKey(c)));
    }
    const ledSuit = trick[0].card.suit;
    const hasSuit = myHand.some(c => c.suit === ledSuit);
    if (hasSuit) return new Set(myHand.filter(c => c.suit === ledSuit).map(c => cardKey(c)));
    return new Set(myHand.map(c => cardKey(c)));
  }, [isMyPlayTurn, myHand, match.currentTrick]);

  async function handleChatSend() {
    const txt = chatInput.trim();
    if (!txt) return;
    setChatInput('');
    await sendChat(txt);
  }

  async function handleCardClick(card: Card) {
    if (!isMyPlayTurn) return;
    const key = cardKey(card);
    if (!playableSet.has(key)) return;
    if (selectedCard && cardKey(selectedCard) === key) {
      await playCard(card);
    } else {
      selectCard(card);
    }
  }

  const winner = isFinished && match.winnerPlayerId
    ? match.players.find(p => p.id === match.winnerPlayerId)
    : null;

  // Sort players so "me" is always at bottom (seat arrangement)
  const seatedPlayers = [...match.players].sort((a, b) => {
    if (mySeat === null) return a.seatIndex - b.seatIndex;
    return ((a.seatIndex - mySeat + 4) % 4) - ((b.seatIndex - mySeat + 4) % 4);
  });

  // Positions for the 4 seats: bottom(me), left, top, right
  const seatPositions = ['bottom', 'left', 'top', 'right'] as const;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: '#020008' }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: 'rgba(155,0,255,0.2)', background: 'rgba(10,6,28,0.97)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base">🃏</span>
          <div className="min-w-0">
            <p className="font-display font-bold text-white text-sm leading-tight">
              {t.games.joker.title}
              <span className="ml-2 font-mono text-[10px] text-white/30 font-normal">
                {match.settings.mode === 'classic' ? t.games.joker.modeClassic : t.games.joker.modeNines}
              </span>
            </p>
            <p className="font-mono text-[9px] text-white/30">
              {match.code} · {t.games.joker.round} {match.currentRoundIndex + 1}/{match.totalRounds} · {cardCount}🃏
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowScoreboard(s => !s)}
            className="font-mono text-[10px] text-white/40 hover:text-white/70 px-2 py-1 rounded border border-white/10 hover:border-white/25 transition-colors"
          >
            {t.games.joker.score}
          </button>
          {isPlayer && match.status === 'playing' && (
            <button
              onClick={resign}
              className="font-mono text-[10px] text-red-400/60 hover:text-red-400 px-2 py-1 rounded border border-red-500/15 hover:border-red-500/35 transition-colors"
            >
              {t.games.joker.resign}
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

      <div className="flex-1 overflow-hidden flex flex-col relative min-h-0">
        {/* ── Waiting room ── */}
        {match.status === 'waiting' && (
          <WaitingRoom
            match={match}
            isCreator={isCreator}
            onStart={startMatch}
            isLoading={isLoading}
          />
        )}

        {/* ── Game table ── */}
        {match.status !== 'waiting' && !isFinished && (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {/* Player badges (top + sides) */}
            <div className="flex-shrink-0 px-3 pt-2 grid grid-cols-3 gap-1">
              {/* Top player */}
              <div />
              <PlayerBadge
                player={seatedPlayers[2]}
                match={match}
                myId={myId}
                position="top"
              />
              <div />
              {/* Left + Right */}
              <PlayerBadge player={seatedPlayers[1]} match={match} myId={myId} position="left" />
              <div />
              <PlayerBadge player={seatedPlayers[3]} match={match} myId={myId} position="right" />
            </div>

            {/* Table center: current trick */}
            <div className="flex-1 flex items-center justify-center min-h-0 py-2">
              <TrickArea match={match} seatedPlayers={seatedPlayers} />
            </div>

            {/* Declaration phase */}
            <AnimatePresence>
              {match.status === 'declaration' && isMyDeclTurn && myDeclaration === null && (
                <DeclarationPanel
                  cardCount={cardCount}
                  onDeclare={declareAction}
                />
              )}
            </AnimatePresence>

            {/* Declaration waiting */}
            {match.status === 'declaration' && (!isMyDeclTurn || myDeclaration !== null) && (
              <div className="flex-shrink-0 text-center pb-2">
                <p className="font-mono text-[11px] text-white/35">
                  {myDeclaration !== null
                    ? `${t.games.joker.yourDeclaration}: ${myDeclaration}`
                    : t.games.joker.waitingDeclaration}
                </p>
                <DeclarationProgress match={match} />
              </div>
            )}

            {/* My hand */}
            {isPlayer && (
              <div className="flex-shrink-0 px-2 pb-2">
                <PlayerBadge
                  player={seatedPlayers[0]}
                  match={match}
                  myId={myId}
                  position="bottom"
                  compact
                />
                <div className="mt-1 flex gap-1 overflow-x-auto pb-1 justify-center flex-wrap">
                  {myHand.map((card, i) => {
                    const key = cardKey(card);
                    const isSelected = selectedCard ? cardKey(selectedCard) === key : false;
                    const isPlayable = playableSet.has(key);
                    return (
                      <JokerCard
                        key={i}
                        card={card}
                        selected={isSelected}
                        playable={isMyPlayTurn && isPlayable}
                        disabled={isMyPlayTurn && !isPlayable}
                        onClick={() => handleCardClick(card)}
                      />
                    );
                  })}
                  {myHand.length === 0 && match.status === 'playing' && (
                    <p className="font-mono text-xs text-white/20 py-4">{t.games.joker.noCards}</p>
                  )}
                </div>
                {isMyPlayTurn && selectedCard && (
                  <p className="text-center font-mono text-[10px] text-neon-cyan/60 mt-1">
                    {t.games.joker.tapAgainToPlay}
                  </p>
                )}
                {isMyPlayTurn && !selectedCard && (
                  <p className="text-center font-mono text-[10px] text-neon-cyan mt-1">
                    {t.games.joker.yourTurn}
                  </p>
                )}
              </div>
            )}

            {isSpectator && (
              <div className="flex-shrink-0 text-center py-2">
                <p className="font-mono text-[10px] text-white/25">{t.games.joker.spectating}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Finished overlay ── */}
        <AnimatePresence>
          {isFinished && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 flex items-center justify-center"
              style={{ background: 'rgba(2,0,8,0.9)', backdropFilter: 'blur(6px)' }}
            >
              <div
                className="mx-4 w-full max-w-xs rounded-2xl overflow-hidden"
                style={{ background: 'rgba(20,10,40,0.98)', border: '1px solid rgba(155,0,255,0.4)' }}
              >
                <div className="px-5 py-4 border-b" style={{ borderColor: 'rgba(155,0,255,0.2)' }}>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-white/30 text-center">
                    {t.games.joker.finalScore}
                  </p>
                  {winner && (
                    <p className="font-display text-xl font-bold text-center mt-1"
                      style={{ color: '#00f5ff' }}>
                      🏆 {winner.name}
                    </p>
                  )}
                </div>
                <div className="px-4 py-3 space-y-1">
                  {[...match.players]
                    .sort((a, b) => (match.scores[b.id] ?? 0) - (match.scores[a.id] ?? 0))
                    .map((p, i) => (
                      <div key={p.id} className="flex items-center gap-3 py-1">
                        <span className="font-mono text-xs text-white/30 w-4">{i + 1}.</span>
                        <span className={`font-mono text-sm flex-1 ${p.id === myId ? 'text-white' : 'text-white/60'}`}>
                          {p.name}{p.id === myId ? ' ✦' : ''}
                        </span>
                        <span className="font-mono text-sm font-bold"
                          style={{ color: (match.scores[p.id] ?? 0) >= 0 ? '#00f5ff' : '#f87171' }}>
                          {match.scores[p.id] ?? 0}
                        </span>
                      </div>
                    ))}
                </div>
                <div className="px-4 pb-4 flex gap-2">
                  {isPlayer && (
                    <button
                      onClick={rematch}
                      disabled={isLoading}
                      className="flex-1 py-2 rounded-xl font-display font-semibold text-sm uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
                      style={{ background: 'linear-gradient(135deg, rgba(155,0,255,0.4), rgba(0,245,255,0.25))', border: '1px solid rgba(155,0,255,0.4)', color: '#fff' }}
                    >
                      {t.games.joker.rematch}
                    </button>
                  )}
                  <button
                    onClick={leaveMatch}
                    className="flex-1 py-2 rounded-xl font-mono text-sm text-white/50 border border-white/15 hover:text-white/80 transition-colors"
                  >
                    {t.games.joker.backToGames}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Scoreboard panel ── */}
        <AnimatePresence>
          {showScoreboard && (
            <motion.div
              initial={{ opacity: 0, x: '100%' }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: '100%' }}
              className="absolute inset-y-0 right-0 z-10 w-64 overflow-y-auto"
              style={{ background: 'rgba(10,6,28,0.97)', borderLeft: '1px solid rgba(155,0,255,0.2)' }}
            >
              <ScoreboardPanel match={match} myId={myId} onClose={() => setShowScoreboard(false)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Chat */}
      <div
        className="flex-shrink-0 border-t"
        style={{ borderColor: 'rgba(155,0,255,0.15)', maxHeight: 120 }}
      >
        <div ref={chatRef} className="overflow-y-auto px-3 py-1 space-y-0.5" style={{ maxHeight: 80 }}>
          {match.chat.map((msg, i) => (
            <div key={i} className="flex gap-2 items-start">
              <span className="font-mono text-[9px] text-white/30 flex-shrink-0 mt-0.5">{msg.senderName}</span>
              <span className="font-mono text-[10px] text-white/65 break-words min-w-0">{msg.text}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2 px-3 pb-2">
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleChatSend(); }}
            placeholder={t.games.joker.chatPlaceholder}
            maxLength={200}
            className="flex-1 bg-transparent font-mono text-xs text-white placeholder-white/20 outline-none border-b border-white/10 focus:border-white/30 transition-colors py-0.5"
          />
          <button onClick={handleChatSend} disabled={!chatInput.trim()}
            className="font-mono text-xs text-white/40 hover:text-white/70 transition-colors disabled:opacity-20">↵</button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function cardKey(c: Card) { return `${c.suit}${c.rank}`; }

function WaitingRoom({ match, isCreator, onStart, isLoading }: {
  match: any; isCreator: boolean; onStart: () => void; isLoading: boolean;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center text-4xl"
        style={{ background: 'rgba(155,0,255,0.08)', border: '2px solid rgba(155,0,255,0.2)' }}
      >
        🃏
      </div>

      <div className="text-center">
        <p className="font-mono text-sm text-white/60">
          {match.players.length}/4 {t.games.joker.players}
        </p>
        <p className="font-mono text-xs text-white/30 mt-1">{t.games.joker.waitingFor4}</p>
      </div>

      {/* Player seats */}
      <div className="w-full max-w-xs space-y-1">
        {Array.from({ length: 4 }, (_, i) => {
          const p = match.players.find((pl: any) => pl.seatIndex === i);
          return (
            <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
              style={{ background: p ? 'rgba(155,0,255,0.08)' : 'rgba(255,255,255,0.02)', border: `1px solid ${p ? 'rgba(155,0,255,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
              <span className="font-mono text-[10px] text-white/30 w-4">{i + 1}</span>
              <span className={`font-mono text-xs ${p ? 'text-white' : 'text-white/20'}`}>
                {p ? `${p.name}${i === 0 ? ' 👑' : ''}` : '—'}
              </span>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => {
          navigator.clipboard?.writeText(match.code).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-sm transition-all active:scale-95"
        style={{ border: '1px solid rgba(155,0,255,0.4)', background: 'rgba(155,0,255,0.08)', color: '#c084fc' }}
      >
        <span>{match.code}</span>
        <span className="text-xs opacity-60">{copied ? '✓' : '⎘'}</span>
      </button>

      {isCreator && match.players.length === 4 && (
        <button
          onClick={onStart}
          disabled={isLoading}
          className="px-8 py-3 rounded-xl font-display font-bold text-sm uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, rgba(155,0,255,0.5), rgba(0,245,255,0.3))', border: '1px solid rgba(155,0,255,0.5)', color: '#fff', boxShadow: '0 0 20px rgba(155,0,255,0.2)' }}
        >
          {t.games.joker.startGame}
        </button>
      )}
    </div>
  );
}

function PlayerBadge({ player, match, myId, position, compact }: {
  player: JokerPlayerPublic | undefined;
  match: any;
  myId: string | null;
  position: 'top' | 'left' | 'right' | 'bottom';
  compact?: boolean;
}) {
  const t = useT();
  if (!player) return <div />;

  const isDealer = player.seatIndex === match.currentDealerSeat;
  const declaration = match.declarations[player.id] ?? null;
  const taken = match.tricksTaken[player.id] ?? 0;
  const isMyTurn = match.currentPlaySeat === player.seatIndex && match.status === 'playing';
  const isDeclTurn = match.currentDeclarationSeat === player.seatIndex && match.status === 'declaration';
  const isMe = player.id === myId;
  const score = match.scores[player.id] ?? 0;

  const cardCount = player.cardCount;

  return (
    <div className={`flex ${position === 'left' || position === 'right' ? 'flex-col items-center' : 'items-center'} gap-1`}>
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
        style={{
          background: isMyTurn || isDeclTurn
            ? 'rgba(0,245,255,0.08)'
            : 'rgba(255,255,255,0.03)',
          border: `1px solid ${isMyTurn || isDeclTurn ? 'rgba(0,245,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
          boxShadow: isMyTurn ? '0 0 10px rgba(0,245,255,0.15)' : 'none',
        }}
      >
        {isDealer && <span className="text-[10px]" title="Dealer">🎴</span>}
        <div className="min-w-0">
          <p className="font-mono text-[10px] text-white truncate max-w-[70px]">
            {player.name}{isMe ? ' ✦' : ''}
          </p>
          {!compact && (
            <p className="font-mono text-[9px] text-white/30">
              {declaration !== null ? `${t.games.joker.declared}: ${declaration}` : ''}
              {declaration !== null && ` · ${t.games.joker.taken}: ${taken}`}
              {' · '}
              <span style={{ color: score >= 0 ? 'rgba(0,245,255,0.7)' : '#f87171' }}>{score}</span>
            </p>
          )}
        </div>
        {/* Card count dots */}
        <div className="flex gap-0.5 flex-shrink-0">
          {Array.from({ length: Math.min(cardCount, 9) }, (_, i) => (
            <div key={i} style={{ width: 4, height: 8, background: 'rgba(192,132,252,0.5)', borderRadius: 1 }} />
          ))}
          {cardCount > 9 && <span className="font-mono text-[8px] text-white/30">+{cardCount - 9}</span>}
        </div>
      </div>
    </div>
  );
}

function TrickArea({ match, seatedPlayers }: { match: any; seatedPlayers: JokerPlayerPublic[] }) {
  const t = useT();
  const trick = match.currentTrick as Array<{ playerId: string; seatIndex: number; card: Card }>;
  // Map seatIndex to position in seatedPlayers (bottom=0, left=1, top=2, right=3)
  const seatToPos: Record<number, number> = {};
  seatedPlayers.forEach((p, idx) => { seatToPos[p.seatIndex] = idx; });

  const positions = ['bottom', 'left', 'top', 'right'];
  const posStyle: Record<string, React.CSSProperties> = {
    bottom: { bottom: 0, left: '50%', transform: 'translateX(-50%)' },
    left:   { left: 0, top: '50%', transform: 'translateY(-50%)' },
    top:    { top: 0, left: '50%', transform: 'translateX(-50%)' },
    right:  { right: 0, top: '50%', transform: 'translateY(-50%)' },
  };

  return (
    <div className="relative" style={{ width: 160, height: 160 }}>
      {/* Green felt center */}
      <div style={{
        position: 'absolute', inset: 16, borderRadius: 12,
        background: 'radial-gradient(circle, rgba(0,60,20,0.6), rgba(0,30,10,0.4))',
        border: '1px solid rgba(0,200,50,0.12)',
      }} />

      {trick.map((pc) => {
        const posIdx = seatToPos[pc.seatIndex] ?? 0;
        const pos = positions[posIdx];
        return (
          <div key={`${pc.playerId}-${cardKey(pc.card)}`}
            style={{ position: 'absolute', ...posStyle[pos] }}>
            <JokerCard card={pc.card} size="sm" />
          </div>
        );
      })}

      {trick.length === 0 && match.status === 'playing' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p className="font-mono text-[9px] text-white/15">{t.games.joker.playCard}</p>
        </div>
      )}
    </div>
  );
}

function DeclarationPanel({ cardCount, onDeclare }: { cardCount: number; onDeclare: (n: number) => void }) {
  const t = useT();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="flex-shrink-0 px-3 pb-2"
    >
      <div className="rounded-xl p-3" style={{ background: 'rgba(155,0,255,0.06)', border: '1px solid rgba(155,0,255,0.25)' }}>
        <p className="font-mono text-[10px] text-white/50 mb-2 text-center uppercase tracking-widest">
          {t.games.joker.howManyTricks}
        </p>
        <div className="flex gap-1.5 flex-wrap justify-center">
          {Array.from({ length: cardCount + 1 }, (_, n) => (
            <button
              key={n}
              onClick={() => onDeclare(n)}
              className="w-9 h-9 rounded-lg font-display font-bold text-sm transition-all active:scale-90"
              style={{
                background: n === 0 ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, rgba(155,0,255,0.25), rgba(0,245,255,0.15))',
                border: '1px solid rgba(155,0,255,0.35)',
                color: '#fff',
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function DeclarationProgress({ match }: { match: any }) {
  const t = useT();
  return (
    <div className="flex gap-2 justify-center mt-1 flex-wrap">
      {match.players.map((p: JokerPlayerPublic) => {
        const decl = match.declarations[p.id];
        return (
          <div key={p.id} className="flex items-center gap-1">
            <span className="font-mono text-[9px] text-white/30">{p.name}:</span>
            <span className="font-mono text-[9px]" style={{ color: decl !== null && decl !== undefined ? '#00f5ff' : 'rgba(255,255,255,0.2)' }}>
              {decl !== null && decl !== undefined ? decl : '?'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ScoreboardPanel({ match, myId, onClose }: { match: any; myId: string | null; onClose: () => void }) {
  const t = useT();
  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <p className="font-display font-bold text-white text-sm">{t.games.joker.score}</p>
        <button onClick={onClose} className="text-white/40 hover:text-white/70 text-sm">✕</button>
      </div>

      {/* Current totals */}
      <div className="space-y-1 mb-4">
        {[...match.players]
          .sort((a: any, b: any) => (match.scores[b.id] ?? 0) - (match.scores[a.id] ?? 0))
          .map((p: any, i: number) => (
            <div key={p.id} className="flex items-center gap-2 py-1 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <span className="font-mono text-[9px] text-white/30 w-3">{i + 1}</span>
              <span className={`font-mono text-xs flex-1 truncate ${p.id === myId ? 'text-white' : 'text-white/50'}`}>
                {p.name}
              </span>
              <span className="font-mono text-sm font-bold" style={{ color: (match.scores[p.id] ?? 0) >= 0 ? '#00f5ff' : '#f87171' }}>
                {match.scores[p.id] ?? 0}
              </span>
            </div>
          ))}
      </div>

      {/* Round history */}
      <p className="font-mono text-[9px] uppercase tracking-widest text-white/25 mb-2">{t.games.joker.roundHistory}</p>
      <div className="space-y-2">
        {match.roundHistory.map((r: any) => (
          <div key={r.roundIndex} className="rounded-lg px-2 py-1.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="font-mono text-[9px] text-white/30 mb-1">
              {t.games.joker.round} {r.roundIndex + 1} · {r.cardCount}🃏
              {r.pulkaId !== null ? ` · Pulka ${r.pulkaId}` : ''}
            </p>
            <div className="space-y-0.5">
              {match.players.map((p: any) => {
                const decl = r.declarations[p.id] ?? '?';
                const taken = r.taken[p.id] ?? 0;
                const pts = r.points[p.id] ?? 0;
                const khishti = r.khishtiPlayers.includes(p.id);
                const bonus = r.pulkaBonusPlayers[p.id] ?? 0;
                return (
                  <div key={p.id} className="flex items-center gap-1">
                    <span className="font-mono text-[9px] text-white/40 w-14 truncate">{p.name}</span>
                    <span className="font-mono text-[9px] text-white/30">{decl}→{taken}</span>
                    <span className="font-mono text-[9px] ml-auto" style={{ color: pts >= 0 ? 'rgba(0,245,255,0.7)' : '#f87171' }}>
                      {pts >= 0 ? '+' : ''}{pts}
                      {khishti ? ' ხ' : ''}
                      {bonus > 0 ? ` +${bonus}🎉` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
