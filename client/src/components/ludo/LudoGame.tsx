import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useT } from '@/store/langStore';
import { useLudoStore } from '@/store/ludoStore';
import { LudoBoard, getPieceGridPos, WIN_POS } from './LudoBoard';
import type { LudoColor, LudoMatchPublic } from '@/types/ludo';

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

// ── Dice face dots layout ──────────────────────────────────────────────
const DOT_POSITIONS: Record<number,[number,number][]> = {
  1: [[50,50]],
  2: [[25,28],[75,72]],
  3: [[25,25],[50,50],[75,75]],
  4: [[26,26],[74,26],[26,74],[74,74]],
  5: [[26,26],[74,26],[50,50],[26,74],[74,74]],
  6: [[26,22],[74,22],[26,50],[74,50],[26,78],[74,78]],
};

function DiceFace({ value, rolling, size=64 }: { value:number|null; rolling:boolean; size?:number }) {
  const dots = value ? DOT_POSITIONS[value] ?? [] : [];
  const isSix = value === 6 && !rolling;
  return (
    <motion.div
      animate={rolling ? { rotate:[0,15,-15,10,-10,0], scale:[1,1.05,0.97,1.03,0.98,1] } : { rotate:0, scale:1 }}
      transition={rolling ? { repeat:Infinity, duration:0.25 } : { type:'spring', stiffness:400, damping:18 }}
      style={{
        width:size, height:size, borderRadius:Math.round(size*0.2),
        flexShrink:0, position:'relative',
        background: isSix ? 'linear-gradient(135deg,#fef08a,#fbbf24)' : value ? '#f8fafc' : 'rgba(255,255,255,0.06)',
        border: `${Math.max(2,size*0.04)}px solid ${isSix?'#f59e0b':value?'rgba(255,255,255,0.5)':'rgba(255,255,255,0.1)'}`,
        boxShadow: isSix ? '0 0 20px rgba(251,191,36,0.7),0 2px 12px rgba(0,0,0,0.5)' : value ? '0 2px 12px rgba(0,0,0,0.4)' : '0 1px 6px rgba(0,0,0,0.3)',
      }}
    >
      {dots.map(([x,y],i) => (
        <div key={i} style={{
          position:'absolute', borderRadius:'50%',
          width:size*0.155, height:size*0.155,
          background: isSix ? '#92400e' : '#1e1b4b',
          left:`calc(${x}% - ${size*0.155/2}px)`,
          top:`calc(${y}% - ${size*0.155/2}px)`,
        }}/>
      ))}
      {!value && !rolling && (
        <span style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',
                      fontSize:size*0.35,opacity:0.2,color:'#fff'}}>?</span>
      )}
    </motion.div>
  );
}

// ── Piece status pips ──────────────────────────────────────────────────
function PiecePips({ pieces, color }: { pieces:{pos:number}[]; color:LudoColor }) {
  return (
    <div className="flex gap-1">
      {pieces.map((p,i) => {
        const isYard     = p.pos === -1;
        const isFinished = p.pos === WIN_POS;
        const isHome     = p.pos >= 52 && p.pos < WIN_POS;
        const isOnBoard  = p.pos >= 0 && p.pos < 52;
        const bg = isFinished ? '#22c55e' : isHome ? (color==='red'?'#fca5a5':'#93c5fd')
                 : isOnBoard  ? (color==='red'?'#ef4444':'#3b82f6')
                 : 'rgba(255,255,255,0.12)';
        return (
          <div key={i} style={{ width:9,height:9,borderRadius:'50%',background:bg,
                                border:`1.5px solid ${isFinished?'#86efac':isYard?'rgba(255,255,255,0.15)':(color==='red'?'#fca5a5':'#93c5fd')}`,
                                flexShrink:0 }} />
        );
      })}
    </div>
  );
}

