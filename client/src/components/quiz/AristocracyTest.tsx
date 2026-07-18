import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useT } from '@/store/langStore';

/**
 * არისტოკრატიის ტესტი — a light-hearted single-player taste/etiquette quiz.
 * 10 random questions per run, 4 options each, instant right/wrong feedback
 * with a one-line reason, then a scored aristocracy verdict. Client-only.
 */
interface Q { q: string; options: string[]; correct: number; why: string }

const POOL: Q[] = [
  { q: 'რომელი არის ჩამოთვლილთაგან არისტოკრატული ხილი?', options: ['ყურძენი', 'საზამთრო', 'ლეღვი', 'ატამი'], correct: 0, why: 'ყურძენი — ღვინის, დახვეწილობისა და ელეგანტურობის სიმბოლო.' },
  { q: 'არისტოკრატისთვის რომელი სასმელი შეეფერება?', options: ['ენერგეტიკული', 'წითელი ღვინო', 'ლუდი კათხით', 'ლიმონათი'], correct: 1, why: 'დახვეწილი წითელი ღვინო — არისტოკრატიის კლასიკა.' },
  { q: 'რომელი მუსიკაა უფრო არისტოკრატული?', options: ['ტრეპი', 'ტექნო', 'კლასიკური', 'რეპი'], correct: 2, why: 'კლასიკური მუსიკა — დახვეწილი გემოვნების ნიშანი.' },
  { q: 'სადილის მაგიდაზე რომელი ხელსახოცი შეეფერება?', options: ['ქაღალდის', 'თეთრი სელის', 'ფერადი პლასტმასის', 'საერთოდ არა'], correct: 1, why: 'თეთრი სელის ხელსახოცი — ეტიკეტის ნიშანი.' },
  { q: 'არისტოკრატი როგორ სვამს ჩაის?', options: ['ბოთლიდან', 'ერთ ყლუპში', 'პატარა ყლუპებით, ფინჯნიდან', 'ცხელს ბერავს ხმამაღლა'], correct: 2, why: 'მშვიდი, პატარა ყლუპები — სიმშვიდისა და ეტიკეტის.' },
  { q: 'რომელი ჰობია არისტოკრატული?', options: ['ცხენოსნობა', 'ხმაურიანი კამათი', 'უსასრულო სქროლი', 'ჩხუბი'], correct: 0, why: 'ცხენოსნობა — კეთილშობილების ტრადიციული ხელოვნება.' },
  { q: 'სტუმართან როგორ იქცევა ჭეშმარიტი არისტოკრატი?', options: ['უგულებელყოფით', 'თავაზიანად და ღიმილით', 'ხმამაღლა ბრძანებებით', 'დაცინვით'], correct: 1, why: 'თავაზიანობა და სითბო — კეთილშობილების საზომი.' },
  { q: 'რომელი ფერია არისტოკრატული?', options: ['ნეონისფერი მწვანე', 'ბურგუნდისფერი', 'მოციმციმე ვარდისფერი', 'ჟოლოსფერი კრიალა'], correct: 1, why: 'ღრმა ბურგუნდისფერი — თავშეკავებული დიდებულება.' },
  { q: 'საუბრისას არისტოკრატი…', options: ['აწყვეტინებს ყველას', 'მშვიდად და გამართულად ლაპარაკობს', 'ყვირის', 'ჩურჩულებს ზურგსუკან'], correct: 1, why: 'გამართული, მშვიდი მეტყველება — განათლების ნიშანი.' },
  { q: 'რომელი ყვავილი შეამკობს არისტოკრატის მაგიდას?', options: ['პლასტმასის ყვავილი', 'ცოცხალი ვარდი', 'გამხმარი ბალახი', 'არაფერი'], correct: 1, why: 'ცოცხალი ვარდი — ელეგანტურობისა და გემოვნების.' },
  { q: 'როგორ იჯდება არისტოკრატი მაგიდასთან?', options: ['იდაყვები მაგიდაზე', 'ზურგგამართული, იდაყვები ჩამოშვებული', 'ფეხმორთხმული', 'დამხობილი'], correct: 1, why: 'გამართული ტანი — თავდაჭერისა და ეტიკეტის.' },
  { q: 'საჩუქრად რას აჩუქებდა არისტოკრატი?', options: ['კუპონს', 'ხელით შერჩეულ წიგნს ან ყვავილებს', 'ვერაფერს', 'ნახმარ ნივთს'], correct: 1, why: 'გააზრებული, გულითადი საჩუქარი — ყურადღების ნიშანი.' },
  { q: 'რომელი სუნამო შეეფერება არისტოკრატს?', options: ['მკვეთრი და იაფი', 'დახვეწილი, თავშეკავებული', 'საერთოდ არა', 'საყოფაცხოვრებო ქიმია'], correct: 1, why: 'ნატიფი, თავშეკავებული სურნელი — ელეგანტურობის.' },
  { q: 'რომელი წიგნი იქნება არისტოკრატის თაროზე?', options: ['კომიქსი', 'პოეზიის კრებული', 'რეკლამის ბუკლეტი', 'ცარიელი თარო'], correct: 1, why: 'პოეზია — დახვეწილი სულის საზრდო.' },
  { q: 'დაბადების დღეს არისტოკრატი ულოცავს…', options: ['ემოჯით მასობრივ ჩატში', 'პირადად, გულითადი სიტყვებით', 'საერთოდ არ ულოცავს', 'დაგვიანებით, ფორმალურად'], correct: 1, why: 'პირადი, გულწრფელი მილოცვა — ყურადღებისა და პატივის.' },
  { q: 'რომელი კერძი უფრო არისტოკრატულია?', options: ['ხრაშუნა ფასტფუდი', 'დახვეწილად მირთმეული ზღვის პროდუქტები', 'ნახევრად ცივი პიცა', 'ინსტანტ ლაფშა'], correct: 1, why: 'დახვეწილად სერვირებული კერძი — გემოვნების ნიშანი.' },
  { q: 'რას გააკეთებს არისტოკრატი, თუ ვინმე შეცდა?', options: ['საჯაროდ დასცინებს', 'დელიკატურად, ტაქტით მიანიშნებს', 'იყვირებს', 'გაავრცელებს ჭორს'], correct: 1, why: 'ტაქტი და დელიკატურობა — ნამდვილი კეთილშობილება.' },
  { q: 'რომელი აქსესუარი შეეფერება არისტოკრატს?', options: ['კრიალა პლასტმასის საათი', 'ელეგანტური, თავშეკავებული საათი', 'სამი ჯაჭვი ერთად', 'არაფერი'], correct: 1, why: 'თავშეკავებული ელეგანტურობა — ხარისხი, არა ხმაური.' },
  { q: 'როგორ პასუხობს არისტოკრატი შეურაცხყოფაზე?', options: ['იმავე მონეტით', 'ღირსეული სიმშვიდით', 'ხელჩართული ჩხუბით', 'ტირილით'], correct: 1, why: 'ღირსება და თავდაჭერა — შინაგანი კეთილშობილება.' },
  { q: 'რომელი სასმელი ჭიქა შეეფერება ღვინოს არისტოკრატულ სუფრაზე?', options: ['პლასტმასის ჭიქა', 'მინის ფეხიანი ბოკალი', 'კათხა', 'ქილა'], correct: 1, why: 'მინის ფეხიანი ბოკალი — ღვინის ეტიკეტის ნაწილი.' },
  { q: 'რას აკეთებს არისტოკრატი შეხვედრაზე დაგვიანებისას?', options: ['ჩუმად შემოიპარება', 'თავაზიანად ბოდიშს იხდის', 'არაფერს', 'სხვას დააბრალებს'], correct: 1, why: 'გულწრფელი ბოდიში — პატივისცემისა და ეტიკეტის.' },
];

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j]!, r[i]!]; }
  return r;
}

