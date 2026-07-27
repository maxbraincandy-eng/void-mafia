// ── ფორმალური ლოგიკის აკადემია ────────────────────────────────────────
// შვიდი განყოფილება ერთ ჰაბში. ტესტი პასუხის შემდეგ ხსნის, რომელი წესი
// დაირღვა — ქულა მეორეხარისხოვანია, სწავლება მთავარია.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import { useSocialStore } from '@/store/socialStore';
import { useAuthStore } from '@/store/authStore';
import { LogicLogo } from './LogicLogo';

type Level = 'beginner' | 'medium' | 'hard' | 'expert';
type Mode = 'practice' | 'ranked' | 'daily' | 'test';
type Scope = 'world' | 'country' | 'friends' | 'week' | 'month' | 'all';
type View = 'hub' | 'test' | 'result' | 'board' | 'stats' | 'achv' | 'levels' | 'book' | 'chapter' | 'exam' | 'examResult' | 'examBoard';

interface Profile {
  rating: number; peakRating: number; answered: number; correct: number; totalMs: number;
  tests: number; streak: number; bestStreak: number; dailyStreak: number; bestDailyStreak: number;
  lastDaily: string | null; hardest: string; xp: number;
}
interface Ranks { world: number | null; country: number | null; countryCode: string | null; totalPlayers: number }
interface Achv { code: string; name: string; desc: string; icon: string; earned: boolean; at: number | null }
interface Hub {
  profile: Profile; ranks: Ranks; daily: { done: boolean; date: string; streak: number };
  achievements: Achv[];
  exam: ExamStatus;
  handbook: { chapters: number; sections: number };
  bank: { total: number; levels: Array<{ level: Level; label: string; count: number }>; categories: Array<{ cat: string; label: string }> };
}
interface QView {
  sessionId: string; mode: Mode; index: number; total: number; score: number; combo: number;
  question: { title: string; body: string; q: string; options: string[]; level: Level; cat: string; seconds: number } | null;
}
interface AnswerRes {
  correct: boolean; correctPos: number; chosen: number; gained: number; combo: number; ratingDelta: number;
  rule: string; why: string; trap: string | null; explain: boolean; done: boolean; next: QView | null;
}
interface Result {
  score: number; correct: number; total: number;
  ratingBefore: number; ratingAfter: number; ratingDelta: number;
  accuracy: number; avgMs: number; bestCombo: number; xp: number; coins: number;
  achievements: string[];
  review: Array<{ title: string; body: string; q: string; options: string[]; correctPos: number; chosen: number; rule: string; why: string; trap: string | null; level: string; cat: string }>;
}
interface BoardRow { rank: number; userId: string; username: string; avatar: string; avatarUrl: string | null; country: string | null; rating: number; accuracy: number; tests: number; score?: number }
interface ExamBoardRow { rank: number; userId: string; username: string; avatar: string; avatarUrl: string | null; country: string | null; score: number; correct: number; total: number; durationMs: number; at: number }
interface ExamStatus { canSit: boolean; waitMs: number; lastAt: number | null; lastScore: number | null; best: { score: number; correct: number; total: number; at: number } | null; attempts: number; totalQuestions: number; examMs: number }
interface ExamView { examId: string; index: number; total: number; endsAt: number; answered: number; question: { title: string; body: string; q: string; options: string[]; level: Level; cat: string } | null }
interface ExamResult { score: number; correct: number; total: number; answered: number; timedOut: boolean; durationMs: number; grade: string; byLevel: Record<string, { correct: number; total: number }>; best: boolean; coins: number; nextSittingAt: number; review: Result['review'] }
interface HbSection { h: string; p: string[]; formal?: string[]; example?: string; pitfall?: string; note?: string }
interface HbChapter { id: string; icon: string; title: string; blurb: string; sections: HbSection[] }

const LV_COLOR: Record<string, string> = { beginner: '#3fb950', medium: '#4d9fff', hard: '#a371f7', expert: '#ff4d5e' };
const LV_LABEL: Record<string, string> = { beginner: 'დამწყები', medium: 'საშუალო', hard: 'რთული', expert: 'ექსპერტი' };
const LV_DOT: Record<string, string> = { beginner: '🟢', medium: '🔵', hard: '🟣', expert: '🔴' };
const SCOPES: Array<{ id: Scope; label: string }> = [
  { id: 'world', label: '🌍 მსოფლიო' }, { id: 'country', label: '🇬🇪 ქვეყანა' }, { id: 'friends', label: '👥 მეგობრები' },
  { id: 'week', label: '📅 კვირა' }, { id: 'month', label: '📅 თვე' }, { id: 'all', label: '🏆 ყველა დრო' },
];

