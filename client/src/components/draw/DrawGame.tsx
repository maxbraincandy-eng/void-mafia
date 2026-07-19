import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SFX } from '@/lib/audioEngine';
import { haptic } from '@/lib/haptics';
import { useAuthStore } from '@/store/authStore';
import { useDrawStore, drawIncoming } from '@/store/drawStore';
import type { DrawSeg } from '@/types/draw';

/**
 * დახაზე & გამოიცანი — one player draws a secret word (strokes synced live);
 * the rest guess in chat. Faster correct guesses score more. Prop-less overlay.
 */
const COLORS = ['#141414', '#e23b3b', '#4d9fff', '#3fae5a', '#ffcf3d', '#ff8c26', '#c084fc', '#7a4a1e'];
const SIZES = [0.006, 0.015, 0.03];
const CANVAS_BG = '#f7f3e8';

export function DrawGame() {
  const profile = useAuthStore(s => s.profile);
  const nickname = profile?.username ?? 'Player';
  const { match, chat, leaveMatch, startMatch, chooseWord, sendGuess, sendSeg, clearCanvas, rematch, error, clearError } = useDrawStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [now, setNow] = useState(Date.now());
  const [guessText, setGuessText] = useState('');
  const [color, setColor] = useState('#141414');
  const [sizeI, setSizeI] = useState(1);
  const [eraser, setEraser] = useState(false);
  const prevStatus = useRef('');
  const turnKey = useRef('');
  const drawing = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(iv); }, []);

  // ── Canvas render loop: clear on new turn, drain incoming remote segments ──
  // Re-attaches whenever we enter a canvas phase (the <canvas> only mounts for
  // choosing/drawing/turnend, so a []-deps effect would bail during the lobby).
  const canvasPhase = match && match.status !== 'waiting' && match.status !== 'finished';
  useEffect(() => {
    if (!canvasPhase) return;
    let raf = 0, disposed = false;
    const fit = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (w && h && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; paintBg(ctx, canvas); }
    };
    const loop = () => {
      if (disposed) return;
      raf = requestAnimationFrame(loop);
      const canvas = canvasRef.current;
      if (!canvas) return; // canvas not mounted yet this frame
      const ctx = canvas.getContext('2d')!;
      fit(canvas, ctx);
      if (drawIncoming.clear) { drawIncoming.clear = false; paintBg(ctx, canvas); }
      if (drawIncoming.segs.length) {
        const batch = drawIncoming.segs.splice(0, drawIncoming.segs.length);
        for (const s of batch) drawSeg(ctx, canvas, s);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => { disposed = true; cancelAnimationFrame(raf); };
  }, [canvasPhase]);

  // Clear canvas whenever the turn changes (new drawer / round / phase).
  useEffect(() => {
    if (!match) return;
    const key = `${match.drawerId}-${match.round}-${match.status === 'drawing' ? 'd' : 'x'}`;
    if (key !== turnKey.current) {
      turnKey.current = key;
      drawIncoming.segs.length = 0;
      const c = canvasRef.current;
      if (c) { const ctx = c.getContext('2d')!; paintBg(ctx, c); }
    }
    // SFX
    if (match.status === 'drawing' && prevStatus.current === 'choosing') SFX.dayStart();
    if (match.status === 'turnend' && prevStatus.current === 'drawing') SFX.phaseTransition();
    if (match.status === 'finished' && prevStatus.current && prevStatus.current !== 'finished') SFX.gameOver();
    prevStatus.current = match.status;
  }, [match?.status, match?.drawerId, match?.round]);

  if (!match) return null;
  const myId = match.myUserId;
  const isHost = match.hostId === myId;
  const secondsLeft = Math.max(0, Math.ceil((match.endsAt - now) / 1000));
  const canDraw = match.status === 'drawing' && match.amDrawer;

  // ── Drawer pointer handling ──
  const toNorm = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const onDown = (e: React.PointerEvent) => {
    if (!canDraw) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawing.current = toNorm(e);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!canDraw || !drawing.current) return;
    const p = toNorm(e);
    const last = drawing.current;
    if (Math.hypot(p.x - last.x, p.y - last.y) < 0.002) return;
    const seg: DrawSeg = { x0: last.x, y0: last.y, x1: p.x, y1: p.y, c: eraser ? CANVAS_BG : color, w: eraser ? 0.045 : SIZES[sizeI]! };
    const c = canvasRef.current!; drawSeg(c.getContext('2d')!, c, seg);
    sendSeg(seg);
    drawing.current = p;
  };
  const onUp = () => { drawing.current = null; };

  const submitGuess = () => { const t = guessText.trim(); if (!t) return; sendGuess(t); setGuessText(''); };

  const ranked = [...match.players].sort((a, b) => b.score - a.score);

  return createPortal(
    <div className="fixed inset-0 z-[500] flex flex-col select-none" style={{ background: '#0d0b16' }}
      onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+10px)] pb-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="text-[14px] font-display font-bold tracking-wide text-white">🎨 დახაზე & გამოიცანი</span>
        <div className="flex items-center gap-2">
          {match.status !== 'waiting' && match.status !== 'finished' && <span className="font-mono text-[12px] text-white/40">რაუნდი {Math.min(match.round, match.totalRounds)}/{match.totalRounds}</span>}
          <button onClick={() => leaveMatch()} className="w-8 h-8 rounded-full flex items-center justify-center text-white/60" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>✕</button>
        </div>
      </div>

      {/* ══ LOBBY ══ */}
      {match.status === 'waiting' && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-md mx-auto pt-2 text-center">
            <p className="text-4xl mb-2">🎨</p>
            <p className="font-mono text-[12px] text-white/40 mb-1">გაუზიარე კოდი მეგობრებს</p>
            <button onClick={() => { try { navigator.clipboard?.writeText(match.code); } catch { /* ignore */ } }}
              className="font-mono font-bold text-3xl tracking-[0.3em] text-neon-cyan mb-4 mx-auto block">{match.code}</button>
            <div className="space-y-1.5 mb-5 max-h-64 overflow-y-auto">
              {match.players.map(p => (
                <div key={p.userId} className="px-3 py-2 rounded-xl font-mono text-sm text-white/80" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  {p.nickname}{p.userId === match.hostId ? ' 👑' : ''}{p.userId === myId ? ' ●' : ''}
                </div>
              ))}
            </div>
            <p className="font-mono text-[12px] text-white/35 mb-4">{match.players.length}/{match.maxPlayers} · {match.settings.rounds} რაუნდი · {match.settings.drawSeconds}წმ</p>
            {isHost ? (
              <button onClick={() => startMatch()} disabled={match.players.length < 2}
                className="w-full py-3 rounded-xl font-display font-bold text-sm text-white disabled:opacity-40" style={{ background: 'linear-gradient(135deg,#ff8c26,#c026d3)' }}>
                თამაშის დაწყება
              </button>
            ) : <p className="font-mono text-[13px] text-white/40">ჰოსტს ელოდები…</p>}
            {error && <p className="mt-3 font-mono text-[12px] text-neon-red" onClick={clearError}>{error}</p>}
          </div>
        </div>
      )}

      {/* ══ GAME ══ */}
      {(match.status === 'choosing' || match.status === 'drawing' || match.status === 'turnend') && (
        <div className="flex-1 overflow-hidden flex flex-col p-3">
          {/* Header row: word/mask + timer */}
          <div className="flex items-center justify-between mb-2 flex-shrink-0 px-1">
            <div className="min-w-0">
              {match.status === 'drawing' && (match.amDrawer || match.iGuessed
                ? <span className="font-display font-bold text-lg text-white">{match.myWord}</span>
                : <span className="font-mono text-lg tracking-widest text-white/80">{match.wordMask}</span>)}
              {match.status === 'choosing' && <span className="font-mono text-sm text-white/60">{match.amDrawer ? 'აირჩიე სიტყვა' : `${match.drawerName} ირჩევს…`}</span>}
              {match.status === 'turnend' && <span className="font-display font-bold text-base text-white">სიტყვა: <span style={{ color: '#ffd34d' }}>{match.revealedWord}</span></span>}
            </div>
            <span className="font-display font-bold text-xl flex-shrink-0" style={{ color: secondsLeft <= 10 && match.status === 'drawing' ? '#ff5d6c' : '#fff' }}>⏱{secondsLeft}</span>
          </div>

          {/* Scoreboard strip */}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none mb-2 flex-shrink-0">
            {ranked.map(p => (
              <div key={p.userId} className="flex-shrink-0 px-2 py-1 rounded-lg text-center" style={{ background: p.userId === match.drawerId ? 'rgba(255,140,38,0.18)' : p.guessedThisTurn ? 'rgba(63,174,90,0.16)' : 'rgba(255,255,255,0.05)', border: p.userId === myId ? '1px solid rgba(0,229,255,0.4)' : '1px solid transparent' }}>
                <p className="font-mono text-[11px] text-white/80 whitespace-nowrap">{p.userId === match.drawerId ? '✏️' : p.guessedThisTurn ? '✓' : ''} {p.nickname}</p>
                <p className="font-mono text-[12px] font-bold text-white">{p.score}</p>
              </div>
            ))}
          </div>

          {/* Canvas */}
          <div className="relative flex-shrink-0 rounded-xl overflow-hidden mx-auto w-full" style={{ maxWidth: 520 }}>
            <canvas ref={canvasRef} className="block w-full" style={{ aspectRatio: '4 / 3', background: CANVAS_BG, touchAction: 'none', cursor: canDraw ? 'crosshair' : 'default' }}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onPointerCancel={onUp} />

            {/* Choosing overlay */}
            {match.status === 'choosing' && match.amDrawer && match.myChoices && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: 'rgba(13,11,22,0.92)' }}>
                <p className="font-mono text-[13px] text-white/60 mb-1">აირჩიე რას დახატავ:</p>
                {match.myChoices.map(w => (
                  <button key={w} onClick={() => { chooseWord(w); haptic('selection'); }} className="px-6 py-3 rounded-xl font-display font-bold text-lg text-white" style={{ background: 'rgba(255,140,38,0.16)', border: '1px solid rgba(255,140,38,0.5)' }}>{w}</button>
                ))}
              </div>
            )}
            {match.status === 'turnend' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'rgba(13,11,22,0.55)' }}>
                <p className="text-3xl mb-1">🖼</p>
                <p className="font-display font-bold text-lg text-white">სიტყვა იყო: <span style={{ color: '#ffd34d' }}>{match.revealedWord}</span></p>
                <p className="font-mono text-[12px] text-white/50 mt-1">შემდეგი რაუნდი…</p>
              </div>
            )}
          </div>

          {/* Tools (drawer only) */}
          {canDraw && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap justify-center flex-shrink-0">
              {COLORS.map(c => (
                <button key={c} onClick={() => { setColor(c); setEraser(false); }} className="w-7 h-7 rounded-full" style={{ background: c, border: color === c && !eraser ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)' }} />
              ))}
              <button onClick={() => setEraser(e => !e)} className="px-2 h-7 rounded-lg text-[13px]" style={{ background: eraser ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.2)' }}>🧽</button>
              {SIZES.map((_, i) => (
                <button key={i} onClick={() => setSizeI(i)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: sizeI === i ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)' }}>
                  <span className="rounded-full bg-white block" style={{ width: 3 + i * 4, height: 3 + i * 4 }} />
                </button>
              ))}
              <button onClick={() => clearCanvas()} className="px-2 h-7 rounded-lg text-[12px] text-white/70" style={{ border: '1px solid rgba(255,255,255,0.2)' }}>🗑</button>
            </div>
          )}

          {/* Chat / guessing */}
          <div className="flex-1 min-h-0 flex flex-col mt-2">
            <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5 px-1">
              {chat.slice(-30).map((c, i) => (
                <p key={i} className="font-mono text-[13px] leading-snug">
                  {c.system
                    ? <span className="text-neon-green/80">✓ {c.nickname} გამოიცნო!</span>
                    : <><span className="text-neon-cyan/70">{c.nickname}:</span> <span className="text-white/70">{c.text}</span></>}
                </p>
              ))}
            </div>
            {!match.amDrawer && match.status === 'drawing' && !match.iGuessed && (
              <div className="flex gap-2 mt-1.5">
                <input value={guessText} onChange={e => setGuessText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitGuess(); }}
                  placeholder="შენი გამოცანა…" maxLength={60}
                  className="flex-1 px-3 py-2 rounded-xl font-mono text-[14px] text-white bg-white/5 border border-white/10 outline-none focus:border-neon-cyan/40" />
                <button onClick={submitGuess} className="px-4 rounded-xl font-mono text-neon-cyan" style={{ border: '1px solid rgba(0,229,255,0.35)' }}>➤</button>
              </div>
            )}
            {match.iGuessed && match.status === 'drawing' && <p className="text-center font-mono text-[12px] text-neon-green/70 mt-1.5">გამოიცანი! ✓ დაელოდე დანარჩენებს</p>}
          </div>
        </div>
      )}

      {/* ══ FINISHED ══ */}
      {match.status === 'finished' && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-md mx-auto text-center pt-6">
            <p className="text-5xl mb-3">🏆</p>
            <p className="font-display font-bold text-2xl text-white mb-5">{match.players.find(p => p.userId === match.winnerId)?.nickname ?? '—'} გაიმარჯვა!</p>
            <div className="space-y-1.5 mb-8">
              {ranked.map((p, i) => (
                <div key={p.userId} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: i === 0 ? 'rgba(255,211,77,0.12)' : 'rgba(255,255,255,0.04)' }}>
                  <span className="font-mono text-white/40 w-5">{i + 1}</span>
                  <span className="font-mono text-sm text-white/85 flex-1 text-left truncate">{p.nickname}</span>
                  <span className="font-display font-bold text-white">{p.score}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2.5 items-stretch max-w-[280px] mx-auto">
              {isHost && <button onClick={() => rematch()} className="py-3 rounded-xl font-display font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg,#ff8c26,#c026d3)' }}>თავიდან</button>}
              <button onClick={() => leaveMatch()} className="py-3 rounded-xl font-mono text-sm text-white/50" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>გასვლა</button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

function paintBg(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  ctx.fillStyle = CANVAS_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
function drawSeg(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, s: DrawSeg) {
  ctx.strokeStyle = s.c;
  ctx.lineWidth = Math.max(1, s.w * canvas.width);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(s.x0 * canvas.width, s.y0 * canvas.height);
  ctx.lineTo(s.x1 * canvas.width, s.y1 * canvas.height);
  ctx.stroke();
}
