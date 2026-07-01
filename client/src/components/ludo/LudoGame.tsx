import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useT } from '@/store/langStore';
import { useLudoStore } from '@/store/ludoStore';
import { LudoBoard, getPieceGridPos, WIN_POS } from './LudoBoard';
import { useLudoAnimation } from './useLudoAnimation';
import { play, sfxDiceRoll, sfxCapture, sfxPieceHome, sfxVictory, vibrate, isSoundOn, setSoundOn } from './ludoSounds';
import { useLudoVoice } from '@/hooks/useLudoVoice';
import { LudoPTTButton } from './LudoPTTButton';
import { useAuthStore } from '@/store/authStore';
import { useLiveKitGate, useLivekitRoomVoice } from '@/hooks/useLivekitVoice';
import { LiveKitVoiceBarView } from '@/components/game/LiveKitVoiceBar';
import { GameInviteButton } from '@/components/social/GameInviteButton';
import type { LudoColor, LudoMatchPublic } from '@/types/ludo';

// ── Ambient particles ──────────────────────────────────────────────────
const PARTICLES = Array.from({length:18}, (_, i) => ({
  id: i,
  x: (i * 37 + 11) % 100,
  y: (i * 53 + 7)  % 100,
  size: 1.2 + (i % 3) * 0.8,
  dur: 7 + (i % 5) * 2.5,
  delay: (i * 0.6) % 4,
  cyan: i % 3 !== 0,
}));

function Particles() {
  return (
    <div style={{position:'absolute',inset:0,pointerEvents:'none',overflow:'hidden',zIndex:0}}>
      {PARTICLES.map(p => (
        <motion.div
          key={p.id}
          style={{
            position:'absolute',
            left:`${p.x}%`, top:`${p.y}%`,
            width:p.size, height:p.size,
            borderRadius:'50%',
            background: p.cyan ? '#00f5ff' : '#c084fc',
            boxShadow: `0 0 ${p.size*3}px ${p.cyan?'#00f5ff':'#c084fc'}`,
          }}
          animate={{ y:[0,-28,0], opacity:[0,0.55,0] }}
          transition={{ duration:p.dur, delay:p.delay, repeat:Infinity, ease:'easeInOut' }}
        />
      ))}
    </div>
  );
}

// ── Toast system ───────────────────────────────────────────────────────
interface Toast { id:string; text:string; emoji:string; accent:string }

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const add = useCallback((text:string, emoji:string, accent:string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(p => [...p.slice(-3), {id,text,emoji,accent}]);
    setTimeout(() => setToasts(p => p.filter(t=>t.id!==id)), 2800);
  }, []);
  return { toasts, add };
}

// ── Dice face ──────────────────────────────────────────────────────────
const DOT_POS: Record<number,[number,number][]> = {
  1: [[50,50]],
  2: [[25,28],[75,72]],
  3: [[25,25],[50,50],[75,75]],
  4: [[26,26],[74,26],[26,74],[74,74]],
  5: [[26,26],[74,26],[50,50],[26,74],[74,74]],
  6: [[26,22],[74,22],[26,50],[74,50],[26,78],[74,78]],
};

function DiceFace({ value, rolling, size=72 }: { value:number|null; rolling:boolean; size?:number }) {
  const dots = value ? DOT_POS[value] ?? [] : [];
  const isSix = value === 6 && !rolling;
  const isSpecial = rolling;
  return (
    <motion.div
      animate={rolling
        ? { rotate:[0,12,-14,8,-10,6,-4,0], scale:[1,1.08,0.94,1.05,0.97,1.03,0.99,1] }
        : { rotate:0, scale:1 }}
      transition={rolling
        ? { repeat:Infinity, duration:0.22, ease:'easeInOut' }
        : { type:'spring', stiffness:450, damping:18 }}
      style={{
        width:size, height:size,
        borderRadius:Math.round(size*0.22),
        flexShrink:0, position:'relative',
        background: isSix
          ? 'linear-gradient(135deg,#fef08a,#fbbf24,#f59e0b)'
          : rolling
            ? 'linear-gradient(135deg,rgba(0,245,255,0.15),rgba(192,132,252,0.15))'
            : value
              ? 'linear-gradient(135deg,#f0f4ff,#e8ecff)'
              : 'rgba(0,245,255,0.05)',
        border: `${Math.max(2,size*0.035)}px solid ${
          isSix ? '#f59e0b'
          : rolling ? 'rgba(0,245,255,0.5)'
          : value ? 'rgba(180,190,220,0.8)'
          : 'rgba(0,245,255,0.15)'}`,
        boxShadow: isSix
          ? '0 0 28px rgba(251,191,36,0.8), 0 0 56px rgba(251,191,36,0.35), 0 4px 16px rgba(0,0,0,0.6)'
          : rolling
            ? '0 0 20px rgba(0,245,255,0.3), 0 4px 16px rgba(0,0,0,0.6)'
            : value
              ? '0 4px 16px rgba(0,0,0,0.5)'
              : '0 2px 8px rgba(0,0,0,0.4)',
      }}
    >
      {dots.map(([x,y],i) => (
        <div key={i} style={{
          position:'absolute', borderRadius:'50%',
          width:size*0.155, height:size*0.155,
          background: isSix ? '#92400e' : '#1e1e3a',
          left:`calc(${x}% - ${size*0.155/2}px)`,
          top:`calc(${y}% - ${size*0.155/2}px)`,
          boxShadow: isSix ? '0 1px 3px rgba(0,0,0,0.3)' : undefined,
        }}/>
      ))}
      {rolling && (
        <motion.div style={{position:'absolute',inset:0,borderRadius:'inherit',
          background:'radial-gradient(circle at 40% 35%, rgba(0,245,255,0.12), transparent 70%)'}}
          animate={{opacity:[0.4,1,0.4]}} transition={{repeat:Infinity,duration:0.22}} />
      )}
      {!value && !rolling && (
        <span style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',
                      fontSize:size*0.38,opacity:0.18,color:'#00f5ff'}}>?</span>
      )}
    </motion.div>
  );
}

