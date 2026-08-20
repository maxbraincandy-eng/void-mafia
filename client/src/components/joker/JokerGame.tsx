import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useT } from '@/store/langStore';
import { useJokerStore } from '@/store/jokerStore';
import { useJokerVoice } from '@/hooks/useJokerVoice';
import { JokerCard } from './JokerCard';
import type { Card, JokerPlayerPublic, Suit } from '@/types/joker';
import { haptic } from '@/lib/haptics';
import { tNow } from '@/store/langStore';
import { GameInviteButton } from '@/components/social/GameInviteButton';
import { useSocialStore } from '@/store/socialStore';

const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣', J: '🃏' };

// ── CSS keyframe animations ────────────────────────────────────────────────
function JokerStyles() {
  return (
    <style>{`
      @keyframes jkTurnPulse {
        0%   { box-shadow: 0 0 0 0px rgba(0,245,255,0.9), 0 0 12px rgba(0,245,255,0.4); }
        60%  { box-shadow: 0 0 0 7px rgba(0,245,255,0),   0 0 20px rgba(0,245,255,0.2); }
        100% { box-shadow: 0 0 0 0px rgba(0,245,255,0),   0 0 12px rgba(0,245,255,0.4); }
      }
      @keyframes jkDeclPulse {
        0%   { box-shadow: 0 0 0 0px rgba(192,132,252,0.9), 0 0 12px rgba(155,0,255,0.4); }
        60%  { box-shadow: 0 0 0 7px rgba(192,132,252,0),   0 0 22px rgba(155,0,255,0.2); }
        100% { box-shadow: 0 0 0 0px rgba(192,132,252,0),   0 0 12px rgba(155,0,255,0.4); }
      }
      @keyframes jkMyTurnBlink {
        0%,100% { opacity: 1; }
        50%     { opacity: 0.4; }
      }
      .jk-turn-active  { animation: jkTurnPulse  1.1s ease-in-out infinite; }
      .jk-decl-active  { animation: jkDeclPulse  1.0s ease-in-out infinite; }
      .jk-my-turn-text { animation: jkMyTurnBlink 0.9s ease-in-out infinite; }
    `}</style>
  );
}

function cardKey(c: Card) { return `${c.suit}${c.rank}`; }

/**
 * Hold the phone the way the table wants to be held.
 *
 * Two paths, because the platforms disagree. Android in fullscreen can be told
 * to lock landscape and the page genuinely turns; iOS has no such API at all,
 * so the surface is rotated with a transform instead and the phone is simply
 * held sideways. Both end in the same place, and the moment the DEVICE reports
 * landscape — by lock or by the player turning it — the fake rotation stops, so
 * the two can never stack up into a sideways-upside-down mess.
 */
function useLandscapeToggle() {
  const [want, setWant] = useState(false);
  const [deviceLandscape, setDeviceLandscape] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(orientation: landscape)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)');
    const onChange = (e: MediaQueryListEvent) => setDeviceLandscape(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Never leave the phone locked after the table is gone.
  useEffect(() => () => {
    try { (screen.orientation as any)?.unlock?.(); } catch { /* not supported */ }
  }, []);

  const toggle = useCallback(() => {
    setWant(w => {
      const next = !w;
      const so: any = (screen as any).orientation;
      if (next) {
        const el: any = document.documentElement;
        const fs = el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.();
        Promise.resolve(fs).catch(() => {}).finally(() => {
          try { so?.lock?.('landscape').catch(() => {}); } catch { /* iOS */ }
        });
      } else {
        try { so?.unlock?.(); } catch { /* iOS */ }
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      }
      return next;
    });
  }, []);

  // Only fake it when the device itself is still portrait.
  const rotate = want && !deviceLandscape;
  const style: React.CSSProperties = rotate
    ? {
        position: 'fixed', top: 0, left: 0,
        width: '100vh', height: '100vw',
        transform: 'rotate(90deg) translateY(-100%)',
        transformOrigin: 'top left',
      }
    : {};
  return { want, rotate, style, toggle };
}

