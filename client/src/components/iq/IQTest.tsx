import { useEffect, useMemo, useRef, useState } from 'react';
import { haptic } from '@/lib/haptics';
import { setScreenSecure } from '@/lib/screenSecurity';
import { IQGlyph, IQStimulus } from './IQGlyph';
import { IQ_DOMAIN_KA, type IQSafeQuestion } from '@/types/iq';

/**
 * IQTest — the running assessment. Owns the countdown, section/progress display,
 * per-question navigation (skip + return), and anti-cheat instrumentation
 * (per-question time, tab-blur count, total duration). Calls `onComplete` with
 * the answer set + meta when the user finishes or the clock expires.
 */

export interface IQSubmitMeta { totalMs: number; tabBlurs: number; startedAt: number }
export interface IQAnswerOut { questionId: string; optionId: string | null; timeMs: number }

function fmt(sec: number): string {
  const m = Math.floor(sec / 60); const s = Math.max(0, sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function IQTest({ test, durationSec = 1800, onComplete, onAbort }: {
  test: IQSafeQuestion[];
  durationSec?: number;
  onComplete: (answers: IQAnswerOut[], meta: IQSubmitMeta) => void;
  onAbort: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [remaining, setRemaining] = useState(durationSec);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [confirmAbort, setConfirmAbort] = useState(false);
  const [leftApp, setLeftApp] = useState(false); // test terminated because the app was backgrounded

  const startedAt = useRef(Date.now());
  const tabBlurs = useRef(0);
  const timeByQid = useRef<Record<string, number>>({});
  const shownSince = useRef(Date.now());
  const submitted = useRef(false);
  const answersRef = useRef<Record<string, string>>({}); // mirror of `answers` for timer/background submit

  const q = test[idx]!;
  const total = test.length;
  const answeredCount = Object.keys(answers).length;

  // Accumulate time on the outgoing question whenever we move.
  const flushTime = () => {
    const prev = test[idx];
    if (prev) timeByQid.current[prev.id] = (timeByQid.current[prev.id] ?? 0) + (Date.now() - shownSince.current);
    shownSince.current = Date.now();
  };

  const buildAndComplete = () => {
    if (submitted.current) return;
    submitted.current = true;
    flushTime();
    const out: IQAnswerOut[] = test.map(tq => ({
      questionId: tq.id,
      optionId: answersRef.current[tq.id] ?? null,
      timeMs: Math.round(timeByQid.current[tq.id] ?? 0),
    }));
    onComplete(out, { totalMs: Date.now() - startedAt.current, tabBlurs: tabBlurs.current, startedAt: startedAt.current });
  };

  // Countdown — auto-submit on expiry.
  useEffect(() => {
    const iv = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) { clearInterval(iv); buildAndComplete(); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Proctoring: leaving/minimizing the app ENDS the test (announced up front) ──
  useEffect(() => {
    const onHide = () => {
      if (!document.hidden || submitted.current) return;
      tabBlurs.current += 1;
      setLeftApp(true);
      buildAndComplete(); // score whatever was answered; leaving is a hard stop
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onHide); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Native screenshot / screen-recording guard (FLAG_SECURE) while the test
  // is on-screen — screenshots come out black on the Android app. No-op on web. ──
  useEffect(() => {
    setScreenSecure(true);
    return () => setScreenSecure(false);
  }, []);

  // ── Anti-copy: block selection, copy/cut, right-click/long-press, and the
  // usual copy/save/print shortcuts so question text can't be lifted into an AI. ──
  useEffect(() => {
    const block = (e: Event) => { e.preventDefault(); };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ['c', 'x', 's', 'p', 'a'].includes(k)) e.preventDefault();
      if (k === 'printscreen') { try { navigator.clipboard?.writeText(''); } catch { /* ignore */ } }
    };
    document.addEventListener('copy', block);
    document.addEventListener('cut', block);
    document.addEventListener('contextmenu', block);
    document.addEventListener('selectstart', block);
    document.addEventListener('dragstart', block);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('copy', block);
      document.removeEventListener('cut', block);
      document.removeEventListener('contextmenu', block);
      document.removeEventListener('selectstart', block);
      document.removeEventListener('dragstart', block);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const go = (next: number) => {
    if (next < 0 || next >= total) return;
    flushTime();
    setIdx(next);
  };

  const choose = (optionId: string) => {
    setAnswers(a => { const next = { ...a, [q.id]: optionId }; answersRef.current = next; return next; });
    haptic('selection');
  };

  const sectionLabel = IQ_DOMAIN_KA[q.domain];
  const progress = ((idx + 1) / total) * 100;
  const isGroup = q.visual?.type === 'group';

  const optionCols = useMemo(() => {
    if (q.options.every(o => o.text != null)) return 1;      // text → stacked
    return q.options.length <= 4 ? 2 : 3;                    // visual → grid
  }, [q]);

  return (
    <div className="fixed inset-0 z-[560] flex flex-col select-none"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #0d1424 0%, #06070f 60%)', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as any}
      onContextMenu={e => e.preventDefault()} onCopy={e => e.preventDefault()} onCut={e => e.preventDefault()} onDragStart={e => e.preventDefault()}
      onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>

      {/* Top bar */}
      <div className="flex-shrink-0 px-4 pt-[calc(env(safe-area-inset-top,0px)+10px)] pb-2" style={{ borderBottom: '1px solid rgba(120,200,255,0.1)' }}>
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => setConfirmAbort(true)} className="w-8 h-8 rounded-full flex items-center justify-center text-white/50" style={{ border: '1px solid rgba(255,255,255,0.14)' }}>✕</button>
          <div className="text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/35">{sectionLabel}</p>
            <p className="font-display font-bold text-sm text-white">კითხვა {idx + 1} / {total}</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-[9px] uppercase tracking-widest text-white/35">დარჩა</p>
            <p className="font-display font-bold text-[15px]" style={{ color: remaining <= 120 ? '#ff5d6c' : '#8ee9ff', fontVariantNumeric: 'tabular-nums' }}>{fmt(remaining)}</p>
          </div>
        </div>
        {/* progress */}
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg,#00e5ff,#8b5cff)', transition: 'width .3s' }} />
        </div>
      </div>

      {/* Question body */}
      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div className="max-w-lg mx-auto">
          {q.prompt && <p className="text-center font-display text-white text-[17px] leading-snug mb-5">{q.prompt}</p>}

          {q.visual && !isGroup && (
            <div className="mb-6 flex justify-center overflow-x-auto">
              <IQStimulus visual={q.visual} />
            </div>
          )}

          {isGroup && <p className="text-center font-mono text-[11px] text-white/30 mb-3 uppercase tracking-widest">აირჩიე ერთი</p>}

          {/* Options */}
          <div className={optionCols === 1 ? 'space-y-2.5' : 'grid gap-3'} style={optionCols > 1 ? { gridTemplateColumns: `repeat(${optionCols}, 1fr)` } : undefined}>
            {q.options.map((o, i) => {
              const selected = answers[q.id] === o.id;
              const letter = String.fromCharCode(65 + i);
              if (o.text != null) {
                return (
                  <button key={o.id} onClick={() => choose(o.id)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-display text-[16px] text-left transition-all active:scale-[0.99]"
                    style={{
                      background: selected ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.03)',
                      border: selected ? '1.5px solid rgba(0,229,255,0.7)' : '1px solid rgba(255,255,255,0.1)',
                      color: selected ? '#bff2ff' : '#fff',
                      boxShadow: selected ? '0 0 18px rgba(0,229,255,0.18)' : 'none',
                    }}>
                    <span className="font-mono text-[12px] w-5 flex-shrink-0" style={{ color: selected ? '#00e5ff' : 'rgba(255,255,255,0.3)' }}>{letter}</span>
                    <span className="flex-1">{o.text}</span>
                  </button>
                );
              }
              return (
                <button key={o.id} onClick={() => choose(o.id)}
                  className="relative flex items-center justify-center rounded-2xl aspect-square transition-all active:scale-[0.98]"
                  style={{
                    background: selected ? 'rgba(0,229,255,0.1)' : 'rgba(255,255,255,0.025)',
                    border: selected ? '1.5px solid rgba(0,229,255,0.75)' : '1px solid rgba(255,255,255,0.1)',
                    boxShadow: selected ? '0 0 20px rgba(0,229,255,0.2)' : 'none',
                  }}>
                  <span className="absolute top-1.5 left-2.5 font-mono text-[11px]" style={{ color: selected ? '#00e5ff' : 'rgba(255,255,255,0.25)' }}>{letter}</span>
                  {o.cell && <IQGlyph cell={o.cell} size={84} color={selected ? '#8ee9ff' : '#cfe9f5'} />}
                </button>
              );
            })}
          </div>

          {/* jump dots */}
          <div className="flex flex-wrap gap-1.5 justify-center mt-7">
            {test.map((tq, i) => {
              const done = answers[tq.id] != null;
              const cur = i === idx;
              return (
                <button key={tq.id} onClick={() => go(i)}
                  className="w-6 h-6 rounded-md font-mono text-[10px] flex items-center justify-center transition-all"
                  style={{
                    background: cur ? 'rgba(0,229,255,0.25)' : done ? 'rgba(120,200,255,0.12)' : 'rgba(255,255,255,0.04)',
                    border: cur ? '1px solid rgba(0,229,255,0.8)' : done ? '1px solid rgba(120,200,255,0.35)' : '1px solid rgba(255,255,255,0.1)',
                    color: cur ? '#8ee9ff' : done ? '#8ee9ff' : 'rgba(255,255,255,0.4)',
                  }}>{i + 1}</button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer nav */}
      <div className="flex-shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3 flex items-center gap-2.5" style={{ borderTop: '1px solid rgba(120,200,255,0.1)' }}>
        <button onClick={() => go(idx - 1)} disabled={idx === 0}
          className="px-4 py-3 rounded-xl font-mono text-[13px] text-white/60 disabled:opacity-30" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>‹ წინა</button>
        {idx < total - 1 ? (
          <button onClick={() => go(idx + 1)} className="flex-1 py-3 rounded-xl font-display font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg,#0a84ff,#5e5ce6)' }}>
            {answers[q.id] != null ? 'შემდეგი ›' : 'გამოტოვება ›'}
          </button>
        ) : (
          <button onClick={() => setConfirmFinish(true)} className="flex-1 py-3 rounded-xl font-display font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg,#00b894,#0a84ff)' }}>
            დასრულება · {answeredCount}/{total}
          </button>
        )}
      </div>

      {/* Confirm finish */}
      {confirmFinish && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6" style={{ background: 'rgba(4,6,12,0.85)' }}>
          <div className="w-full max-w-xs rounded-2xl p-5 text-center" style={{ background: 'rgba(12,16,28,0.99)', border: '1px solid rgba(0,229,255,0.35)' }}>
            <p className="text-3xl mb-2">🧠</p>
            <p className="font-display font-bold text-white text-base mb-1">დაასრულებ ტესტს?</p>
            <p className="font-mono text-[12px] text-white/50 mb-5">
              {answeredCount < total ? `${total - answeredCount} კითხვა უპასუხოა და არასწორად ჩაითვლება.` : 'ყველა კითხვას უპასუხე.'}
            </p>
            <div className="flex gap-2.5">
              <button onClick={() => setConfirmFinish(false)} className="flex-1 py-2.5 rounded-xl font-mono text-[13px] text-white/60" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>გაგრძელება</button>
              <button onClick={() => { setConfirmFinish(false); buildAndComplete(); }} className="flex-1 py-2.5 rounded-xl font-display font-bold text-[13px] text-white" style={{ background: 'linear-gradient(135deg,#00b894,#0a84ff)' }}>დასრულება</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm abort */}
      {confirmAbort && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6" style={{ background: 'rgba(4,6,12,0.85)' }}>
          <div className="w-full max-w-xs rounded-2xl p-5 text-center" style={{ background: 'rgba(12,16,28,0.99)', border: '1px solid rgba(255,45,85,0.35)' }}>
            <p className="text-3xl mb-2">⚠️</p>
            <p className="font-display font-bold text-white text-base mb-1">გამოხვალ ტესტიდან?</p>
            <p className="font-mono text-[12px] text-white/50 mb-5">პროგრესი დაიკარგება და შედეგი არ ჩაიწერება.</p>
            <div className="flex gap-2.5">
              <button onClick={() => setConfirmAbort(false)} className="flex-1 py-2.5 rounded-xl font-mono text-[13px] text-white/60" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>დარჩენა</button>
              <button onClick={() => { submitted.current = true; onAbort(); }} className="flex-1 py-2.5 rounded-xl font-display font-bold text-[13px] text-white" style={{ background: 'rgba(255,45,85,0.25)', border: '1px solid rgba(255,45,85,0.5)' }}>გასვლა</button>
            </div>
          </div>
        </div>
      )}

      {/* Terminated because the app was left/minimized — also blanks content from any late screenshot */}
      {leftApp && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-8 text-center" style={{ background: '#06070f' }}>
          <p className="text-5xl mb-4">🚫</p>
          <p className="font-display font-bold text-white text-lg mb-2">ტესტი დასრულდა</p>
          <p className="font-mono text-[13px] text-white/55 leading-relaxed max-w-[280px]">
            აპლიკაცია დატოვე ტესტის მიმდინარეობისას. წესების თანახმად, შედეგი დაფიქსირდა მიმდინარე პასუხებით.
          </p>
        </div>
      )}
    </div>
  );
}
