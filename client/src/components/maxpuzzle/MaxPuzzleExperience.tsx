import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { SFX } from '@/lib/audioEngine';
import { haptic } from '@/lib/haptics';
import { useAuthStore } from '@/store/authStore';
import { useMaxPuzzleStore } from '@/store/maxPuzzleStore';
import { MaxSeal } from './MaxSeal';
import { MP_DILEMMAS, MP_TOTAL } from './dilemmas';
import { computeResult } from './engine';
import {
  MP_TRAITS, MP_TRAIT_META, MP_BOARD_SCOPES,
  type MPAnswer, type MPResult,
} from './types';

/**
 * ბატონი მაქსის თავსატეხი — the full experience: aristocratic intro, one
 * dilemma per screen, Mr. Max's commentary after every answer, and a premium
 * profile screen with trait bars, a shareable card, and the trait leaderboard.
 * Scoring lives in engine.ts; the UI only replays the answer list, so
 * back/refresh are safe.
 */

const STATE_KEY = 'vm-mx-state';
const RESULT_KEY = 'vm-mx-result';

type Phase = 'intro' | 'test' | 'commentary' | 'computing' | 'result' | 'board';

interface SavedState { answers: MPAnswer[] }
interface SavedResult { answers: MPAnswer[]; date: number }

function loadJSON<T>(key: string): T | null { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) as T : null; } catch { return null; } }
function saveJSON(key: string, v: unknown): void { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } }

const GOLD = '#d9b45a';
const GOLD_SOFT = 'rgba(217,180,90,0.55)';
const VIOLET = '#8b5cf6';

const CATEGORY_KA: Record<string, string> = {
  social_influence: 'სოციალური გავლენა',
  status: 'სტატუსი',
  conformity: 'კონფორმიზმი',
  morality: 'მორალი',
  freedom: 'თავისუფლება',
  truth: 'სიმართლე',
  ambition: 'ამბიცია',
  power: 'ძალაუფლება',
  human_nature: 'ადამიანური ბუნება',
  mirror: 'სარკე',
};