// ── Piece status pips ──────────────────────────────────────────────────
function PiecePips({ pieces, color }: { pieces:{pos:number}[]; color:LudoColor }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {pieces.map((p,i) => {
        const isDone  = p.pos === WIN_POS;
        const isHome  = p.pos >= 52 && p.pos < WIN_POS;
        const isBoard = p.pos >= 0 && p.pos < 52;
        const isYard  = p.pos === -1;
        const clr = isDone ? '#00ff88' : isHome
          ? (color==='red'?'#ff9999':'#66bbff')
          : isBoard ? (color==='red'?'#ff2244':'#0090ff')
          : 'rgba(255,255,255,0.1)';
        const glow = isDone ? '0 0 6px #00ff88'
          : isBoard ? `0 0 4px ${clr}`
          : 'none';
        return (
          <div key={i} style={{
            width:8, height:8, borderRadius:'50%', background:clr,
            border:`1.5px solid ${isDone?'#80ffcc':isYard?'rgba(255,255,255,0.12)':clr}`,
            boxShadow:glow, flexShrink:0,
            opacity: isYard ? 0.35 : 1,
          }} />
        );
      })}
    </div>
  );
}

// ── Player card ────────────────────────────────────────────────────────
function PlayerCard({
  name, color, isActive, pieces, isYou, absent, lastRoll, t,
}: {
  name:string; color:LudoColor; isActive:boolean; pieces:{pos:number}[];
  isYou:boolean; absent:boolean; lastRoll:number|null; t:any
}) {
  const ACCENTS: Record<LudoColor, string> = { red:'#ff2244', blue:'#0090ff', green:'#22c55e', yellow:'#f59e0b' };
  const ACCENT_RGBS: Record<LudoColor, string> = { red:'255,34,68', blue:'0,144,255', green:'34,197,94', yellow:'245,158,11' };
  const accent = ACCENTS[color];
  const accentRgb = ACCENT_RGBS[color];
  return (
    <motion.div
      animate={isActive ? { borderColor:`rgba(${accentRgb},0.6)`, boxShadow:`0 0 18px rgba(${accentRgb},0.2)` }
                        : { borderColor:'rgba(255,255,255,0.07)', boxShadow:'none' }}
      transition={{ duration:0.3 }}
      style={{
        display:'flex', alignItems:'center', gap:10, padding:'7px 11px',
        borderRadius:12, flex:1, minWidth:0,
        background: isActive ? `rgba(${accentRgb},0.1)` : 'rgba(255,255,255,0.03)',
        border:`1.5px solid rgba(255,255,255,0.07)`,
      }}
    >
      {/* Color dot */}
      <motion.div
        animate={isActive ? { scale:[1,1.3,1], boxShadow:[`0 0 4px ${accent}`,`0 0 14px ${accent}`,`0 0 4px ${accent}`] }
                          : { scale:1, boxShadow:'none' }}
        transition={{ repeat:isActive?Infinity:0, duration:1.2 }}
        style={{ width:10, height:10, borderRadius:'50%', background:accent, flexShrink:0 }}
      />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:2 }}>
          <p style={{ fontFamily:'monospace', fontSize:12, color:isActive?'#fff':'rgba(255,255,255,0.55)',
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                      fontWeight:isActive?700:400, transition:'all 0.3s' }}>
            {absent ? <span style={{color:'rgba(255,255,255,0.25)'}}>—</span> : name}
          </p>
          {isYou && <span style={{fontFamily:'monospace',fontSize: 12,color:'rgba(255,255,255,0.25)',letterSpacing:1}}>YOU</span>}
        </div>
        {!absent && <PiecePips pieces={pieces} color={color} />}
        {/* Last roll display */}
        <AnimatePresence>
          {isActive && lastRoll && (
            <motion.p
              key={`lr-${lastRoll}`}
              initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} exit={{opacity:0}}
              style={{fontFamily:'monospace',fontSize: 12,color:accent,marginTop:2,letterSpacing:0.5}}>
              🎲 {lastRoll === 6 ? `6 — Roll again!` : `Rolled ${lastRoll}`}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
      {isActive && (
        <motion.div
          animate={{ opacity:[1,0.2,1] }}
          transition={{ repeat:Infinity, duration:1.0 }}
          style={{ width:7, height:7, borderRadius:'50%', background:accent, flexShrink:0 }}
        />
      )}
    </motion.div>
  );
}

