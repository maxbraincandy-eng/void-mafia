import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useT } from '@/store/langStore';
import { useJokerStore } from '@/store/jokerStore';
import { useJokerVoice } from '@/hooks/useJokerVoice';
import { useAuthStore } from '@/store/authStore';
import { useLiveKitGate, useLivekitRoomVoice } from '@/hooks/useLivekitVoice';
import { LiveKitVoiceBarView } from '@/components/game/LiveKitVoiceBar';
import { VoiceDisguiseButton } from '@/components/game/VoiceDisguiseButton';
import { JokerCard } from './JokerCard';
import { SUIT_NAME, KHISHTI_PENALTIES, type Card, type JokerPlayerPublic, type Suit } from '@/types/joker';
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
  // MEASURED, not 100vh. On a phone browser 100vh is the height WITHOUT the
  // address bar, so a rotated surface built from it hangs past the bottom of
  // the screen and the page scrolls sideways to reach the rest — which is
  // exactly what going landscape used to do here.
  const [vp, setVp] = useState(() => ({
    w: typeof window === 'undefined' ? 0 : window.innerWidth,
    h: typeof window === 'undefined' ? 0 : window.innerHeight,
  }));

  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)');
    const onChange = (e: MediaQueryListEvent) => setDeviceLandscape(e.matches);
    const measure = () => {
      const vv = window.visualViewport;
      setVp({
        w: Math.round(vv?.width ?? window.innerWidth),
        h: Math.round(vv?.height ?? window.innerHeight),
      });
    };
    measure();
    mq.addEventListener('change', onChange);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      mq.removeEventListener('change', onChange);
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
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

  // While the surface is rotated the document must not scroll at all: any
  // scroll would move the page under a turned view, which reads as the screen
  // sliding away sideways.
  useEffect(() => {
    if (!rotate) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, [rotate]);

  const style: React.CSSProperties = rotate
    ? {
        position: 'fixed', top: 0, left: 0,
        width: vp.h, height: vp.w,          // measured, in pixels
        transform: 'rotate(90deg) translateY(-100%)',
        transformOrigin: 'top left',
        overflow: 'hidden',
      }
    : {};

  // What the game actually has to lay out into, whichever way round we are.
  const surface = rotate ? { w: vp.h, h: vp.w } : vp;
  return { want, rotate, style, surface, toggle };
}

