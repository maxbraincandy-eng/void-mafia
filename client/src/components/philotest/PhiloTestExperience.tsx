import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { SFX } from '@/lib/audioEngine';
import { haptic } from '@/lib/haptics';
import { AXES, AXIS_META, type PTAnswer, type PTResult } from './types';
import { FINAL_QUESTION, FINAL_EPILOGUE } from './scenarios';
import { buildQueue, getScenario, computeResult, analysisSections, TOTAL_QUESTIONS } from './engine';

/**
 * ფილოსოფიური პიროვნების ტესტი — the full experience: cinematic intro,
 * adaptive scenario runner, meta-question, and the premium result screen with
 * a shareable card. All scoring lives in engine.ts; the UI only replays the
 * answer list, so back/refresh are trivially safe.
 */

const STATE_KEY = 'vm-pt-state';
const RESULT_KEY = 'vm-pt-result';

type Phase = 'intro' | 'test' | 'final' | 'computing' | 'result';

interface SavedState { answers: PTAnswer[] }
interface SavedResult { answers: PTAnswer[]; finalChoice: number; date: number }

function loadJSON<T>(key: string): T | null { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) as T : null; } catch { return null; } }
function saveJSON(key: string, v: unknown): void { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } }

const INTRO_LINES = [
  'ყოველი არჩევანი რაღაცას ამხელს.',
  'არა იმას, რისი გჯერა.',
  'იმას, რის გაწირვასაც დათანხმდები.',
  '',
  'შენი პასუხები არ შეფასდება როგორც სწორი ან მცდარი.',
  'შენი გადაწყვეტილებები გაანალიზდება.',
  'ზოგი კითხვა შესაძლოა იმაზე დიდხანს დაგრჩეს, ვიდრე ელოდები.',
];

