import { useEffect, useState } from 'react';
import { SFX } from '@/lib/audioEngine';
import { IQLogo } from './IQLogo';
import { IQ_DOMAIN_KA, type IQScoreResult, type IQDomain } from '@/types/iq';

/** Premium result page for a completed VOID IQ assessment. */
const DOMAIN_ORDER: IQDomain[] = ['pattern', 'matrix', 'numeric', 'logic', 'spatial', 'verbal'];

function fmtDur(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function IQResult({ result, onViewLeaderboard, onClose }: {
  result: IQScoreResult;
  onViewLeaderboard: () => void;
  onClose: () => void;
}) {
  const [shownIq, setShownIq] = useState(0);

  useEffect(() => {
    SFX.gameOver?.();
    const target = result.iq;
    const t0 = Date.now();
    const dur = 1400;
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setShownIq(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [result.iq]);

  const date = new Date(result.durationMs && result.attemptId ? Date.now() : Date.now());
  const dateStr = date.toLocaleDateString('ka-GE', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="fixed inset-0 z-[560] flex flex-col select-none" style={{ background: 'radial-gradient(ellipse at 50% -10%, #10203a 0%, #06070f 55%)' }}
      onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
      <div className="flex-shrink-0 px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-2 flex items-center justify-between">
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.3em] text-white/40"><IQLogo size={22} />VOID IQ · შედეგი</span>
        <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-white/50" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>✕</button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-8">
        <div className="max-w-md mx-auto">

          {/* Hero score */}
          <div className="text-center pt-4 pb-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-white/40 mb-3">IQ SCORE</p>
            <p className="font-display font-black leading-none" style={{ fontSize: 84, background: 'linear-gradient(180deg,#eaffff,#4fb8ff 70%,#8b5cff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 6px 30px rgba(79,184,255,0.35))', fontVariantNumeric: 'tabular-nums' }}>
              {shownIq}
            </p>
            <p className="font-display font-bold text-lg mt-2 tracking-wide" style={{ color: '#8ee9ff' }}>{result.bandKa} · {result.band}</p>
            <div className="inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full" style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.25)' }}>
              <span className="font-display font-bold text-white text-sm">{result.percentile}<span className="text-[11px] align-top">th</span></span>
              <span className="font-mono text-[11px] text-white/50">პერცენტილი</span>
            </div>
            <p className="font-mono text-[11px] text-white/40 mt-3 max-w-[260px] mx-auto leading-relaxed">
              შენ აჯობე ტესტირებულთა დაახლოებით {result.percentile}%-ს
            </p>
          </div>

          {/* Verification banner */}
          <div className="rounded-2xl px-4 py-3 mb-5 flex items-center gap-3" style={{
            background: result.verified ? 'rgba(63,174,90,0.08)' : 'rgba(255,171,64,0.08)',
            border: `1px solid ${result.verified ? 'rgba(63,174,90,0.35)' : 'rgba(255,171,64,0.4)'}`,
          }}>
            <span className="text-xl">{result.verified ? '✅' : '⚠️'}</span>
            <div className="flex-1 min-w-0">
              <p className="font-display font-bold text-sm" style={{ color: result.verified ? '#7fe0a0' : '#ffcf80' }}>
                {result.verified ? 'ვერიფიცირებული შედეგი' : 'ეჭვქვეშ მყოფი შედეგი'}
              </p>
              <p className="font-mono text-[11px] text-white/45">
                {result.verified ? 'ეთვლება გლობალურ ლიდერბორდზე' : 'საეჭვო ქცევა დაფიქსირდა — ლიდერბორდზე არ ჩაითვლება'}
              </p>
            </div>
          </div>

          {/* Domain breakdown */}
          <div className="rounded-2xl p-4 mb-5" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(120,200,255,0.14)' }}>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/35 mb-3">დომენების შედეგი</p>
            <div className="space-y-2.5">
              {DOMAIN_ORDER.map(d => {
                const pct = result.domainScores[d] ?? 0;
                return (
                  <div key={d}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[12px] text-white/70">{IQ_DOMAIN_KA[d]}</span>
                      <span className="font-display font-bold text-[13px]" style={{ color: '#8ee9ff' }}>{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#00e5ff,#8b5cff)', transition: 'width .8s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Interpretation */}
          <div className="rounded-2xl p-4 mb-5" style={{ background: 'linear-gradient(135deg, rgba(0,229,255,0.05), rgba(139,92,255,0.05))', border: '1px solid rgba(139,92,255,0.2)' }}>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/35 mb-2">ინტერპრეტაცია</p>
            <p className="font-mono text-[13px] leading-relaxed text-white/75">{result.interpretation}</p>
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-2.5 mb-5">
            {[
              { l: 'კითხვები', v: String(result.total) },
              { l: 'სწორი პასუხი', v: `${result.correct}` },
              { l: 'დრო', v: fmtDur(result.durationMs) },
              { l: 'თარიღი', v: dateStr },
            ].map((m, i) => (
              <div key={i} className="rounded-xl px-3 py-2.5 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <p className="font-display font-bold text-white text-[15px]">{m.v}</p>
                <p className="font-mono text-[10px] text-white/40 mt-0.5">{m.l}</p>
              </div>
            ))}
          </div>

          {result.isHighest && result.verified && (
            <p className="text-center font-mono text-[12px] mb-4" style={{ color: '#ffd34d' }}>⭐ ეს შენი ახალი რეკორდია!{result.rank ? ` · გლობალური რანგი #${result.rank}` : ''}</p>
          )}

          <div className="flex flex-col gap-2.5">
            <button onClick={onViewLeaderboard} className="py-3.5 rounded-2xl font-display font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg,#0a84ff,#5e5ce6)' }}>
              🏆 ლიდერბორდის ნახვა
            </button>
            <button onClick={onClose} className="py-3 rounded-2xl font-mono text-[13px] text-white/55" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>დახურვა</button>
          </div>

          <p className="font-mono text-[10px] text-white/25 leading-relaxed text-center mt-6 px-2">{result.disclaimer}</p>
        </div>
      </div>
    </div>
  );
}
