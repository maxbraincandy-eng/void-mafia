/**
 * სიტყვა — one Georgian word a day.
 *
 * WHY THIS GAME AND NOT ANOTHER QUIZ
 * ──────────────────────────────────
 * Everything else in the catalogue needs other people in a lobby, or is a test
 * you take once. Nothing brought anybody back tomorrow. A single shared puzzle
 * a day is the cheapest thing that does, and the shared part is the point: the
 * grid is worth posting precisely because everybody had the same word.
 *
 * THE CLIENT KNOWS NOTHING
 * ────────────────────────
 * It sends five letters and gets back five colours. The word is not in the
 * bundle, not in the state payload, and not on the leaderboard until the day is
 * over for that player. A daily game whose answer is readable is a daily game
 * about reading it.
 *
 * THIRTY-THREE KEYS
 * ─────────────────
 * Mkhedruli has no capitals and no obvious phone layout, so the keyboard is the
 * alphabet in order, three rows of eleven, with the enter and delete keys on
 * their own row underneath. Borrowing a QWERTY shape would mean inventing one,
 * and a player hunting for ჭ in an invented order is a player typing slowly.
 *
 * The alphabet comes from the server rather than from a constant here, for the
 * same reason the categories in დებილების ტესტი do: one definition, so the
 * keyboard cannot offer a letter the word list has never heard of.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { socket } from '@/lib/socket';

const ACCENT = '#4dd48a';
const NEAR = '#e0b93c';
/*
 * A tried-and-absent key must not look like an untried one.
 *
 * At #3a3546 against the untried key's rgba(255,255,255,0.1) the two were a
 * few percent apart and the keyboard stopped being a record of what you had
 * ruled out — which is most of what it is for.
 */
const MISS = '#1d1a26';
const BAD = '#ff5d6c';

type Mark = 'hit' | 'near' | 'miss';
interface Row { guess: string; marks: Mark[] }
interface Stats {
  played: number; wins: number; streak: number; maxStreak: number; distribution: number[];
}
interface State {
  puzzle: number;
  rows: Row[];
  status: 'playing' | 'won' | 'lost';
  solution: string | null;
  keys: Record<string, Mark>;
  rollover: number;
  stats: Stats;
  alphabet: string[];
  length: number;
  maxGuesses: number;
  bankSize: number;
}
interface BoardRow {
  rank: number; userId: string; username: string; avatarUrl: string | null;
  guesses: number; streak: number;
}

const COLOUR: Record<Mark, string> = { hit: ACCENT, near: NEAR, miss: MISS };

/** Split a word into letters. Mkhedruli is one code point per letter. */
const letters = (s: string) => Array.from(s);