// ── Main component ─────────────────────────────────────────────────────
export function LudoGame() {
  const t = useT();
  const { match, isLoading, leaveMatch, rollDice, movePiece, resign, rematch, sendChat, startMatch } = useLudoStore();

  const [isRolling, setIsRolling]   = useState(false);
  const [diceFace,  setDiceFace]    = useState<number|null>(null);
  const [isSix,     setIsSix]       = useState(false);
  const [soundOn,   setSoundState]  = useState(isSoundOn);
  const rollIntervalRef  = useRef<ReturnType<typeof setInterval>|null>(null);
  const pendingRollRef   = useRef<number|null>(null);

  const [chatOpen,  setChatOpen]   = useState(false);
  const [chatInput, setChatInput]  = useState('');
  const chatRef = useRef<HTMLDivElement>(null);

  const [showResign, setShowResign] = useState(false);
  const [flashCell, setFlashCell]   = useState<{row:number;col:number}|null>(null);

  const { toasts, add: addToast } = useToasts();
  const prevMatchRef = useRef<LudoMatchPublic|null>(null);

  // Step animation
  const { displayPos, isAnimating } = useLudoAnimation(match);

  // Track last roll per color for player card display
  const [lastRolls, setLastRolls] = useState<Record<LudoColor, number|null>>({ red:null, blue:null, green:null, yellow:null });

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [match?.chat]);

  // Detect game events
  useEffect(() => {
    const prev = prevMatchRef.current;
    const curr = match;
    if (!curr) { prevMatchRef.current = null; return; }

    if (prev) {
      // New dice roll
      if (curr.diceRoll !== null && curr.diceRoll !== prev.diceRoll) {
        // Save the final value; the rolling interval effect will apply it
        // when it stops so the interval can't overwrite the correct face.
        pendingRollRef.current = curr.diceRoll;
        setLastRolls(lr => ({ ...lr, [curr.currentTurn]: curr.diceRoll }));
        if (curr.diceRoll === 6) {
          setIsSix(true);
          addToast(t.games.ludo.rolledSix, '🎲', '#fbbf24');
        } else {
          setIsSix(false);
        }
      }
      if (curr.diceRoll === null && prev.diceRoll !== null) setIsSix(false);

      // Captures & piece reaching home for all 4 colors
      const ALL_COLORS: LudoColor[] = ['red', 'blue', 'green', 'yellow'];
      for (const color of ALL_COLORS) {
        const currSide = curr.players[color];
        const prevSide = prev.players[color];
        if (!currSide) continue;
        // Captures
        for (const cp of currSide.pieces) {
          const pp = (prevSide?.pieces ?? []).find(p => p.id === cp.id);
          if (pp && pp.pos >= 0 && cp.pos === -1) {
            const { row, col } = getPieceGridPos(pp.pos, color, cp.id);
            setFlashCell({ row, col });
            setTimeout(() => setFlashCell(null), 700);
            play(sfxCapture);
            vibrate(60);
            addToast(t.games.ludo.sentToYard, '💥', '#f97316');
          }
        }
        // Piece reaching home
        for (const cp of currSide.pieces) {
          const pp = (prevSide?.pieces ?? []).find(p => p.id === cp.id);
          if (pp && pp.pos !== WIN_POS && cp.pos === WIN_POS) {
            play(sfxPieceHome);
            addToast(`${currSide.name}: ${t.games.ludo.pieceHome}`, '⭐', '#22c55e');
          }
        }
      }

      // Game start
      if (prev.status === 'waiting' && curr.status === 'active') {
        addToast(t.games.ludo.gameStarted, '🎮', '#c084fc');
      }

      // Game over
      if (prev.status === 'active' && curr.status === 'finished') {
        play(sfxVictory);
        try { navigator.vibrate?.([80, 40, 80, 40, 160]); } catch {}
      }
    }
    prevMatchRef.current = curr;
  }, [match, addToast, t]);

  // Dice rolling interval
  useEffect(() => {
    if (isRolling) {
      rollIntervalRef.current = setInterval(() => setDiceFace(Math.floor(Math.random()*6)+1), 75);
    } else {
      if (rollIntervalRef.current) { clearInterval(rollIntervalRef.current); rollIntervalRef.current = null; }
      // After clearing the interval, set the real roll value so the
      // animation cannot overwrite it with a random face.
      if (pendingRollRef.current !== null) {
        setDiceFace(pendingRollRef.current);
        pendingRollRef.current = null;
      }
    }
    return () => { if (rollIntervalRef.current) clearInterval(rollIntervalRef.current); };
  }, [isRolling]);

  const handleRoll = useCallback(async () => {
    if (!match || isRolling) return;
    setIsRolling(true);
    setIsSix(false);
    play(sfxDiceRoll);
    vibrate(40);
    await Promise.all([rollDice(), new Promise(r => setTimeout(r, 1500))]);
    setIsRolling(false);
  }, [match, isRolling, rollDice]);

  const handlePieceClick = useCallback(async (_color:LudoColor, id:number) => {
    if (isAnimating) return;
    vibrate(12);
    await movePiece(id);
  }, [movePiece, isAnimating]);

  const handleSendChat = useCallback(async () => {
    const txt = chatInput.trim();
    if (!txt) return;
    setChatInput('');
    await sendChat(txt);
  }, [chatInput, sendChat]);

  const toggleSound = useCallback(() => {
    const next = !soundOn;
    setSoundState(next);
    setSoundOn(next);
  }, [soundOn]);

  // ── Voice (must be before conditional return) ───────────────────────
  const { isTalking, speakingSocketIds, leave: leaveVoice, joinVoice, joinListen } = useLudoVoice();
  const isMatchFinished = match?.status === 'finished';
  const ludoMatchId = match?.id;
  const ludoMyColor = match?.myColor;
  const ludoIsPlayer = ludoMyColor === 'red' || ludoMyColor === 'blue' || ludoMyColor === 'green' || ludoMyColor === 'yellow';
  const ludoMyName = ludoIsPlayer
    ? (match?.players[ludoMyColor as 'red'|'blue'|'green'|'yellow']?.name ?? 'Player')
    : 'Player';

  // LiveKit voice (each match == one LiveKit room). Replaces the mesh PTT when
  // enabled; spectators are listen-only.
  const lkProfile = useAuthStore(s => s.profile);
  const { enabled: livekitEnabled, resolved: livekitResolved } = useLiveKitGate();
  const lkVoice = useLivekitRoomVoice({
    roomId: ludoMatchId ? `ludo_${ludoMatchId}` : null,
    identity: lkProfile?.id ?? null,
    active: livekitEnabled && !!ludoMatchId && !isMatchFinished,
    listenOnly: !ludoIsPlayer,
  });

  // Auto-join the legacy mesh voice — skipped when LiveKit owns voice.
  useEffect(() => {
    if (!ludoMatchId) return;
    if (!livekitResolved) return;
    if (livekitEnabled) return;
    if (ludoIsPlayer) joinVoice(ludoMatchId, ludoMyName);
    else joinListen(ludoMatchId, ludoMyName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ludoMatchId, livekitResolved, livekitEnabled]);

  useEffect(() => { if (isMatchFinished) leaveVoice(); }, [isMatchFinished, leaveVoice]);
  useEffect(() => () => leaveVoice(), [leaveVoice]);

  if (!match) return null;

  const myColor    = match.myColor;
  const isPlayer   = myColor === 'red' || myColor === 'blue' || myColor === 'green' || myColor === 'yellow';
  const isMyTurn   = isPlayer && match.currentTurn === myColor;
  const isFinished = match.status === 'finished';
  const isWaiting  = match.status === 'waiting';

  const canRoll = isMyTurn && !match.diceRolled && !isFinished && !isWaiting && !isRolling;
  const canMove = isMyTurn && match.diceRolled && match.movablePieceIds.length > 0 && !isAnimating;

  const PLAYER_ORDER_UI: LudoColor[] = ['red', 'blue', 'green', 'yellow'];
  // bottomColor = myColor (or red by default for spectators)
  const bottomColor: LudoColor = (myColor === 'red' || myColor === 'blue' || myColor === 'green' || myColor === 'yellow') ? myColor : 'red';
  const topColor: LudoColor = match.playerOrder.find(c => c !== bottomColor) ?? 'blue';
  const topSide    = match.players[topColor];
  const bottomSide = match.players[bottomColor];
  const activePlayers = match.playerOrder;

  const isWinner  = isFinished && match.winnerColor === myColor;
  const winnerName = match.winnerColor
    ? (match.players[match.winnerColor]?.name ?? '?')
    : null;

  const homeCount: Record<LudoColor, number> = {
    red:    match.players.red?.pieces.filter(p => p.pos === WIN_POS).length ?? 0,
    blue:   match.players.blue?.pieces.filter(p => p.pos === WIN_POS).length ?? 0,
    green:  match.players.green?.pieces.filter(p => p.pos === WIN_POS).length ?? 0,
    yellow: match.players.yellow?.pieces.filter(p => p.pos === WIN_POS).length ?? 0,
  };

  const TURN_ACCENTS: Record<LudoColor, string> = {
    red: '#ff2244', blue: '#0090ff', green: '#22c55e', yellow: '#f59e0b',
  };
  const turnAccent = !isFinished ? TURN_ACCENTS[match.currentTurn] : '#ffffff';
  const turnIsMe    = !isFinished && !isWaiting && isMyTurn;
  const turnName    = !isFinished && !isWaiting
    ? (match.players[match.currentTurn]?.name ?? '?')
    : null;

  return (
    <motion.div
      initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden"
      style={{background:'linear-gradient(180deg,#02050f 0%,#000810 100%)'}}
    >
      <Particles />

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{ position:'relative', zIndex:10, flexShrink:0, display:'flex', alignItems:'center',
                    justifyContent:'space-between', padding:'10px 14px',
                    paddingTop:'max(10px, env(safe-area-inset-top, 0px))',
                    background:'rgba(2,5,18,0.97)',
                    borderBottom:'1px solid rgba(0,245,255,0.12)',
                    boxShadow:'0 2px 20px rgba(0,0,0,0.5)' }}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <motion.span animate={{rotate:[0,-5,5,0]}} transition={{repeat:Infinity,duration:3,ease:'easeInOut'}}
            style={{fontSize:22,display:'block'}}>🎲</motion.span>
          <div>
            <p style={{fontFamily:'monospace',fontWeight:900,color:'#00f5ff',fontSize:14,lineHeight:1.2,
                        letterSpacing:2,textShadow:'0 0 12px rgba(0,245,255,0.6)'}}>
              VOID LUDO
            </p>
            <p style={{fontFamily:'monospace',fontSize: 12,color:'rgba(0,245,255,0.35)',letterSpacing:3}}>
              {match.code}
            </p>
          </div>
        </div>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          {/* Sound toggle */}
          <button onClick={toggleSound}
            style={{width:44,height:44,display:'flex',alignItems:'center',justifyContent:'center',
                    borderRadius:8,border:'1px solid rgba(255,255,255,0.1)',
                    background:soundOn?'rgba(0,245,255,0.08)':'rgba(255,255,255,0.03)',
                    cursor:'pointer',fontSize:16,color:soundOn?'#00f5ff':'rgba(255,255,255,0.25)'}}>
            {soundOn ? '🔊' : '🔇'}
          </button>
          {isPlayer && !isFinished && !isWaiting && (
            <button onClick={()=>setShowResign(true)}
              style={{padding:'8px 12px',borderRadius:8,fontFamily:'monospace',fontSize: 12,
                      color:'rgba(255,255,255,0.3)',border:'1px solid rgba(255,255,255,0.08)',
                      background:'transparent',cursor:'pointer',letterSpacing:1,minHeight:44}}>
              RESIGN
            </button>
          )}
          <button onClick={leaveMatch}
            style={{width:44,height:44,display:'flex',alignItems:'center',justifyContent:'center',
                    borderRadius:8,color:'rgba(255,255,255,0.35)',border:'1px solid rgba(255,255,255,0.1)',
                    background:'rgba(255,255,255,0.04)',cursor:'pointer',fontSize:16,fontFamily:'monospace'}}>
            ✕
          </button>
        </div>
      </div>

      {/* ── Turn banner ─────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {!isFinished && !isWaiting && turnName && (
          <motion.div
            key={`${match.currentTurn}-${match.diceRolled}`}
            initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:8}}
            transition={{duration:0.22}}
            style={{ position:'relative',zIndex:9,flexShrink:0,textAlign:'center',
                     padding:'6px 16px 2px',
                     background:`linear-gradient(180deg,rgba(${turnIsMe ? (
                       match.currentTurn === 'red' ? '255,34,68' :
                       match.currentTurn === 'blue' ? '0,144,255' :
                       match.currentTurn === 'green' ? '34,197,94' : '245,158,11'
                     ) : '255,255,255'},0.06) 0%,transparent 100%)` }}>
            <p style={{ fontFamily:'monospace', fontWeight:900, fontSize:16, letterSpacing:2,
                         textTransform:'uppercase',
                         color: turnAccent, textShadow:`0 0 20px ${turnAccent}` }}>
              {turnIsMe ? '⚡' : '⏳'} {turnIsMe ? 'YOUR' : `${turnName}'s`} TURN
            </p>
            <p style={{ fontFamily:'monospace', fontSize: 12, letterSpacing:1,
                         color:'rgba(255,255,255,0.3)', marginTop:1 }}>
              {canRoll && 'Roll the dice!'}
              {canMove && '↑ Tap a piece to move'}
              {!canRoll && !canMove && isMyTurn && match.diceRolled && '—'}
              {!isMyTurn && '—'}
            </p>
          </motion.div>
        )}
        {isWaiting && (
          <motion.div
            key="waiting-banner"
            initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            style={{ position:'relative',zIndex:9,flexShrink:0,textAlign:'center',padding:'6px 16px 2px' }}>
            {myColor === 'red' ? (
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                <motion.p
                  animate={{opacity:[1,0.5,1]}} transition={{repeat:Infinity,duration:1.5}}
                  style={{fontFamily:'monospace',fontWeight:700,fontSize:13,color:'#c084fc',
                          letterSpacing:2,textTransform:'uppercase'}}>
                  ⏳ {match.players.blue ? t.games.ludo.waitingForHost?.replace('Waiting for host','Ready') ?? 'Players joined' : t.games.ludo.waitingForOpponent}
                </motion.p>
                {match.playerOrder.length >= 2 && (
                  <motion.button
                    whileTap={{scale:0.91}} whileHover={{scale:1.05}}
                    onClick={startMatch}
                    style={{padding:'6px 16px',borderRadius:10,fontFamily:'monospace',fontSize:11,
                            fontWeight:900,letterSpacing:1,textTransform:'uppercase',cursor:'pointer',
                            background:'linear-gradient(135deg,rgba(34,197,94,0.25),rgba(34,197,94,0.1))',
                            border:'1.5px solid rgba(34,197,94,0.5)',color:'#22c55e',
                            boxShadow:'0 0 16px rgba(34,197,94,0.2)',touchAction:'manipulation'}}>
                    {t.games.ludo.startGame ?? 'Start Game'}
                  </motion.button>
                )}
              </div>
            ) : (
              <motion.p
                animate={{opacity:[1,0.5,1]}} transition={{repeat:Infinity,duration:1.5}}
                style={{fontFamily:'monospace',fontWeight:700,fontSize:13,color:'#c084fc',
                        letterSpacing:2,textTransform:'uppercase'}}>
                ⏳ {t.games.ludo.waitingForHost ?? 'Waiting for host to start...'}
              </motion.p>
            )}
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
              <GameInviteButton game="ludo" code={match.code} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Player cards ─────────────────────────────────────────────── */}
      <div style={{position:'relative',zIndex:9,flexShrink:0,display:'flex',gap:8,padding:'4px 12px 4px',flexWrap:'wrap'}}>
        {activePlayers.map(color => {
          const side = match.players[color];
          return (
            <PlayerCard
              key={color}
              name={side?.name ?? '—'} color={color}
              isActive={!isFinished && match.currentTurn === color}
              pieces={side?.pieces ?? []} isYou={myColor === color}
              absent={!side}
              lastRoll={!isFinished && match.currentTurn === color && match.diceRoll !== null ? match.diceRoll : null}
              t={t}
            />
          );
        })}
      </div>

      {/* ── Board ───────────────────────────────────────────────────── */}
      <div style={{ position:'relative',zIndex:9, flex:1,display:'flex',alignItems:'center',
                    justifyContent:'center', padding:'4px 12px', minHeight:0, overflow:'hidden' }}>
        <div style={{width:'100%',maxWidth:400}}>
          <LudoBoard match={match} onPieceClick={handlePieceClick}
            flashCell={flashCell} displayPos={displayPos} />
        </div>
      </div>

      {/* ── Dice + Controls ─────────────────────────────────────────── */}
      <div style={{ position:'relative',zIndex:9, flexShrink:0, padding:'8px 16px 10px',
                    background:'rgba(2,5,18,0.7)', borderTop:'1px solid rgba(0,245,255,0.08)' }}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:14}}>

          {/* Dice */}
          <div style={{position:'relative'}}>
            <DiceFace value={diceFace} rolling={isRolling} size={64} />
            <AnimatePresence>
              {isSix && !isRolling && (
                <motion.div
                  initial={{opacity:0,scale:0.6,y:6}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:0.6}}
                  style={{position:'absolute',top:-26,left:'50%',transform:'translateX(-50%)',
                          background:'#fbbf24',color:'#78350f',borderRadius:8,
                          padding:'3px 9px',fontFamily:'monospace',fontSize: 12,fontWeight:900,
                          whiteSpace:'nowrap',boxShadow:'0 0 14px rgba(251,191,36,0.7)',letterSpacing:1}}>
                  🎲 ROLL AGAIN!
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Buttons */}
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
            <AnimatePresence mode="wait">
              {canRoll && (
                <motion.button
                  key="roll"
                  initial={{opacity:0,scale:0.85}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:0.85}}
                  whileTap={{scale:0.91}} whileHover={{scale:1.05}}
                  onClick={handleRoll}
                  style={{padding:'11px 28px',borderRadius:14,fontFamily:'monospace',fontSize:13,
                          fontWeight:900,letterSpacing:2,textTransform:'uppercase',cursor:'pointer',
                          background:'linear-gradient(135deg,rgba(0,245,255,0.18),rgba(0,245,255,0.08))',
                          border:'1.5px solid rgba(0,245,255,0.5)',color:'#00f5ff',
                          boxShadow:'0 0 24px rgba(0,245,255,0.18)',touchAction:'manipulation'}}>
                  {t.games.ludo.rollDice}
                </motion.button>
              )}
              {isRolling && (
                <motion.div
                  key="rolling"
                  initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
                  style={{padding:'11px 28px',borderRadius:14,fontFamily:'monospace',fontSize:13,
                          fontWeight:700,letterSpacing:2,textTransform:'uppercase',
                          color:'rgba(0,245,255,0.5)',border:'1.5px solid rgba(0,245,255,0.2)'}}>
                  <motion.span animate={{opacity:[1,0.3,1]}} transition={{repeat:Infinity,duration:0.4}}>
                    {t.games.ludo.rolling}
                  </motion.span>
                </motion.div>
              )}
              {canMove && (
                <motion.div
                  key="move"
                  initial={{opacity:0,y:4}} animate={{opacity:1,y:0}}
                  style={{textAlign:'center'}}>
                  <motion.p
                    animate={{opacity:[1,0.5,1]}} transition={{repeat:Infinity,duration:0.9}}
                    style={{fontFamily:'monospace',fontSize:12,color:'#22c55e',fontWeight:900,
                            letterSpacing:1,textTransform:'uppercase',textShadow:'0 0 12px rgba(34,197,94,0.7)'}}>
                    ↑ {t.games.ludo.tapPiece}
                  </motion.p>
                </motion.div>
              )}
              {!canRoll && !canMove && !isRolling && !isFinished && !isWaiting && !isMyTurn && (
                <motion.p
                  key="wait"
                  initial={{opacity:0}} animate={{opacity:1}}
                  style={{fontFamily:'monospace',fontSize:11,color:'rgba(255,255,255,0.22)',letterSpacing:1}}>
                  {t.games.ludo.opponentRolling}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Voice — LiveKit bar when enabled, else the legacy mesh PTT */}
          {livekitEnabled ? (
            <div style={{ width: '100%', maxWidth: 340 }}><LiveKitVoiceBarView voice={lkVoice} /></div>
          ) : (isPlayer && !isFinished && (
            <LudoPTTButton matchId={match.id} myName={match.players[bottomColor]?.name ?? 'Player'} />
          ))}

          {/* Consecutive sixes + chat */}
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
            {match.consecutiveSixes > 0 && !isFinished && (
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                {Array.from({length:match.consecutiveSixes}).map((_,i)=>(
                  <motion.div key={i}
                    animate={{scale:[1,1.3,1]}} transition={{repeat:Infinity,duration:0.9,delay:i*0.15}}
                    style={{width:8,height:8,borderRadius:'50%',background:'#fbbf24',
                            boxShadow:'0 0 6px rgba(251,191,36,0.8)'}} />
                ))}
                <p style={{fontFamily:'monospace',fontSize: 12,color:'#fbbf24',letterSpacing:0.5}}>
                  {match.consecutiveSixes}/3
                </p>
              </div>
            )}
            <button
              onClick={()=>setChatOpen(o=>!o)}
              style={{width:38,height:38,borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',
                      cursor:'pointer',
                      background:chatOpen?'rgba(0,245,255,0.1)':'rgba(255,255,255,0.04)',
                      border:`1px solid ${chatOpen?'rgba(0,245,255,0.3)':'rgba(255,255,255,0.08)'}`,
                      position:'relative', touchAction:'manipulation'}}>
              <span style={{fontSize:16}}>💬</span>
              {match.chat.length>0 && !chatOpen && (
                <div style={{position:'absolute',top:4,right:4,width:6,height:6,borderRadius:'50%',
                             background:'#c084fc',boxShadow:'0 0 6px #c084fc'}} />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Chat ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{height:0,opacity:0}} animate={{height:140,opacity:1}} exit={{height:0,opacity:0}}
            transition={{duration:0.22,ease:'easeOut'}}
            style={{position:'relative',zIndex:10,flexShrink:0,
                    borderTop:'1px solid rgba(0,245,255,0.08)',overflow:'hidden',
                    background:'rgba(2,5,18,0.8)',backdropFilter:'blur(8px)'}}>
            <div ref={chatRef} style={{overflowY:'auto',padding:'6px 12px',maxHeight:100}}>
              {match.chat.length===0 && (
                <p style={{fontFamily:'monospace',fontSize: 12,color:'rgba(255,255,255,0.18)'}}>
                  {t.games.ludo.noMessages}
                </p>
              )}
              {match.chat.map(msg=>(
                <div key={msg.id} style={{display:'flex',gap:6,marginBottom:3}}>
                  <span style={{fontFamily:'monospace',fontSize: 12,color:'rgba(0,245,255,0.5)',flexShrink:0}}>
                    {msg.name}:
                  </span>
                  <span style={{fontFamily:'monospace',fontSize: 12,color:'rgba(255,255,255,0.7)',wordBreak:'break-word'}}>
                    {msg.text}
                  </span>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:8,padding:'0 12px 8px'}}>
              <input value={chatInput} onChange={e=>setChatInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter')handleSendChat();}}
                placeholder={t.games.ludo.chatPlaceholder} maxLength={300}
                style={{flex:1,background:'transparent',fontFamily:'monospace',fontSize:12,color:'#fff',
                        outline:'none',padding:'5px 10px',borderRadius:10,
                        border:'1px solid rgba(0,245,255,0.12)'}} />
              <button onClick={handleSendChat} disabled={!chatInput.trim()}
                style={{padding:'5px 12px',borderRadius:10,fontFamily:'monospace',fontSize:12,
                        color:'rgba(0,245,255,0.6)',border:'1px solid rgba(0,245,255,0.15)',
                        background:'transparent',cursor:'pointer'}}>↑</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toasts ──────────────────────────────────────────────────── */}
      <div style={{position:'absolute',top:68,left:0,right:0,display:'flex',flexDirection:'column',
                   alignItems:'center',gap:6,pointerEvents:'none',zIndex:30}}>
        <AnimatePresence>
          {toasts.map(toast=>(
            <motion.div key={toast.id}
              initial={{opacity:0,y:-18,scale:0.82}} animate={{opacity:1,y:0,scale:1}}
              exit={{opacity:0,y:10,scale:0.88}} transition={{type:'spring',stiffness:320,damping:24}}
              style={{display:'flex',alignItems:'center',gap:8,padding:'7px 18px',borderRadius:28,
                      backdropFilter:'blur(12px)',
                      background:'rgba(2,5,18,0.95)',
                      border:`1px solid ${toast.accent}55`,
                      boxShadow:`0 4px 28px ${toast.accent}25`}}>
              <span style={{fontSize:16}}>{toast.emoji}</span>
              <span style={{fontFamily:'monospace',fontSize:11,color:'#fff',fontWeight:700,letterSpacing:0.5}}>
                {toast.text}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Victory overlay ──────────────────────────────────────────── */}
      <AnimatePresence>
        {isFinished && (
          <motion.div
            initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            style={{position:'absolute',inset:0,zIndex:50,display:'flex',flexDirection:'column',
                    alignItems:'center',justifyContent:'center',
                    background:'rgba(2,5,18,0.94)',backdropFilter:'blur(10px)'}}>

            {/* Star burst for winner */}
            {isWinner && [0,60,120,180,240,300].map(angle=>(
              <motion.div key={angle}
                initial={{opacity:0,scale:0,x:0,y:0}}
                animate={{
                  opacity:[0,1,0], scale:[0,1.4,2],
                  x:`${Math.cos(angle*Math.PI/180)*90}px`,
                  y:`${Math.sin(angle*Math.PI/180)*90}px`,
                }}
                transition={{delay:0.1+angle*0.002,duration:0.9,ease:'easeOut'}}
                style={{position:'absolute',fontSize:18,pointerEvents:'none'}}>⭐</motion.div>
            ))}

            <motion.div
              initial={{scale:0.4,y:40,opacity:0}} animate={{scale:1,y:0,opacity:1}}
              transition={{type:'spring',stiffness:260,damping:20,delay:0.08}}
              style={{textAlign:'center',padding:'32px 32px',maxWidth:360,width:'90%',
                      background:'rgba(2,5,18,0.98)',borderRadius:24,
                      border:`2px solid ${isWinner?'rgba(255,200,0,0.5)':match.winnerColor?'rgba(255,34,68,0.3)':'rgba(255,255,255,0.1)'}`,
                      boxShadow:`0 0 60px ${isWinner?'rgba(255,200,0,0.15)':'rgba(0,0,0,0.8)'}` }}>

              {/* Trophy */}
              <motion.div
                animate={isWinner ? {scale:[1,1.15,1],rotate:[-3,3,-2,2,0]} : {}}
                transition={{repeat:Infinity,duration:2.5,delay:0.5}}
                style={{fontSize:64,marginBottom:10,lineHeight:1}}>
                {isWinner ? '🏆' : match.winnerColor===null ? '🤝' : '💀'}
              </motion.div>

              <p style={{fontFamily:'monospace',fontSize:24,fontWeight:900,color:'#fff',marginBottom:4,
                         textShadow:isWinner?'0 0 40px #fbbf24, 0 0 80px rgba(255,200,0,0.3)':'none',
                         letterSpacing:1}}>
                {winnerName ?? '—'}
              </p>
              <p style={{fontFamily:'monospace',fontSize:13,letterSpacing:3,textTransform:'uppercase',
                         color:isWinner?'#fbbf24':match.winnerColor===null?'rgba(255,255,255,0.5)':'rgba(255,80,100,0.8)',
                         marginBottom:20}}>
                {match.winnerColor ? t.games.ludo.wins : t.games.ludo.draw}
              </p>

              {/* Stats */}
              <div style={{display:'flex',gap:8,justifyContent:'center',marginBottom:24,flexWrap:'wrap'}}>
                {(['red','blue','green','yellow'] as LudoColor[])
                  .filter(color => match.players[color] !== null)
                  .map(color => {
                    const COLOR_TEXTS: Record<LudoColor, string> = { red:'#ff6688', blue:'#66aaff', green:'#86efac', yellow:'#fcd34d' };
                    const COLOR_VALS: Record<LudoColor, string> = { red:'#ff2244', blue:'#0090ff', green:'#22c55e', yellow:'#f59e0b' };
                    const COLOR_RGBS: Record<LudoColor, string> = { red:'255,34,68', blue:'0,144,255', green:'34,197,94', yellow:'245,158,11' };
                    return (
                      <div key={color} style={{textAlign:'center',padding:'8px 14px',borderRadius:12,
                        background:`rgba(${COLOR_RGBS[color]},0.1)`,
                        border:`1px solid rgba(${COLOR_RGBS[color]},0.25)`,
                        flex:'1 1 80px',minWidth:0}}>
                        <p style={{fontFamily:'monospace',fontSize: 12,color:COLOR_TEXTS[color],
                                    marginBottom:4,letterSpacing:1,textTransform:'uppercase'}}>
                          {match.players[color]!.name}
                        </p>
                        <p style={{fontFamily:'monospace',fontSize:20,fontWeight:900,
                                    color:COLOR_VALS[color],lineHeight:1}}>
                          {homeCount[color]}<span style={{fontSize:12,opacity:0.6}}>/4</span>
                        </p>
                        <p style={{fontFamily:'monospace',fontSize: 12,color:'rgba(255,255,255,0.3)',marginTop:2}}>
                          pieces home
                        </p>
                      </div>
                    );
                  })}
              </div>

              <div style={{display:'flex',gap:10,justifyContent:'center'}}>
                {isPlayer && match.playerOrder.length >= 2 && (
                  <motion.button whileTap={{scale:0.94}} onClick={rematch} disabled={isLoading}
                    style={{padding:'12px 22px',borderRadius:14,fontFamily:'monospace',fontSize:11,
                            fontWeight:900,letterSpacing:2,textTransform:'uppercase',cursor:'pointer',
                            background:'linear-gradient(135deg,rgba(0,245,255,0.18),rgba(0,245,255,0.08))',
                            border:'1.5px solid rgba(0,245,255,0.5)',color:'#00f5ff',
                            opacity:isLoading?0.4:1,touchAction:'manipulation'}}>
                    {t.games.ludo.rematch}
                  </motion.button>
                )}
                <motion.button whileTap={{scale:0.94}} onClick={leaveMatch}
                  style={{padding:'12px 22px',borderRadius:14,fontFamily:'monospace',fontSize:11,
                          fontWeight:900,letterSpacing:2,textTransform:'uppercase',cursor:'pointer',
                          background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.14)',
                          color:'rgba(255,255,255,0.65)',touchAction:'manipulation'}}>
                  {t.games.ludo.backToGames}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Resign confirm ───────────────────────────────────────────── */}
      <AnimatePresence>
        {showResign && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            style={{position:'absolute',inset:0,zIndex:60,display:'flex',alignItems:'center',
                    justifyContent:'center',background:'rgba(2,5,18,0.9)'}}>
            <motion.div initial={{scale:0.82,y:24}} animate={{scale:1,y:0}} exit={{scale:0.82,y:24}}
              transition={{type:'spring',stiffness:320,damping:22}}
              style={{margin:24,padding:28,borderRadius:22,textAlign:'center',
                      background:'rgba(5,10,28,0.99)',
                      border:'1.5px solid rgba(255,34,68,0.25)',
                      boxShadow:'0 0 40px rgba(255,34,68,0.08)'}}>
              <p style={{fontFamily:'monospace',fontSize:13,color:'rgba(255,255,255,0.8)',marginBottom:20,lineHeight:1.5}}>
                {t.games.ludo.resignConfirm}
              </p>
              <div style={{display:'flex',gap:12,justifyContent:'center'}}>
                <button onClick={async()=>{await resign();setShowResign(false);}}
                  style={{padding:'10px 20px',borderRadius:12,fontFamily:'monospace',fontSize:11,
                          textTransform:'uppercase',letterSpacing:1,fontWeight:700,cursor:'pointer',
                          background:'rgba(255,34,68,0.15)',border:'1.5px solid rgba(255,34,68,0.45)',
                          color:'#ff2244',touchAction:'manipulation'}}>
                  {t.games.ludo.confirmResign}
                </button>
                <button onClick={()=>setShowResign(false)}
                  style={{padding:'10px 20px',borderRadius:12,fontFamily:'monospace',fontSize:11,
                          textTransform:'uppercase',letterSpacing:1,cursor:'pointer',
                          color:'rgba(255,255,255,0.45)',border:'1px solid rgba(255,255,255,0.1)',
                          background:'transparent',touchAction:'manipulation'}}>
                  {t.games.ludo.cancel}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
