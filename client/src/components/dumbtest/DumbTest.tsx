/**
 * დებილების ტესტი.
 *
 * Twelve absurd questions, four options each, and a punchline after every one.
 *
 * THE REVEAL IS THE GAME
 * ──────────────────────
 * A quiz that answers "correct" or "wrong" and moves on has thrown away its
 * best line. The joke in each of these is not the question and not the option
 * chosen — it is the explanation afterwards, which is why the answer is shown
 * immediately rather than saved for a results screen nobody reads to the end.
 *
 * WHAT IS NOT HERE
 * ────────────────
 * The answers. The client never sees which option is correct until it has
 * committed to one, because the server scores the test and only then sends the
 * breakdown back. A leaderboard on a quiz whose answer key ships in the bundle
 * is a list of who opened the network tab.
 *
 * CHOOSING A CATEGORY
 * ───────────────────
 * The picker is the first screen rather than a setting behind a button, because
 * it is also the intro: the four tiles explain what the game is faster than a
 * paragraph would. Tapping one starts immediately — a chooser followed by a
 * "start" button is two taps to do one thing.
 *
 * The categories themselves come from the server, counts included. Hardcoding
 * them here would put the labels in two places and let the advertised number of
 * questions drift away from the bank the moment anyone adds one.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { socket } from '@/lib/socket';

const FALLBACK_ACCENT = '#c46bff';
const GOOD = '#4dd48a';
const BAD = '#ff5d6c';

interface Option { id: string; text: string }
interface Question { id: string; text: string; options: Option[] }

interface CategoryInfo {
  id: string; title: string; sub: string; emoji: string; accent: string; count: number;
}

interface Breakdown {
  questionId: string; text: string; chosen: string | null;
  correctText: string; right: boolean; reveal: string;
}
interface Result {
  correct: number; total: number; durationMs: number;
  title: string; note: string; isBest: boolean; rank: number | null;
  category: string;
  breakdown: Breakdown[];
}
interface LeaderRow {
  rank: number; userId: string; username: string; avatar: string; avatarUrl: string | null;
  correct: number; total: number; durationMs: number; isMe: boolean;
}

type Phase = 'pick' | 'playing' | 'result' | 'board';

export function DumbTest({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('pick');
  const [categories, setCategories] = useState<CategoryInfo[] | null>(null);
  const [mine, setMine] = useState<Record<string, { plays: number; best: number }>>({});
  const [chosen, setChosen] = useState<CategoryInfo | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [at, setAt] = useState(0);
  const [answers, setAnswers] = useState<{ questionId: string; optionId: string | null }[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [board, setBoard] = useState<LeaderRow[] | null>(null);
  const [boardCat, setBoardCat] = useState<string>('mixed');
  const [bankSize, setBankSize] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(0);

  /*
   * The reveal for the question just answered.
   *
   * Held locally between picking and advancing. The server has the real answer
   * and sends the breakdown at the end, but waiting until then to say anything
   * would mean twelve questions of silence — so the option is locked in, the
   * pick is remembered, and the punchline arrives with the result.
   */
  const [locked, setLocked] = useState(false);

  /** The screen takes the chosen category's colour, so it reads as a place. */
  const accent = chosen?.accent ?? FALLBACK_ACCENT;

  /*
   * The tab strip scrolls, and the tab being shown is often not the first one —
   * opening the board after an alien run left the highlighted tab off the right
   * edge, so the board looked like it was showing the wrong category.
   */
  const activeTab = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (phase === 'board') {
      activeTab.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
  }, [phase, boardCat]);

  useEffect(() => {
    socket.emit('dumb:categories' as any, {}, (res: any) => {
      if (!res?.ok) { setError(res?.error ?? 'კატეგორიები ვერ ჩაიტვირთა'); return; }
      setCategories(res.data.categories ?? []);
      setMine(res.data.mine ?? {});
    });
  }, []);

  const load = useCallback((cat: CategoryInfo) => {
    setBusy(true);
    setError(null);
    setChosen(cat);
    socket.emit('dumb:start' as any, { category: cat.id }, (res: any) => {
      setBusy(false);
      if (!res?.ok) { setError(res?.error ?? 'ვერ დაიწყო'); return; }
      setQuestions(res.data.questions ?? []);
      setBankSize(res.data.bankSize ?? 0);
      setAnswers([]);
      setAt(0);
      setPicked(null);
      setLocked(false);
      setResult(null);
      started.current = Date.now();
      setPhase('playing');
    });
  }, []);

  const loadBoard = useCallback((categoryId: string) => {
    setBoardCat(categoryId);
    setBoard(null);
    socket.emit('dumb:leaderboard' as any, { category: categoryId, limit: 50 }, (res: any) => {
      if (res?.ok) setBoard(res.data.rows ?? []);
      else setBoard([]);
    });
  }, []);

  const openBoard = () => { loadBoard(chosen?.id ?? 'mixed'); setPhase('board'); };

  /** Back to the picker, with the tile subtitles refreshed after a run. */
  const backToPick = () => {
    setPhase('pick');
    socket.emit('dumb:categories' as any, {}, (res: any) => {
      if (res?.ok) { setCategories(res.data.categories ?? []); setMine(res.data.mine ?? {}); }
    });
  };

  const q = questions[at];

  const choose = (optionId: string | null) => {
    if (locked || !q) return;
    setPicked(optionId);
    setLocked(true);
  };

  const next = () => {
    if (!q) return;
    const nextAnswers = [...answers, { questionId: q.id, optionId: picked }];
    setAnswers(nextAnswers);
    setPicked(null);
    setLocked(false);

    if (at + 1 < questions.length) { setAt(at + 1); return; }

    setBusy(true);
    socket.emit('dumb:submit' as any,
      { answers: nextAnswers, durationMs: Date.now() - started.current },
      (res: any) => {
        setBusy(false);
        if (!res?.ok) { setError(res?.error ?? 'ვერ შეფასდა'); return; }
        setResult(res.data);
        setPhase('result');
      });
  };

  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[730] overflow-y-auto" style={{ background: '#0a0611' }}>
      <div className="min-h-full flex flex-col max-w-lg mx-auto px-5 pb-10">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 pt-5 pb-3">
          <button onClick={onClose} aria-label="დახურვა"
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)' }}>✕</button>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-[16px] truncate">დებილების ტესტი</p>
            {chosen && phase !== 'pick' && (
              <p className="font-mono text-[10.5px] truncate" style={{ color: accent }}>
                {chosen.emoji} {chosen.title}
              </p>
            )}
          </div>
          {phase !== 'board' && (
            <button onClick={openBoard}
              className="px-3 h-9 rounded-xl font-mono text-[11px] text-white/70 flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)' }}>
              🏆 ტოპი
            </button>
          )}
        </div>

        {error && <p className="font-mono text-[12px] py-3" style={{ color: BAD }}>{error}</p>}

        {/* ── Category picker ──────────────────────────────────────────────── */}
        {phase === 'pick' && (
          <div className="flex-1 py-3">
            <p className="text-5xl text-center mb-3">🤪</p>
            <p className="font-display font-black text-white text-center" style={{ fontSize: 22 }}>
              12 კითხვა
            </p>
            <p className="font-mono text-[12px] text-white/45 text-center mt-2 mb-6 leading-relaxed">
              პასუხები არ არის ლოგიკური.<br />
              აირჩიე, რომელ სამყაროში გინდა დაბნეულობა.
            </p>

            {categories === null && (
              <p className="font-mono text-[12px] text-white/35 py-8 text-center">…</p>
            )}

            <div className="flex flex-col gap-2.5">
              {categories?.map(c => {
                const own = mine[c.id];
                return (
                  <button key={c.id} onClick={() => load(c)} disabled={busy}
                    className="text-left rounded-2xl px-4 py-3.5 flex items-center gap-3.5 disabled:opacity-50 transition-all"
                    style={{
                      background: `linear-gradient(135deg, ${c.accent}1f, rgba(255,255,255,0.03))`,
                      border: `1px solid ${c.accent}44`,
                    }}>
                    <span className="text-[26px] flex-shrink-0">{c.emoji}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-display font-bold text-white text-[14.5px]">{c.title}</span>
                      <span className="block font-mono text-[10.5px] text-white/45 mt-0.5 leading-snug">{c.sub}</span>
                      <span className="block font-mono text-[10px] mt-1.5" style={{ color: `${c.accent}cc` }}>
                        {c.count} კითხვა
                        {own ? ` · საუკეთესო ${own.best}/12 · ${own.plays}-ჯერ` : ''}
                      </span>
                    </span>
                    <span className="font-mono text-[15px] flex-shrink-0" style={{ color: c.accent }}>›</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Playing ──────────────────────────────────────────────────────── */}
        {phase === 'playing' && q && (
          <div className="flex-1 flex flex-col">
            <div className="flex items-center gap-2 mb-5">
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.09)' }}>
                <motion.div animate={{ width: `${((at) / questions.length) * 100}%` }}
                  style={{ height: '100%', background: accent }} />
              </div>
              <span className="font-mono text-[11px] text-white/40 flex-shrink-0">{at + 1}/{questions.length}</span>
            </div>

            <p className="font-display font-bold text-white leading-snug mb-6" style={{ fontSize: 19 }}>
              {q.text}
            </p>

            <div className="flex flex-col gap-2.5">
              {q.options.map(o => {
                const isPicked = picked === o.id;
                return (
                  <button key={o.id} onClick={() => choose(o.id)} disabled={locked}
                    className="text-left px-4 py-3.5 rounded-2xl font-mono text-[13px] transition-all"
                    style={{
                      background: isPicked ? `${accent}33` : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${isPicked ? accent : 'rgba(255,255,255,0.12)'}`,
                      color: isPicked ? '#fff' : 'rgba(255,255,255,0.82)',
                      cursor: locked ? 'default' : 'pointer',
                    }}>
                    {o.text}
                  </button>
                );
              })}
            </div>

            <div className="mt-auto pt-6 flex gap-2">
              {/*
                * Skipping is allowed and counts as wrong — the server treats a
                * null answer as an answer. Removing it from the total instead
                * would let somebody skip eleven questions and finish on 1/1.
                */}
              <button onClick={() => { setPicked(null); setLocked(true); }}
                disabled={locked}
                className="px-4 py-3.5 rounded-2xl font-mono text-[12px] text-white/45 disabled:opacity-30"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                არ ვიცი
              </button>
              <button onClick={next} disabled={!locked || busy}
                className="flex-1 py-3.5 rounded-2xl font-display font-bold text-white text-[14px] disabled:opacity-35"
                style={{ background: accent }}>
                {at + 1 === questions.length ? (busy ? '…' : 'დასრულება') : 'შემდეგი'}
              </button>
            </div>
          </div>
        )}

        {/* ── Result ───────────────────────────────────────────────────────── */}
        {phase === 'result' && result && (
          <div className="flex-1 py-4">
            <div className="text-center mb-6">
              <p className="font-display font-black" style={{ fontSize: 46, color: accent }}>
                {result.correct}<span className="text-white/25" style={{ fontSize: 24 }}>/{result.total}</span>
              </p>
              <p className="font-display font-bold text-white mt-1" style={{ fontSize: 19 }}>{result.title}</p>
              <p className="font-mono text-[12px] text-white/45 mt-2 px-4 leading-relaxed">{result.note}</p>
              {result.isBest && result.rank && (
                <p className="font-mono text-[11.5px] mt-3" style={{ color: GOOD }}>
                  ახალი რეკორდი · #{result.rank} {chosen ? `„${chosen.title}"-ში` : 'ტოპში'}
                </p>
              )}
            </div>

            {/*
              * Every question, with its punchline. This is the part people
              * actually read, and it is why the reveal is written per question
              * rather than the game just saying "correct".
              */}
            <div className="flex flex-col gap-2.5">
              {result.breakdown.map((b, i) => (
                <div key={b.questionId} className="rounded-2xl px-4 py-3"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${b.right ? `${GOOD}44` : 'rgba(255,255,255,0.09)'}`,
                  }}>
                  <p className="font-mono text-[10px] text-white/30 mb-1">{i + 1} · {b.right ? '✓' : '✕'}</p>
                  <p className="font-display font-bold text-white text-[13.5px] leading-snug">{b.text}</p>
                  {!b.right && (
                    <p className="font-mono text-[11.5px] mt-1.5" style={{ color: BAD }}>
                      შენ: {b.chosen ?? 'არ ვიცი'}
                    </p>
                  )}
                  <p className="font-mono text-[11.5px] mt-1" style={{ color: GOOD }}>
                    სწორი: {b.correctText}
                  </p>
                  <p className="font-mono text-[11.5px] text-white/45 mt-1.5 leading-relaxed">{b.reveal}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-2 mt-6">
              <button onClick={backToPick}
                className="px-4 py-3.5 rounded-2xl font-mono text-[12px] text-white/70"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)' }}>
                კატეგორიები
              </button>
              <button onClick={() => chosen && load(chosen)} disabled={busy || !chosen}
                className="flex-1 py-3.5 rounded-2xl font-display font-bold text-white text-[14px]"
                style={{ background: accent }}>
                {busy ? '…' : 'კიდევ 12 კითხვა'}
              </button>
            </div>
            <p className="font-mono text-[10.5px] text-white/25 text-center mt-3">
              ამ კატეგორიაში {bankSize} კითხვაა — იგივე ორჯერ არ მოგივა
            </p>
          </div>
        )}

        {/* ── Leaderboard ──────────────────────────────────────────────────── */}
        {phase === 'board' && (
          <div className="flex-1 py-2">
            {/*
              * A tab per category, because the boards are separate. One shared
              * board would rank whoever picked the easiest category, which is a
              * ranking of nothing.
              */}
            <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1"
              style={{ scrollbarWidth: 'none' }}>
              {categories?.map(c => (
                <button key={c.id} onClick={() => loadBoard(c.id)}
                  ref={boardCat === c.id ? activeTab : undefined}
                  className="px-3 py-2 rounded-xl font-mono text-[11px] flex-shrink-0 transition-all"
                  style={{
                    background: boardCat === c.id ? `${c.accent}2e` : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${boardCat === c.id ? c.accent : 'rgba(255,255,255,0.1)'}`,
                    color: boardCat === c.id ? '#fff' : 'rgba(255,255,255,0.55)',
                  }}>
                  {c.emoji} {c.title}
                </button>
              ))}
            </div>

            <p className="font-mono text-[11px] text-white/35 mt-2 mb-3">
              საუკეთესო შედეგი თითო ადამიანზე · ფრედ დროზე წყდება
            </p>
            {board === null && <p className="font-mono text-[12px] text-white/35 py-6 text-center">…</p>}
            {board?.length === 0 && (
              <p className="font-mono text-[12px] text-white/35 py-8 text-center">
                აქ ჯერ არავის უთამაშია. იყავი პირველი.
              </p>
            )}
            {board?.map(r => (
              <div key={r.userId} className="flex items-center gap-3 py-2.5 px-3 rounded-xl mb-1.5"
                style={{
                  background: r.isMe ? `${accent}1f` : 'transparent',
                  border: `1px solid ${r.isMe ? `${accent}55` : 'transparent'}`,
                }}>
                <span className="font-mono font-bold text-[12px] w-6 flex-shrink-0"
                  style={{ color: r.rank === 1 ? '#ffcc33' : 'rgba(255,255,255,0.35)' }}>
                  {r.rank}
                </span>
                <span style={{
                  width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                  background: 'linear-gradient(135deg, #9b00ff, #00f5ff)',
                }}>
                  {r.avatarUrl
                    ? <img src={r.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : r.avatar}
                </span>
                <span className="flex-1 min-w-0 font-mono text-[12.5px] text-white/85 truncate">{r.username}</span>
                <span className="font-mono text-[10px] text-white/30 flex-shrink-0">
                  {Math.round(r.durationMs / 1000)}წმ
                </span>
                <span className="font-display font-bold text-[14px] flex-shrink-0" style={{ color: accent }}>
                  {r.correct}/{r.total}
                </span>
              </div>
            ))}

            <button onClick={() => setPhase(result ? 'result' : 'pick')}
              className="w-full mt-5 py-3.5 rounded-2xl font-mono text-[12.5px] text-white/70"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)' }}>
              უკან
            </button>
          </div>
        )}
      </div>
    </motion.div>,
    document.body,
  );
}

export default DumbTest;