export function JokerGame() {
  const t = useT();
  const {
    match, myHand, selectedCard,
    startMatch, declare: declareAction, playCard, resign, rematch, leaveMatch, sendChat, selectCard,
    isLoading,
  } = useJokerStore();

  const [chatInput, setChatInput] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [jokerPendingCard, setJokerPendingCard] = useState<Card | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  const chatLen = match?.chat?.length ?? 0;
  const seenChat = useRef(0);
  useEffect(() => {
    if (showChat) {
      seenChat.current = chatLen;
      setUnreadChat(0);
      if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
    } else {
      setUnreadChat(Math.max(0, chatLen - seenChat.current));
    }
  }, [chatLen, showChat]);

  // ── Voice (must be before conditional return) ──────────────────────
  /*
   * The same voice every other table in the app uses: one LiveKit room per
   * match, joined for as long as the match is live, with the verified voice
   * changer beside it. ჯოკერი was still on the old push-to-talk mesh, which is
   * why it simply did not work here.
   *
   * The mesh is kept as the fallback for a server with no LiveKit configured —
   * and only ever joined then, or the microphone would be captured twice.
   */
  const { enabled: livekitEnabled, resolved: livekitResolved } = useLiveKitGate();
  const profile = useAuthStore(s => s.profile);
  const voice = useJokerVoice();
  const jokerMatchId = match?.id;
  const jokerIsPlayer = match?.myPlayerId !== null && match?.myPlayerId !== undefined;

  const lkVoice = useLivekitRoomVoice({
    roomId: jokerMatchId ? `joker_${jokerMatchId}` : null,
    identity: profile?.id ?? null,
    active: livekitEnabled && !!jokerMatchId && match?.status !== 'finished',
    listenOnly: !jokerIsPlayer,
  });

  useEffect(() => {
    if (!jokerMatchId || livekitEnabled || !livekitResolved) return;
    if (jokerIsPlayer) voice.joinVoice(jokerMatchId);
    else voice.joinListen(jokerMatchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jokerMatchId, livekitEnabled, livekitResolved]);

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

  // How much room the table actually has. Sideways on a phone the height is
  // the phone's WIDTH, so the same layout has to hold in ~390px — hence one
  // switch here rather than guesses scattered through the markup.
  const tight = orientation.surface.h < 560;
  // A tall phone can afford full-size cards on the felt; a short one cannot.
  const feltCardSize = tight ? 'md' : orientation.surface.h >= 760 ? 'xl' : 'lg';
  const handCardSize = tight ? 'md' : 'xl';
  const handMaxWidth = Math.max(240, Math.min(460, orientation.surface.w - 24));

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
        {/* One line, never two. The old header wrapped the moment a mode name
            and a round counter shared a phone's width with four buttons. */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-lg flex-shrink-0">🃏</span>
          <div className="min-w-0">
            <p className="font-display font-bold text-white leading-tight truncate" style={{ fontSize: 14 }}>
              {t.games.joker.title}
            </p>
            <p className="font-mono text-white/30 truncate" style={{ fontSize: 11 }}>
              {match.status === 'waiting'
                ? match.code
                : `${t.games.joker.round} ${match.currentRoundIndex + 1}/${match.totalRounds} · ${cardCount}🃏`}
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
          {/* Chat lives behind a button now: on a phone it was eating a
              hundred pixels of felt to show two lines nobody was reading. */}
          <button onClick={() => setShowChat(c => !c)}
            className="font-mono text-[15px] w-11 h-11 rounded border transition-colors flex items-center justify-center relative"
            style={{
              color: showChat ? '#c084fc' : 'rgba(255,255,255,0.35)',
              borderColor: showChat ? 'rgba(192,132,252,0.45)' : 'rgba(255,255,255,0.1)',
            }}>
            💬
            {!showChat && unreadChat > 0 && (
              <span style={{
                position: 'absolute', top: 4, right: 4, width: 7, height: 7,
                borderRadius: '50%', background: '#c084fc',
              }} />
            )}
          </button>
          {match.status !== 'waiting' && (
            <button onClick={() => setShowScoreboard(s => !s)}
              title={t.games.joker.score}
              className="font-mono text-[15px] text-white/40 hover:text-white/70 w-11 h-11 rounded border border-white/10 hover:border-white/25 transition-colors flex items-center justify-center">
              📊
            </button>
          )}
          {isPlayer && match.status === 'playing' && (
            <button onClick={resign}
              title={t.games.joker.resign}
              className="font-mono text-[15px] text-red-400/55 hover:text-red-400 w-11 h-11 rounded border border-red-500/15 hover:border-red-500/35 transition-colors flex items-center justify-center">
              🏳
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
          <WaitingRoom
            match={match} isCreator={isCreator} onStart={startMatch} isLoading={isLoading}
            voiceSlot={livekitEnabled ? (
              <div className="flex flex-col gap-2">
                <LiveKitVoiceBarView voice={lkVoice} />
                <div className="flex"><VoiceDisguiseButton /></div>
              </div>
            ) : null}
          />
        )}

        {/* ── Active game ── */}
        {match.status !== 'waiting' && !isFinished && (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">

            {/* Voice — the bar and the changer, exactly as the other tables
                have it. Sideways there is no room for a full-width bar, so the
                mic and the changer move down beside my own seat instead. */}
            {livekitEnabled && !tight && (
              <div className="px-3 pt-1.5 flex-shrink-0 flex flex-wrap items-center gap-2">
                <div className="flex-1" style={{ minWidth: 150 }}><LiveKitVoiceBarView voice={lkVoice} /></div>
                <VoiceDisguiseButton />
              </div>
            )}

            {/* The table, with the three other seats sitting ON its edges.
                Giving each of them a column of its own used to cost the felt a
                third of the screen — and the felt is the game. */}
            <div className="flex-1 min-h-0 relative px-1 py-1">
              <TrickArea match={match} seatedPlayers={seatedPlayers} cardSize={feltCardSize} minHeight={tight ? 150 : 210} />

              {/* Centred over the felt when there is height for it; tucked into
                  the corner when there is not, because a short felt puts the
                  played cards exactly where that badge would sit. */}
              <div
                className="absolute z-10"
                style={tight
                  ? { top: 4, left: 8 }
                  : { top: 4, left: '50%', transform: 'translateX(-50%)' }}
              >
                <PlayerBadge player={seatedPlayers[2]} match={match} myId={myId} position="top" compact={tight} />
              </div>
              <div className="absolute z-10" style={{ left: 4, top: '50%', transform: 'translateY(-50%)' }}>
                <PlayerBadge player={seatedPlayers[1]} match={match} myId={myId} position="side" />
              </div>
              <div className="absolute z-10" style={{ right: 4, top: '50%', transform: 'translateY(-50%)' }}>
                <PlayerBadge player={seatedPlayers[3]} match={match} myId={myId} position="side" />
              </div>
            </div>

            {/* ── Bottom section: declaration + hand ── */}
            <div
              className="flex-shrink-0 px-2"
              style={{ paddingBottom: `calc(${tight ? 2 : 8}px + env(safe-area-inset-bottom, 0px))` }}
            >

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

              {/* My own seat, with the mic beside it. Sideways there is no room
                  for a full-width talk button, but there is always room for a
                  thumb-sized one next to my own name. */}
              {isPlayer && (
                <div className="flex items-center gap-2">
                  <PlayerBadge player={seatedPlayers[0]} match={match} myId={myId} position="bottom" compact={tight} />
                  {livekitEnabled && tight && !isFinished && (
                    <>
                      <button
                        onClick={() => lkVoice.toggleMic()}
                        className="rounded-full font-mono text-[13px] transition-all active:scale-95 flex items-center justify-center flex-shrink-0"
                        style={{
                          width: 34, height: 34,
                          background: lkVoice.micEnabled ? 'rgba(0,245,255,0.2)' : 'rgba(255,255,255,0.05)',
                          border: `1px solid ${lkVoice.micEnabled ? 'rgba(0,245,255,0.6)' : 'rgba(255,255,255,0.14)'}`,
                          color: lkVoice.micEnabled ? '#00f5ff' : 'rgba(255,255,255,0.45)',
                        }}
                      >{lkVoice.micEnabled ? '🎙' : '🔇'}</button>
                      <VoiceDisguiseButton compact />
                    </>
                  )}
                  {!isFinished && !livekitEnabled && voice.joined && tight && (
                    <button
                      onPointerDown={handlePttStart}
                      onPointerUp={handlePttStop}
                      onPointerLeave={handlePttStop}
                      className="rounded-full font-mono text-[13px] transition-all active:scale-95 select-none flex items-center justify-center"
                      style={{
                        width: 34, height: 34, flexShrink: 0, touchAction: 'none',
                        background: voice.isTalking ? 'rgba(168,85,247,0.35)' : 'rgba(168,85,247,0.1)',
                        border: `1px solid ${voice.isTalking ? 'rgba(168,85,247,0.8)' : 'rgba(168,85,247,0.28)'}`,
                        color: voice.isTalking ? '#fff' : 'rgba(168,85,247,0.7)',
                      }}
                    >🎙</button>
                  )}
                </div>
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
                    size={handCardSize}
                    maxWidth={handMaxWidth}
                    onCardClick={handleCardClick}
                  />
                  {myHand.length === 0 && match.status === 'playing' && (
                    <p className="font-mono text-xs text-white/20 text-center py-3">{t.games.joker.noCards}</p>
                  )}
                </div>
              )}

              {/* Turn status text */}
              {isPlayer && isMyPlayTurn && !tight && (
                <p className={`text-center font-mono text-[11px] mt-1.5 tracking-wider ${selectedCard ? 'text-yellow-400/80' : 'text-cyan-400 jk-my-turn-text'}`}
                  style={{ textShadow: selectedCard ? 'none' : '0 0 10px rgba(0,245,255,0.5)' }}>
                  {selectedCard ? `▶ ${t.games.joker.tapAgainToPlay}` : `▶ ${t.games.joker.yourTurn}`}
                </p>
              )}

              {/* PTT button */}
              {isPlayer && !isFinished && !livekitEnabled && voice.joined && !tight && (
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
                  <p className="font-mono text-[12px] uppercase tracking-widest text-white/30 text-center">
                    {match.dissolved ? 'მაგიდა დაიხურა' : t.games.joker.finalScore}
                  </p>
                  {/* A table that broke up did not have a winner, and saying it
                      did would be a lie about the game they just played. */}
                  {match.dissolved
                    ? <p className="font-display text-[15px] font-bold text-center mt-1" style={{ color: '#ff8a92' }}>🚪 ჰოსტმა დატოვა თამაში</p>
                    : winner && <p className="font-display text-xl font-bold text-center mt-1" style={{ color: '#00f5ff' }}>🏆 {winner.name}</p>}
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

      {/* ── Chat drawer ── */}
      <AnimatePresence>
        {showChat && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="flex-shrink-0 border-t overflow-hidden"
            style={{ borderColor: 'rgba(155,0,255,0.12)', background: 'rgba(8,4,22,0.98)' }}
          >
            <div ref={chatRef} className="overflow-y-auto px-3 py-1.5 space-y-0.5" style={{ maxHeight: 108 }}>
              {match.chat.length === 0 && (
                <p className="font-mono text-[11px] text-white/20 text-center py-2">…</p>
              )}
              {match.chat.map((msg: any, i: number) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="font-mono text-[12px] text-white/30 flex-shrink-0 mt-0.5">{msg.senderName}</span>
                  <span className="font-mono text-[12px] text-white/60 break-words min-w-0">{msg.text}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 px-3 pb-2.5 items-center">
              <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleChatSend(); }}
                placeholder={t.games.joker.chatPlaceholder} maxLength={200}
                className="flex-1 min-w-0 font-mono text-white placeholder-white/25 outline-none transition-colors"
                style={{
                  fontSize: 13, padding: '9px 14px', borderRadius: 999,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }} />
              {/* A filled circle with an arrow in it. The old one was a bare
                  "↵" that nobody read as a button at all. */}
              <button onClick={handleChatSend} disabled={!chatInput.trim()}
                aria-label="გაგზავნა"
                className="rounded-full flex items-center justify-center transition-all active:scale-90 disabled:opacity-30 flex-shrink-0"
                style={{
                  width: 34, height: 34,
                  background: chatInput.trim() ? 'linear-gradient(135deg,#9b00ff,#00e5ff)' : 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(155,0,255,0.35)',
                  color: '#fff', fontSize: 14,
                }}>➤</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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

function TrickArea({ match, seatedPlayers, cardSize = 'md', minHeight = 190 }: {
  match: any; seatedPlayers: JokerPlayerPublic[]; cardSize?: 'md' | 'lg' | 'xl'; minHeight?: number;
}) {
  const t = useT();
  const trick = match.currentTrick as Array<{ playerId: string; seatIndex: number; card: Card }>;

  const seatToPos: Record<number, number> = {};
  seatedPlayers.forEach((p, idx) => { seatToPos[p.seatIndex] = idx; });

  const positions = ['bottom', 'left', 'top', 'right'] as const;

  /*
   * The four cards sit in a cross AROUND THE MIDDLE of the felt.
   *
   * Measured rather than guessed: the felt is a different shape on a phone held
   * upright, the same phone turned sideways, and a tablet, and a fixed offset
   * that looks right on one of them pushes a card clean off another. The
   * spacing is therefore whatever the felt can actually hold, and never less
   * than the cards can overlap without hiding each other.
   */
  const feltRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = feltRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const cw = cardSize === 'xl' ? 88 : cardSize === 'lg' ? 72 : 58;
  const ch = cardSize === 'xl' ? 132 : cardSize === 'lg' ? 108 : 87;
  // A share of the table rather than a fixed gap: on a big felt the four cards
  // should sit apart like four players' cards do, and on a short one they close
  // up until they nearly touch — but never past the edge, and never so far
  // apart that the trick stops reading as one pile.
  const offY = Math.max(26, Math.min(130, box.h * 0.24, box.h / 2 - ch / 2 - 6));
  // …and clear of the side seats, which sit ON the felt now: 80px of edge on
  // each side belongs to them, and a card landing there hides a name.
  const offX = Math.max(34, Math.min(150, box.w * 0.26, box.w / 2 - cw / 2 - 80));
  const centre = 'translate(-50%, -50%) ';
  const posStyle: Record<string, React.CSSProperties> = {
    bottom: { left: '50%', top: '50%', transform: `${centre}translate(0, ${offY}px)` },
    left:   { left: '50%', top: '50%', transform: `${centre}translate(-${offX}px, 0)` },
    top:    { left: '50%', top: '50%', transform: `${centre}translate(0, -${offY}px)` },
    right:  { left: '50%', top: '50%', transform: `${centre}translate(${offX}px, 0)` },
  };

  const trumpSuit = match.trumpSuit as Suit | null;

  return (
    <div ref={feltRef} style={{ width: '100%', height: '100%', minHeight, position: 'relative', overflow: 'hidden', borderRadius: 18 }}>
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
              <span className="font-mono text-[10px] text-yellow-400/70">{SUIT_NAME[trumpSuit]}</span>
            </>
          : <span className="font-mono text-[10px] text-white/35">უხიშტოდ</span>}
      </div>

      {/* Round / phase indicator */}
      <div style={{
        position: 'absolute', bottom: 8, left: 10, zIndex: 3,
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
            <JokerCard card={pc.card} size={cardSize} trump={!!trumpSuit && pc.card.suit === trumpSuit} animate />
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

function HandFan({ cards, playableSet, isMyTurn, selectedCard, trumpSuit, size, maxWidth, onCardClick }: {
  cards: Card[];
  playableSet: Set<string>;
  isMyTurn: boolean;
  selectedCard: Card | null;
  trumpSuit: Suit | null;
  size: 'md' | 'xl';
  maxWidth: number;
  onCardClick: (card: Card) => void;
}) {
  if (cards.length === 0) return null;

  const n = cards.length;
  const cw = size === 'xl' ? 88 : 58;
  const ch = size === 'xl' ? 132 : 87;
  // Overlap shrinks as the hand grows, so nine cards fit the same width four do.
  const overlap = n <= 1 ? 0 : Math.min(cw * 0.62, Math.floor((maxWidth - cw) / (n - 1)));
  const totalW = (n - 1) * overlap + cw;

  return (
    <div style={{ position: 'relative', height: ch + 18, width: totalW, margin: '0 auto' }}>
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
              bottom: isSelected ? 20 : 0,
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
              size={size}
              onClick={() => onCardClick(card)}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Declaration panel ──────────────────────────────────────────────────────

// All four suits, under the names they are called by at the table.
const TRUMP_CHOICES: Array<{ suit: Suit | null; symbol: string; name: string; color: string }> = [
  { suit: 'S', symbol: '♠', name: SUIT_NAME.S, color: '#e2e8f0' },
  { suit: 'H', symbol: '♥', name: SUIT_NAME.H, color: '#ff6b6b' },
  { suit: 'D', symbol: '♦', name: SUIT_NAME.D, color: '#ff6b6b' },
  { suit: 'C', symbol: '♣', name: SUIT_NAME.C, color: '#e2e8f0' },
  { suit: null, symbol: '∅', name: 'უხიშტოდ', color: 'rgba(255,255,255,0.65)' },
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
                  <button key={c.name} onClick={() => { haptic('selection'); setTrump(c.suit); }}
                    className="px-2.5 py-1 rounded-xl transition-all active:scale-90 flex flex-col items-center"
                    style={{
                      minWidth: 46,
                      background: on ? 'rgba(251,191,36,0.22)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${on ? 'rgba(251,191,36,0.75)' : 'rgba(255,255,255,0.12)'}`,
                      color: on ? '#fbbf24' : c.color,
                    }}>
                    <span style={{ fontSize: 17, lineHeight: 1.1, fontWeight: 700 }}>{c.symbol}</span>
                    <span className="font-mono" style={{ fontSize: 9, opacity: 0.75 }}>{c.name}</span>
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
          {lastResult.trumpSuit ? ` · ხიშტი ${SUIT_SYMBOL[lastResult.trumpSuit as Suit]} ${SUIT_NAME[lastResult.trumpSuit as Suit]}` : ' · უხიშტოდ'}
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
              {r.trumpSuit ? ` · ხიშტი ${SUIT_SYMBOL[r.trumpSuit as Suit]} ${SUIT_NAME[r.trumpSuit as Suit]}` : ' · უხიშტოდ'}
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

/** One row of the settings card: a label and a row of choices. */
function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="font-mono text-[11px] text-white/45">{label}</span>
        {hint && <span className="font-mono text-[10px] text-white/25">{hint}</span>}
      </div>
      <div className="flex gap-1.5 flex-wrap">{children}</div>
    </div>
  );
}

function Choice({ on, disabled, onClick, children }: {
  on: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={() => { if (!disabled) { haptic('selection'); onClick(); } }}
      disabled={disabled}
      className="px-3 py-1.5 rounded-xl font-mono transition-all active:scale-95 disabled:cursor-default"
      style={{
        fontSize: 11.5,
        background: on ? 'rgba(251,191,36,0.18)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${on ? 'rgba(251,191,36,0.6)' : 'rgba(255,255,255,0.1)'}`,
        color: on ? '#fbbf24' : 'rgba(255,255,255,0.45)',
        opacity: disabled && !on ? 0.45 : 1,
      }}
    >{children}</button>
  );
}

/**
 * The lobby.
 *
 * It is the first thing four people look at together, and it used to be a
 * stack of loose parts: a wrapping title, four grey rows, a code, a button.
 * Worse, the two decisions that actually shape the evening — how long the game
 * runs and what a broken word costs — could only be made on the create screen,
 * before anybody had arrived to argue about them. They live here now, the host
 * can change them while the table fills, and everyone else can read what they
 * are walking into.
 */
function WaitingRoom({ match, isCreator, onStart, isLoading, voiceSlot }: {
  match: any; isCreator: boolean; onStart: () => void; isLoading: boolean;
  voiceSlot?: React.ReactNode;
}) {
  const t = useT();
  const updateSettings = useJokerStore(s => s.updateSettings);
  const [copied, setCopied] = useState(false);
  const filled = match.players.length;
  const mode = match.settings?.mode ?? 'classic';
  const khishti = match.settings?.khishtiPenalty ?? 200;
  const premium = match.settings?.bonusEnabled !== false;
  const deals = match.roundPlan?.length ?? 0;

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain">
      <div className="max-w-sm mx-auto px-4 pt-4 pb-8 flex flex-col gap-4">

        {/* Who is here */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(155,0,255,0.22)' }}>
          <div className="flex items-center justify-between px-3.5 py-2.5" style={{ background: 'rgba(155,0,255,0.09)' }}>
            <span className="font-display font-bold text-white" style={{ fontSize: 13 }}>
              მაგიდა · {filled}/4
            </span>
            <span className="font-mono text-[10.5px]" style={{ color: filled === 4 ? '#7fe0a0' : 'rgba(255,255,255,0.35)' }}>
              {filled === 4 ? 'სრულია' : `კიდევ ${4 - filled}`}
            </span>
          </div>
          <div className="p-2 space-y-1.5">
            {Array.from({ length: 4 }, (_, i) => {
              const p = match.players.find((pl: any) => pl.seatIndex === i);
              return (
                <div key={i} className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl"
                  style={{
                    background: p ? 'rgba(155,0,255,0.08)' : 'rgba(255,255,255,0.015)',
                    border: `1px solid ${p ? 'rgba(155,0,255,0.22)' : 'rgba(255,255,255,0.05)'}`,
                  }}>
                  <span className="font-mono text-[11px] text-white/25 w-3">{i + 1}</span>
                  {p
                    ? <Avatar player={p} size={30} onOpen={p.profileId ? () => useSocialStore.getState().openProfile(p.profileId!) : undefined} />
                    : <div style={{ width: 30, height: 30, borderRadius: '50%', border: '1px dashed rgba(255,255,255,0.12)' }} />}
                  <span className={`font-mono flex-1 truncate ${p ? 'text-white' : 'text-white/20'}`} style={{ fontSize: 13 }}>
                    {p ? p.name : 'ცარიელი ადგილი'}
                  </span>
                  {i === 0 && p && <span style={{ fontSize: 13 }}>👑</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* The rules of this table */}
        <div className="rounded-2xl px-3.5 pb-1 pt-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="font-display font-bold text-white mb-0.5" style={{ fontSize: 12.5 }}>
            ⚙️ წესები {!isCreator && <span className="font-mono text-[10px] text-white/25">· ჰოსტი აწესებს</span>}
          </p>

          <SettingRow label="სტრუქტურა" hint={`${deals} დარიგება · 4 პულკა`}>
            <Choice on={mode === 'classic'} disabled={!isCreator} onClick={() => updateSettings({ mode: 'classic' })}>
              კლასიკური 1→9→1
            </Choice>
            <Choice on={mode === 'nines_only'} disabled={!isCreator} onClick={() => updateSettings({ mode: 'nines_only' })}>
              4×4 ცხრიანი
            </Choice>
          </SettingRow>

          <SettingRow label="ხიშტი" hint="დარღვეული სიტყვის ფასი">
            {KHISHTI_PENALTIES.map(v => (
              <Choice key={v} on={khishti === v} disabled={!isCreator} onClick={() => updateSettings({ khishtiPenalty: v })}>
                {v === 0 ? '10/ხელი' : `−${v}`}
              </Choice>
            ))}
          </SettingRow>

          <SettingRow label="პრემია" hint="სუფთა პულკა ორმაგდება">
            <Choice on={premium} disabled={!isCreator} onClick={() => updateSettings({ bonusEnabled: true })}>ჩართული</Choice>
            <Choice on={!premium} disabled={!isCreator} onClick={() => updateSettings({ bonusEnabled: false })}>გამორთული</Choice>
          </SettingRow>
        </div>

        {/* Talking starts before the cards do — half the reason to sit down. */}
        {voiceSlot}

        {/* How they get in */}
        <div className="flex flex-col items-center gap-2.5">
          <button
            onClick={() => {
              navigator.clipboard?.writeText(match.code).catch(() => {});
              haptic('selection'); setCopied(true); setTimeout(() => setCopied(false), 1800);
            }}
            className="w-full py-3 rounded-2xl transition-all active:scale-[0.98] flex flex-col items-center"
            style={{ border: '1px solid rgba(155,0,255,0.4)', background: 'rgba(155,0,255,0.08)' }}>
            <span className="font-mono font-bold" style={{ fontSize: 22, letterSpacing: '0.28em', color: '#c084fc' }}>{match.code}</span>
            <span className="font-mono text-[10px]" style={{ color: copied ? '#7fe0a0' : 'rgba(255,255,255,0.3)' }}>
              {copied ? '✓ დაკოპირდა' : 'შეეხე კოდის კოპირებისთვის'}
            </span>
          </button>
          {/* A code only reaches whoever is already listening. */}
          <GameInviteButton game="joker" code={match.code} />
        </div>

        {/* Start */}
        {isCreator ? (
          <button onClick={onStart} disabled={isLoading || filled < 4}
            className="w-full py-3.5 rounded-2xl font-display font-bold text-white transition-all active:scale-[0.98] disabled:opacity-40"
            style={{
              fontSize: 15,
              background: filled === 4
                ? 'linear-gradient(135deg,rgba(155,0,255,0.6),rgba(0,245,255,0.35))'
                : 'rgba(255,255,255,0.05)',
              border: `1px solid ${filled === 4 ? 'rgba(155,0,255,0.6)' : 'rgba(255,255,255,0.1)'}`,
              boxShadow: filled === 4 ? '0 0 24px rgba(155,0,255,0.25)' : 'none',
            }}>
            {filled === 4 ? `🚀 ${t.games.joker.startGame}` : `ველოდებით კიდევ ${4 - filled} მოთამაშეს`}
          </button>
        ) : (
          <p className="text-center font-mono text-[12px] text-white/35 py-2">
            {filled === 4 ? 'ჰოსტი იწყებს…' : 'ველოდებით მოთამაშეებს…'}
          </p>
        )}
      </div>
    </div>
  );
}