export function AristocracyTest({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [round, setRound] = useState(0); // bump to reshuffle
  const questions = useMemo(() => shuffle(POOL).slice(0, 10), [round]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const q = questions[idx]!;
  const answered = picked !== null;

  const pick = (i: number) => {
    if (answered) return;
    setPicked(i);
    if (i === q.correct) setScore(s => s + 1);
  };
  const next = () => {
    if (idx + 1 >= questions.length) { setDone(true); return; }
    setIdx(i => i + 1);
    setPicked(null);
  };
  const restart = () => { setRound(r => r + 1); setIdx(0); setPicked(null); setScore(0); setDone(false); };

  const verdict = (() => {
    if (score >= 9) return { emoji: '👑', title: 'ჭეშმარიტი არისტოკრატი', sub: 'ცისფერი სისხლი გაწვის ძარღვებში.' };
    if (score >= 7) return { emoji: '🎩', title: 'კეთილშობილი სული', sub: 'ელეგანტურობა შენი მეორე ბუნებაა.' };
    if (score >= 5) return { emoji: '🌱', title: 'დახვეწის გზაზე', sub: 'პოტენციალი ჩანს — გააგრძელე.' };
    if (score >= 3) return { emoji: '📚', title: 'ჯერ სასწავლია', sub: 'ცოტა ეტიკეტი და გამოსწორდები.' };
    return { emoji: '😅', title: 'ხალხის ბიჭი', sub: 'არისტოკრატია მოგელოდება... ოდესმე.' };
  })();

  const optStyle = (i: number) => {
    if (!answered) return { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(212,175,55,0.25)', color: 'rgba(255,255,255,0.85)' };
    if (i === q.correct) return { background: 'rgba(63,174,90,0.18)', border: '1px solid rgba(63,174,90,0.6)', color: '#9fe6b5' };
    if (i === picked) return { background: 'rgba(255,60,60,0.15)', border: '1px solid rgba(255,60,60,0.55)', color: '#ff9a9a' };
    return { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' };
  };

  return createPortal(
    // stopPropagation: keep in-game swipes from reaching the app's tab nav
    // (React portal events bubble through the component tree, not the DOM).
    <div className="fixed inset-0 z-[500] flex flex-col" style={{ background: 'radial-gradient(ellipse 90% 60% at 50% 0%, #241a08, #0a0714 60%)' }} onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
      {/* header */}
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)] pb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">👑</span>
          <div>
            <p className="font-display font-bold text-sm tracking-wide" style={{ color: '#e8cf7a' }}>{t.games.aristocracy.title}</p>
            {!done && <p className="font-mono text-[11px] text-white/40">{t.games.aristocracy.questionOf.replace('{n}', String(idx + 1)).replace('{m}', String(questions.length))} · 🏅 {score}</p>}
          </div>
        </div>
        <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center text-white/60"
          style={{ background: 'rgba(20,12,4,0.6)', border: '1px solid rgba(212,175,55,0.3)' }}>✕</button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-6 flex flex-col justify-center max-w-2xl w-full mx-auto">
        {!done ? (
          <AnimatePresence mode="wait">
            <motion.div key={idx} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }}>
              <p className="font-display font-bold text-lg leading-snug text-white mb-5">{q.q}</p>
              <div className="space-y-2.5">
                {q.options.map((o, i) => (
                  <button key={i} onClick={() => pick(i)} disabled={answered}
                    className="w-full text-left px-4 py-3.5 rounded-2xl font-mono text-[14px] transition-all active:scale-[0.99] flex items-center gap-3"
                    style={optStyle(i)}>
                    <span className="font-bold opacity-60">{['ა', 'ბ', 'გ', 'დ'][i]}.</span>
                    <span className="flex-1">{o}</span>
                    {answered && i === q.correct && <span>✓</span>}
                    {answered && i === picked && i !== q.correct && <span>✗</span>}
                  </button>
                ))}
              </div>

              <AnimatePresence>
                {answered && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-2xl px-4 py-3"
                    style={{ background: picked === q.correct ? 'rgba(63,174,90,0.1)' : 'rgba(255,60,60,0.08)', border: `1px solid ${picked === q.correct ? 'rgba(63,174,90,0.35)' : 'rgba(255,60,60,0.3)'}` }}>
                    <p className="font-mono text-[13px] font-bold mb-1" style={{ color: picked === q.correct ? '#9fe6b5' : '#ff9a9a' }}>
                      {picked === q.correct ? t.games.aristocracy.correct : t.games.aristocracy.wrong}
                    </p>
                    <p className="font-mono text-[12.5px] text-white/60 leading-snug">{q.why}</p>
                    <button onClick={next} className="mt-3 w-full py-2.5 rounded-xl font-mono font-bold text-sm"
                      style={{ background: 'rgba(212,175,55,0.18)', border: '1px solid rgba(212,175,55,0.5)', color: '#e8cf7a' }}>
                      {idx + 1 >= questions.length ? t.games.aristocracy.finish : t.games.aristocracy.next} →
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </AnimatePresence>
        ) : (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
            <p className="text-6xl mb-3">{verdict.emoji}</p>
            <p className="font-mono text-sm text-white/40 mb-1">{t.games.aristocracy.yourScore}</p>
            <p className="font-display font-bold text-4xl mb-2" style={{ color: '#e8cf7a' }}>{score} / {questions.length}</p>
            <p className="font-display font-bold text-xl text-white mb-1">{verdict.title}</p>
            <p className="font-mono text-sm text-white/50 mb-6">{verdict.sub}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={restart} className="px-6 py-2.5 rounded-xl font-mono font-bold text-sm"
                style={{ background: 'rgba(212,175,55,0.18)', border: '1px solid rgba(212,175,55,0.5)', color: '#e8cf7a' }}>
                {t.games.aristocracy.retry}
              </button>
              <button onClick={onClose} className="px-6 py-2.5 rounded-xl font-mono text-sm text-white/50" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
                {t.games.aristocracy.exit}
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>,
    document.body,
  );
}