export function JokerGame() {
  const t = useT();
  const {
    match, myHand, selectedCard,
    startMatch, declare: declareAction, playCard, resign, rematch, leaveMatch, sendChat, selectCard,
    isLoading,
  } = useJokerStore();

  const [chatInput, setChatInput] = useState('');
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [jokerPendingCard, setJokerPendingCard] = useState<Card | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [match?.chat]);

  // ── Voice (must be before conditional return) ──────────────────────
  const voice = useJokerVoice();
  const jokerMatchId = match?.id;
  const jokerIsPlayer = match?.myPlayerId !== null && match?.myPlayerId !== undefined;

  useEffect(() => {
    if (!jokerMatchId) return;
    if (jokerIsPlayer) voice.joinVoice(jokerMatchId);
    else voice.joinListen(jokerMatchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jokerMatchId]);

  const jokerIsFinished = match?.status === 'finished';
  useEffect(() => { if (jokerIsFinished) voice.leave(); }, [jokerIsFinished, voice.leave]);
  useEffect(() => () => { voice.leave(); }, [voice.leave]);

  const handlePttStart = useCallback(() => {
    if (jokerMatchId) voice.startTalk(jokerMatchId);
  }, [jokerMatchId, voice.startTalk]);

  const handlePttStop = useCallback(() => {
    if (jokerMatchId) voice.stopTalk(jokerMatchId);
  }, [jokerMatchId, voice.stopTalk]);

  const orientation = useLandscapeToggle();

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

  const playableSet = useMemo(() => {
    if (!isMyPlayTurn || myHand.length === 0) return new Set<string>();
    const trick = match.currentTrick;
    if (trick.length === 0) return new Set(myHand.map(c => cardKey(c)));
    const ledSuit = trick[0].card.suit;
    const hasSuit = myHand.some(c => c.suit === ledSuit && c.suit !== 'J');
    if (hasSuit) {
      return new Set(myHand.filter(c => c.suit === ledSuit || c.suit === 'J').map(c => cardKey(c)));
    }
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
      if (card.suit === 'J') {
        haptic('tap');
        setJokerPendingCard(card);
      } else {
        haptic('success');
        await playCard(card);
      }
    } else {
      haptic('selection');
      selectCard(card);
    }
  }

  const winner = isFinished && match.winnerPlayerId
    ? match.players.find(p => p.id === match.winnerPlayerId)
    : null;

  // Seat arrangement: me at bottom
  const seatedPlayers = [...match.players].sort((a, b) => {
    if (mySeat === null) return a.seatIndex - b.seatIndex;
    return ((a.seatIndex - mySeat + 4) % 4) - ((b.seatIndex - mySeat + 4) % 4);
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ background: '#050310', ...orientation.style }}
    >
      <JokerStyles />

      {/* ── Header ── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4"
        style={{ minHeight: 56, paddingTop: 'max(8px, env(safe-area-inset-top, 0px))', borderBottom: '1px solid rgba(155,0,255,0.2)', background: 'rgba(8,4,22,0.98)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg">🃏</span>
          <div className="min-w-0">
            <p className="font-display font-bold text-white text-sm leading-tight">
              {t.games.joker.title}
              <span className="ml-2 font-mono text-[12px] text-white/25 font-normal">
                {match.settings.mode === 'classic' ? t.games.joker.modeClassic : t.games.joker.modeNines}
              </span>
            </p>
            <p className="font-mono text-[12px] text-white/25">
              {match.code} · {t.games.joker.round} {match.currentRoundIndex + 1}/{match.totalRounds} · {cardCount}🃏
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Landscape: a card table is wider than it is tall. */}
          <button onClick={() => { haptic('selection'); orientation.toggle(); }}
            title="ეკრანის მიმართულება"
            className="font-mono text-[15px] w-11 h-11 rounded border transition-colors flex items-center justify-center"
            style={{
              color: orientation.want ? '#fbbf24' : 'rgba(255,255,255,0.35)',
              borderColor: orientation.want ? 'rgba(251,191,36,0.45)' : 'rgba(255,255,255,0.1)',
            }}>
            {orientation.want ? '📱' : '🔄'}
          </button>
          <button onClick={() => setShowScoreboard(s => !s)}
            className="font-mono text-[12px] text-white/40 hover:text-white/70 px-3 py-2 rounded border border-white/10 hover:border-white/25 transition-colors min-h-[44px] flex items-center">
            {t.games.joker.score}
          </button>
          {isPlayer && match.status === 'playing' && (
            <button onClick={resign}
              className="font-mono text-[12px] text-red-400/60 hover:text-red-400 px-3 py-2 rounded border border-red-500/15 hover:border-red-500/35 transition-colors min-h-[44px] flex items-center">
              {t.games.joker.resign}
            </button>
          )}
          <button onClick={leaveMatch}
            className="font-mono text-[16px] text-white/35 hover:text-white/70 w-11 h-11 rounded border border-white/10 hover:border-white/25 transition-colors flex items-center justify-center">
            ✕
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 overflow-hidden flex flex-col relative min-h-0">

        {/* ── Waiting room ── */}
        {match.status === 'waiting' && (
          <WaitingRoom match={match} isCreator={isCreator} onStart={startMatch} isLoading={isLoading} />
        )}

        {/* ── Active game ── */}
        {match.status !== 'waiting' && !isFinished && (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">

            {/* Top player */}
            <div className="flex-shrink-0 flex justify-center pt-2 pb-0.5 px-2">
              <PlayerBadge player={seatedPlayers[2]} match={match} myId={myId} position="top" />
            </div>

            {/* Left | Table | Right */}
            <div className="flex-1 flex items-stretch min-h-0 gap-1 px-1">
              {/* Left player */}
              <div className="flex-shrink-0 flex items-center">
                <PlayerBadge player={seatedPlayers[1]} match={match} myId={myId} position="side" />
              </div>

              {/* Table felt */}
              <div className="flex-1 min-h-0 py-1">
                <TrickArea match={match} seatedPlayers={seatedPlayers} />
              </div>

              {/* Right player */}
              <div className="flex-shrink-0 flex items-center">
                <PlayerBadge player={seatedPlayers[3]} match={match} myId={myId} position="side" />
              </div>
            </div>

            {/* ── Bottom section: declaration + hand ── */}
            <div className="flex-shrink-0 px-2 pb-2">

              {/* Declaration panel (my turn) */}
              <AnimatePresence>
                {match.status === 'declaration' && isMyDeclTurn && myDeclaration === null && (
                  <DeclarationPanel
                    cardCount={cardCount}
                    forbidden={match.forbiddenBid ?? null}
                    isTrumpChooser={mySeat === match.trumpChooserSeat}
                    sumSoFar={match.bidTension?.sum ?? 0}
                    onDeclare={declareAction}
                  />
                )}
              </AnimatePresence>

              {/* Declaration waiting */}
              {match.status === 'declaration' && (!isMyDeclTurn || myDeclaration !== null) && (
                <div className="flex-shrink-0 text-center pb-1">
                  <p className="font-mono text-[12px] text-white/35">
                    {myDeclaration !== null
                      ? `${t.games.joker.yourDeclaration}: ${myDeclaration}`
                      : t.games.joker.waitingDeclaration}
                  </p>
                  <DeclarationProgress match={match} />
                </div>
              )}

              {/* My player badge */}
              {isPlayer && (
                <PlayerBadge player={seatedPlayers[0]} match={match} myId={myId} position="bottom" />
              )}

              {/* My hand — fan layout */}
              {isPlayer && (
                <div className="mt-1.5">
                  <HandFan
                    cards={myHand}
                    playableSet={playableSet}
                    isMyTurn={isMyPlayTurn}
                    selectedCard={selectedCard}
                    trumpSuit={match.trumpSuit ?? null}
                    onCardClick={handleCardClick}
                  />
                  {myHand.length === 0 && match.status === 'playing' && (
                    <p className="font-mono text-xs text-white/20 text-center py-3">{t.games.joker.noCards}</p>
                  )}
                </div>
              )}

              {/* Turn status text */}
              {isPlayer && isMyPlayTurn && (
                <p className={`text-center font-mono text-[11px] mt-1.5 tracking-wider ${selectedCard ? 'text-yellow-400/80' : 'text-cyan-400 jk-my-turn-text'}`}
                  style={{ textShadow: selectedCard ? 'none' : '0 0 10px rgba(0,245,255,0.5)' }}>
                  {selectedCard ? `▶ ${t.games.joker.tapAgainToPlay}` : `▶ ${t.games.joker.yourTurn}`}
                </p>
              )}

              {/* PTT button */}
              {isPlayer && !isFinished && voice.joined && (
                <button
                  onPointerDown={handlePttStart}
                  onPointerUp={handlePttStop}
                  onPointerLeave={handlePttStop}
                  className="w-full mt-1.5 py-2 rounded-xl font-mono text-[11px] font-bold transition-all active:scale-95 select-none"
                  style={{
                    background: voice.isTalking ? 'rgba(168,85,247,0.3)' : 'rgba(168,85,247,0.08)',
                    border: voice.isTalking ? '1px solid rgba(168,85,247,0.7)' : '1px solid rgba(168,85,247,0.2)',
                    color: voice.isTalking ? '#fff' : 'rgba(168,85,247,0.6)',
                    touchAction: 'none',
                  }}
                >
                  {voice.isTalking ? '🎙 LIVE' : '🎤 HOLD TO TALK'}
                </button>
              )}

              {isSpectator && (
                <p className="font-mono text-[12px] text-white/20 text-center py-1">{t.games.joker.spectating}</p>
              )}
            </div>
          </div>
        )}

        {/* ── Joker target modal ── */}
        <AnimatePresence>
          {jokerPendingCard && (
            <motion.div key="joker-choice" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 flex items-center justify-center"
              style={{ background: 'rgba(2,0,8,0.88)', backdropFilter: 'blur(6px)' }}>
              <div className="mx-4 w-full max-w-xs rounded-2xl overflow-hidden"
                style={{ background: 'rgba(30,15,5,0.98)', border: '1px solid rgba(251,191,36,0.4)' }}>
                <div className="px-5 py-4 border-b text-center" style={{ borderColor: 'rgba(251,191,36,0.2)' }}>
                  <div className="text-3xl mb-1">🃏</div>
                  <p className="font-mono text-[12px] uppercase tracking-widest text-yellow-400/60">
                    {t.games.joker.jokerPlay}
                  </p>
                </div>
                <div className="px-4 py-3 space-y-2">
                  <button onClick={async () => { setJokerPendingCard(null); await playCard(jokerPendingCard); }}
                    className="w-full py-2.5 rounded-xl font-display font-semibold text-sm uppercase tracking-wider transition-all active:scale-95"
                    style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.4)', color: '#fbbf24' }}>
                    {t.games.joker.jokerWinSelf}
                  </button>
                  {match.players.filter((p: JokerPlayerPublic) => p.id !== myId).map((p: JokerPlayerPublic) => (
                    <button key={p.id}
                      onClick={async () => { setJokerPendingCard(null); await playCard(jokerPendingCard, p.id); }}
                      className="w-full py-2.5 rounded-xl font-display font-semibold text-sm transition-all active:scale-95"
                      style={{ background: 'rgba(155,0,255,0.08)', border: '1px solid rgba(155,0,255,0.25)', color: '#c084fc' }}>
                      {t.games.joker.jokerGiveTo} {p.name}{p.isBot ? ' 🤖' : ''}
                    </button>
                  ))}
                </div>
                <div className="px-4 pb-3">
                  <button onClick={() => { setJokerPendingCard(null); selectCard(null); }}
                    className="w-full py-2 rounded-lg font-mono text-xs text-white/30 border border-white/10 hover:text-white/60 transition-colors">
                    {t.games.joker.cancel}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Round End overlay ── */}
        <AnimatePresence>
          {match.status === 'round_end' && (
            <motion.div key="round-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 flex items-center justify-center"
              style={{ background: 'rgba(2,0,8,0.92)', backdropFilter: 'blur(6px)' }}>
              <RoundEndPanel match={match} myId={myId} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Finished overlay ── */}
        <AnimatePresence>
          {isFinished && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 flex items-center justify-center"
              style={{ background: 'rgba(2,0,8,0.9)', backdropFilter: 'blur(6px)' }}>
              <div className="mx-4 w-full max-w-xs rounded-2xl overflow-hidden"
                style={{ background: 'rgba(20,10,40,0.98)', border: '1px solid rgba(155,0,255,0.4)' }}>
                <div className="px-5 py-4 border-b" style={{ borderColor: 'rgba(155,0,255,0.2)' }}>
                  <p className="font-mono text-[12px] uppercase tracking-widest text-white/30 text-center">{t.games.joker.finalScore}</p>
                  {winner && (
                    <p className="font-display text-xl font-bold text-center mt-1" style={{ color: '#00f5ff' }}>🏆 {winner.name}</p>
                  )}
                </div>
                <FinalStandings match={match} myId={myId} />
                <div className="px-4 pb-4 flex gap-2">
                  {isPlayer && (
                    <button onClick={rematch} disabled={isLoading}
                      className="flex-1 py-2.5 rounded-xl font-display font-semibold text-sm uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
                      style={{ background: 'linear-gradient(135deg,rgba(155,0,255,0.4),rgba(0,245,255,0.25))', border: '1px solid rgba(155,0,255,0.4)', color: '#fff' }}>
                      {t.games.joker.rematch}
                    </button>
                  )}
                  <button onClick={leaveMatch}
                    className="flex-1 py-2.5 rounded-xl font-mono text-sm text-white/50 border border-white/15 hover:text-white/80 transition-colors">
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
            <motion.div initial={{ opacity: 0, x: '100%' }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: '100%' }}
              className="absolute inset-y-0 right-0 z-10 w-64 overflow-y-auto"
              style={{ background: 'rgba(10,6,28,0.97)', borderLeft: '1px solid rgba(155,0,255,0.2)' }}>
              <ScoreboardPanel match={match} myId={myId} onClose={() => setShowScoreboard(false)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Chat ── */}
      <div className="flex-shrink-0 border-t" style={{ borderColor: 'rgba(155,0,255,0.12)', maxHeight: 110 }}>
        <div ref={chatRef} className="overflow-y-auto px-3 py-1 space-y-0.5" style={{ maxHeight: 72 }}>
          {match.chat.map((msg: any, i: number) => (
            <div key={i} className="flex gap-2 items-start">
              <span className="font-mono text-[12px] text-white/30 flex-shrink-0 mt-0.5">{msg.senderName}</span>
              <span className="font-mono text-[12px] text-white/60 break-words min-w-0">{msg.text}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2 px-3 pb-2">
          <input value={chatInput} onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleChatSend(); }}
            placeholder={t.games.joker.chatPlaceholder} maxLength={200}
            className="flex-1 bg-transparent font-mono text-xs text-white placeholder-white/20 outline-none border-b border-white/10 focus:border-white/30 transition-colors py-0.5" />
          <button onClick={handleChatSend} disabled={!chatInput.trim()}
            className="font-mono text-xs text-white/40 hover:text-white/70 transition-colors disabled:opacity-20">↵</button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

/**
 * A seat at the table: face, name, what they promised, what they have taken.
 *
 * The face is a button. Four names on a felt tell you nothing about who you are
 * playing with, and the profile is one tap away everywhere else in the app —
 * there is no reason a card table should be the exception.
 */
function Avatar({ player, size, onOpen }: {
  player: JokerPlayerPublic;
  size: number;
  onOpen?: () => void;
}) {
  const ring = player.isBot ? 'rgba(255,255,255,0.16)' : 'rgba(155,0,255,0.45)';
  return (
    <button
      onClick={onOpen}
      disabled={!onOpen}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
        border: `1.5px solid ${ring}`,
        background: 'linear-gradient(135deg, rgba(124,58,237,0.35), rgba(37,99,235,0.3))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.5, lineHeight: 1, padding: 0,
        cursor: onOpen ? 'pointer' : 'default',
      }}
    >
      {player.avatarUrl
        ? <img src={player.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span>{player.isBot ? '🤖' : (player.avatar || '🃏')}</span>}
    </button>
  );
}

function PlayerBadge({ player, match, myId, position, compact }: {
  player: JokerPlayerPublic | undefined;
  match: any; myId: string | null;
  position: 'top' | 'side' | 'bottom';
  compact?: boolean;
}) {
  const t = useT();
  const openProfile = useSocialStore(s => s.openProfile);
  if (!player) return <div style={{ width: position === 'side' ? 72 : undefined }} />;
  const openMe = player.profileId && !player.isBot
    ? () => { haptic('selection'); openProfile(player.profileId!); }
    : undefined;

  const isDealer   = player.seatIndex === match.currentDealerSeat;
  // The one who names the ხიშტი this deal — worth showing, it is a real edge.
  const isTrumpChooser = player.seatIndex === match.trumpChooserSeat && match.status === 'declaration';
  const declaration = match.declarations[player.id] ?? null;
  const taken       = match.tricksTaken[player.id] ?? 0;
  const isMyTurn    = match.currentPlaySeat === player.seatIndex && match.status === 'playing';
  const isDeclTurn  = match.currentDeclarationSeat === player.seatIndex && match.status === 'declaration';
  const isMe        = player.id === myId;
  const score       = match.scores[player.id] ?? 0;
  const cardCount   = player.cardCount;
  const isActive    = isMyTurn || isDeclTurn;

  const borderColor = isMyTurn ? 'rgba(0,245,255,0.55)' : isDeclTurn ? 'rgba(192,132,252,0.55)' : isMe ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.07)';
  const bgColor     = isActive ? (isMyTurn ? 'rgba(0,245,255,0.07)' : 'rgba(155,0,255,0.08)') : 'rgba(255,255,255,0.03)';
  const animClass   = isMyTurn ? 'jk-turn-active' : isDeclTurn ? 'jk-decl-active' : '';

  if (position === 'side') {
    // Compact vertical badge for left/right players
    return (
      <div
        className={animClass}
        style={{
          width: 72, padding: '6px 8px', borderRadius: 10,
          background: bgColor, border: `1px solid ${borderColor}`,
          display: 'flex', flexDirection: 'column', gap: 3,
          transition: 'border-color 0.3s',
        }}
      >
        {/* Face + name */}
        <div className="flex items-center gap-1.5">
          <Avatar player={player} size={22} onOpen={openMe} />
          <span className="font-mono text-[12px] text-white truncate" style={{ maxWidth: 40 }}>
            {player.name}
          </span>
        </div>
        {(isDealer || isTrumpChooser) && (
          <span className="font-mono text-[9px]" style={{ color: 'rgba(251,191,36,0.75)' }}>
            {isDealer ? '🎴 დამრიგებელი' : '👑 ხიშტი'}
          </span>
        )}
        {/* Score */}
        <span className="font-mono text-[12px] font-bold" style={{ color: score >= 0 ? '#00f5ff' : '#f87171' }}>
          {score >= 0 ? '+' : ''}{score}
        </span>
        {/* Declaration → taken */}
        {declaration !== null && (
          <span className="font-mono text-[12px] text-white/40">
            {declaration}→{taken}
          </span>
        )}
        {/* Card count dots */}
        <div className="flex gap-0.5 flex-wrap">
          {Array.from({ length: Math.min(cardCount, 8) }, (_, i) => (
            <div key={i} style={{ width: 5, height: 9, background: isActive ? (isMyTurn ? 'rgba(0,245,255,0.6)' : 'rgba(192,132,252,0.6)') : 'rgba(192,132,252,0.35)', borderRadius: 1.5 }} />
          ))}
          {cardCount > 8 && <span className="font-mono text-[12px] text-white/25">+{cardCount - 8}</span>}
        </div>
      </div>
    );
  }

  // Horizontal badge for top/bottom
  return (
    <div
      className={animClass}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '5px 10px', borderRadius: 10,
        background: bgColor, border: `1px solid ${borderColor}`,
        maxWidth: 260, transition: 'border-color 0.3s',
      }}
    >
      <Avatar player={player} size={position === 'bottom' ? 28 : 24} onOpen={openMe} />
      <div style={{ minWidth: 0 }}>
        <p className="font-mono text-[11px] text-white font-semibold truncate" style={{ maxWidth: 110 }}>
          {isDealer ? '🎴 ' : isTrumpChooser ? '👑 ' : ''}{player.name}{isMe ? ' ✦' : ''}
        </p>
        {!compact && declaration !== null && (
          <p className="font-mono text-[12px] text-white/40">
            {t.games.joker.declared}: {declaration} · {t.games.joker.taken}: {taken}
          </p>
        )}
      </div>
      <span className="font-mono text-[11px] font-bold flex-shrink-0" style={{ color: score >= 0 ? '#00f5ff' : '#f87171' }}>
        {score >= 0 ? '+' : ''}{score}
      </span>
      {/* Card count */}
      <div className="flex gap-0.5 flex-shrink-0">
        {Array.from({ length: Math.min(cardCount, 10) }, (_, i) => (
          <div key={i} style={{ width: 4, height: 10, background: isActive ? (isMyTurn ? 'rgba(0,245,255,0.65)' : 'rgba(192,132,252,0.65)') : 'rgba(192,132,252,0.3)', borderRadius: 1.5 }} />
        ))}
        {cardCount > 10 && <span className="font-mono text-[12px] text-white/25">+{cardCount - 10}</span>}
      </div>
    </div>
  );
}

