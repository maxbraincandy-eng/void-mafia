/**
 * The M.A.R.S. front page.
 *
 * This exists because a separate site needs something the in-app version never
 * did: a reason to stay. Someone arrives here from a link with no idea what
 * this is, so the page has to say what it stores, what it does not promise, and
 * what to do next — in that order, above the fold.
 *
 * The counters are real. A landing page that invents "10,000 records preserved"
 * would be the first lie told by a product whose entire value is not lying.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import type { Res } from '@/types/index';
import { MatrixRain } from './MatrixRain';
import { MarsLegal } from './MarsLegal';
import { lifespan, sectorOf, type DirEntry, type Stats } from './types';

export function MarsLanding({
  onEnter, onOpenRecord, authed,
}: {
  onEnter: () => void;
  onOpenRecord: (code: string) => void;
  authed: boolean;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<DirEntry[]>([]);
  const [legal, setLegal] = useState<null | 'terms' | 'privacy'>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await emitWithAck<undefined, Res<any>>('mars:status');
        if (alive && 'ok' in s && s.ok) setStats(s.data.stats);
      } catch { /* the page works without them */ }
      try {
        const d = await emitWithAck<{ limit: number }, Res<DirEntry[]>>('mars:directory', { limit: 8 });
        if (alive && 'ok' in d && d.ok) setRecent(d.data);
      } catch { /* ditto */ }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden" style={{ background: '#01060a' }}>
      <MatrixRain opacity={0.09} />
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 110% 60% at 50% 0%, rgba(0,255,120,0.10) 0%, transparent 60%)',
      }} />
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.26) 0px, rgba(0,0,0,0.26) 1px, transparent 1px, transparent 3px)',
        mixBlendMode: 'multiply',
      }} />

      <div className="relative z-10 px-5 py-8" style={{ maxWidth: 720, marginInline: 'auto' }}>
        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <p className="font-mono text-[13px] font-bold tracking-[0.35em]" style={{ color: '#39ff6a', textShadow: '0 0 14px rgba(57,255,106,0.5)' }}>
            M.A.R.S.
          </p>
          <p className="font-mono text-[10px] tracking-[0.18em] mt-1" style={{ color: 'rgba(57,255,106,0.4)' }}>
            MANKIND&apos;S AUTOMATED REALITY SYSTEM
          </p>

          <h1 className="font-display font-bold mt-6 leading-tight text-white" style={{ fontSize: 'clamp(26px, 7vw, 40px)' }}>
            ადამიანისგან რჩება<br />მისი სიტყვები.
          </h1>
          <p className="font-mono text-[14px] mt-4 leading-relaxed" style={{ color: 'rgba(230,255,240,0.72)' }}>
            M.A.R.S. ინახავს იმას, რაც შენგან და შენს ახლობლებისგან რჩება — ტექსტს, სახეს,
            დოკუმენტებს, მოგონებებს. ერთ ადგილას, ერთი მუდმივი კოდით.
          </p>

          <div className="flex flex-col sm:flex-row gap-2 mt-6">
            <button onClick={onEnter}
              className="flex-1 py-3.5 rounded-xl font-mono text-[14px] font-bold transition-all active:scale-[0.98]"
              style={{ border: '1px solid rgba(57,255,106,0.5)', background: 'rgba(57,255,106,0.16)', color: '#39ff6a' }}>
              {authed ? 'გახსენი არქივი' : 'დაიწყე — უფასოა'}
            </button>
          </div>
        </motion.div>

        {/* What it stores */}
        <div className="mt-10 grid gap-2 sm:grid-cols-2">
          {[
            ['📝', 'ჩანაწერი საკუთარ თავზე', 'დაწერე ვინ ხარ საკუთარი სიტყვებით. სისტემა კითხულობს და გაძლევს მუდმივ კოდს.'],
            ['🕯', 'ჩანაწერი მასზე, ვინც აღარ არის', 'შექმენი გვერდი ახლობელზე. ვისაც ის უყვარდა, დაამატებს მოგონებას.'],
            ['💬', 'ესაუბრე ჩანაწერს', 'ყოველი პასუხი ციტატაა იმისა, რაც ნამდვილად დაიწერა. სისტემა არაფერს იგონებს.'],
            ['🧬', 'ბიოლოგიური ნიმუშის რეესტრი', 'აღრიცხე რომ ნიმუში არსებობს და სად. ჩვენ მას არ ვაგროვებთ.'],
          ].map(([icon, title, body]) => (
            <div key={title} className="rounded-2xl p-4"
              style={{ border: '1px solid rgba(57,255,106,0.16)', background: 'rgba(255,255,255,0.02)' }}>
              <div className="text-[20px] mb-1">{icon}</div>
              <p className="font-display font-bold text-[14px] text-white/90">{title}</p>
              <p className="font-mono text-[11px] mt-1 leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>{body}</p>
            </div>
          ))}
        </div>

        {/* Live numbers, or nothing. */}
        {stats && stats.total > 0 && (
          <div className="mt-8 flex gap-2">
            <Stat n={stats.total} label="ჩანაწერი" />
            {Object.entries(stats.sectors).filter(([, v]) => v > 0).slice(0, 3).map(([k, v]) => (
              <Stat key={k} n={v} label={k} color={sectorOf(k).color} />
            ))}
          </div>
        )}

        {/* Recent records — proof that people are actually here. */}
        {recent.length > 0 && (
          <div className="mt-8">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] mb-2" style={{ color: 'rgba(57,255,106,0.45)' }}>
              ბოლო ჩანაწერები
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {recent.map(e => {
                const s = sectorOf(e.sector);
                const years = lifespan(e.bornYear, e.diedYear);
                return (
                  <button key={e.code} onClick={() => onOpenRecord(e.code)}
                    className="rounded-xl p-2.5 flex flex-col items-center text-center transition-all active:scale-[0.98]"
                    style={{ border: `1px solid ${s.color}2e`, background: 'rgba(255,255,255,0.02)' }}>
                    <div className="rounded-lg overflow-hidden mb-1.5" style={{ width: 48, height: 48, border: `1px solid ${s.color}44`, background: 'rgba(0,0,0,0.35)' }}>
                      {e.portrait
                        ? <img src={e.portrait} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center font-mono" style={{ color: `${s.color}66`, fontSize: 17 }}>
                            {e.designation.slice(0, 1).toUpperCase() || '?'}
                          </div>}
                    </div>
                    <p className="font-mono text-[10px] text-white/80 truncate w-full">{e.designation}</p>
                    <p className="font-mono text-[9px] mt-0.5" style={{ color: `${s.color}bb` }}>
                      {years || `#${e.code}`}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* The boundary, stated on the front page and not buried. */}
        <div className="mt-8 rounded-2xl p-4" style={{ border: '1px solid rgba(255,212,90,0.28)', background: 'rgba(255,212,90,0.05)' }}>
          <p className="font-mono text-[12px] font-bold mb-1.5" style={{ color: '#ffd45a' }}>რას არ ვაკეთებთ</p>
          <p className="font-mono text-[11px] leading-relaxed" style={{ color: 'rgba(255,212,90,0.8)' }}>
            ეს არქივია და არა დაპირება. ბიოლოგიურ მასალას არ ვიღებთ და არ ვინახავთ — ამას
            ლიცენზირებული ბიობანკი აკეთებს. აღდგენას ვერავინ გპირდება. ერთადერთი, რასაც
            ვაკეთებთ, ისაა, რომ შენი კვალი არ დაიკარგოს.
          </p>
        </div>

        <footer className="mt-8 pt-4 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => setLegal('terms')} className="font-mono text-[11px]"
              style={{ color: 'rgba(125,249,255,0.7)' }}>წესები</button>
            <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
            <button onClick={() => setLegal('privacy')} className="font-mono text-[11px]"
              style={{ color: 'rgba(125,249,255,0.7)' }}>კონფიდენციალურობა</button>
          </div>
          <p className="font-mono text-[10px] mt-2" style={{ color: 'rgba(255,255,255,0.22)' }}>
            M.A.R.S. · Void
          </p>
        </footer>
      </div>

      <AnimatePresence>
        {legal && <MarsLegal initial={legal} onClose={() => setLegal(null)} />}
      </AnimatePresence>
    </div>
  );
}

function Stat({ n, label, color = '#39ff6a' }: { n: number; label: string; color?: string }) {
  return (
    <div className="flex-1 rounded-xl px-2 py-2.5 text-center" style={{ border: `1px solid ${color}2e`, background: `${color}0a` }}>
      <p className="font-display font-bold text-[19px]" style={{ color }}>{n}</p>
      <p className="font-mono text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</p>
    </div>
  );
}
