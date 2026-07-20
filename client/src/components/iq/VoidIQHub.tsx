import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useIQStore } from '@/store/iqStore';
import { IQTest, type IQAnswerOut, type IQSubmitMeta } from './IQTest';
import { IQResult } from './IQResult';
import { IQLeaderboard } from './IQLeaderboard';
import { IQLogo } from './IQLogo';
import { IQ_DOMAIN_KA, type IQSafeQuestion, type IQScoreResult, type IQDomain } from '@/types/iq';

/**
 * VOID IQ — top-level section. A futuristic "cognitive lab" hub that routes
 * between the two headline actions (TAKE IQ TEST / IQ LEADERBOARD), the
 * pre-test brief, the running assessment, the result, and personal history.
 */
type Screen = 'home' | 'intro' | 'test' | 'scoring' | 'result' | 'leaderboard';

const SECTIONS: { d: IQDomain; icon: string }[] = [
  { d: 'pattern', icon: '🔷' }, { d: 'matrix', icon: '▦' }, { d: 'numeric', icon: '№' },
  { d: 'logic', icon: '⧉' }, { d: 'spatial', icon: '◳' }, { d: 'verbal', icon: '✎' },
];

function cooldownLabel(untilMs: number): string {
  const ms = untilMs - Date.now();
  if (ms <= 0) return '';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  if (d > 0) return `${d} დღეში`;
  if (h > 0) return `${h} საათში`;
  return `${Math.max(1, Math.floor((ms % 3600000) / 60000))} წუთში`;
}