const unwrap = <T,>(r: any): T => { if (r?.ok === false || r?.error) throw new Error(r.error ?? 'შეცდომა'); return (r?.data ?? r) as T; };
const fmtMs = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}წმ` : `${ms}მწმ`;

/** Rating band — what the number actually means, in words. */
function band(r: number): { name: string; color: string } {
  if (r >= 2200) return { name: 'ლოგიკის ლეგენდა', color: '#ffd45a' };
  if (r >= 2000) return { name: 'ექსპერტი', color: '#ff4d5e' };
  if (r >= 1800) return { name: 'ანალიტიკოსი', color: '#a371f7' };
  if (r >= 1600) return { name: 'სტრატეგი', color: '#7c9cff' };
  if (r >= 1400) return { name: 'ფორმალური მოაზროვნე', color: '#4d9fff' };
  if (r >= 1200) return { name: 'მოსწავლე', color: '#3fb950' };
  return { name: 'დამწყები', color: '#8b93a7' };
}

export function LogicAcademy({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<View>('hub');
  const [hub, setHub] = useState<Hub | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // test state
  const [q, setQ] = useState<QView | null>(null);
  const [mode, setMode] = useState<Mode>('practice');
  const [picked, setPicked] = useState<number | null>(null);
  const [fb, setFb] = useState<AnswerRes | null>(null);
  const [left, setLeft] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const shownAt = useRef(0);
  const timerRef = useRef<number | null>(null);

  // board / stats
  const [scope, setScope] = useState<Scope>('world');
  const [board, setBoard] = useState<BoardRow[] | null>(null);
  const [stats, setStats] = useState<any>(null);

  // handbook
  const [book, setBook] = useState<HbChapter[] | null>(null);
  const [chapter, setChapter] = useState<HbChapter | null>(null);

  // exam — ONE pooled clock for the whole paper, not a timer per question
  const [exam, setExam] = useState<ExamView | null>(null);
  const [examLeft, setExamLeft] = useState(0);
  const [examPicked, setExamPicked] = useState<number | null>(null);
  const [examRes, setExamRes] = useState<ExamResult | null>(null);
  const [examBoard, setExamBoard] = useState<ExamBoardRow[] | null>(null);
  const [examScope, setExamScope] = useState<'all' | 'week' | 'country'>('all');
  const examRef = useRef<ExamView | null>(null);
  const examTimer = useRef<number | null>(null);

  const openProfile = useSocialStore(s => s.openProfile);
  const myId = useAuthStore(s => s.profile?.id ?? s.uid);

  const loadHub = useCallback(async () => {
    try { setHub(unwrap<Hub>(await emitWithAck('logic:hub'))); }
    catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { loadHub(); }, [loadHub]);

  // ── timer ──
  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  useEffect(() => () => stopTimer(), []);

  const beginQuestion = useCallback((v: QView) => {
    setQ(v); setPicked(null); setFb(null);
    shownAt.current = Date.now();
    stopTimer();
    if (!v.question) return;
    setLeft(v.question.seconds);
    timerRef.current = window.setInterval(() => {
      setLeft(prev => {
        if (prev <= 1) { stopTimer(); submit(-1); return 0; }
        return prev - 1;
      });
    }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async (m: Mode, level: Level | 'mixed', count = 10) => {
    setBusy(true); setErr(null);
    try {
      const v = unwrap<QView>(await emitWithAck('logic:start', { mode: m, level, count }));
      setMode(m); setResult(null); setView('test');
      beginQuestion(v);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const submit = useCallback(async (choice: number) => {
    const cur = qRef.current;
    if (!cur || pickedRef.current !== null) return;
    stopTimer();
    setPicked(choice);
    try {
      const r = unwrap<AnswerRes>(await emitWithAck('logic:answer', {
        sessionId: cur.sessionId, choice, ms: Date.now() - shownAt.current,
      }));
      setFb(r);
      if (r.done) {
        const res = unwrap<Result>(await emitWithAck('logic:finish', { sessionId: cur.sessionId }));
        setResult(res);
        setTimeout(() => { setView('result'); loadHub(); }, r.explain ? 1400 : 600);
      }
    } catch (e: any) { setErr(e.message); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadHub]);

  // refs so the interval callback sees fresh values
  const qRef = useRef<QView | null>(null); useEffect(() => { qRef.current = q; }, [q]);
  const pickedRef = useRef<number | null>(null); useEffect(() => { pickedRef.current = picked; }, [picked]);

  const next = () => { if (fb?.next) beginQuestion(fb.next); };

  // ── exam ──
  useEffect(() => { examRef.current = exam; }, [exam]);
  const stopExamTimer = () => { if (examTimer.current) { clearInterval(examTimer.current); examTimer.current = null; } };
  useEffect(() => () => stopExamTimer(), []);

  const finishExamNow = useCallback(async () => {
    const cur = examRef.current;
    if (!cur) return;
    stopExamTimer();
    try {
      const r = unwrap<ExamResult>(await emitWithAck('logic:exam_finish', { examId: cur.examId }));
      setExamRes(r); setExam(null); setView('examResult'); loadHub();
    } catch (e: any) { setErr(e.message); setView('hub'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadHub]);

  /** The pooled clock is driven off the server's `endsAt`, so a refresh or a
      backgrounded tab cannot buy extra time. */
  const armExamClock = useCallback((v: ExamView) => {
    stopExamTimer();
    const tick = () => {
      const ms = Math.max(0, v.endsAt - Date.now());
      setExamLeft(Math.ceil(ms / 1000));
      if (ms <= 0) { stopExamTimer(); finishExamNow(); }
    };
    tick();
    examTimer.current = window.setInterval(tick, 500);
  }, [finishExamNow]);

  const startExam = async () => {
    setBusy(true); setErr(null);
    try {
      const v = unwrap<ExamView>(await emitWithAck('logic:exam_start'));
      setExam(v); setExamPicked(null); setExamRes(null); setView('exam');
      armExamClock(v);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const answerExam = async (choice: number) => {
    const cur = examRef.current;
    if (!cur || examPicked !== null) return;
    setExamPicked(choice);
    try {
      const r = unwrap<{ done: boolean; next: ExamView | null }>(await emitWithAck('logic:exam_answer', { examId: cur.examId, choice }));
      if (r.done) { await finishExamNow(); return; }
      // same paper, same clock — only the question changes
      setExam(r.next); setExamPicked(null);
    } catch (e: any) { setErr(e.message); }
  };

  const openBook = async () => {
    setView('book');
    if (book) return;
    try { setBook(unwrap<{ chapters: HbChapter[] }>(await emitWithAck('logic:handbook')).chapters); }
    catch (e: any) { setErr(e.message); }
  };
  const loadExamBoard = async (sc: 'all' | 'week' | 'country') => {
    setExamScope(sc); setExamBoard(null);
    try { setExamBoard(unwrap<ExamBoardRow[]>(await emitWithAck('logic:exam_board', { scope: sc, limit: 50 }))); }
    catch (e: any) { setErr(e.message); setExamBoard([]); }
  };

  const loadBoard = async (s: Scope) => {
    setScope(s); setBoard(null);
    try { setBoard(unwrap<BoardRow[]>(await emitWithAck('logic:leaderboard', { scope: s, limit: 50 }))); }
    catch (e: any) { setErr(e.message); setBoard([]); }
  };
  const openBoard = () => { setView('board'); loadBoard(scope); };
  const openStats = async () => {
    setView('stats'); setStats(null);
    try { setStats(unwrap<any>(await emitWithAck('logic:stats'))); } catch (e: any) { setErr(e.message); }
  };

  const p = hub?.profile;
  const bandInfo = useMemo(() => band(p?.rating ?? 1200), [p?.rating]);

  // The games tab sits inside a transformed ancestor, which makes `position:
  // fixed` anchor to THAT box instead of the viewport — the panel opened
  // scrolled past its own header and left the sidebar showing. A portal to
  // <body> escapes the containing block entirely.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';          // no background scroll bleed
    return () => { document.body.style.overflow = prev; };
  }, []);
  // every screen change starts at the top, not wherever the last one was
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [view]);

  return createPortal(
    <div style={S.wrap} ref={scroller}>
      <div style={S.inner}>
        {/* header */}
        <div style={S.header}>
          <button style={S.icon} onClick={() => (view === 'hub' ? onClose() : setView('hub'))}>‹</button>
          {view === 'hub' && <LogicLogo size={34} label={false} className="flex-shrink-0" />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={S.title}>ფორმალური ლოგიკის აკადემია</div>
            <div style={S.sub}>
              {view === 'hub' ? 'ლოგიკა, არგუმენტაცია, დედუქცია' : view === 'test' ? `კითხვა ${(q?.index ?? 0) + 1}/${q?.total ?? 0}` : ''}
            </div>
          </div>
          {view === 'hub' && p && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: '"Space Grotesk",monospace', fontSize: 22, fontWeight: 800, color: bandInfo.color }}>{p.rating}</div>
              <div style={{ fontSize: 10, color: '#7d86a0', letterSpacing: 1 }}>LOGIC RATING</div>
            </div>
          )}
        </div>

        {err && <div style={S.err} onClick={() => setErr(null)}>{err}</div>}

        <AnimatePresence mode="wait">
          {/* ── HUB ── */}
          {view === 'hub' && (
            <motion.div key="hub" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ paddingBottom: 30 }}>
              {!hub ? <div style={S.dim}>იტვირთება…</div> : (
                <>
                  <RatingCard p={hub.profile} ranks={hub.ranks} band={bandInfo} />
                  <div style={S.grid}>
                    <Tile icon="📝" title="ტესტის დაწყება" sub="შერეული, 10 კითხვა" accent="#7c9cff" onClick={() => setView('levels')} busy={busy} />
                    <Tile icon="🗓️" title="ყოველდღიური გამოწვევა"
                      sub={hub.daily.done ? `დასრულებულია · სერია ${hub.daily.streak}` : 'ახალი ტესტი ყოველდღე'}
                      accent="#ffd45a" disabled={hub.daily.done} onClick={() => start('daily', 'mixed', 8)} busy={busy} />
                    <Tile icon="🎯" title="სავარჯიშო რეჟიმი" sub="რეიტინგი არ იცვლება · ახსნა მაშინვე" accent="#3fb950" onClick={() => start('practice', 'mixed', 10)} busy={busy} />
                    <Tile icon="⚔️" title="რეიტინგული რეჟიმი" sub="რთული კითხვები · ახსნა ბოლოს" accent="#ff4d5e" onClick={() => start('ranked', 'mixed', 10)} busy={busy} />
                    <Tile icon="🎓" title="გამოცდა"
                      sub={hub.exam.canSit
                        ? `${hub.exam.totalQuestions} კითხვა · ${Math.round(hub.exam.examMs / 60000)} წუთი ჯამში · 100 ქულა`
                        : `გადაბარება ${Math.ceil(hub.exam.waitMs / 86400000)} დღეში${hub.exam.best ? ` · საუკეთესო ${hub.exam.best.score}/100` : ''}`}
                      accent="#ffd45a" disabled={!hub.exam.canSit} onClick={startExam} busy={busy} />
                    <Tile icon="📖" title="სახელმძღვანელო"
                      sub={`${hub.handbook.chapters} თავი · ${hub.handbook.sections} განყოფილება`}
                      accent="#4dd4c4" onClick={openBook} />
                    <Tile icon="🏆" title="ლიდერბორდი" sub="მსოფლიო · ქვეყანა · მეგობრები" accent="#a371f7" onClick={openBoard} />
                    <Tile icon="🥇" title="გამოცდის ლიდერბორდი" sub="100-ქულიანი შეფასება" accent="#ff9f43" onClick={() => { setView('examBoard'); loadExamBoard(examScope); }} />
                    <Tile icon="📊" title="ჩემი სტატისტიკა" sub="სიზუსტე, დრო, სერიები" accent="#4d9fff" onClick={openStats} />
                    <Tile icon="🎖️" title="მიღწევები"
                      sub={`${hub.achievements.filter(a => a.earned).length}/${hub.achievements.length} მოპოვებული`}
                      accent="#ff9f43" onClick={() => setView('achv')} />
                  </div>
                  <div style={{ ...S.dim, marginTop: 14, textAlign: 'center' }}>
                    ბაზაში {hub.bank.total} კითხვაა · კითხვები არ მეორდება სანამ ბაზა არ ამოიწურება
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ── LEVEL PICKER ── */}
          {view === 'levels' && hub && (
            <motion.div key="lv" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div style={S.sectionTitle}>აირჩიე დონე</div>
              {hub.bank.levels.map(l => (
                <button key={l.level} style={{ ...S.levelRow, borderColor: LV_COLOR[l.level] + '55' }} onClick={() => start('test', l.level, 10)} disabled={busy}>
                  <span style={{ fontSize: 20 }}>{LV_DOT[l.level]}</span>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ color: LV_COLOR[l.level], fontWeight: 700 }}>{l.label}</div>
                    <div style={{ fontSize: 11.5, color: '#7d86a0' }}>{levelBlurb(l.level)}</div>
                  </div>
                  <span style={{ fontSize: 12, color: '#7d86a0', fontFamily: 'monospace' }}>{l.count}</span>
                </button>
              ))}
              <button style={{ ...S.levelRow, borderColor: '#7c9cff55' }} onClick={() => start('test', 'mixed', 12)} disabled={busy}>
                <span style={{ fontSize: 20 }}>🎲</span>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ color: '#7c9cff', fontWeight: 700 }}>შერეული ტესტი</div>
                  <div style={{ fontSize: 11.5, color: '#7d86a0' }}>თანდათან რთულდება — დამწყებიდან ექსპერტამდე</div>
                </div>
                <span style={{ fontSize: 12, color: '#7d86a0', fontFamily: 'monospace' }}>12</span>
              </button>
            </motion.div>
          )}

          {/* ── TEST ── */}
          {view === 'test' && q?.question && (
            <motion.div key={`q${q.index}`} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
              <div style={S.qMeta}>
                <span style={{ color: LV_COLOR[q.question.level], fontWeight: 700 }}>{LV_DOT[q.question.level]} {LV_LABEL[q.question.level]}</span>
                <span style={{ flex: 1 }} />
                {q.combo > 1 && <span style={S.combo}>🔥 {q.combo}x</span>}
                <span style={{ fontFamily: 'monospace', color: left <= 5 ? '#ff4d5e' : '#7d86a0' }}>{left}წმ</span>
              </div>
              <div style={S.timerTrack}>
                <div style={{ ...S.timerFill, width: `${(left / q.question.seconds) * 100}%`, background: left <= 5 ? '#ff4d5e' : '#7c9cff' }} />
              </div>

              <div style={S.qTitle}>{q.question.title}</div>
              <div style={S.qBody}>{q.question.body.split('\n').map((l, i) => <div key={i}>{l}</div>)}</div>
              <div style={S.qAsk}>{q.question.q}</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {q.question.options.map((o, i) => {
                  const isPicked = picked === i;
                  const isRight = fb && i === fb.correctPos;
                  const isWrong = fb && isPicked && !fb.correct;
                  return (
                    <motion.button key={i} whileTap={{ scale: fb ? 1 : 0.985 }}
                      onClick={() => submit(i)} disabled={picked !== null}
                      style={{
                        ...S.option,
                        borderColor: isRight ? '#3fb950' : isWrong ? '#ff4d5e' : isPicked ? '#7c9cff' : 'rgba(255,255,255,.11)',
                        background: isRight ? 'rgba(63,185,80,.14)' : isWrong ? 'rgba(255,77,94,.14)' : 'rgba(255,255,255,.035)',
                      }}>
                      <span style={{ ...S.optLetter, background: isRight ? '#3fb950' : isWrong ? '#ff4d5e' : 'rgba(255,255,255,.08)' }}>
                        {isRight ? '✓' : isWrong ? '✕' : 'ABCD'[i]}
                      </span>
                      <span style={{ flex: 1, textAlign: 'left' }}>{o}</span>
                    </motion.button>
                  );
                })}
              </div>

              {/* explanation */}
              <AnimatePresence>
                {fb && fb.explain && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0 }}
                    style={{ ...S.explain, borderColor: fb.correct ? 'rgba(63,185,80,.4)' : 'rgba(255,77,94,.4)' }}>
                    <div style={{ fontWeight: 800, color: fb.correct ? '#3fb950' : '#ff4d5e', marginBottom: 4 }}>
                      {fb.correct ? `სწორია  +${fb.gained}` : 'არასწორია'}
                      {fb.ratingDelta !== 0 && <span style={{ marginLeft: 8, fontSize: 12, color: fb.ratingDelta > 0 ? '#3fb950' : '#ff4d5e' }}>{fb.ratingDelta > 0 ? '+' : ''}{fb.ratingDelta} რეიტინგი</span>}
                    </div>
                    <div style={S.ruleChip}>წესი: {fb.rule}</div>
                    <div style={{ marginTop: 6, lineHeight: 1.55, whiteSpace: 'pre-line' }}>{fb.why}</div>
                    {fb.trap && (
                      <div style={S.trap}>
                        <b>რატომ არ ჯდება შენი პასუხი:</b> {fb.trap}
                      </div>
                    )}
                  </motion.div>
                )}
                {fb && !fb.explain && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ ...S.explain, borderColor: 'rgba(124,156,255,.35)' }}>
                    პასუხი მიღებულია. რეიტინგულ რეჟიმში ახსნები ტესტის ბოლოს გამოჩნდება.
                  </motion.div>
                )}
      
              </AnimatePresence>

              {fb && !fb.done && (
                <button style={S.nextBtn} onClick={next}>შემდეგი კითხვა →</button>
              )}
            </motion.div>
          )}

          {/* ── RESULT ── */}
          {view === 'result' && result && (
            <motion.div key="res" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ paddingBottom: 30 }}>
              <div style={S.resultCard}>
                <div style={{ fontSize: 13, color: '#7d86a0', letterSpacing: 2 }}>შედეგი</div>
                <div style={{ fontSize: 46, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>{result.correct}/{result.total}</div>
                <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 10, flexWrap: 'wrap' }}>
                  <Stat label="ქულა" value={String(result.score)} />
                  <Stat label="სიზუსტე" value={`${result.accuracy}%`} />
                  <Stat label="საშ. დრო" value={fmtMs(result.avgMs)} />
                  <Stat label="სერია" value={String(result.bestCombo)} />
                </div>
                {result.ratingDelta !== 0 && (
                  <div style={{ marginTop: 14, fontSize: 15 }}>
                    <span style={{ color: '#7d86a0' }}>რეიტინგი </span>
                    <b style={{ color: '#fff' }}>{result.ratingBefore}</b>
                    <span style={{ color: '#7d86a0' }}> → </span>
                    <b style={{ color: result.ratingDelta > 0 ? '#3fb950' : '#ff4d5e' }}>{result.ratingAfter}</b>
                    <span style={{ color: result.ratingDelta > 0 ? '#3fb950' : '#ff4d5e', marginLeft: 6 }}>
                      ({result.ratingDelta > 0 ? '+' : ''}{result.ratingDelta})
                    </span>
                  </div>
                )}
                <div style={{ marginTop: 8, fontSize: 13, color: '#7d86a0' }}>
                  +{result.xp} XP{result.coins > 0 ? ` · +${result.coins} 🪙` : ''}
                </div>
              </div>

              {result.achievements.length > 0 && hub && (
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={S.achvPop}>
                  <div style={{ fontWeight: 800, color: '#ffd45a', marginBottom: 6 }}>🎖️ ახალი მიღწევა!</div>
                  {result.achievements.map(code => {
                    const a = hub.achievements.find(x => x.code === code);
                    return <div key={code} style={{ fontSize: 14 }}>{a?.icon} {a?.name}</div>;
                  })}
                </motion.div>
              )}

              <div style={S.sectionTitle}>განხილვა</div>
              {result.review.map((r, i) => <ReviewCard key={i} r={r} />)}
              <button style={S.nextBtn} onClick={() => { setView('hub'); loadHub(); }}>დასრულება</button>
            </motion.div>
          )}

          {/* ── LEADERBOARD ── */}
          {view === 'board' && (
            <motion.div key="bd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ paddingBottom: 30 }}>
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8 }}>
                {SCOPES.map(s => (
                  <button key={s.id} onClick={() => loadBoard(s.id)}
                    style={{ ...S.chip, ...(scope === s.id ? S.chipOn : {}) }}>{s.label}</button>
                ))}
              </div>
              {!board ? <div style={S.dim}>იტვირთება…</div> : board.length === 0 ? <div style={S.dim}>ჯერ ცარიელია</div> : (
                board.map(r => (
                  <button key={r.userId} onClick={() => openProfile(r.userId)}
                    style={{ ...S.boardRow, width: '100%', textAlign: 'left', cursor: 'pointer',
                      borderColor: r.userId === myId ? '#7c9cff66' : r.rank <= 3 ? '#ffd45a44' : 'rgba(255,255,255,.07)',
                      background: r.userId === myId ? 'rgba(124,156,255,.1)' : 'rgba(255,255,255,.03)' }}>
                    <span style={{ width: 30, fontWeight: 800, color: r.rank === 1 ? '#ffd45a' : r.rank <= 3 ? '#c9d3e6' : '#7d86a0' }}>
                      {r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}
                    </span>
                    <Avatar row={r} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: '#e8edf7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.username}{r.userId === myId ? ' ●' : ''}
                      </div>
                      <div style={{ fontSize: 11, color: '#7d86a0' }}>{r.accuracy}% სიზუსტე · {r.tests} ტესტი</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, color: band(r.rating).color, fontFamily: '"Space Grotesk",monospace' }}>
                        {r.score !== undefined ? r.score : r.rating}
                      </div>
                      <div style={{ fontSize: 9.5, color: '#7d86a0', letterSpacing: 1 }}>{r.score !== undefined ? 'ქულა' : 'RATING'}</div>
                    </div>
                  </button>
                ))
              )}
            </motion.div>
          )}

          {/* ── STATS ── */}
          {view === 'stats' && (
            <motion.div key="st" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ paddingBottom: 30 }}>
              {!stats ? <div style={S.dim}>იტვირთება…</div> : (
                <>
                  <RatingCard p={stats.profile} ranks={stats.ranks} band={band(stats.profile.rating)} />
                  <div style={S.statGrid}>
                    <Big label="სიზუსტე" value={`${stats.accuracy}%`} />
                    <Big label="საშ. პასუხის დრო" value={fmtMs(stats.avgMs)} />
                    <Big label="ამოხსნილი ტესტი" value={String(stats.profile.tests)} />
                    <Big label="სწორი პასუხი" value={String(stats.profile.correct)} />
                    <Big label="არასწორი" value={String(Math.max(0, stats.profile.answered - stats.profile.correct))} />
                    <Big label="მიმდინარე სერია" value={String(stats.profile.streak)} />
                    <Big label="საუკეთესო სერია" value={String(stats.profile.bestStreak)} />
                    <Big label="ყოველდღიური სერია" value={String(stats.profile.dailyStreak)} />
                    <Big label="უმაღლესი რეიტინგი" value={String(stats.profile.peakRating)} />
                    <Big label="ყველაზე რთული დონე" value={LV_LABEL[stats.profile.hardest] ?? '—'} />
                  </div>
                  <div style={S.sectionTitle}>კატეგორიები</div>
                  {stats.categories.length === 0 ? <div style={S.dim}>ჯერ არაფერი გიცდია</div> : stats.categories.map((c: any) => (
                    <div key={c.cat} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', fontSize: 12.5, color: '#c9d3e6' }}>
                        <span style={{ flex: 1 }}>{c.label}</span><span style={{ color: '#7d86a0' }}>{c.seen}</span>
                      </div>
                      <div style={S.barTrack}><div style={{ ...S.barFill, width: `${Math.min(100, (c.seen / Math.max(1, stats.bank)) * 400)}%` }} /></div>
                    </div>
                  ))}
                </>
              )}
            </motion.div>
          )}

          {/* ── ACHIEVEMENTS ── */}
          {view === 'achv' && hub && (
            <motion.div key="ac" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ paddingBottom: 30 }}>
              {hub.achievements.map(a => (
                <div key={a.code} style={{ ...S.achvRow, opacity: a.earned ? 1 : 0.45, borderColor: a.earned ? '#ffd45a44' : 'rgba(255,255,255,.07)' }}>
                  <span style={{ fontSize: 26, filter: a.earned ? 'none' : 'grayscale(1)' }}>{a.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: a.earned ? '#ffd45a' : '#c9d3e6', fontSize: 14 }}>{a.name}</div>
                    <div style={{ fontSize: 12, color: '#7d86a0' }}>{a.desc}</div>
                  </div>
                  {a.earned && <span style={{ fontSize: 18 }}>✓</span>}
                </div>
              ))}
            </motion.div>
          )}
          {/* ── EXAM: one pooled clock, no feedback until it is handed in ── */}
          {view === 'exam' && exam?.question && (
            <motion.div key={`ex${exam.index}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
              <div style={S.examBar}>
                <span style={{ color: '#ffd45a', fontWeight: 800 }}>🎓 გამოცდა</span>
                <span style={{ flex: 1 }} />
                <span style={{ color: '#7d86a0' }}>{exam.index + 1}/{exam.total}</span>
                <span style={{ fontFamily: '"Space Grotesk",monospace', fontWeight: 800, fontSize: 16,
                  color: examLeft <= 120 ? '#ff4d5e' : examLeft <= 300 ? '#ffb020' : '#e8edf7' }}>
                  {Math.floor(examLeft / 60)}:{String(examLeft % 60).padStart(2, '0')}
                </span>
              </div>
              <div style={S.timerTrack}>
                <div style={{ ...S.timerFill, transition: 'width .5s linear',
                  width: `${Math.max(0, Math.min(100, (examLeft / ((hub?.exam.examMs ?? 1800000) / 1000)) * 100))}%`,
                  background: examLeft <= 120 ? '#ff4d5e' : '#ffd45a' }} />
              </div>
              <div style={{ ...S.dim, textAlign: 'left', padding: '2px 0 8px' }}>
                დრო ჯამურია — თვითონ გადაანაწილე კითხვებზე. ახსნები ბოლოს გამოჩნდება.
              </div>

              <div style={S.qMeta}>
                <span style={{ color: LV_COLOR[exam.question.level], fontWeight: 700 }}>
                  {LV_DOT[exam.question.level]} {LV_LABEL[exam.question.level]}
                </span>
              </div>
              <div style={S.qTitle}>{exam.question.title}</div>
              <div style={S.qBody}>{exam.question.body.split('\n').map((l, i) => <div key={i}>{l}</div>)}</div>
              <div style={S.qAsk}>{exam.question.q}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {exam.question.options.map((o, i) => (
                  <motion.button key={i} whileTap={{ scale: 0.985 }} onClick={() => answerExam(i)} disabled={examPicked !== null}
                    style={{ ...S.option, borderColor: examPicked === i ? '#ffd45a' : 'rgba(255,255,255,.11)',
                      background: examPicked === i ? 'rgba(255,212,90,.14)' : 'rgba(255,255,255,.035)' }}>
                    <span style={{ ...S.optLetter, background: examPicked === i ? '#ffd45a' : 'rgba(255,255,255,.08)', color: examPicked === i ? '#1a1206' : '#fff' }}>
                      {'ABCD'[i]}
                    </span>
                    <span style={{ flex: 1, textAlign: 'left' }}>{o}</span>
                  </motion.button>
                ))}
              </div>
              <button style={{ ...S.btnGhostWide }} onClick={() => answerExam(-1)} disabled={examPicked !== null}>
                გამოტოვება →
              </button>
            </motion.div>
          )}

          {/* ── EXAM RESULT ── */}
          {view === 'examResult' && examRes && (
            <motion.div key="exr" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ paddingBottom: 30 }}>
              <div style={{ ...S.resultCard, borderColor: 'rgba(255,212,90,.35)' }}>
                <div style={{ fontSize: 13, color: '#7d86a0', letterSpacing: 2 }}>გამოცდის შეფასება</div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
                  <div style={{ fontSize: 56, fontWeight: 900, color: examRes.score >= 60 ? '#ffd45a' : '#ff8fa0', lineHeight: 1.1 }}>{examRes.score}</div>
                  <div style={{ fontSize: 20, color: '#7d86a0', fontWeight: 700 }}>/100</div>
                </div>
                <div style={{ color: examRes.score >= 60 ? '#ffe9a8' : '#ffb3c0', fontWeight: 700, fontSize: 15 }}>{examRes.grade}</div>
                {examRes.best && <div style={{ ...S.ruleChip, marginTop: 8, background: 'rgba(255,212,90,.16)', color: '#ffd45a' }}>ახალი პირადი რეკორდი</div>}
                <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                  <Stat label="სწორი" value={`${examRes.correct}/${examRes.total}`} />
                  <Stat label="ნაპასუხები" value={String(examRes.answered)} />
                  <Stat label="დრო" value={`${Math.floor(examRes.durationMs / 60000)} წთ`} />
                  <Stat label="ჯილდო" value={`${examRes.coins} 🪙`} />
                </div>
                {examRes.timedOut && <div style={{ ...S.dim, color: '#ffb020', marginTop: 8 }}>დრო ამოიწურა — დარჩენილი კითხვები არ ჩაითვალა</div>}
                <div style={{ ...S.dim, marginTop: 10 }}>
                  შემდეგი გამოცდა: {new Date(examRes.nextSittingAt).toLocaleDateString('ka-GE')}
                </div>
              </div>

              <div style={S.sectionTitle}>დონეების მიხედვით</div>
              {Object.entries(examRes.byLevel).map(([lv, b]) => (
                <div key={lv} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', fontSize: 12.5 }}>
                    <span style={{ flex: 1, color: LV_COLOR[lv] }}>{LV_DOT[lv]} {LV_LABEL[lv]}</span>
                    <span style={{ color: '#7d86a0' }}>{b.correct}/{b.total}</span>
                  </div>
                  <div style={S.barTrack}><div style={{ ...S.barFill, width: `${(b.correct / Math.max(1, b.total)) * 100}%`, background: LV_COLOR[lv] }} /></div>
                </div>
              ))}

              <div style={S.sectionTitle}>განხილვა</div>
              {examRes.review.map((r, i) => <ReviewCard key={i} r={r} />)}
              <button style={S.nextBtn} onClick={() => { setView('hub'); loadHub(); }}>დასრულება</button>
            </motion.div>
          )}

          {/* ── EXAM LEADERBOARD ── */}
          {view === 'examBoard' && (
            <motion.div key="exb" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ paddingBottom: 30 }}>
              <div style={{ display: 'flex', gap: 6, paddingBottom: 8 }}>
                {([['all', '🏆 ყველა დრო'], ['week', '📅 კვირა'], ['country', '🇬🇪 ქვეყანა']] as const).map(([id, label]) => (
                  <button key={id} onClick={() => loadExamBoard(id)} style={{ ...S.chip, ...(examScope === id ? S.chipOn : {}) }}>{label}</button>
                ))}
              </div>
              {!examBoard ? <div style={S.dim}>იტვირთება…</div> : examBoard.length === 0 ? <div style={S.dim}>ჯერ ვერავის ჩაუბარებია</div> : (
                examBoard.map(r => (
                  <button key={r.userId + r.at} onClick={() => openProfile(r.userId)}
                    style={{ ...S.boardRow, width: '100%', textAlign: 'left', cursor: 'pointer',
                      borderColor: r.userId === myId ? '#7c9cff66' : r.rank <= 3 ? '#ffd45a44' : 'rgba(255,255,255,.07)',
                      background: r.userId === myId ? 'rgba(124,156,255,.1)' : 'rgba(255,255,255,.03)' }}>
                    <span style={{ width: 30, fontWeight: 800, color: r.rank === 1 ? '#ffd45a' : r.rank <= 3 ? '#c9d3e6' : '#7d86a0' }}>
                      {r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}
                    </span>
                    <Avatar row={r} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: '#e8edf7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.username}{r.userId === myId ? ' ●' : ''}
                      </div>
                      <div style={{ fontSize: 11, color: '#7d86a0' }}>
                        {r.correct}/{r.total} · {Math.floor(r.durationMs / 60000)} წთ · {new Date(r.at).toLocaleDateString('ka-GE')}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 900, fontSize: 18, color: '#ffd45a', fontFamily: '"Space Grotesk",monospace' }}>{r.score}</div>
                      <div style={{ fontSize: 9.5, color: '#7d86a0', letterSpacing: 1 }}>/100</div>
                    </div>
                  </button>
                ))
              )}
            </motion.div>
          )}

          {/* ── HANDBOOK: chapter list ── */}
          {view === 'book' && (
            <motion.div key="bk" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ paddingBottom: 30 }}>
              <div style={{ ...S.dim, textAlign: 'left', paddingTop: 0 }}>
                ყოველი წესი, რომელსაც ტესტში შეხვდები, აქ ცალკე აიხსნება — ფორმალური ჩანაწერით, მაგალითით და იმ შეცდომით, რომელსაც ის იჭერს.
              </div>
              {!book ? <div style={S.dim}>იტვირთება…</div> : book.map(c => (
                <button key={c.id} style={S.chapterRow} onClick={() => { setChapter(c); setView('chapter'); }}>
                  <span style={{ fontSize: 24 }}>{c.icon}</span>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ color: '#4dd4c4', fontWeight: 700, fontSize: 14.5 }}>{c.title}</div>
                    <div style={{ fontSize: 11.5, color: '#7d86a0', marginTop: 1 }}>{c.blurb}</div>
                  </div>
                  <span style={{ fontSize: 11, color: '#7d86a0', fontFamily: 'monospace' }}>{c.sections.length}</span>
                </button>
              ))}
            </motion.div>
          )}

          {/* ── HANDBOOK: one chapter ── */}
          {view === 'chapter' && chapter && (
            <motion.div key={chapter.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ paddingBottom: 34 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 28 }}>{chapter.icon}</span>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{chapter.title}</div>
                  <div style={{ fontSize: 12, color: '#7d86a0' }}>{chapter.blurb}</div>
                </div>
              </div>
              {chapter.sections.map((sec, i) => (
                <div key={i} style={S.bookSection}>
                  <div style={{ color: '#4dd4c4', fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{sec.h}</div>
                  {sec.p.map((para, k) => (
                    <p key={k} style={{ fontSize: 13.5, lineHeight: 1.65, color: '#d3dced', margin: '0 0 8px' }}>{para}</p>
                  ))}
                  {sec.formal && (
                    <pre style={S.formal}>{sec.formal.join('\n')}</pre>
                  )}
                  {sec.example && (
                    <div style={S.bookBox}><b style={{ color: '#8de04a' }}>მაგალითი: </b>{sec.example}</div>
                  )}
                  {sec.pitfall && (
                    <div style={{ ...S.bookBox, background: 'rgba(255,77,94,.08)', borderColor: 'rgba(255,77,94,.28)' }}>
                      <b style={{ color: '#ff8fa0' }}>ტიპური შეცდომა: </b>{sec.pitfall}
                    </div>
                  )}
                  {sec.note && (
                    <div style={{ ...S.bookBox, background: 'rgba(124,156,255,.08)', borderColor: 'rgba(124,156,255,.28)' }}>
                      <b style={{ color: '#9db4ff' }}>საინტერესო: </b>{sec.note}
                    </div>
                  )}
                </div>
              ))}
              <button style={S.nextBtn} onClick={() => setView('book')}>← თავების სია</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>,
    document.body,
  );
}

function levelBlurb(l: Level): string {
  return l === 'beginner' ? 'მარტივი დასკვნები, ჭეშმარიტი/მცდარი'
    : l === 'medium' ? '„თუ… მაშინ…", აუცილებელი და საკმარისი'
    : l === 'hard' ? 'სილოგიზმები, მრავალსაფეხურიანი ამოცანები'
    : 'ფარული წინაპირობები, მაღალი დედუქცია';
}

function RatingCard({ p, ranks, band: b }: { p: Profile; ranks: Ranks; band: { name: string; color: string } }) {
  // ring fills across the current 200-point band
  const lo = Math.floor(p.rating / 200) * 200;
  const pct = Math.max(0, Math.min(1, (p.rating - lo) / 200));
  const R = 44, C = 2 * Math.PI * R;
  return (
    <div style={S.ratingCard}>
      <div style={{ position: 'relative', width: 108, height: 108, flexShrink: 0 }}>
        <svg width="108" height="108" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="54" cy="54" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="8" />
          <motion.circle cx="54" cy="54" r={R} fill="none" stroke={b.color} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - pct) }}
            transition={{ duration: 0.9, ease: 'easeOut' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: '"Space Grotesk",monospace', fontSize: 26, fontWeight: 900, color: '#fff' }}>{p.rating}</div>
          <div style={{ fontSize: 9, color: '#7d86a0', letterSpacing: 1 }}>RATING</div>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: b.color, fontWeight: 800, fontSize: 15 }}>{b.name}</div>
        <div style={{ fontSize: 12, color: '#7d86a0', marginTop: 2 }}>პიკი {p.peakRating}</div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
          <MiniStat icon="🌍" v={ranks.world ? `#${ranks.world}` : '—'} l="მსოფლიო" />
          <MiniStat icon="🏳️" v={ranks.country ? `#${ranks.country}` : '—'} l={ranks.countryCode ?? 'ქვეყანა'} />
          <MiniStat icon="🎯" v={p.answered ? `${Math.round((p.correct / p.answered) * 100)}%` : '—'} l="სიზუსტე" />
          <MiniStat icon="🔥" v={String(p.dailyStreak)} l="სერია" />
        </div>
      </div>
    </div>
  );
}

/**
 * A leaderboard avatar. `players.avatar` is an EMOJI and `avatar_url` is the
 * uploaded picture — rendering the emoji into an <img src> (the original bug)
 * silently showed nothing at all.
 */
function Avatar({ row }: { row: { avatar: string; avatarUrl: string | null; username: string } }) {
  const [broken, setBroken] = useState(false);
  const url = row.avatarUrl && !broken ? row.avatarUrl : null;
  return (
    <div style={S.avatar}>
      {url
        ? <img src={url} alt="" onError={() => setBroken(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ fontSize: row.avatar ? 18 : 14 }}>{row.avatar || (row.username[0] ?? '?').toUpperCase()}</span>}
    </div>
  );
}

function ReviewCard({ r }: { r: Result['review'][number] }) {
  return (
    <div style={{ ...S.reviewCard, borderColor: r.chosen === r.correctPos ? 'rgba(63,185,80,.3)' : 'rgba(255,77,94,.3)' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
        <span style={{ color: LV_COLOR[r.level], fontSize: 11 }}>{LV_DOT[r.level]}</span>
        <b style={{ fontSize: 13.5 }}>{r.title}</b>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 16 }}>{r.chosen === r.correctPos ? '✅' : '❌'}</span>
      </div>
      <div style={{ fontSize: 12.5, color: '#b9c2d6', whiteSpace: 'pre-line' }}>{r.body}</div>
      <div style={{ fontSize: 12.5, color: '#e8edf7', marginTop: 4 }}>{r.q}</div>
      <div style={{ marginTop: 6, fontSize: 12.5 }}>
        <div style={{ color: '#3fb950' }}>✓ {r.options[r.correctPos]}</div>
        {r.chosen >= 0 && r.chosen !== r.correctPos && <div style={{ color: '#ff8fa0' }}>✕ {r.options[r.chosen]}</div>}
        {r.chosen < 0 && <div style={{ color: '#7d86a0' }}>— უპასუხოდ</div>}
      </div>
      <div style={{ ...S.ruleChip, marginTop: 8 }}>წესი: {r.rule}</div>
      <div style={{ marginTop: 5, fontSize: 12.5, lineHeight: 1.5, color: '#c9d3e6', whiteSpace: 'pre-line' }}>{r.why}</div>
      {r.trap && <div style={S.trap}>{r.trap}</div>}
    </div>
  );
}

const MiniStat = ({ icon, v, l }: { icon: string; v: string; l: string }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ fontSize: 13, color: '#e8edf7', fontWeight: 700 }}>{icon} {v}</div>
    <div style={{ fontSize: 9.5, color: '#7d86a0' }}>{l}</div>
  </div>
);
const Stat = ({ label, value }: { label: string; value: string }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ fontSize: 18, fontWeight: 800, color: '#e8edf7' }}>{value}</div>
    <div style={{ fontSize: 10, color: '#7d86a0' }}>{label}</div>
  </div>
);
const Big = ({ label, value }: { label: string; value: string }) => (
  <div style={S.bigStat}>
    <div style={{ fontSize: 17, fontWeight: 800, color: '#e8edf7' }}>{value}</div>
    <div style={{ fontSize: 10.5, color: '#7d86a0', marginTop: 2 }}>{label}</div>
  </div>
);
function Tile({ icon, title, sub, accent, onClick, disabled, busy }: { icon: string; title: string; sub: string; accent: string; onClick: () => void; disabled?: boolean; busy?: boolean }) {
  return (
    <motion.button whileTap={{ scale: disabled ? 1 : 0.97 }} onClick={onClick} disabled={disabled || busy}
      style={{ ...S.tile, borderColor: accent + '44', opacity: disabled ? 0.5 : 1 }}>
      <span style={{ fontSize: 24 }}>{icon}</span>
      <div style={{ flex: 1, textAlign: 'left' }}>
        <div style={{ color: accent, fontWeight: 700, fontSize: 14 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: '#7d86a0', marginTop: 1 }}>{sub}</div>
      </div>
    </motion.button>
  );
}