export function MaxPuzzleExperience({ onClose }: { onClose: () => void }) {
  const saved = useMemo(() => loadJSON<SavedState>(STATE_KEY), []);
  const savedResult = useMemo(() => loadJSON<SavedResult>(RESULT_KEY), []);
  const isMod = useAuthStore(s => !!s.profile?.isModerator);

  const [phase, setPhase] = useState<Phase>('intro');
  const [answers, setAnswers] = useState<MPAnswer[]>(saved?.answers ?? []);
  const [result, setResult] = useState<MPResult | null>(
    savedResult ? computeResult(savedResult.answers) : null,
  );
  const [commentary, setCommentary] = useState<string>('');

  const idx = answers.length;
  const dilemma = idx < MP_TOTAL ? MP_DILEMMAS[idx]! : null;

  // Resume mid-test after refresh.
  useEffect(() => {
    if (saved && saved.answers.length > 0 && saved.answers.length < MP_TOTAL && !savedResult) setPhase('test');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const begin = () => { SFX.gameStart(); haptic('success'); setAnswers([]); saveJSON(STATE_KEY, { answers: [] }); setPhase('test'); };

  const pick = (choiceIdx: number) => {
    if (!dilemma) return;
    SFX.click(); haptic('selection');
    const next = [...answers, { dilemmaId: dilemma.id, choiceIdx }];
    setAnswers(next);
    saveJSON(STATE_KEY, { answers: next });
    setCommentary(dilemma.answers[choiceIdx]!.c);
    setPhase('commentary');
  };

  const continueAfterCommentary = () => {
    SFX.click();
    if (answers.length >= MP_TOTAL) {
      setPhase('computing');
      SFX.phaseTransition(); haptic('heavy');
      setTimeout(() => {
        const r = computeResult(answers);
        setResult(r);
        saveJSON(RESULT_KEY, { answers, date: Date.now() });
        try { localStorage.removeItem(STATE_KEY); } catch { /* ignore */ }
        useMaxPuzzleStore.getState().submitResult(r);
        setPhase('result');
        SFX.gameOver();
      }, 2400);
    } else {
      setPhase('test');
    }
  };

  const restart = () => {
    try { localStorage.removeItem(STATE_KEY); localStorage.removeItem(RESULT_KEY); } catch { /* ignore */ }
    setAnswers([]); setResult(null); setPhase('intro');
  };

  return createPortal(
    <div className="fixed inset-0 z-[520] flex flex-col select-none"
      style={{ background: 'radial-gradient(ellipse 95% 55% at 50% -5%, #1c1230 0%, #0a0714 62%)', fontFamily: '"Space Grotesk", system-ui, sans-serif' }}
      onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>

      {/* Top bar */}
      <div className="flex-shrink-0 px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-2" style={{ borderBottom: `1px solid rgba(217,180,90,0.16)` }}>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em]" style={{ color: GOLD_SOFT }}>ბატონი მაქსის თავსატეხი</span>
          <div className="flex items-center gap-2">
            {(phase === 'test' || phase === 'commentary') && (
              <span className="font-mono text-[11px]" style={{ color: 'rgba(255,255,255,0.4)', fontVariantNumeric: 'tabular-nums' }}>
                თავსატეხი {String(Math.min(idx + (phase === 'commentary' ? 0 : 1), MP_TOTAL)).padStart(2, '0')} / {MP_TOTAL}
              </span>
            )}
            {phase === 'board' && (
              <button onClick={() => setPhase(result ? 'result' : 'intro')} className="font-mono text-[11px] px-2 py-1 rounded-lg" style={{ color: GOLD, border: `1px solid rgba(217,180,90,0.3)` }}>← უკან</button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.15)' }}>✕</button>
          </div>
        </div>
        {(phase === 'test' || phase === 'commentary') && (
          <div className="mt-2 h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
            <motion.div className="h-full rounded-full" animate={{ width: `${(idx / MP_TOTAL) * 100}%` }}
              style={{ background: `linear-gradient(90deg, ${VIOLET}, ${GOLD})` }} transition={{ duration: 0.5 }} />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <AnimatePresence mode="wait">

          {/* ── INTRO ─────────────────────────────────────────────────── */}
          {phase === 'intro' && (
            <motion.div key="intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="min-h-full flex flex-col items-center justify-center px-6 py-10 text-center max-w-xl mx-auto">
              <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.8, ease: 'easeOut' }}>
                <MaxSeal size={110} />
              </motion.div>
              <h1 className="font-display font-black text-white mt-6 leading-tight" style={{ fontSize: 26 }}>
                ბატონი მაქსის <span style={{ color: GOLD }}>თავსატეხი</span>
              </h1>
              <p className="mt-3 text-[14px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)', fontStyle: 'italic' }}>
                „ყველაზე საინტერესო პასუხები ხშირად ის პასუხებია, რომელთა ახსნაც ყველაზე რთულია."
              </p>
              <div className="mt-6 rounded-2xl p-4 text-left" style={{ background: 'rgba(217,180,90,0.05)', border: '1px solid rgba(217,180,90,0.18)' }}>
                <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  ეს არის დილემების კრებული ადამიანურ ქცევაზე, გავლენაზე, სტატუსზე, კონფორმიზმზე, მორალზე, ამბიციასა და თავისუფლებაზე.
                  აქ ობიექტურად სწორი პასუხები არ არსებობს — სისტემა შენს არჩევანს აანალიზებს და ეტაპობრივად აგებს შენს ფსიქოლოგიურ პორტრეტს.
                </p>
                <p className="mt-2 font-mono text-[11px] tracking-wider" style={{ color: GOLD_SOFT }}>
                  ეს არ არის ტესტი იმაზე, რა იცი. ეს ტესტია იმაზე, ვინ ხარ.
                </p>
              </div>
              {result && (
                <button onClick={() => setPhase('result')} className="mt-5 font-mono text-[12px] px-4 py-2 rounded-xl transition-all active:scale-95"
                  style={{ color: '#fff', background: 'rgba(139,92,246,0.18)', border: '1px solid rgba(139,92,246,0.4)' }}>
                  ჩემი ბოლო პროფილი: {result.primary.ka}
                </button>
              )}
              <motion.button onClick={begin} whileTap={{ scale: 0.96 }}
                className="mt-6 px-10 py-3.5 rounded-2xl font-display font-bold text-[15px]"
                style={{ color: '#1a1206', background: `linear-gradient(135deg, #f2d98a, ${GOLD} 55%, #b8923e)`, boxShadow: '0 8px 30px rgba(217,180,90,0.25)' }}>
                {result || (saved?.answers.length ?? 0) > 0 ? 'თავიდან დაწყება' : 'შესვლა'}
              </motion.button>
              {saved && saved.answers.length > 0 && saved.answers.length < MP_TOTAL && !savedResult && (
                <button onClick={() => setPhase('test')} className="mt-3 font-mono text-[12px] text-white/45 underline underline-offset-4">
                  გაგრძელება ({saved.answers.length}/{MP_TOTAL})
                </button>
              )}
              <button onClick={() => { setPhase('board'); }} className="mt-4 font-mono text-[12px] px-4 py-2 rounded-xl"
                style={{ color: GOLD, border: '1px solid rgba(217,180,90,0.3)' }}>
                🏛 ლიდერბორდი
              </button>
            </motion.div>
          )}

          {/* ── TEST ──────────────────────────────────────────────────── */}
          {phase === 'test' && dilemma && (
            <motion.div key={`q-${dilemma.id}`} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }} transition={{ duration: 0.35 }}
              className="min-h-full flex flex-col justify-center px-5 py-8 max-w-xl mx-auto w-full">
              <p className="font-mono text-[10px] uppercase tracking-[0.35em]" style={{ color: GOLD_SOFT }}>
                თავსატეხი №{String(dilemma.num).padStart(2, '0')} · {CATEGORY_KA[dilemma.category] ?? ''}
              </p>
              <h2 className="font-display font-black text-white mt-2" style={{ fontSize: 22, lineHeight: 1.25 }}>
                „{dilemma.title}"
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.78)' }}>
                {dilemma.text}
              </p>
              <div className="mt-6 space-y-2.5">
                {dilemma.answers.map((a, i) => (
                  <motion.button key={i} onClick={() => pick(i)} whileTap={{ scale: 0.98 }}
                    initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.06 }}
                    className="w-full text-left px-4 py-3.5 rounded-2xl transition-colors"
                    style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(217,180,90,0.2)', backdropFilter: 'blur(6px)' }}>
                    <span className="font-mono text-[11px] mr-2" style={{ color: GOLD }}>{String.fromCharCode(65 + i)}.</span>
                    <span className="text-[14px]" style={{ color: 'rgba(255,255,255,0.85)' }}>{a.text}</span>
                  </motion.button>
                ))}
              </div>
              {answers.length > 0 && (
                <button onClick={() => { const next = answers.slice(0, -1); setAnswers(next); saveJSON(STATE_KEY, { answers: next }); }}
                  className="mt-5 self-start font-mono text-[11px] text-white/35 underline underline-offset-4">← წინა კითხვა</button>
              )}
            </motion.div>
          )}

          {/* ── MR. MAX COMMENTARY ────────────────────────────────────── */}
          {phase === 'commentary' && (
            <motion.div key={`c-${idx}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
              className="min-h-full flex flex-col items-center justify-center px-6 py-10 max-w-lg mx-auto text-center">
              <motion.div initial={{ scale: 0.75, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }}>
                <MaxSeal size={72} />
              </motion.div>
              <p className="font-mono text-[10px] uppercase tracking-[0.35em] mt-4" style={{ color: GOLD_SOFT }}>ბატონი მაქსის კომენტარი</p>
              <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.5 }}
                className="mt-4 text-[16px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.85)', fontStyle: 'italic' }}>
                „{commentary}"
              </motion.p>
              <motion.button onClick={continueAfterCommentary} whileTap={{ scale: 0.96 }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
                className="mt-8 px-8 py-3 rounded-2xl font-display font-bold text-[14px]"
                style={{ color: '#1a1206', background: `linear-gradient(135deg, #f2d98a, ${GOLD})` }}>
                {answers.length >= MP_TOTAL ? 'პროფილის ნახვა' : 'შემდეგი'}
              </motion.button>
            </motion.div>
          )}

          {/* ── COMPUTING ─────────────────────────────────────────────── */}
          {phase === 'computing' && (
            <motion.div key="computing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="min-h-full flex flex-col items-center justify-center px-6">
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 6, ease: 'linear' }}>
                <MaxSeal size={90} />
              </motion.div>
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] mt-6 animate-pulse" style={{ color: GOLD_SOFT }}>
                ბატონი მაქსი შენს პასუხებს სწავლობს…
              </p>
            </motion.div>
          )}

          {/* ── RESULT ────────────────────────────────────────────────── */}
          {phase === 'result' && result && (
            <ResultScreen key="result" result={result} onRestart={restart} onBoard={() => setPhase('board')} />
          )}

          {/* ── LEADERBOARD ───────────────────────────────────────────── */}
          {phase === 'board' && (
            <BoardScreen key="board" isMod={isMod} />
          )}

        </AnimatePresence>
      </div>
    </div>,
    document.body,
  );
}