function TrickArea({ match, seatedPlayers }: { match: any; seatedPlayers: JokerPlayerPublic[] }) {
  const t = useT();
  const trick = match.currentTrick as Array<{ playerId: string; seatIndex: number; card: Card }>;

  const seatToPos: Record<number, number> = {};
  seatedPlayers.forEach((p, idx) => { seatToPos[p.seatIndex] = idx; });

  const positions = ['bottom', 'left', 'top', 'right'] as const;

  // Card positions relative to felt center; placed with absolute + translate
  const posStyle: Record<string, React.CSSProperties> = {
    bottom: { bottom: '14%',  left: '50%', transform: 'translateX(-50%)' },
    left:   { left:   '14%',  top:  '50%', transform: 'translateY(-50%)' },
    top:    { top:    '14%',  left: '50%', transform: 'translateX(-50%)' },
    right:  { right:  '14%',  top:  '50%', transform: 'translateY(-50%)' },
  };

  const trumpSuit = match.trumpSuit as Suit | null;

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 160, position: 'relative' }}>
      {/* Felt */}
      <div style={{
        position: 'absolute', inset: 0,
        borderRadius: 18,
        background: 'radial-gradient(ellipse 90% 80% at 50% 45%, #0e5c24 0%, #07350f 55%, #031208 100%)',
        border: '1px solid rgba(10,160,60,0.18)',
        boxShadow: 'inset 0 0 60px rgba(0,0,0,0.65), inset 0 0 20px rgba(0,80,20,0.3), 0 4px 24px rgba(0,0,0,0.5)',
      }} />

      {/* ხიშტი — named by the first speaker, and true for the whole deal. */}
      <div style={{
        position: 'absolute', top: 8, right: 10, zIndex: 3,
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 20,
        background: 'rgba(0,0,0,0.45)',
        border: `1px solid ${trumpSuit ? 'rgba(251,191,36,0.45)' : 'rgba(255,255,255,0.12)'}`,
      }}>
        {trumpSuit && trumpSuit !== 'J'
          ? <>
              <span style={{ fontSize: 13, color: (trumpSuit === 'H' || trumpSuit === 'D') ? '#ff6b6b' : '#e2e8f0' }}>
                {SUIT_SYMBOL[trumpSuit]}
              </span>
              <span className="font-mono text-[10px] text-yellow-400/70">ხიშტი</span>
            </>
          : <span className="font-mono text-[10px] text-white/35">უხიშტოდ</span>}
      </div>

      {/* Round / phase indicator */}
      <div style={{
        position: 'absolute', top: 8, left: 10, zIndex: 3,
        padding: '2px 8px', borderRadius: 20,
        background: 'rgba(0,0,0,0.45)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}>
        <span className="font-mono text-[12px] text-white/35">
          {t.games.joker.round} {match.currentRoundIndex + 1}
          {match.pulkaIds?.[match.currentRoundIndex] ? ` · პულკა ${match.pulkaIds[match.currentRoundIndex]}` : ''}
        </span>
      </div>

      {/* Torn or stuffed — the shape of the whole hand, in one line. */}
      {match.bidTension && match.status !== 'declaration' && (
        <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 3 }}>
          <TensionChip tension={match.bidTension} cardCount={match.roundPlan[match.currentRoundIndex] ?? 0} compact />
        </div>
      )}

      {/* Played cards */}
      {trick.map((pc) => {
        const posIdx = seatToPos[pc.seatIndex] ?? 0;
        const pos = positions[posIdx];
        return (
          <div key={`${pc.playerId}-${cardKey(pc.card)}`}
            style={{ position: 'absolute', zIndex: 4, ...posStyle[pos] }}>
            <JokerCard card={pc.card} size="md" trump={!!trumpSuit && pc.card.suit === trumpSuit} animate />
          </div>
        );
      })}

      {/* Empty table prompt */}
      {trick.length === 0 && match.status === 'playing' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
          <p className="font-mono text-[12px] text-white/15">{t.games.joker.playCard}</p>
        </div>
      )}
    </div>
  );
}