export function VoidIQHub({ onClose }: { onClose: () => void }) {
  const { status, fetchStatus, startTest, submitTest } = useIQStore();
  const [screen, setScreen] = useState<Screen>('home');
  const [test, setTest] = useState<IQSafeQuestion[] | null>(null);
  const [result, setResult] = useState<IQScoreResult | null>(null);
  const [disclaimer, setDisclaimer] = useState('');
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const cooldownActive = !!(status?.cooldownUntil && status.cooldownUntil > Date.now());

  const beginTest = async () => {
    setStarting(true); setErr(null);
    try {
      const res = await startTest();
      setDisclaimer(res.disclaimer);
      if (!res.available) {
        setErr(res.retakeInMs ? `ხელახლა ${cooldownLabel(Date.now() + res.retakeInMs)}` : 'ტესტი ამჟამად მიუწვდომელია');
        await fetchStatus();
        setScreen('home');
      } else if (res.test) {
        setTest(res.test);
        setScreen('test');
      }
    } catch (e: any) { setErr(e.message); }
    finally { setStarting(false); }
  };

  const onTestComplete = async (answers: IQAnswerOut[], meta: IQSubmitMeta) => {
    setScreen('scoring');
    try {
      const r = await submitTest(answers, meta);
      setResult(r);
      setScreen('result');
    } catch (e: any) {
      setErr(e.message || 'შეფასება ვერ მოხერხდა');
      setScreen('home');
    }
  };

  // ── Sub-screens ──
  if (screen === 'test' && test) {
    return createPortal(<IQTest test={test} durationSec={1800} onComplete={onTestComplete} onAbort={() => { setTest(null); setScreen('home'); }} />, document.body);
  }
  if (screen === 'result' && result) {
    return createPortal(<IQResult result={result} onViewLeaderboard={() => setScreen('leaderboard')} onClose={() => { setResult(null); setScreen('home'); fetchStatus(); }} />, document.body);
  }
  if (screen === 'leaderboard') {
    return createPortal(<IQLeaderboard onBack={() => setScreen('home')} />, document.body);
  }
  if (screen === 'scoring') {
    return createPortal(
      <div className="fixed inset-0 z-[560] flex flex-col items-center justify-center" style={{ background: 'radial-gradient(ellipse at 50% 40%, #0d1a30 0%, #06070f 60%)' }}>
        <div className="text-5xl mb-4 animate-pulse">🧠</div>
        <p className="font-display font-bold text-white tracking-widest">შედეგის დამუშავება…</p>
        <p className="font-mono text-[11px] text-white/40 mt-2">კოგნიტური პროფილის გამოთვლა</p>
      </div>, document.body);
  }

  // ── HOME / INTRO ──
  return createPortal(
    <div className="fixed inset-0 z-[555] flex flex-col select-none" style={{ background: 'radial-gradient(ellipse at 50% -5%, #0e1c34 0%, #05060d 55%)' }}
      onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>

      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-[calc(env(safe-area-inset-top,0px)+14px)] pb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <IQLogo size={40} className="flex-shrink-0" />
          <div>
            <p className="font-display font-black text-xl tracking-[0.15em]" style={{ background: 'linear-gradient(90deg,#eaffff,#4fb8ff,#8b5cff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>VOID IQ</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/30 mt-0.5">კოგნიტური შეფასება</p>
          </div>
        </div>
        <button onClick={() => screen === 'intro' ? setScreen('home') : onClose()} className="w-9 h-9 rounded-full flex items-center justify-center text-white/55" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>{screen === 'intro' ? '‹' : '✕'}</button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-8">
        <div className="max-w-md mx-auto">

          {screen === 'home' && (
            <>
              {/* Personal summary */}
              {status?.hasResult && status.bestIq != null && (
                <div className="rounded-2xl p-4 mb-5 mt-2" style={{ background: 'linear-gradient(135deg, rgba(0,229,255,0.08), rgba(139,92,255,0.08))', border: '1px solid rgba(120,200,255,0.25)' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">შენი VOID IQ</p>
                      <p className="font-display font-black text-4xl mt-1" style={{ color: '#8ee9ff', fontVariantNumeric: 'tabular-nums' }}>{status.bestIq}</p>
                    </div>
                    <div className="text-right">
                      {status.rank && <p className="font-display font-bold text-white text-lg">#{status.rank}</p>}
                      <p className="font-mono text-[11px] text-white/45">{status.bestPercentile}th %</p>
                      <p className="font-mono text-[10px] text-white/30 mt-1">{status.attempts} მცდელობა</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Two headline cards */}
              <div className="space-y-4 mt-2">
                {/* TAKE TEST */}
                <div className="rounded-3xl overflow-hidden" style={{ border: '1px solid rgba(0,229,255,0.35)', boxShadow: '0 8px 40px rgba(0,150,255,0.15)' }}>
                  <div className="p-6 text-center" style={{ background: 'linear-gradient(160deg, rgba(10,40,70,0.6), rgba(20,15,50,0.6))' }}>
                    <div className="flex justify-center mb-2"><IQLogo size={56} /></div>
                    <p className="font-display font-black text-white text-lg tracking-wide">TAKE IQ TEST</p>
                    <p className="font-mono text-[12px] text-white/45 mt-1 mb-4">გაზომე შენი გონება</p>
                    {cooldownActive ? (
                      <div className="py-3 rounded-2xl font-mono text-[13px] text-white/50" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                        ⏳ ხელახლა {cooldownLabel(status!.cooldownUntil!)}
                      </div>
                    ) : (
                      <button onClick={() => setScreen('intro')} className="w-full py-3.5 rounded-2xl font-display font-bold text-white text-sm" style={{ background: 'linear-gradient(135deg,#00b8ff,#5e5ce6)' }}>
                        {status?.hasResult ? 'ხელახლა გავლა' : 'ტესტის დაწყება'}
                      </button>
                    )}
                  </div>
                </div>

                {/* LEADERBOARD */}
                <div className="rounded-3xl overflow-hidden" style={{ border: '1px solid rgba(139,92,255,0.35)', boxShadow: '0 8px 40px rgba(120,60,255,0.12)' }}>
                  <div className="p-6 text-center" style={{ background: 'linear-gradient(160deg, rgba(30,15,55,0.6), rgba(15,25,55,0.6))' }}>
                    <p className="text-4xl mb-2">🏆</p>
                    <p className="font-display font-black text-white text-lg tracking-wide">IQ LEADERBOARD</p>
                    <p className="font-mono text-[12px] text-white/45 mt-1 mb-4">ვინ ფიქრობს ყველაზე კარგად</p>
                    <button onClick={() => setScreen('leaderboard')} className="w-full py-3.5 rounded-2xl font-display font-bold text-white text-sm" style={{ background: 'linear-gradient(135deg,#7c3aed,#3b82f6)' }}>
                      რანგების ნახვა
                    </button>
                  </div>
                </div>
              </div>

              {err && <p className="text-center font-mono text-[12px] text-neon-red mt-4">{err}</p>}

              {/* History */}
              {status && status.history.length > 0 && (
                <div className="mt-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/35 mb-2">ისტორია</p>
                  <div className="space-y-1.5">
                    {status.history.slice(0, 8).map((h, i) => (
                      <div key={h.id} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <span className="font-mono text-[11px] text-white/35 w-14">#{status.history.length - i}</span>
                        <span className="font-display font-bold text-white text-[15px] flex-1" style={{ fontVariantNumeric: 'tabular-nums' }}>IQ {h.iq}</span>
                        {h.isHighest && <span className="text-[11px]">⭐</span>}
                        <span className="font-mono text-[10px]" style={{ color: h.verified ? '#7fe0a0' : '#ffcf80' }}>{h.verified ? 'ვერიფ.' : 'ეჭვქვეშ'}</span>
                        <span className="font-mono text-[10px] text-white/30">{new Date(h.createdAt).toLocaleDateString('ka-GE', { month: 'short', day: 'numeric' })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="font-mono text-[10px] text-white/25 leading-relaxed text-center mt-8 px-2">
                ეს ონლაინ შეფასება იძლევა კოგნიტური შესაძლებლობების სავარაუდო შეფასებას. ეს არ არის კლინიკური IQ გამოცდა.
              </p>
            </>
          )}

          {screen === 'intro' && (
            <div className="pt-2">
              <div className="flex justify-center mb-3"><IQLogo size={72} /></div>
              <p className="text-center font-display font-black text-white text-xl tracking-wide mb-1">კოგნიტური შეფასება</p>
              <p className="text-center font-mono text-[12px] text-white/45 mb-6">6 დომენი · ~35 კითხვა · 30 წუთი</p>

              <div className="grid grid-cols-2 gap-2.5 mb-6">
                {SECTIONS.map(s => (
                  <div key={s.d} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(120,200,255,0.14)' }}>
                    <span className="text-lg">{s.icon}</span>
                    <span className="font-mono text-[12px] text-white/70 leading-tight">{IQ_DOMAIN_KA[s.d]}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl p-4 mb-4 space-y-2" style={{ background: 'rgba(255,171,64,0.05)', border: '1px solid rgba(255,171,64,0.2)' }}>
                {[
                  '⏱ ტაიმერი ერთხელ იწყება — 30 წუთი მთელ ტესტზე',
                  '↔ კითხვების გამოტოვება და დაბრუნება შესაძლებელია',
                  '🎯 კითხვები თანდათან რთულდება',
                ].map((t, i) => <p key={i} className="font-mono text-[12px] leading-relaxed" style={{ color: 'rgba(255,224,138,0.85)' }}>{t}</p>)}
              </div>

              {/* Proctoring warning — the hard rules */}
              <div className="rounded-2xl p-4 mb-5 space-y-2" style={{ background: 'rgba(255,45,85,0.06)', border: '1px solid rgba(255,45,85,0.3)' }}>
                <p className="font-display font-bold text-[13px] mb-1" style={{ color: '#ff8ca3' }}>⚠️ პატიოსნების წესები</p>
                {[
                  '🚫 აპლიკაციის დატოვება ან ჩაკეცვა ავტომატურად დაასრულებს ტესტს',
                  '📋 ტექსტის კოპირება და მონიშვნა გამორთულია',
                  '🤖 AI-ს ან სხვა დახმარების გამოყენება აკრძალულია',
                ].map((t, i) => <p key={i} className="font-mono text-[12px] leading-relaxed" style={{ color: 'rgba(255,190,200,0.9)' }}>{t}</p>)}
              </div>

              <button onClick={beginTest} disabled={starting} className="w-full py-4 rounded-2xl font-display font-bold text-white disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#00b8ff,#5e5ce6)' }}>
                {starting ? 'იტვირთება…' : '▶ ტესტის დაწყება'}
              </button>
              {err && <p className="text-center font-mono text-[12px] text-neon-red mt-3">{err}</p>}

              <p className="font-mono text-[10px] text-white/25 leading-relaxed text-center mt-6 px-2">
                {disclaimer || 'ეს ონლაინ შეფასება იძლევა კოგნიტური შესაძლებლობების სავარაუდო შეფასებას ლოგიკის, პატერნების, რიცხვითი, სივრცითი და ვერბალური ამოცანების საფუძველზე. ეს არ არის კლინიკური ან პროფესიონალურად ჩატარებული IQ გამოცდა.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