// ── Result screen ────────────────────────────────────────────────────────────

function ResultScreen({ result, onRestart, onBoard }: { result: MPResult; onRestart: () => void; onBoard: () => void }) {
  const profile = useAuthStore(s => s.profile);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const drawCard = (): HTMLCanvasElement => {
    const c = canvasRef.current ?? document.createElement('canvas');
    canvasRef.current = c;
    c.width = 1080; c.height = 1350;
    const g = c.getContext('2d')!;
    // background
    const bg = g.createLinearGradient(0, 0, 0, 1350);
    bg.addColorStop(0, '#1c1230'); bg.addColorStop(1, '#0a0714');
    g.fillStyle = bg; g.fillRect(0, 0, 1080, 1350);
    // gold frame
    g.strokeStyle = 'rgba(217,180,90,0.55)'; g.lineWidth = 6; g.strokeRect(40, 40, 1000, 1270);
    g.strokeStyle = 'rgba(217,180,90,0.25)'; g.lineWidth = 2; g.strokeRect(58, 58, 964, 1234);
    // seal (simplified): double ring + M
    g.beginPath(); g.arc(540, 250, 110, 0, Math.PI * 2); g.strokeStyle = '#d9b45a'; g.lineWidth = 8; g.stroke();
    g.beginPath(); g.arc(540, 250, 90, 0, Math.PI * 2); g.strokeStyle = 'rgba(217,180,90,0.6)'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#d9b45a'; g.font = 'bold 120px Georgia, serif'; g.textAlign = 'center'; g.fillText('M', 540, 295);
    // header
    g.fillStyle = 'rgba(217,180,90,0.8)'; g.font = '600 30px monospace'; g.fillText('ბ ა ტ ო ნ ი   მ ა ქ ს ი ს   თ ა ვ ს ა ტ ე ხ ი', 540, 430);
    // archetype
    g.fillStyle = '#ffffff'; g.font = 'bold 64px Georgia, "Noto Sans Georgian", sans-serif';
    g.fillText(result.primary.ka, 540, 530);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.font = 'italic 34px Georgia, serif';
    g.fillText(result.primary.en, 540, 585);
    // quote (wrapped)
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = 'italic 32px Georgia, "Noto Sans Georgian", sans-serif';
    wrapText(g, `„${result.primary.quote}"`, 540, 660, 860, 44);
    // trait bars
    let y = 800;
    for (const t of MP_TRAITS) {
      const v = result.traits[t];
      g.textAlign = 'left';
      g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = '28px "Noto Sans Georgian", sans-serif';
      g.fillText(MP_TRAIT_META[t].ka, 120, y);
      g.textAlign = 'right';
      g.fillStyle = '#d9b45a'; g.font = 'bold 28px monospace';
      g.fillText(`${v}%`, 960, y);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      roundRect(g, 120, y + 12, 840, 14, 7); g.fill();
      const grad = g.createLinearGradient(120, 0, 960, 0);
      grad.addColorStop(0, '#8b5cf6'); grad.addColorStop(1, '#d9b45a');
      g.fillStyle = grad;
      roundRect(g, 120, y + 12, Math.max(20, 840 * v / 100), 14, 7); g.fill();
      g.textAlign = 'center';
      y += 62;
    }
    // footer
    g.fillStyle = 'rgba(255,255,255,0.4)'; g.font = '26px monospace';
    g.fillText(`${profile?.username ?? ''}  ·  voidmafia.one`, 540, 1290);
    return c;
  };

  const downloadCard = () => {
    SFX.click();
    const c = drawCard();
    const a = document.createElement('a');
    a.download = 'mr-max-puzzle.png';
    a.href = c.toDataURL('image/png');
    a.click();
  };

  const shareCard = async () => {
    SFX.click();
    const c = drawCard();
    try {
      const blob: Blob | null = await new Promise(res => c.toBlob(res, 'image/png'));
      if (blob && navigator.canShare?.({ files: [new File([blob], 'mr-max-puzzle.png', { type: 'image/png' })] })) {
        await navigator.share({ files: [new File([blob], 'mr-max-puzzle.png', { type: 'image/png' })], title: 'ბატონი მაქსის თავსატეხი' });
        return;
      }
    } catch { /* fall through to download */ }
    downloadCard();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="px-5 py-8 max-w-xl mx-auto w-full">
      <div className="text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.35em]" style={{ color: GOLD_SOFT }}>შენი პროფილი</p>
        <motion.h2 initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6 }}
          className="font-display font-black mt-2" style={{ fontSize: 28, color: result.primary.color }}>
          {result.primary.ka}
        </motion.h2>
        <p className="font-mono text-[11px] uppercase tracking-widest mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{result.primary.en}</p>
        <p className="mt-4 text-[14px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)', fontStyle: 'italic' }}>„{result.primary.quote}"</p>
      </div>

      <div className="mt-5 rounded-2xl p-4" style={{ background: 'rgba(217,180,90,0.05)', border: '1px solid rgba(217,180,90,0.18)' }}>
        <p className="text-[13.5px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>{result.primary.body}</p>
        <p className="mt-3 font-mono text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
          მეორადი შტრიხი: <span style={{ color: result.secondary.color }}>{result.secondary.ka}</span>
        </p>
      </div>

      {/* Trait bars */}
      <div className="mt-6 space-y-3">
        {MP_TRAITS.map((t, i) => (
          <div key={t}>
            <div className="flex items-center justify-between">
              <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.65)' }}>{MP_TRAIT_META[t].ka}</span>
              <span className="font-mono text-[12px] font-bold" style={{ color: GOLD }}>{result.traits[t]}%</span>
            </div>
            <div className="mt-1 h-[7px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
              <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${result.traits[t]}%` }}
                transition={{ delay: 0.15 + i * 0.08, duration: 0.7, ease: 'easeOut' }}
                style={{ background: `linear-gradient(90deg, ${VIOLET}, ${GOLD})` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-7 grid grid-cols-2 gap-2.5">
        <button onClick={shareCard} className="py-3 rounded-2xl font-display font-bold text-[13px]"
          style={{ color: '#1a1206', background: `linear-gradient(135deg, #f2d98a, ${GOLD})` }}>📤 გაზიარება</button>
        <button onClick={downloadCard} className="py-3 rounded-2xl font-display font-bold text-[13px]"
          style={{ color: GOLD, border: '1px solid rgba(217,180,90,0.4)' }}>💾 ბარათის შენახვა</button>
        <button onClick={onBoard} className="py-3 rounded-2xl font-mono text-[12px]"
          style={{ color: '#fff', background: 'rgba(139,92,246,0.16)', border: '1px solid rgba(139,92,246,0.4)' }}>🏛 ლიდერბორდი</button>
        <button onClick={onRestart} className="py-3 rounded-2xl font-mono text-[12px]"
          style={{ color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.15)' }}>↻ თავიდან</button>
      </div>
    </motion.div>
  );
}

function wrapText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number): void {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); line = w; y += lineH; }
    else line = t;
  }
  if (line) g.fillText(line, x, y);
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ── Leaderboard screen ───────────────────────────────────────────────────────