export function PhiloTestExperience({ onClose }: { onClose: () => void }) {
  const saved = useMemo(() => loadJSON<SavedState>(STATE_KEY), []);
  const savedResult = useMemo(() => loadJSON<SavedResult>(RESULT_KEY), []);

  const [phase, setPhase] = useState<Phase>(savedResult ? 'result' : 'intro');
  const [answers, setAnswers] = useState<PTAnswer[]>(saved?.answers ?? []);
  const [result, setResult] = useState<PTResult | null>(
    savedResult ? computeResult(savedResult.answers, savedResult.finalChoice) : null,
  );
  const [fadeKey, setFadeKey] = useState(0);

  const queue = useMemo(() => buildQueue(answers), [answers]);
  const idx = answers.length;
  const scenario = idx < queue.length ? getScenario(queue[idx]!) : null;

  // Resume mid-test after refresh.
  useEffect(() => {
    if (savedResult) return;
    if (saved && saved.answers.length > 0) setPhase('test');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const begin = () => { SFX.gameStart(); haptic('success'); setPhase('test'); };

  const pick = (choiceIdx: number) => {
    if (!scenario) return;
    SFX.click(); haptic('selection');
    const next = [...answers, { scenarioId: scenario.id, choiceIdx }];
    setAnswers(next);
    saveJSON(STATE_KEY, { answers: next });
    setFadeKey(k => k + 1);
    if (next.length >= buildQueue(next).length) setPhase('final');
  };

  const back = () => {
    if (answers.length === 0) return;
    SFX.click();
    const next = answers.slice(0, -1);
    setAnswers(next);
    saveJSON(STATE_KEY, { answers: next });
    setFadeKey(k => k + 1);
    if (phase === 'final') setPhase('test');
  };

  const pickFinal = (finalChoice: number) => {
    SFX.phaseTransition(); haptic('heavy');
    setPhase('computing');
    setTimeout(() => {
      const r = computeResult(answers, finalChoice);
      setResult(r);
      saveJSON(RESULT_KEY, { answers, finalChoice, date: Date.now() });
      try { localStorage.removeItem(STATE_KEY); } catch { /* ignore */ }
      setPhase('result');
      SFX.gameOver();
    }, 2200);
  };

  const restart = () => {
    try { localStorage.removeItem(STATE_KEY); localStorage.removeItem(RESULT_KEY); } catch { /* ignore */ }
    setAnswers([]); setResult(null); setPhase('intro'); setFadeKey(k => k + 1);
  };

  const progress = Math.min(idx + (phase === 'final' ? 1 : 0), TOTAL_QUESTIONS - 1);

  return createPortal(
    <div className="fixed inset-0 z-[520] flex flex-col select-none"
      style={{ background: 'radial-gradient(ellipse 90% 55% at 50% -5%, #171238 0%, #07060f 60%)', fontFamily: '"Space Grotesk", system-ui, sans-serif' }}
      onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>

      {/* Top bar */}
      <div className="flex-shrink-0 px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-2" style={{ borderBottom: '1px solid rgba(139,92,255,0.14)' }}>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em]" style={{ color: 'rgba(195,184,255,0.55)' }}>ფილოსოფიური ექსპერიმენტი</span>
          <div className="flex items-center gap-2">
            {(phase === 'test' || phase === 'final') && (
              <span className="font-mono text-[11px]" style={{ color: 'rgba(255,255,255,0.4)', fontVariantNumeric: 'tabular-nums' }}>
                კითხვა {String(progress + 1).padStart(2, '0')} / {TOTAL_QUESTIONS}
              </span>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.15)' }}>✕</button>
          </div>
        </div>
        {(phase === 'test' || phase === 'final') && (
          <div className="mt-2 h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
            <div style={{ width: `${((progress + 1) / TOTAL_QUESTIONS) * 100}%`, height: '100%', background: 'linear-gradient(90deg,#8b5cff,#c3b8ff)', transition: 'width .5s ease' }} />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ══ INTRO ══ */}
        {phase === 'intro' && (
          <div className="min-h-full flex flex-col items-center justify-center px-8 py-10 text-center">
            <div className="max-w-md">
              {INTRO_LINES.map((l, i) => (
                <motion.p key={i}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.55, duration: 0.8 }}
                  className={l === '' ? 'h-6' : i < 3 ? 'font-display text-[19px] leading-relaxed text-white mb-1' : 'font-mono text-[13px] leading-relaxed mb-1'}
                  style={i >= 4 ? { color: 'rgba(195,184,255,0.6)' } : undefined}>
                  {l}
                </motion.p>
              ))}
              <motion.button
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 + INTRO_LINES.length * 0.55 + 0.4, duration: 1 }}
                onClick={begin}
                className="mt-10 px-10 py-4 rounded-2xl font-display font-bold text-[15px] tracking-[0.15em] text-white"
                style={{ background: 'linear-gradient(135deg, rgba(139,92,255,0.25), rgba(80,60,180,0.25))', border: '1px solid rgba(139,92,255,0.55)', boxShadow: '0 0 34px rgba(139,92,255,0.25)' }}>
                დაიწყე ექსპერიმენტი
              </motion.button>
              {saved && saved.answers.length > 0 && (
                <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
                  onClick={() => setPhase('test')}
                  className="block mx-auto mt-4 font-mono text-[12px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  გაგრძელება ({saved.answers.length} პასუხი შენახულია) →
                </motion.button>
              )}
            </div>
          </div>
        )}

        {/* ══ TEST ══ */}
        {phase === 'test' && scenario && (
          <div className="px-6 py-8 max-w-xl mx-auto">
            <AnimatePresence mode="wait">
              <motion.div key={fadeKey} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }}>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] mb-5" style={{ color: 'rgba(139,92,255,0.6)' }}>▌{scenario.title}</p>
                <p className="text-[15.5px] leading-[1.9] whitespace-pre-wrap mb-8" style={{ color: '#e9e6f5' }}>{scenario.text}</p>
                <div className="space-y-2.5">
                  {scenario.choices.map((c, i) => (
                    <button key={i} onClick={() => pick(i)}
                      className="w-full text-left px-4 py-3.5 rounded-xl text-[13.5px] leading-relaxed transition-all active:scale-[0.99] hover:border-opacity-70"
                      style={{ color: '#ddd9f0', border: '1px solid rgba(139,92,255,0.28)', background: 'rgba(139,92,255,0.05)' }}>
                      {c.text}
                    </button>
                  ))}
                </div>
                {answers.length > 0 && (
                  <button onClick={back} className="mt-6 font-mono text-[12px]" style={{ color: 'rgba(255,255,255,0.35)' }}>‹ წინა კითხვა</button>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        )}

        {/* ══ FINAL META-QUESTION ══ */}
        {phase === 'final' && (
          <div className="px-6 py-10 max-w-xl mx-auto">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}>
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] mb-6" style={{ color: 'rgba(139,92,255,0.6)' }}>▌{FINAL_QUESTION.title}</p>
              <p className="text-[17px] leading-[1.9] whitespace-pre-wrap mb-9" style={{ color: '#efecfa' }}>{FINAL_QUESTION.text}</p>
              <div className="space-y-2.5">
                {FINAL_QUESTION.choices.map((c, i) => (
                  <button key={i} onClick={() => pickFinal(i)}
                    className="w-full text-left px-4 py-3.5 rounded-xl text-[13.5px] leading-relaxed transition-all active:scale-[0.99]"
                    style={{ color: '#ddd9f0', border: '1px solid rgba(139,92,255,0.35)', background: 'rgba(139,92,255,0.07)' }}>
                    {c}
                  </button>
                ))}
              </div>
              <button onClick={back} className="mt-6 font-mono text-[12px]" style={{ color: 'rgba(255,255,255,0.35)' }}>‹ წინა კითხვა</button>
            </motion.div>
          </div>
        )}

        {/* ══ COMPUTING ══ */}
        {phase === 'computing' && (
          <div className="min-h-full flex flex-col items-center justify-center px-8 text-center">
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
              className="w-14 h-14 rounded-full mb-6"
              style={{ border: '2px solid rgba(139,92,255,0.2)', borderTopColor: '#8b5cff' }} />
            <p className="font-display font-bold text-white tracking-[0.2em] mb-2">ანალიზი მიმდინარეობს</p>
            <p className="font-mono text-[11px]" style={{ color: 'rgba(195,184,255,0.5)' }}>შენი გადაწყვეტილებების ნიმუში იშიფრება…</p>
          </div>
        )}

        {/* ══ RESULT ══ */}
        {phase === 'result' && result && <ResultScreen r={result} onRestart={restart} onClose={onClose} />}
      </div>
    </div>,
    document.body,
  );
}