const S: Record<string, any> = {
  wrap: { position: 'fixed', inset: 0, zIndex: 70, background: 'linear-gradient(160deg,#080a14 0%,#0d1024 50%,#120e22 100%)', overflowY: 'auto' },
  inner: { maxWidth: 560, margin: '0 auto', padding: '14px 14px 40px' },
  header: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, position: 'sticky', top: 0, background: 'rgba(8,10,20,.92)', backdropFilter: 'blur(10px)', padding: '8px 0', zIndex: 5 },
  icon: { width: 36, height: 36, borderRadius: 12, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', color: '#c9d3e6', fontSize: 22, lineHeight: 1 },
  title: { fontFamily: '"Space Grotesk",monospace', fontSize: 16.5, fontWeight: 800, color: '#fff', letterSpacing: 0.3 },
  sub: { fontSize: 11.5, color: '#7d86a0' },
  dim: { color: '#7d86a0', fontSize: 13, padding: '18px 0', textAlign: 'center' },
  err: { padding: '9px 12px', borderRadius: 12, background: 'rgba(255,77,94,.14)', color: '#ff8fa0', fontSize: 13, marginBottom: 10 },
  grid: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 },
  tile: { display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderRadius: 16, border: '1px solid', background: 'rgba(255,255,255,.035)', width: '100%' },
  ratingCard: { display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: 18, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(124,156,255,.2)' },
  sectionTitle: { fontSize: 12, letterSpacing: 2, color: '#7d86a0', margin: '18px 0 8px' },
  levelRow: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '13px 14px', marginBottom: 8, borderRadius: 16, border: '1px solid', background: 'rgba(255,255,255,.035)' },
  qMeta: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6 },
  combo: { padding: '2px 8px', borderRadius: 20, background: 'rgba(255,159,67,.16)', color: '#ff9f43', fontWeight: 700, fontSize: 11.5 },
  timerTrack: { height: 3, borderRadius: 2, background: 'rgba(255,255,255,.08)', overflow: 'hidden', marginBottom: 14 },
  timerFill: { height: '100%', borderRadius: 2, transition: 'width 1s linear' },
  qTitle: { fontSize: 13, color: '#7c9cff', fontWeight: 700, letterSpacing: 0.5 },
  qBody: { marginTop: 6, padding: 12, borderRadius: 14, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', color: '#dbe3f2', fontSize: 14.5, lineHeight: 1.6 },
  qAsk: { marginTop: 10, fontSize: 15, color: '#fff', fontWeight: 600 },
  option: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 13px', borderRadius: 14, border: '1px solid', color: '#e8edf7', fontSize: 14, lineHeight: 1.45, width: '100%' },
  optLetter: { width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800, color: '#fff', flexShrink: 0 },
  explain: { marginTop: 12, padding: 13, borderRadius: 14, border: '1px solid', background: 'rgba(255,255,255,.035)', color: '#c9d3e6', fontSize: 13.5, overflow: 'hidden' },
  ruleChip: { display: 'inline-block', padding: '3px 9px', borderRadius: 20, background: 'rgba(124,156,255,.14)', color: '#7c9cff', fontSize: 11.5, fontWeight: 700 },
  trap: { marginTop: 8, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,77,94,.1)', color: '#ffb3c0', fontSize: 12.5, lineHeight: 1.5 },
  nextBtn: { width: '100%', marginTop: 14, padding: '13px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#4d6cff,#a371f7)', color: '#fff', fontWeight: 700, fontSize: 15 },
  resultCard: { textAlign: 'center', padding: 20, borderRadius: 18, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(124,156,255,.22)' },
  achvPop: { marginTop: 12, padding: 14, borderRadius: 16, background: 'rgba(255,212,90,.1)', border: '1px solid rgba(255,212,90,.35)', textAlign: 'center', color: '#ffe9a8' },
  reviewCard: { padding: 12, borderRadius: 14, border: '1px solid', background: 'rgba(255,255,255,.03)', marginBottom: 8, color: '#dbe3f2' },
  chip: { padding: '7px 12px', borderRadius: 20, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', color: '#c9d3e6', fontSize: 12.5, whiteSpace: 'nowrap' },
  chipOn: { background: 'rgba(124,156,255,.18)', borderColor: '#7c9cff', color: '#fff' },
  boardRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 14, border: '1px solid', background: 'rgba(255,255,255,.03)', marginBottom: 6 },
  avatar: { width: 34, height: 34, borderRadius: '50%', background: 'rgba(124,156,255,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c9d3e6', fontWeight: 700, flexShrink: 0, overflow: 'hidden' },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(96px,1fr))', gap: 8, marginTop: 14 },
  bigStat: { padding: '11px 8px', borderRadius: 13, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', textAlign: 'center' },
  barTrack: { height: 5, borderRadius: 3, background: 'rgba(255,255,255,.07)', overflow: 'hidden', marginTop: 3 },
  barFill: { height: '100%', borderRadius: 3, background: 'linear-gradient(90deg,#4d6cff,#a371f7)' },
  examBar: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, marginBottom: 6 },
  chapterRow: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '13px 14px', marginBottom: 8, borderRadius: 16, border: '1px solid rgba(77,212,196,.28)', background: 'rgba(255,255,255,.035)' },
  bookSection: { padding: 14, borderRadius: 16, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.03)', marginTop: 10 },
  formal: { margin: '8px 0', padding: '10px 12px', borderRadius: 12, background: 'rgba(0,0,0,.35)', border: '1px solid rgba(255,255,255,.09)', color: '#9fe8dd', fontFamily: 'ui-monospace,monospace', fontSize: 12.5, lineHeight: 1.7, overflowX: 'auto', whiteSpace: 'pre' },
  bookBox: { marginTop: 8, padding: '9px 11px', borderRadius: 12, background: 'rgba(141,224,74,.08)', border: '1px solid rgba(141,224,74,.25)', fontSize: 12.5, lineHeight: 1.55, color: '#dbe3f2' },
  btnGhostWide: { width: '100%', marginTop: 12, padding: '11px', borderRadius: 12, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.04)', color: '#c9d3e6', fontSize: 13.5 },
  achvRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', borderRadius: 14, border: '1px solid', background: 'rgba(255,255,255,.03)', marginBottom: 7 },
};

export default LogicAcademy;