function BoardScreen({ isMod }: { isMod: boolean }) {
  const { board, myRow, scope, loadingBoard, fetchBoard, modRemove } = useMaxPuzzleStore();

  useEffect(() => { fetchBoard(scope); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="px-4 py-6 max-w-xl mx-auto w-full">
      <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-center" style={{ color: GOLD_SOFT }}>სალონის წიგნი</p>
      <h2 className="font-display font-black text-white text-center mt-1" style={{ fontSize: 20 }}>ლიდერბორდი</h2>

      <div className="flex gap-1.5 overflow-x-auto pb-1 mt-4" style={{ scrollbarWidth: 'none' }}>
        {MP_BOARD_SCOPES.map(s => (
          <button key={s.key} onClick={() => fetchBoard(s.key)}
            className="px-3 py-1.5 rounded-full font-mono text-[10px] whitespace-nowrap flex-shrink-0 transition-all"
            style={{
              background: scope === s.key ? 'rgba(217,180,90,0.16)' : 'rgba(255,255,255,0.04)',
              border: scope === s.key ? '1px solid rgba(217,180,90,0.5)' : '1px solid rgba(255,255,255,0.1)',
              color: scope === s.key ? GOLD : 'rgba(255,255,255,0.45)',
            }}>
            {s.ka}
          </button>
        ))}
      </div>

      {loadingBoard ? (
        <p className="text-center font-mono text-[12px] text-white/30 py-10 animate-pulse">იტვირთება…</p>
      ) : board.length === 0 ? (
        <p className="text-center font-mono text-[12px] text-white/30 py-10">ჯერ არავინ გაუვლია თავსატეხს. იყავი პირველი.</p>
      ) : (
        <div className="mt-4 space-y-1.5">
          {board.map(r => (
            <div key={r.userId} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
              style={{
                background: myRow?.userId === r.userId ? 'rgba(217,180,90,0.08)' : 'rgba(255,255,255,0.025)',
                border: myRow?.userId === r.userId ? '1px solid rgba(217,180,90,0.35)' : '1px solid rgba(255,255,255,0.06)',
              }}>
              <span className="font-mono text-[12px] w-7 text-right flex-shrink-0" style={{ color: r.rank <= 3 ? GOLD : 'rgba(255,255,255,0.35)' }}>
                {r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : `#${r.rank}`}
              </span>
              <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                {r.avatarUrl ? <img src={r.avatarUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-sm">{r.avatar || '👤'}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[12.5px] text-white truncate">{r.username}</p>
                <p className="font-mono text-[10px] truncate" style={{ color: GOLD_SOFT }}>{r.archetypeKa}</p>
              </div>
              <span className="font-mono text-[14px] font-bold flex-shrink-0" style={{ color: GOLD }}>{r.score}%</span>
              {isMod && (
                <button onClick={() => { if (confirm(`წავშალო ${r.username} ლიდერბორდიდან?`)) modRemove(r.userId); }}
                  className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px]"
                  style={{ color: '#ff8a8a', border: '1px solid rgba(255,100,100,0.3)' }}>✕</button>
              )}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