export function WordGame({ onClose }: { onClose: () => void }) {
  const [st, setSt] = useState<State | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [board, setBoard] = useState<{ today: BoardRow[]; streaks: BoardRow[] } | null>(null);
  const [tab, setTab] = useState<'today' | 'streaks'>('today');
  const [copied, setCopied] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const liveRef = useRef<HTMLParagraphElement | null>(null);

  const load = useCallback(() => {
    socket.emit('word:state' as any, {}, (res: any) => {
      if (res?.ok) setSt(res.data);
      else setError(res?.error ?? 'ვერ ჩაიტვირთა.');
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  /*
   * The end screen is not shown the instant the day is decided.
   *
   * The last row has to finish colouring first, or the win lands before the
   * player has seen why they won. Two seconds is the row animation plus a beat.
   */
  useEffect(() => {
    if (!st || st.status === 'playing') { setShowEnd(false); return; }
    const t = setTimeout(() => setShowEnd(true), 1500);
    return () => clearTimeout(t);
  }, [st?.status, st?.rows.length]);

  const submit = useCallback(() => {
    if (!st || busy || st.status !== 'playing') return;
    if (draft.length !== st.length) {
      setError(`${st.length} ასო უნდა იყოს`);
      setShake(s => s + 1);
      return;
    }
    setBusy(true);
    setError(null);
    socket.emit('word:guess' as any, { guess: draft.join('') }, (res: any) => {
      setBusy(false);
      if (!res?.ok) { setError(res?.error ?? 'ვერ გაიგზავნა.'); return; }
      const { state, rejected } = res.data as { state: State; rejected?: string };
      if (rejected === 'unknown') {
        setError('ასეთი სიტყვა არ მოიძებნა');
        setShake(s => s + 1);
        return;
      }
      if (rejected === 'length') { setError(`${st.length} ასო უნდა იყოს`); setShake(s => s + 1); return; }
      if (rejected === 'finished') { setSt(s => (s ? { ...s, ...state } : s)); return; }
      setSt(s => (s ? { ...s, ...state } : s));
      setDraft([]);
    });
  }, [st, draft, busy]);

  const tapKey = useCallback((k: string) => {
    if (!st || st.status !== 'playing') return;
    setError(null);
    setDraft(d => (d.length >= st.length ? d : [...d, k]));
  }, [st]);

  const backspace = useCallback(() => {
    setError(null);
    setDraft(d => d.slice(0, -1));
  }, []);

  /*
   * A hardware keyboard types Georgian too.
   *
   * Most people are on a phone and will use the keys on screen, but anyone on
   * a desktop with a Georgian layout will simply start typing, and a game that
   * ignored that would feel broken to exactly the people most likely to play
   * it every morning.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!st) return;
      if (e.key === 'Enter') { e.preventDefault(); submit(); return; }
      if (e.key === 'Backspace') { e.preventDefault(); backspace(); return; }
      if (e.key.length === 1 && st.alphabet.includes(e.key)) { e.preventDefault(); tapKey(e.key); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [st, submit, backspace, tapKey]);

  const openBoard = () => {
    socket.emit('word:board' as any, {}, (res: any) => {
      if (res?.ok) setBoard(res.data);
      else setError(res?.error ?? 'ვერ ჩაიტვირთა.');
    });
  };

  /** The emoji grid, built here so it matches exactly what is on screen. */
  const shareText = () => {
    if (!st) return '';
    const box: Record<Mark, string> = { hit: '🟩', near: '🟨', miss: '⬛' };
    const head = `სიტყვა #${st.puzzle} ${st.status === 'won' ? `${st.rows.length}/${st.maxGuesses}` : `X/${st.maxGuesses}`}`;
    return [head, ...st.rows.map(r => r.marks.map(m => box[m]).join('')), 'voidmafia.one'].join('\n');
  };

  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { setError('ვერ დაკოპირდა'); }
  };

  if (!st) {
    return createPortal(
      <div className="fixed inset-0 z-[730] flex items-center justify-center" style={{ background: '#0a0611' }}>
        <p className="font-mono text-[12px] text-white/50">{error ?? 'იტვირთება…'}</p>
      </div>,
      document.body,
    );
  }

  const rowsToDraw = st.maxGuesses;
  const alpha = st.alphabet;
  const kbRows = [alpha.slice(0, 11), alpha.slice(11, 22), alpha.slice(22, 33)];

  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[730] overflow-y-auto" style={{ background: '#0a0611' }}>
      <div className="min-h-full flex flex-col max-w-lg mx-auto px-4 pb-6">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 pt-5 pb-3">
          <button onClick={onClose} aria-label="დახურვა"
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)' }}>✕</button>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-[16px] truncate">სიტყვა</p>
            <p className="font-mono text-[10.5px] truncate" style={{ color: ACCENT }}>
              #{st.puzzle} · დღის სიტყვა
            </p>
          </div>
          {st.stats.streak > 0 && (
            <div className="px-2.5 h-9 rounded-xl flex items-center gap-1 flex-shrink-0"
              style={{ background: 'rgba(224,185,60,0.12)', border: '1px solid rgba(224,185,60,0.3)' }}>
              <span className="text-[13px]">🔥</span>
              <span className="font-mono text-[12px] font-bold" style={{ color: NEAR }}>{st.stats.streak}</span>
            </div>
          )}
          <button onClick={openBoard} aria-label="ლიდერბორდი"
            className="px-3 h-9 rounded-xl font-mono text-[11px] text-white/70 flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)' }}>
            🏆
          </button>
        </div>

        {/* A live region, so the colours are not the only way to read a row. */}
        <p ref={liveRef} className="sr-only" aria-live="polite">
          {st.rows.length > 0 && describeRow(st.rows[st.rows.length - 1]!)}
        </p>

        {/* ── The grid ─────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col items-center justify-center gap-1.5 py-4">
          {Array.from({ length: rowsToDraw }).map((_, r) => {
            const done = st.rows[r];
            const isCurrent = !done && r === st.rows.length;
            return (
              <motion.div key={r} className="flex gap-1.5"
                animate={isCurrent && shake ? { x: [0, -8, 8, -6, 6, 0] } : {}}
                transition={{ duration: 0.36 }}>
                {Array.from({ length: st.length }).map((_, c) => {
                  const ch = done ? letters(done.guess)[c] : isCurrent ? draft[c] : undefined;
                  const mark = done?.marks[c];
                  return (
                    <motion.div key={c}
                      initial={false}
                      animate={mark ? { rotateX: [0, 90, 0] } : {}}
                      transition={{ duration: 0.45, delay: mark ? c * 0.12 : 0 }}
                      className="rounded-lg flex items-center justify-center font-display font-black"
                      style={{
                        width: 'min(15vw, 58px)', height: 'min(15vw, 58px)',
                        fontSize: 'min(7vw, 27px)',
                        color: mark ? '#fff' : '#fff',
                        background: mark ? COLOUR[mark] : 'transparent',
                        border: mark
                          ? `2px solid ${COLOUR[mark]}`
                          : ch ? '2px solid rgba(255,255,255,0.4)' : '2px solid rgba(255,255,255,0.13)',
                      }}>
                      {ch ?? ''}
                    </motion.div>
                  );
                })}
              </motion.div>
            );
          })}
        </div>

        {error && (
          <p className="font-mono text-[12px] text-center pb-2" style={{ color: BAD }}>{error}</p>
        )}

        {/* ── Keyboard ─────────────────────────────────────────────────────── */}
        {st.status === 'playing' && (
          <div className="flex flex-col gap-1.5 pb-1">
            {kbRows.map((row, i) => (
              <div key={i} className="flex gap-1 justify-center">
                {row.map(k => {
                  const mark = st.keys[k];
                  return (
                    <button key={k} onClick={() => tapKey(k)} disabled={busy}
                      className="rounded-md font-display font-bold flex items-center justify-center"
                      style={{
                        flex: '1 1 0', minWidth: 0, height: 44,
                        fontSize: 'min(4.2vw, 17px)',
                        color: mark === 'miss' ? 'rgba(255,255,255,0.32)' : '#fff',
                        background: mark ? COLOUR[mark] : 'rgba(255,255,255,0.1)',
                        border: 'none',
                      }}>
                      {k}
                    </button>
                  );
                })}
              </div>
            ))}
            <div className="flex gap-1.5 justify-center pt-1">
              <button onClick={backspace} disabled={busy}
                className="rounded-md font-mono text-[13px] text-white/80"
                style={{ flex: '1 1 0', height: 46, background: 'rgba(255,255,255,0.1)' }}>
                ⌫ წაშლა
              </button>
              <button onClick={submit} disabled={busy || draft.length !== st.length}
                className="rounded-md font-display font-bold text-[14px]"
                style={{
                  flex: '1 1 0', height: 46,
                  color: draft.length === st.length ? '#0a0611' : 'rgba(255,255,255,0.4)',
                  background: draft.length === st.length ? ACCENT : 'rgba(255,255,255,0.1)',
                }}>
                შემოწმება
              </button>
            </div>
          </div>
        )}

        {/* ── The day is over ──────────────────────────────────────────────── */}
        <AnimatePresence>
          {showEnd && st.status !== 'playing' && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="rounded-2xl p-4 mb-2"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <p className="font-display font-black text-center text-white" style={{ fontSize: 20 }}>
                {st.status === 'won' ? WIN_LINES[Math.min(st.rows.length - 1, WIN_LINES.length - 1)] : 'ხვალ გამოგივა'}
              </p>
              {st.solution && (
                <p className="font-mono text-[13px] text-center pt-1.5 text-white/70">
                  სიტყვა იყო <b style={{ color: ACCENT }}>{st.solution}</b>
                </p>
              )}

              <div className="flex justify-around py-4">
                <Stat label="ნათამაშები" value={st.stats.played} />
                <Stat label="მოგება" value={st.stats.played ? `${Math.round(st.stats.wins / st.stats.played * 100)}%` : '—'} />
                <Stat label="სერია" value={st.stats.streak} />
                <Stat label="საუკეთესო" value={st.stats.maxStreak} />
              </div>

              <Distribution stats={st.stats} highlight={st.status === 'won' ? st.rows.length : null} />

              <div className="flex gap-2 pt-3">
                <button onClick={copyShare}
                  className="flex-1 h-11 rounded-xl font-display font-bold text-[14px]"
                  style={{ background: ACCENT, color: '#0a0611' }}>
                  {copied ? '✓ დაკოპირდა' : '📋 გააზიარე'}
                </button>
                <button onClick={openBoard}
                  className="flex-1 h-11 rounded-xl font-mono text-[13px] text-white/80"
                  style={{ background: 'rgba(255,255,255,0.1)' }}>
                  🏆 ტოპი
                </button>
              </div>
              <Countdown to={st.rollover} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Leaderboard ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {board && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[740] overflow-y-auto"
            style={{ background: '#07040d', backdropFilter: 'blur(6px)' }}
            onClick={() => setBoard(null)}>
            <div className="max-w-lg mx-auto px-5 py-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2 pb-4">
                <button onClick={() => setBoard(null)} aria-label="დახურვა"
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white/70"
                  style={{ background: 'rgba(255,255,255,0.07)' }}>✕</button>
                <p className="font-display font-bold text-white text-[16px]">ლიდერბორდი</p>
              </div>
              <div className="flex gap-2 pb-4">
                {(['today', 'streaks'] as const).map(k => (
                  <button key={k} onClick={() => setTab(k)}
                    className="flex-1 h-10 rounded-xl font-mono text-[12px]"
                    style={{
                      background: tab === k ? ACCENT : 'rgba(255,255,255,0.08)',
                      color: tab === k ? '#0a0611' : 'rgba(255,255,255,0.7)',
                    }}>
                    {k === 'today' ? `დღეს #${st.puzzle}` : '🔥 სერიები'}
                  </button>
                ))}
              </div>
              {(tab === 'today' ? board.today : board.streaks).map(r => (
                <div key={r.userId} className="flex items-center gap-3 py-2.5"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <span className="font-mono text-[12px] text-white/40 w-7">{r.rank}</span>
                  <span className="flex-1 font-display text-[14px] text-white truncate">{r.username}</span>
                  <span className="font-mono text-[13px] font-bold" style={{ color: ACCENT }}>
                    {tab === 'today' ? `${r.guesses}/${st.maxGuesses}` : `🔥 ${r.guesses}`}
                  </span>
                </div>
              ))}
              {(tab === 'today' ? board.today : board.streaks).length === 0 && (
                <p className="font-mono text-[12px] text-white/40 py-8 text-center">
                  {tab === 'today' ? 'დღეს ჯერ არავის ამოუხსნია' : 'ჯერ არავის აქვს სერია'}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>,
    document.body,
  );
}

/** Praise that scales with how few guesses it took. */
const WIN_LINES = ['გენიოსი!', 'ბრწყინვალე!', 'ძალიან კარგი!', 'კარგია!', 'გამოგივიდა!', 'ძლივს!'];

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="font-display font-black text-white" style={{ fontSize: 22 }}>{value}</p>
      <p className="font-mono text-[9.5px] text-white/45 pt-0.5">{label}</p>
    </div>
  );
}

/**
 * How many wins took how many guesses.
 *
 * Bars are drawn against the player's own best row rather than against the
 * number of games, because a player with one win in six would otherwise see
 * six invisible bars and one full one.
 */
function Distribution({ stats, highlight }: { stats: Stats; highlight: number | null }) {
  const max = Math.max(1, ...stats.distribution);
  return (
    <div className="flex flex-col gap-1">
      {stats.distribution.map((n, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-white/45 w-3">{i + 1}</span>
          <div className="flex-1 h-5 rounded"
            style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-5 rounded flex items-center justify-end px-1.5"
              style={{
                width: `${Math.max(n > 0 ? 9 : 0, (n / max) * 100)}%`,
                background: highlight === i + 1 ? ACCENT : 'rgba(255,255,255,0.22)',
                transition: 'width .5s',
              }}>
              {n > 0 && (
                <span className="font-mono text-[10px] font-bold"
                  style={{ color: highlight === i + 1 ? '#0a0611' : '#fff' }}>{n}</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Time to the next puzzle. The reason to come back, so it is on the screen. */
function Countdown({ to }: { to: number }) {
  const [left, setLeft] = useState(Math.max(0, to - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, to - Date.now())), 1000);
    return () => clearInterval(id);
  }, [to]);
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  const s = Math.floor((left % 60000) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <p className="font-mono text-[11px] text-center text-white/45 pt-3">
      შემდეგი სიტყვა {pad(h)}:{pad(m)}:{pad(s)}
    </p>
  );
}

/** A row in words, for a screen reader — the colours are not the only channel. */
function describeRow(r: Row): string {
  const word: Record<Mark, string> = { hit: 'სწორ ადგილზე', near: 'არასწორ ადგილზე', miss: 'არ არის' };
  return letters(r.guess).map((c, i) => `${c}: ${word[r.marks[i]!]}`).join(', ');
}

export default WordGame;