// ── Fan hand layout ────────────────────────────────────────────────────────

const HAND_W = 72;
const HAND_H = 108;

function HandFan({ cards, playableSet, isMyTurn, selectedCard, trumpSuit, onCardClick }: {
  cards: Card[];
  playableSet: Set<string>;
  isMyTurn: boolean;
  selectedCard: Card | null;
  trumpSuit: Suit | null;
  onCardClick: (card: Card) => void;
}) {
  if (cards.length === 0) return null;

  const n = cards.length;
  // Overlap shrinks as hand gets bigger so it always fits in ~340px
  const maxWidth = Math.min(340, window.innerWidth - 32);
  const overlap = n <= 1 ? 0 : Math.min(42, Math.floor((maxWidth - HAND_W) / (n - 1)));
  const totalW = (n - 1) * overlap + HAND_W;

  return (
    <div style={{ position: 'relative', height: HAND_H + 18, width: totalW, margin: '0 auto' }}>
      {cards.map((card, i) => {
        const key = cardKey(card);
        const isSelected = selectedCard ? cardKey(selectedCard) === key : false;
        const isPlayable = playableSet.has(key);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: i * overlap,
              bottom: isSelected ? 18 : 0,
              zIndex: isSelected ? n + 2 : i + 1,
              transition: 'bottom 0.15s ease',
              filter: isMyTurn && !isPlayable && !isSelected ? 'brightness(0.55)' : 'none',
            }}
          >
            <JokerCard
              card={card}
              selected={isSelected}
              playable={isMyTurn && isPlayable}
              trump={!!trumpSuit && card.suit === trumpSuit}
              disabled={false}
              size="lg"
              onClick={() => onCardClick(card)}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Declaration panel ──────────────────────────────────────────────────────

const TRUMP_CHOICES: Array<{ suit: Suit | null; label: string; color: string }> = [
  { suit: 'S', label: '♠', color: '#e2e8f0' },
  { suit: 'H', label: '♥', color: '#ff6b6b' },
  { suit: 'D', label: '♦', color: '#ff6b6b' },
  { suit: 'C', label: '♣', color: '#e2e8f0' },
  { suit: null, label: 'უხიშტოდ', color: 'rgba(255,255,255,0.65)' },
];

/**
 * Naming your word — and, if you speak first, the ხიშტი with it.
 *
 * Two rules are visible here rather than hidden in a rejection:
 *   • the first speaker of the deal owns the trump suit for everybody;
 *   • the last speaker may not make the bids add up to the cards dealt, so that
 *     one number is struck out on their pad rather than refused after the tap.
 */
function DeclarationPanel({ cardCount, forbidden, isTrumpChooser, sumSoFar, onDeclare }: {
  cardCount: number;
  forbidden: number | null;
  isTrumpChooser: boolean;
  sumSoFar: number;
  onDeclare: (n: number, trump?: Suit | null) => void;
}) {
  const t = useT();
  const [trump, setTrump] = useState<Suit | null>(null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
      className="mb-2"
    >
      <div style={{ borderRadius: 14, padding: '10px 12px', background: 'rgba(155,0,255,0.07)', border: '1px solid rgba(155,0,255,0.28)' }}>

        {isTrumpChooser && (
          <>
            <p className="font-mono text-[11px] text-white/40 mb-1.5 text-center">
              შენ ირჩევ ხიშტს — მთელი დარიგებისთვის
            </p>
            <div className="flex gap-1.5 justify-center mb-2.5 flex-wrap">
              {TRUMP_CHOICES.map(c => {
                const on = trump === c.suit;
                return (
                  <button key={c.label} onClick={() => { haptic('selection'); setTrump(c.suit); }}
                    className="px-2.5 h-9 rounded-xl font-display font-bold transition-all active:scale-90"
                    style={{
                      minWidth: c.suit ? 38 : undefined,
                      fontSize: c.suit ? 18 : 11,
                      background: on ? 'rgba(251,191,36,0.22)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${on ? 'rgba(251,191,36,0.75)' : 'rgba(255,255,255,0.12)'}`,
                      color: on ? '#fbbf24' : c.color,
                    }}>
                    {c.label}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <p className="font-mono text-[12px] text-white/50 mb-1 text-center uppercase tracking-widest jk-decl-active"
          style={{ display: 'inline-block', width: '100%', padding: '2px 0' }}>
          {t.games.joker.howManyTricks}
        </p>
        <p className="font-mono text-[10.5px] text-white/30 mb-2 text-center">
          გამოცხადებული: {sumSoFar} / {cardCount}
          {forbidden !== null && <span style={{ color: '#f0a5a5' }}> · {forbidden} აკრძალულია</span>}
        </p>

        <div className="flex gap-2 flex-wrap justify-center">
          {Array.from({ length: cardCount + 1 }, (_, n) => {
            const barred = forbidden === n;
            return (
              <button key={n} onClick={() => { if (!barred) onDeclare(n, isTrumpChooser ? trump : undefined); }}
                disabled={barred}
                className="w-10 h-10 rounded-xl font-display font-bold text-sm transition-all active:scale-90"
                style={{
                  background: barred ? 'rgba(255,255,255,0.02)'
                    : n === 0 ? 'rgba(255,255,255,0.06)'
                    : 'linear-gradient(135deg,rgba(155,0,255,0.3),rgba(0,245,255,0.18))',
                  border: `1px solid ${barred ? 'rgba(255,255,255,0.06)' : 'rgba(155,0,255,0.4)'}`,
                  color: barred ? 'rgba(255,255,255,0.15)' : '#fff',
                  textDecoration: barred ? 'line-through' : 'none',
                  boxShadow: barred ? 'none' : '0 2px 8px rgba(0,0,0,0.3)',
                }}>
                {n}
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Where the deal stands before a card is played: over-called means somebody
 * loses a trick they promised (წაგლეჯვა), under-called means somebody is handed
 * one they did not want (შეტენვა). Announced, because the whole hand is played
 * differently depending on which it is.
 */
export function TensionChip({ tension, cardCount, compact }: {
  tension: { sum: number; diff: number; kind: 'tear' | 'stuff' | 'even' };
  cardCount: number;
  compact?: boolean;
}) {
  const { sum, diff, kind } = tension;
  const label = kind === 'tear' ? 'წაგლეჯვა' : kind === 'stuff' ? 'შეტენვა' : 'თანაბარი';
  const color = kind === 'tear' ? '#ff8a92' : kind === 'stuff' ? '#7fe0a0' : 'rgba(255,255,255,0.5)';
  return (
    <span className="font-mono" style={{
      fontSize: compact ? 10 : 11, color,
      padding: '2px 8px', borderRadius: 20,
      background: 'rgba(0,0,0,0.4)', border: `1px solid ${color}44`,
      whiteSpace: 'nowrap',
    }}>
      {label} {diff > 0 ? `+${diff}` : diff < 0 ? diff : ''} · {sum}/{cardCount}
    </span>
  );
}

function DeclarationProgress({ match }: { match: any }) {
  const t = useT();
  return (
    <div className="flex gap-3 justify-center mt-1 flex-wrap">
      {match.players.map((p: JokerPlayerPublic) => {
        const decl = match.declarations[p.id];
        return (
          <div key={p.id} className="flex items-center gap-1">
            <span className="font-mono text-[12px] text-white/30">{p.name}:</span>
            <span className="font-mono text-[12px] font-bold"
              style={{ color: decl !== null && decl !== undefined ? '#00f5ff' : 'rgba(255,255,255,0.2)' }}>
              {decl !== null && decl !== undefined ? decl : '?'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Round end panel ────────────────────────────────────────────────────────

function RoundEndPanel({ match, myId }: { match: any; myId: string | null }) {
  const t = useT();
  const lastResult = match.roundHistory[match.roundHistory.length - 1];
  if (!lastResult) return null;
  return (
    <div className="mx-4 w-full max-w-xs rounded-2xl overflow-hidden"
      style={{ background: 'rgba(20,10,40,0.98)', border: '1px solid rgba(155,0,255,0.4)' }}>
      <div className="px-5 py-3 border-b" style={{ borderColor: 'rgba(155,0,255,0.2)' }}>
        <p className="font-mono text-[12px] uppercase tracking-widest text-white/30 text-center">{t.games.joker.roundResults}</p>
        <p className="font-display text-base font-bold text-center mt-0.5" style={{ color: '#c084fc' }}>
          {t.games.joker.round} {lastResult.roundIndex + 1} · {lastResult.cardCount}🃏
          {lastResult.pulkaId !== null ? ` · პულკა ${lastResult.pulkaId}` : ''}
          {lastResult.trumpSuit ? ` · ხიშტი ${SUIT_SYMBOL[lastResult.trumpSuit as Suit]}` : ' · უხიშტოდ'}
        </p>
      </div>
      <div className="px-4 py-3">
        <div className="flex items-center gap-1 mb-2 px-1">
          <span className="font-mono text-[12px] text-white/25 flex-1">{t.games.joker.players}</span>
          <span className="font-mono text-[12px] text-white/25 w-8 text-center">{t.games.joker.declared}</span>
          <span className="font-mono text-[12px] text-white/25 w-8 text-center">{t.games.joker.taken}</span>
          <span className="font-mono text-[12px] text-white/25 w-10 text-right">{t.games.joker.pts}</span>
        </div>
        <div className="space-y-1">
          {match.players.map((p: any) => {
            const decl = lastResult.declarations[p.id] ?? '?';
            const took = lastResult.taken[p.id] ?? 0;
            const pts  = lastResult.points[p.id] ?? 0;
            const khishti = lastResult.khishtiPlayers.includes(p.id);
            const isMe = p.id === myId;
            return (
              <div key={p.id} className="flex items-center gap-1 px-2 py-1.5 rounded-lg"
                style={{ background: isMe ? 'rgba(0,245,255,0.05)' : 'rgba(255,255,255,0.02)', border: `1px solid ${isMe ? 'rgba(0,245,255,0.15)' : 'transparent'}` }}>
                <span className={`font-mono text-[12px] flex-1 truncate ${isMe ? 'text-white' : 'text-white/55'}`}>{p.name}{isMe ? ' ✦' : ''}</span>
                <span className="font-mono text-[12px] text-white/40 w-8 text-center">{decl}</span>
                <span className="font-mono text-[12px] text-white/40 w-8 text-center">{took}</span>
                <span className="font-mono text-[12px] font-bold w-10 text-right" style={{ color: pts > 0 ? '#00f5ff' : 'rgba(255,255,255,0.35)' }}>
                  {pts > 0 ? '+' : ''}{pts}{khishti ? ' ⚡' : ''}
                </span>
              </div>
            );
          })}
        </div>
        {/* პრემია — settled when the column is finished, so it belongs here. */}
        {(Object.keys(lastResult.premiumPlayers ?? {}).length > 0 ||
          Object.keys(lastResult.premiumPenalties ?? {}).length > 0) && (
          <div className="mt-2 rounded-xl px-2.5 py-2" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)' }}>
            <p className="font-mono text-[10px] uppercase tracking-widest mb-1" style={{ color: '#fbbf24' }}>
              🎉 პრემია · პულკა {lastResult.pulkaId}
            </p>
            {match.players.map((p: any) => {
              const plus = lastResult.premiumPlayers?.[p.id] ?? 0;
              const minus = lastResult.premiumPenalties?.[p.id] ?? 0;
              if (!plus && !minus) return null;
              return (
                <p key={p.id} className="font-mono text-[11px]" style={{ color: plus ? '#7fe0a0' : '#ff8a92' }}>
                  {p.name}: {plus ? `+${plus} (საუკეთესო დარიგება გაორმაგდა)` : `−${minus} (საუკეთესო დარიგება ჩამოეშალა)`}
                </p>
              );
            })}
          </div>
        )}

        <div className="mt-2 pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          {[...match.players]
            .sort((a: any, b: any) => (match.scores[b.id] ?? 0) - (match.scores[a.id] ?? 0))
            .map((p: any, i: number) => (
              <div key={p.id} className="flex items-center gap-2 py-0.5">
                <span className="font-mono text-[12px] text-white/25 w-3">{i + 1}</span>
                <span className={`font-mono text-[12px] flex-1 truncate ${p.id === myId ? 'text-white' : 'text-white/45'}`}>{p.name}</span>
                <span className="font-mono text-xs font-bold" style={{ color: (match.scores[p.id] ?? 0) >= 0 ? '#00f5ff' : '#f87171' }}>
                  {match.scores[p.id] ?? 0}
                </span>
              </div>
            ))}
        </div>
      </div>
      <div className="px-4 pb-3 text-center">
        <p className="font-mono text-[12px] text-white/25 animate-pulse">{t.games.joker.nextRoundSoon}</p>
      </div>
    </div>
  );
}

// ── Final standings ────────────────────────────────────────────────────────

const MEDALS = ['🥇', '🥈', '🥉', ''];

/**
 * The table at the end of the night.
 *
 * Not just a total: the number people argue about afterwards is how the pulkas
 * went — who took a premium, who was left with a ხიშტი — so those are on the
 * card too, and they arrive one row at a time rather than all at once.
 */
function FinalStandings({ match, myId }: { match: any; myId: string | null }) {
  const ranked = [...match.players].sort(
    (a: JokerPlayerPublic, b: JokerPlayerPublic) => (match.scores[b.id] ?? 0) - (match.scores[a.id] ?? 0),
  );
  const history = (match.roundHistory ?? []) as any[];
  const premiums = (id: string) => history.filter(r => (r.premiumPlayers?.[id] ?? 0) > 0).length;
  const khishtis = (id: string) => history.filter(r => (r.khishtiPlayers ?? []).includes(id)).length;
  const best = (id: string) => Math.max(0, ...history.map(r => r.points?.[id] ?? 0));

  return (
    <div className="px-4 py-3 space-y-1.5">
      {ranked.map((p: JokerPlayerPublic, i: number) => {
        const isMe = p.id === myId;
        const score = match.scores[p.id] ?? 0;
        return (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.12 * i, type: 'spring', stiffness: 320, damping: 26 }}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl"
            style={{
              background: isMe ? 'rgba(0,245,255,0.06)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${i === 0 ? 'rgba(251,191,36,0.4)' : isMe ? 'rgba(0,245,255,0.18)' : 'transparent'}`,
            }}
          >
            <span style={{ fontSize: 15, width: 20 }}>{MEDALS[i] || `${i + 1}.`}</span>
            <Avatar player={p} size={26} />
            <div className="min-w-0 flex-1">
              <p className={`font-mono text-[13px] truncate ${isMe ? 'text-white' : 'text-white/70'}`}>
                {p.name}{isMe ? ' ✦' : ''}
              </p>
              <p className="font-mono text-[9.5px] text-white/30">
                საუკ. დარიგება {best(p.id)}
                {premiums(p.id) > 0 ? ` · 🎉 ${premiums(p.id)}` : ''}
                {khishtis(p.id) > 0 ? ` · ⚡ ${khishtis(p.id)}` : ''}
              </p>
            </div>
            <span className="font-mono text-[15px] font-bold"
              style={{ color: score >= 0 ? '#00f5ff' : '#f87171' }}>
              {score}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Scoreboard panel ───────────────────────────────────────────────────────

function ScoreboardPanel({ match, myId, onClose }: { match: any; myId: string | null; onClose: () => void }) {
  const t = useT();
  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <p className="font-display font-bold text-white text-sm">{t.games.joker.score}</p>
        <button onClick={onClose} className="text-white/40 hover:text-white/70 text-sm">✕</button>
      </div>
      <div className="space-y-1 mb-4">
        {[...match.players]
          .sort((a: any, b: any) => (match.scores[b.id] ?? 0) - (match.scores[a.id] ?? 0))
          .map((p: any, i: number) => (
            <div key={p.id} className="flex items-center gap-2 py-1 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <span className="font-mono text-[12px] text-white/30 w-3">{i + 1}</span>
              <span className={`font-mono text-xs flex-1 truncate ${p.id === myId ? 'text-white' : 'text-white/50'}`}>{p.name}</span>
              <span className="font-mono text-sm font-bold" style={{ color: (match.scores[p.id] ?? 0) >= 0 ? '#00f5ff' : '#f87171' }}>
                {match.scores[p.id] ?? 0}
              </span>
            </div>
          ))}
      </div>
      <p className="font-mono text-[12px] uppercase tracking-widest text-white/25 mb-2">{t.games.joker.roundHistory}</p>
      <div className="space-y-2">
        {match.roundHistory.map((r: any) => (
          <div key={r.roundIndex} className="rounded-lg px-2 py-1.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="font-mono text-[12px] text-white/30 mb-1">
              {t.games.joker.round} {r.roundIndex + 1} · {r.cardCount}🃏
              {r.pulkaId !== null ? ` · პულკა ${r.pulkaId}` : ''}
              {r.trumpSuit ? ` · ხიშტი ${SUIT_SYMBOL[r.trumpSuit as Suit]}` : ' · უხიშტოდ'}
            </p>
            <div className="space-y-0.5">
              {match.players.map((p: any) => {
                const decl = r.declarations[p.id] ?? '?';
                const taken = r.taken[p.id] ?? 0;
                const pts = r.points[p.id] ?? 0;
                const khishti = r.khishtiPlayers.includes(p.id);
                const bonus = r.premiumPlayers?.[p.id] ?? 0;
                const erased = r.premiumPenalties?.[p.id] ?? 0;
                return (
                  <div key={p.id} className="flex items-center gap-1">
                    <span className="font-mono text-[12px] text-white/40 w-14 truncate">{p.name}</span>
                    <span className="font-mono text-[12px] text-white/30">{decl}→{taken}</span>
                    <span className="font-mono text-[12px] ml-auto" style={{ color: pts >= 0 ? 'rgba(0,245,255,0.7)' : '#f87171' }}>
                      {pts > 0 ? '+' : ''}{pts}{khishti ? ` ${tNow().misc.khishtiAbbr}` : ''}{bonus > 0 ? ` +${bonus}🎉` : ''}{erased > 0 ? ` −${erased}` : ''}
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

// ── Waiting room ───────────────────────────────────────────────────────────

function WaitingRoom({ match, isCreator, onStart, isLoading }: {
  match: any; isCreator: boolean; onStart: () => void; isLoading: boolean;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
      <div className="w-20 h-20 rounded-full flex items-center justify-center text-4xl"
        style={{ background: 'rgba(155,0,255,0.08)', border: '2px solid rgba(155,0,255,0.2)' }}>
        🃏
      </div>
      <div className="text-center">
        <p className="font-mono text-sm text-white/60">{match.players.length}/4 {t.games.joker.players}</p>
        <p className="font-mono text-xs text-white/30 mt-1">{t.games.joker.waitingFor4}</p>
      </div>
      <div className="w-full max-w-xs space-y-1">
        {Array.from({ length: 4 }, (_, i) => {
          const p = match.players.find((pl: any) => pl.seatIndex === i);
          return (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
              style={{ background: p ? 'rgba(155,0,255,0.08)' : 'rgba(255,255,255,0.02)', border: `1px solid ${p ? 'rgba(155,0,255,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
              <span className="font-mono text-[12px] text-white/30 w-4">{i + 1}</span>
              {p
                ? <Avatar player={p} size={26} onOpen={p.profileId ? () => useSocialStore.getState().openProfile(p.profileId!) : undefined} />
                : <div style={{ width: 26, height: 26, borderRadius: '50%', border: '1px dashed rgba(255,255,255,0.12)' }} />}
              <span className={`font-mono text-xs ${p ? 'text-white' : 'text-white/20'}`}>
                {p ? `${p.name}${i === 0 ? ' 👑' : ''}` : '—'}
              </span>
            </div>
          );
        })}
      </div>
      <button
        onClick={() => { navigator.clipboard?.writeText(match.code).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        className="flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-sm transition-all active:scale-95"
        style={{ border: '1px solid rgba(155,0,255,0.4)', background: 'rgba(155,0,255,0.08)', color: '#c084fc' }}>
        <span>{match.code}</span>
        <span className="text-xs opacity-60">{copied ? '✓' : '⎘'}</span>
      </button>
      {/* A code only reaches whoever is already listening. */}
      <GameInviteButton game="joker" code={match.code} />
      {isCreator && match.players.length === 4 && (
        <button onClick={onStart} disabled={isLoading}
          className="px-8 py-3 rounded-xl font-display font-bold text-sm uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg,rgba(155,0,255,0.5),rgba(0,245,255,0.3))', border: '1px solid rgba(155,0,255,0.5)', color: '#fff', boxShadow: '0 0 20px rgba(155,0,255,0.2)' }}>
          {t.games.joker.startGame}
        </button>
      )}
    </div>
  );
}