// ── შედეგის ეკრანი ────────────────────────────────────────────────────────────
function ResultScreen({ r, onRestart, onClose }: { r: PTResult; onRestart: () => void; onClose: () => void }) {
  const sections = useMemo(() => analysisSections(r), [r]);
  const [shareMsg, setShareMsg] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const topDna = [...AXES].sort((x, y) => Math.abs(r.dna[y] - 50) - Math.abs(r.dna[x] - 50)).slice(0, 3);

  const drawCard = (): HTMLCanvasElement => {
    const c = canvasRef.current ?? document.createElement('canvas');
    canvasRef.current = c;
    c.width = 1080; c.height = 1350;
    const g = c.getContext('2d')!;
    const bg = g.createLinearGradient(0, 0, 0, 1350);
    bg.addColorStop(0, '#171238'); bg.addColorStop(0.55, '#0b0920'); bg.addColorStop(1, '#07060f');
    g.fillStyle = bg; g.fillRect(0, 0, 1080, 1350);
    g.strokeStyle = 'rgba(139,92,255,0.5)'; g.lineWidth = 3;
    g.strokeRect(40, 40, 1000, 1270);
    g.textAlign = 'center';
    g.fillStyle = 'rgba(195,184,255,0.65)';
    g.font = '600 34px monospace';
    g.fillText('V O I D · ფილოსოფიური პროფილი', 540, 150);
    g.fillStyle = r.primary.color;
    g.font = '800 78px sans-serif';
    g.fillText(r.primary.ka, 540, 330);
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.font = '600 30px monospace';
    g.fillText(r.primary.en, 540, 385);
    // quote (wrap)
    g.fillStyle = 'rgba(233,230,245,0.9)';
    g.font = '400 36px sans-serif';
    const words = `„${r.primary.quote}"`.split(' ');
    let line = ''; let y = 500;
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (g.measureText(t).width > 860) { g.fillText(line, 540, y); y += 52; line = w; } else line = t;
    }
    if (line) { g.fillText(line, 540, y); y += 52; }
    // DNA bars
    y = Math.max(y + 60, 660);
    g.font = '600 30px monospace';
    for (const axis of topDna) {
      const pct = r.dna[axis] >= 50 ? r.dna[axis] : 100 - r.dna[axis];
      const label = r.dna[axis] >= 50 ? AXIS_META[axis].poleA : AXIS_META[axis].poleB;
      g.textAlign = 'left';
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fillText(label, 140, y);
      g.textAlign = 'right';
      g.fillStyle = '#c3b8ff';
      g.fillText(`${pct}%`, 940, y);
      g.fillStyle = 'rgba(255,255,255,0.1)';
      g.fillRect(140, y + 18, 800, 12);
      const grad = g.createLinearGradient(140, 0, 940, 0);
      grad.addColorStop(0, '#8b5cff'); grad.addColorStop(1, '#c3b8ff');
      g.fillStyle = grad;
      g.fillRect(140, y + 18, 800 * (pct / 100), 12);
      y += 92;
    }
    g.textAlign = 'center';
    g.fillStyle = 'rgba(195,184,255,0.5)';
    g.font = '600 28px monospace';
    g.fillText(`მეორეული გავლენა: ${r.secondary.ka}`, 540, y + 30);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.font = '600 30px monospace';
    g.fillText('voidmafia.one', 540, 1270);
    return c;
  };

  const downloadCard = () => {
    const c = drawCard();
    c.toBlob(b => {
      if (!b) return;
      const url = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = url; a.download = 'void-philosophical-profile.png'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, 'image/png');
    setShareMsg('ბარათი ჩამოიტვირთა 🖼');
  };

  const shareCard = async () => {
    const c = drawCard();
    const blob: Blob | null = await new Promise(res => c.toBlob(res, 'image/png'));
    const text = `ჩემი ფილოსოფიური პროფილი: ${r.primary.ka} · voidmafia.one`;
    try {
      if (blob && (navigator as any).canShare?.({ files: [new File([blob], 'profile.png', { type: 'image/png' })] })) {
        await (navigator as any).share({ files: [new File([blob], 'profile.png', { type: 'image/png' })], text });
        return;
      }
      if ((navigator as any).share) { await (navigator as any).share({ text, url: 'https://voidmafia.one' }); return; }
      await navigator.clipboard?.writeText(text + ' — https://voidmafia.one');
      setShareMsg('ბმული დაკოპირდა 📋');
    } catch { /* user cancelled */ }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard?.writeText(`ჩემი ფილოსოფიური პროფილი: ${r.primary.ka} (${r.primary.en}) — გაიარე შენც: https://voidmafia.one`);
      setShareMsg('დაკოპირდა 📋');
    } catch { setShareMsg('ვერ დაკოპირდა'); }
  };

  return (
    <div className="px-6 py-10 max-w-xl mx-auto">
      {/* Primary reveal */}
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9 }} className="text-center mb-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.35em] mb-4" style={{ color: 'rgba(195,184,255,0.55)' }}>შენი ფილოსოფიური პროფილი</p>
        <p className="font-display font-black text-[34px] leading-tight mb-1" style={{ color: r.primary.color, textShadow: `0 0 28px ${r.primary.color}55` }}>{r.primary.ka}</p>
        <p className="font-mono text-[11px] tracking-[0.25em] mb-5" style={{ color: 'rgba(255,255,255,0.4)' }}>{r.primary.en}</p>
        <p className="text-[14px] italic leading-relaxed mb-5" style={{ color: 'rgba(233,230,245,0.85)' }}>„{r.primary.quote}"</p>
        <p className="text-[14px] leading-[1.85] text-left whitespace-pre-wrap" style={{ color: 'rgba(233,230,245,0.9)' }}>{r.primary.body}</p>
      </motion.div>

      {/* Secondary + tension */}
      <div className="grid grid-cols-2 gap-3 mb-10">
        <div className="rounded-2xl p-4" style={{ background: 'rgba(139,92,255,0.06)', border: '1px solid rgba(139,92,255,0.25)' }}>
          <p className="font-mono text-[9px] uppercase tracking-[0.25em] mb-1.5" style={{ color: 'rgba(195,184,255,0.5)' }}>მეორეული გავლენა</p>
          <p className="font-display font-bold text-[15px]" style={{ color: r.secondary.color }}>{r.secondary.ka}</p>
          <p className="font-mono text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{r.secondary.en}</p>
        </div>
        <div className="rounded-2xl p-4" style={{ background: 'rgba(255,93,108,0.05)', border: '1px solid rgba(255,93,108,0.25)' }}>
          <p className="font-mono text-[9px] uppercase tracking-[0.25em] mb-1.5" style={{ color: 'rgba(255,140,163,0.6)' }}>ფარული დაძაბულობა</p>
          <p className="font-display font-bold text-[15px]" style={{ color: r.tension.color }}>{r.tension.ka}</p>
          <p className="font-mono text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{r.tension.en}</p>
        </div>
      </div>

      {/* DNA */}
      <div className="rounded-2xl p-5 mb-10" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(139,92,255,0.2)' }}>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] mb-4 text-center" style={{ color: 'rgba(195,184,255,0.55)' }}>შენი ფილოსოფიური დნმ</p>
        <div className="space-y-3.5">
          {AXES.map(axis => {
            const v = r.dna[axis];
            return (
              <div key={axis}>
                <div className="flex justify-between mb-1">
                  <span className="font-mono text-[10.5px]" style={{ color: v >= 50 ? '#e9e6f5' : 'rgba(255,255,255,0.35)' }}>{AXIS_META[axis].poleA}</span>
                  <span className="font-mono text-[10.5px]" style={{ color: v < 50 ? '#e9e6f5' : 'rgba(255,255,255,0.35)' }}>{AXIS_META[axis].poleB}</span>
                </div>
                <div className="relative h-[7px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                  <motion.div initial={{ width: '50%' }} animate={{ width: `${v}%` }} transition={{ duration: 1.1, ease: 'easeOut' }}
                    style={{ position: 'absolute', left: 0, top: 0, bottom: 0, background: 'linear-gradient(90deg, rgba(139,92,255,0.35), #8b5cff)' }} />
                  <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.25)' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Analysis sections */}
      <div className="space-y-6 mb-10">
        {sections.map((s, i) => (
          <div key={i}>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] mb-2" style={{ color: 'rgba(195,184,255,0.6)' }}>▌{s.title}</p>
            <p className="text-[13.5px] leading-[1.85]" style={{ color: 'rgba(233,230,245,0.88)' }}>{s.text}</p>
          </div>
        ))}
      </div>

      {/* Influences */}
      <div className="rounded-2xl p-5 mb-8" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(139,92,255,0.2)' }}>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] mb-1 text-center" style={{ color: 'rgba(195,184,255,0.55)' }}>ფილოსოფიური გავლენები</p>
        <p className="font-mono text-[10.5px] mb-4 text-center" style={{ color: 'rgba(255,255,255,0.35)' }}>შენი არჩევანების ნიმუში ეხმიანება:</p>
        <div className="space-y-2.5">
          {r.influences.map(inf => (
            <div key={inf.name} className="flex items-center gap-3">
              <span className="font-mono text-[12px] w-28 flex-shrink-0" style={{ color: 'rgba(233,230,245,0.8)' }}>{inf.name}</span>
              <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                <div style={{ width: `${inf.pct}%`, height: '100%', background: 'linear-gradient(90deg,#8b5cff,#c3b8ff)' }} />
              </div>
              <span className="font-mono text-[11px] w-10 text-right" style={{ color: '#c3b8ff', fontVariantNumeric: 'tabular-nums' }}>{inf.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Epilogue from the final question */}
      <p className="text-[12.5px] italic leading-relaxed text-center mb-8 px-3" style={{ color: 'rgba(195,184,255,0.55)' }}>
        {FINAL_EPILOGUE[r.finalChoice] ?? FINAL_EPILOGUE[2]}
      </p>

      {/* Share */}
      <div className="flex flex-col gap-2.5 mb-4">
        <button onClick={downloadCard} className="py-3.5 rounded-2xl font-display font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg,#8b5cff,#5e5ce6)' }}>
          🖼 შედეგის ბარათის შენახვა
        </button>
        <div className="flex gap-2.5">
          <button onClick={shareCard} className="flex-1 py-3 rounded-2xl font-mono text-[13px]" style={{ border: '1px solid rgba(139,92,255,0.4)', color: '#c3b8ff' }}>📤 გაზიარება</button>
          <button onClick={copyLink} className="flex-1 py-3 rounded-2xl font-mono text-[13px]" style={{ border: '1px solid rgba(139,92,255,0.4)', color: '#c3b8ff' }}>📋 კოპირება</button>
        </div>
        {shareMsg && <p className="text-center font-mono text-[11px]" style={{ color: '#7fe0a0' }}>{shareMsg}</p>}
      </div>

      <div className="flex gap-2.5 mb-6">
        <button onClick={onRestart} className="flex-1 py-3 rounded-2xl font-mono text-[13px]" style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.55)' }}>↺ თავიდან გავლა</button>
        <button onClick={onClose} className="flex-1 py-3 rounded-2xl font-mono text-[13px]" style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.55)' }}>გამოსვლა</button>
      </div>

      <p className="font-mono text-[10px] leading-relaxed text-center px-2 pb-4" style={{ color: 'rgba(255,255,255,0.25)' }}>
        ეს ინტერპრეტაციული ინტერაქტიული გამოცდილებაა და არა მეცნიერული ან ფსიქოლოგიური დიაგნოზი. შენი პროფილი მხოლოდ შენი არჩევანების ნიმუშს ასახავს ამ ექსპერიმენტში.
      </p>
    </div>
  );
}