// ── Player banner ──────────────────────────────────────────────────────
function PlayerBanner({
  name, color, isActive, pieces, isYou, absent, t,
}: { name:string; color:LudoColor; isActive:boolean; pieces:{pos:number}[]; isYou:boolean; absent:boolean; t:any }) {
  const isRed = color === 'red';
  const accentRgb = isRed ? '239,68,68' : '59,130,246';
  const accentHex = isRed ? '#ef4444' : '#3b82f6';
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:10, padding:'7px 12px',
      borderRadius:12, flex:1,
      background: isActive ? `rgba(${accentRgb},0.12)` : 'rgba(255,255,255,0.03)',
      border: `1.5px solid ${isActive?`rgba(${accentRgb},0.45)`:'rgba(255,255,255,0.07)'}`,
      transition:'all 0.3s',
    }}>
      <div style={{ width:10,height:10,borderRadius:'50%',background:accentHex,flexShrink:0,
                    boxShadow:isActive?`0 0 8px ${accentHex}`:undefined }} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <p style={{ fontFamily:'monospace',fontSize:12,color:'#fff',lineHeight:1.2,
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
            {absent ? <span style={{color:'rgba(255,255,255,0.3)'}}>{t.games.ludo.waiting}</span> : name}
          </p>
          {isYou && <span style={{fontFamily:'monospace',fontSize:9,color:'rgba(255,255,255,0.3)'}}>{t.games.ludo.you}</span>}
        </div>
        {!absent && <PiecePips pieces={pieces} color={color} />}
      </div>
      {isActive && <motion.div animate={{opacity:[1,0.3,1]}} transition={{repeat:Infinity,duration:1.1}}
        style={{width:7,height:7,borderRadius:'50%',background:accentHex,flexShrink:0}} />}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────
export function LudoGame() {
  const t = useT();
  const { match, isLoading, leaveMatch, rollDice, movePiece, resign, rematch, sendChat } = useLudoStore();

  // Dice animation state
  const [isRolling, setIsRolling]   = useState(false);
  const [diceFace,  setDiceFace]    = useState<number|null>(null);
  const [isSix,     setIsSix]       = useState(false);
  const rollIntervalRef = useRef<ReturnType<typeof setInterval>|null>(null);

  // Chat
  const [chatOpen,  setChatOpen]  = useState(false);
  const [chatInput, setChatInput] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);

  // Resign confirm
  const [showResign, setShowResign] = useState(false);

  // Capture flash
  const [flashCell, setFlashCell] = useState<{row:number;col:number}|null>(null);

  // Toast system
  const { toasts, add: addToast } = useToasts();

  // Track prev match for detecting events
  const prevMatchRef = useRef<LudoMatchPublic|null>(null);

  // Scroll chat on new messages
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [match?.chat]);

  // Detect game events (dice roll, captures, pieces reaching home)
  useEffect(() => {
    const prev = prevMatchRef.current;
    const curr = match;
    if (!curr) { prevMatchRef.current = null; return; }

    if (prev) {
      // Detect new dice roll (diceRoll changed)
      if (curr.diceRoll !== null && curr.diceRoll !== prev.diceRoll) {
        setDiceFace(curr.diceRoll);
        if (curr.diceRoll === 6) {
          setIsSix(true);
          addToast(t.games.ludo.rolledSix, '🎲', '#fbbf24');
        } else {
          setIsSix(false);
        }
      }
      if (curr.diceRoll === null && prev.diceRoll !== null) {
        setIsSix(false);
      }

      // Detect captures (piece went from pos>=0 to pos===-1)
      const checkCaptures = (currPieces: {pos:number;id:number}[], prevPieces: {pos:number;id:number}[], color: LudoColor, opponentName:string) => {
        for (const cp of currPieces) {
          const pp = prevPieces.find(p=>p.id===cp.id);
          if (pp && pp.pos >= 0 && cp.pos === -1) {
            // This piece was captured — flash where it was
            const {row,col} = getPieceGridPos(pp.pos, color, cp.id);
            setFlashCell({row,col});
            setTimeout(() => setFlashCell(null), 600);
            addToast(`${opponentName} ${t.games.ludo.sentToYard}`, '💥', '#f97316');
          }
        }
      };

      const redName  = curr.red.name;
      const blueName = curr.blue?.name ?? '';
      checkCaptures(curr.red.pieces, prev.red.pieces ?? [], 'red', redName);
      if (curr.blue && prev.blue) checkCaptures(curr.blue.pieces, prev.blue.pieces, 'blue', blueName);

      // Detect piece reaching home (pos became WIN_POS)
      const checkWin = (currP: {pos:number;id:number}[], prevP: {pos:number;id:number}[], name:string) => {
        for (const cp of currP) {
          const pp = prevP.find(p=>p.id===cp.id);
          if (pp && pp.pos !== WIN_POS && cp.pos === WIN_POS) {
            addToast(`${name} ${t.games.ludo.pieceHome}`, '⭐', '#22c55e');
          }
        }
      };
      checkWin(curr.red.pieces, prev.red.pieces ?? [], redName);
      if (curr.blue && prev.blue) checkWin(curr.blue.pieces, prev.blue.pieces, blueName);

      // Detect game start
      if (prev.status === 'waiting' && curr.status === 'active') {
        addToast(t.games.ludo.gameStarted, '🎮', '#c084fc');
      }
    }

    prevMatchRef.current = curr;
  }, [match, addToast, t]);

  // Dice rolling interval
  useEffect(() => {
    if (isRolling) {
      rollIntervalRef.current = setInterval(() => {
        setDiceFace(Math.floor(Math.random()*6)+1);
      }, 80);
    } else {
      if (rollIntervalRef.current) { clearInterval(rollIntervalRef.current); rollIntervalRef.current=null; }
    }
    return () => { if (rollIntervalRef.current) clearInterval(rollIntervalRef.current); };
  }, [isRolling]);

  const handleRoll = useCallback(async () => {
    if (!match || isRolling) return;
    setIsRolling(true);
    setIsSix(false);
    await Promise.all([
      rollDice(),
      new Promise(r => setTimeout(r, 650)),
    ]);
    setIsRolling(false);
  }, [match, isRolling, rollDice]);

  const handlePieceClick = useCallback(async (color: LudoColor, id: number) => {
    await movePiece(id);
  }, [movePiece]);

  const handleSendChat = useCallback(async () => {
    const txt = chatInput.trim();
    if (!txt) return;
    setChatInput('');
    await sendChat(txt);
  }, [chatInput, sendChat]);

  if (!match) return null;

  const myColor    = match.myColor;
  const isPlayer   = myColor === 'red' || myColor === 'blue';
  const isMyTurn   = isPlayer && match.currentTurn === myColor;
  const isFinished = match.status === 'finished';
  const isWaiting  = match.status === 'waiting';

  const canRoll = isMyTurn && !match.diceRolled && !isFinished && !isWaiting;
  const canMove = isMyTurn && match.diceRolled && match.movablePieceIds.length > 0;

  // Layout: top player = opponent, bottom player = me (or red if spectator)
  const topColor: LudoColor    = myColor === 'blue' ? 'red'  : 'blue';
  const bottomColor: LudoColor = myColor === 'blue' ? 'blue' : 'red';
  const topSide    = topColor    === 'red' ? match.red : match.blue;
  const bottomSide = bottomColor === 'red' ? match.red : match.blue;

  const isWinner = isFinished && match.winnerColor === myColor;
  const winnerName = match.winnerColor
    ? (match.winnerColor==='red' ? match.red.name : match.blue?.name ?? '?')
    : null;

  // Turn status message
  let statusMsg = '';
  let statusColor = 'rgba(255,255,255,0.35)';
  if (!isFinished && !isWaiting) {
    if (isMyTurn && !match.diceRolled) {
      statusMsg  = t.games.ludo.yourTurn;
      statusColor= '#00f5ff';
    } else if (isMyTurn && canMove) {
      statusMsg  = t.games.ludo.pickPiece;
      statusColor= '#22c55e';
    } else if (isMyTurn && match.diceRolled && !canMove) {
      statusMsg  = t.games.ludo.noMoves;
      statusColor= 'rgba(255,255,255,0.4)';
    } else {
      const oppName = topSide?.name ?? '?';
      statusMsg  = `${oppName}${t.games.ludo.opponentTurnSuffix}`;
      statusColor= 'rgba(255,255,255,0.4)';
    }
  } else if (isWaiting) {
    statusMsg = t.games.ludo.waitingForOpponent;
    statusColor = '#c084fc';
  }

  return (
    <motion.div
      initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{background:'#04010f'}}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{ flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between',
                    padding:'10px 16px', borderBottom:'1px solid rgba(34,197,94,0.18)',
                    background:'rgba(10,6,28,0.97)' }}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:22}}>🎲</span>
          <div>
            <p style={{fontFamily:'var(--font-display,monospace)',fontWeight:700,color:'#fff',fontSize:14,lineHeight:1.2}}>
              {t.games.ludo.title}
            </p>
            <p style={{fontFamily:'monospace',fontSize:10,color:'rgba(255,255,255,0.3)',letterSpacing:2}}>
              {match.code}
            </p>
          </div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {isPlayer && !isFinished && !isWaiting && (
            <button onClick={()=>setShowResign(true)}
              style={{padding:'4px 10px',borderRadius:8,fontFamily:'monospace',fontSize:10,
                      color:'rgba(255,255,255,0.35)',border:'1px solid rgba(255,255,255,0.1)',
                      background:'transparent',cursor:'pointer'}}>
              {t.games.ludo.resign}
            </button>
          )}
          <button onClick={leaveMatch}
            style={{width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center',
                    borderRadius:10,color:'rgba(255,255,255,0.4)',border:'none',
                    background:'rgba(255,255,255,0.05)',cursor:'pointer',fontSize:16}}>
            ✕
          </button>
        </div>
      </div>

      {/* ── Player banners ──────────────────────────────────────────── */}
      <div style={{flexShrink:0,display:'flex',gap:8,padding:'8px 12px 4px'}}>
        <PlayerBanner
          name={topSide?.name ?? '—'} color={topColor}
          isActive={!isFinished && match.currentTurn===topColor}
          pieces={topSide?.pieces ?? []} isYou={myColor===topColor}
          absent={!topSide} t={t}
        />
        <PlayerBanner
          name={bottomSide?.name ?? '—'} color={bottomColor}
          isActive={!isFinished && match.currentTurn===bottomColor}
          pieces={bottomSide?.pieces ?? []} isYou={myColor===bottomColor}
          absent={!bottomSide} t={t}
        />
      </div>

      {/* ── Status line ────────────────────────────────────────────── */}
      {statusMsg && (
        <div style={{flexShrink:0,textAlign:'center',padding:'2px 16px'}}>
          <motion.p
            key={statusMsg}
            initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} transition={{duration:0.2}}
            style={{fontFamily:'monospace',fontSize:11,fontWeight:700,color:statusColor,letterSpacing:1}}>
            {statusMsg.toUpperCase()}
          </motion.p>
        </div>
      )}

      {/* ── Board ──────────────────────────────────────────────────── */}
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',
                   padding:'4px 12px',minHeight:0,overflow:'hidden'}}>
        <div style={{width:'100%',maxWidth:420}}>
          <LudoBoard match={match} onPieceClick={handlePieceClick} flashCell={flashCell} />
        </div>
      </div>

      {/* ── Dice + Controls area ────────────────────────────────────── */}
      <div style={{flexShrink:0,padding:'8px 16px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:16}}>
          {/* Dice */}
          <div style={{position:'relative'}}>
            <DiceFace value={diceFace} rolling={isRolling} size={60} />
            {/* Six banner */}
            <AnimatePresence>
              {isSix && !isRolling && (
                <motion.div
                  initial={{opacity:0,scale:0.7,y:4}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:0.7}}
                  style={{position:'absolute',top:-22,left:'50%',transform:'translateX(-50%)',
                          background:'#fbbf24',color:'#92400e',borderRadius:6,
                          padding:'2px 7px',fontFamily:'monospace',fontSize:10,fontWeight:700,
                          whiteSpace:'nowrap',boxShadow:'0 2px 8px rgba(251,191,36,0.5)'}}>
                  🎲 {t.games.ludo.rollAgain}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Roll button */}
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
            {canRoll && !isRolling && (
              <motion.button
                whileTap={{scale:0.93}} whileHover={{scale:1.04}}
                onClick={handleRoll}
                style={{padding:'11px 28px',borderRadius:14,fontFamily:'monospace',fontSize:14,
                        fontWeight:700,letterSpacing:2,textTransform:'uppercase',cursor:'pointer',
                        background:'linear-gradient(135deg,rgba(34,197,94,0.25),rgba(34,197,94,0.1))',
                        border:'1.5px solid rgba(34,197,94,0.5)',color:'#22c55e',
                        boxShadow:'0 0 20px rgba(34,197,94,0.15)'}}>
                {t.games.ludo.rollDice}
              </motion.button>
            )}
            {isRolling && (
              <motion.div
                animate={{opacity:[1,0.6,1]}} transition={{repeat:Infinity,duration:0.4}}
                style={{padding:'11px 28px',borderRadius:14,fontFamily:'monospace',fontSize:14,
                        fontWeight:700,letterSpacing:2,color:'rgba(255,255,255,0.4)',
                        border:'1.5px solid rgba(255,255,255,0.1)',textTransform:'uppercase'}}>
                {t.games.ludo.rolling}
              </motion.div>
            )}
            {canMove && !isRolling && (
              <p style={{fontFamily:'monospace',fontSize:11,color:'#22c55e',
                         fontWeight:700,letterSpacing:1,textTransform:'uppercase',
                         animation:'pulse 1s ease-in-out infinite'}}>
                ↑ {t.games.ludo.tapPiece}
              </p>
            )}
            {!canRoll && !canMove && !isRolling && !isFinished && !isWaiting && (
              <p style={{fontFamily:'monospace',fontSize:11,color:'rgba(255,255,255,0.25)',letterSpacing:1}}>
                {t.games.ludo.opponentRolling}
              </p>
            )}
          </div>

          {/* Consecutive sixes indicator */}
          {match.consecutiveSixes > 0 && !isFinished && (
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
              {Array.from({length:match.consecutiveSixes}).map((_,i)=>(
                <div key={i} style={{width:8,height:8,borderRadius:'50%',background:'#fbbf24'}} />
              ))}
              <p style={{fontFamily:'monospace',fontSize:8,color:'#fbbf24',letterSpacing:0.5}}>
                {match.consecutiveSixes}/3
              </p>
            </div>
          )}

          {/* Chat toggle */}
          <button
            onClick={()=>setChatOpen(o=>!o)}
            style={{width:40,height:40,borderRadius:12,display:'flex',flexDirection:'column',
                    alignItems:'center',justifyContent:'center',gap:2,cursor:'pointer',
                    background:chatOpen?'rgba(255,255,255,0.08)':'rgba(255,255,255,0.03)',
                    border:`1px solid ${chatOpen?'rgba(255,255,255,0.2)':'rgba(255,255,255,0.08)'}`,
                    position:'relative'}}>
            <span style={{fontSize:16}}>💬</span>
            {match.chat.length>0 && !chatOpen && (
              <div style={{position:'absolute',top:4,right:4,width:6,height:6,borderRadius:'50%',background:'#c084fc'}} />
            )}
          </button>
        </div>
      </div>

      {/* ── Chat ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{height:0,opacity:0}} animate={{height:140,opacity:1}} exit={{height:0,opacity:0}}
            transition={{duration:0.2,ease:'easeOut'}}
            style={{flexShrink:0,borderTop:'1px solid rgba(34,197,94,0.1)',overflow:'hidden',
                    background:'rgba(10,6,28,0.6)',backdropFilter:'blur(4px)'}}>
            <div ref={chatRef} style={{overflowY:'auto',padding:'6px 12px',maxHeight:100}}>
              {match.chat.length===0 && (
                <p style={{fontFamily:'monospace',fontSize:10,color:'rgba(255,255,255,0.2)'}}>
                  {t.games.ludo.noMessages}
                </p>
              )}
              {match.chat.map(msg=>(
                <div key={msg.id} style={{display:'flex',gap:6,marginBottom:2}}>
                  <span style={{fontFamily:'monospace',fontSize:10,color:'rgba(255,255,255,0.4)',flexShrink:0}}>
                    {msg.name}:
                  </span>
                  <span style={{fontFamily:'monospace',fontSize:10,color:'rgba(255,255,255,0.75)',wordBreak:'break-word'}}>
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
                        border:'1px solid rgba(255,255,255,0.1)'}} />
              <button onClick={handleSendChat} disabled={!chatInput.trim()}
                style={{padding:'5px 12px',borderRadius:10,fontFamily:'monospace',fontSize:12,
                        color:'rgba(255,255,255,0.5)',border:'1px solid rgba(255,255,255,0.1)',
                        background:'transparent',cursor:'pointer'}}>↑</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toasts ─────────────────────────────────────────────────── */}
      <div style={{position:'absolute',top:70,left:0,right:0,display:'flex',flexDirection:'column',
                   alignItems:'center',gap:6,pointerEvents:'none',zIndex:40}}>
        <AnimatePresence>
          {toasts.map(toast=>(
            <motion.div key={toast.id}
              initial={{opacity:0,y:-16,scale:0.85}} animate={{opacity:1,y:0,scale:1}}
              exit={{opacity:0,y:8,scale:0.9}} transition={{type:'spring',stiffness:300,damping:24}}
              style={{display:'flex',alignItems:'center',gap:8,padding:'7px 16px',borderRadius:24,
                      backdropFilter:'blur(8px)',
                      background:`rgba(10,6,28,0.92)`,
                      border:`1px solid ${toast.accent}40`,
                      boxShadow:`0 4px 24px ${toast.accent}30`}}>
              <span style={{fontSize:16}}>{toast.emoji}</span>
              <span style={{fontFamily:'monospace',fontSize:11,color:'#fff',fontWeight:600}}>
                {toast.text}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Victory overlay ─────────────────────────────────────────── */}
      <AnimatePresence>
        {isFinished && (
          <motion.div
            initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            style={{position:'absolute',inset:0,zIndex:50,display:'flex',flexDirection:'column',
                    alignItems:'center',justifyContent:'center',
                    background:'rgba(4,1,15,0.92)',backdropFilter:'blur(6px)'}}>
            {/* Stars burst */}
            {isWinner && [0,60,120,180,240,300].map(angle=>(
              <motion.div key={angle}
                initial={{opacity:0,scale:0}} animate={{opacity:[0,1,0],scale:[0,1.5,2],x:`${Math.cos(angle*Math.PI/180)*80}px`,y:`${Math.sin(angle*Math.PI/180)*80}px`}}
                transition={{delay:0.15,duration:0.8,ease:'easeOut'}}
                style={{position:'absolute',fontSize:14,pointerEvents:'none'}}>⭐</motion.div>
            ))}
            <motion.div
              initial={{scale:0.5,y:30}} animate={{scale:1,y:0}}
              transition={{type:'spring',stiffness:280,damping:20,delay:0.1}}
              style={{textAlign:'center',padding:'0 32px',maxWidth:360}}>
              <div style={{fontSize:64,marginBottom:8,lineHeight:1}}>
                {isWinner ? '🏆' : match.winnerColor===null ? '🤝' : '💀'}
              </div>
              <p style={{fontFamily:'monospace',fontSize:26,fontWeight:900,color:'#fff',marginBottom:4,
                         textShadow:isWinner?'0 0 30px #fbbf24':'none'}}>
                {winnerName ? `${winnerName}` : '—'}
              </p>
              <p style={{fontFamily:'monospace',fontSize:14,color:isWinner?'#fbbf24':'rgba(255,255,255,0.5)',
                         marginBottom:24,letterSpacing:2,textTransform:'uppercase'}}>
                {match.winnerColor ? t.games.ludo.wins : t.games.ludo.draw}
              </p>

              <div style={{display:'flex',gap:12,justifyContent:'center'}}>
                {isPlayer && match.blue && (
                  <motion.button whileTap={{scale:0.95}} onClick={rematch} disabled={isLoading}
                    style={{padding:'12px 24px',borderRadius:14,fontFamily:'monospace',fontSize:12,
                            fontWeight:700,letterSpacing:2,textTransform:'uppercase',cursor:'pointer',
                            background:'rgba(34,197,94,0.18)',border:'1.5px solid rgba(34,197,94,0.5)',
                            color:'#22c55e',opacity:isLoading?0.5:1}}>
                    {t.games.ludo.rematch}
                  </motion.button>
                )}
                <motion.button whileTap={{scale:0.95}} onClick={leaveMatch}
                  style={{padding:'12px 24px',borderRadius:14,fontFamily:'monospace',fontSize:12,
                          fontWeight:700,letterSpacing:2,textTransform:'uppercase',cursor:'pointer',
                          background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.15)',
                          color:'rgba(255,255,255,0.7)'}}>
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
                    justifyContent:'center',background:'rgba(4,1,15,0.88)'}}>
            <motion.div initial={{scale:0.85,y:20}} animate={{scale:1,y:0}} exit={{scale:0.85,y:20}}
              transition={{type:'spring',stiffness:300,damping:22}}
              style={{margin:24,padding:24,borderRadius:20,textAlign:'center',
                      background:'rgba(10,6,28,0.99)',border:'1px solid rgba(255,45,85,0.3)'}}>
              <p style={{fontFamily:'monospace',fontSize:13,color:'#fff',marginBottom:20}}>
                {t.games.ludo.resignConfirm}
              </p>
              <div style={{display:'flex',gap:12,justifyContent:'center'}}>
                <button onClick={async()=>{await resign();setShowResign(false);}}
                  style={{padding:'9px 20px',borderRadius:12,fontFamily:'monospace',fontSize:11,
                          textTransform:'uppercase',letterSpacing:1,fontWeight:700,cursor:'pointer',
                          background:'rgba(255,45,85,0.15)',border:'1px solid rgba(255,45,85,0.4)',
                          color:'#ff2d55'}}>
                  {t.games.ludo.confirmResign}
                </button>
                <button onClick={()=>setShowResign(false)}
                  style={{padding:'9px 20px',borderRadius:12,fontFamily:'monospace',fontSize:11,
                          textTransform:'uppercase',letterSpacing:1,cursor:'pointer',
                          color:'rgba(255,255,255,0.5)',border:'1px solid rgba(255,255,255,0.1)',
                          background:'transparent'}}>
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
