// ── ნუარი — the player ────────────────────────────────────────────────
// The engine decides what happens; this file makes it FEEL like it happened.
// Three devices carry that: the animated backdrop behind the text, a typewriter
// reveal that can always be skipped by tapping, and a coloured "beat" flash
// when a choice lands so a violent option reads differently from a clever one.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import { useFullscreenOverlay } from '@/lib/overlayGuard';
import { useSocialStore } from '@/store/socialStore';
import { useAuthStore } from '@/store/authStore';
import { haptic } from '@/lib/haptics';
import { T, hairline, overlay } from '@/design/tokens';
import { NoirBackdrop, BEAT_FLASH, type Beat } from './art';
import { STAT_META, type Choice, type RunState, type StatKey } from './types';
import {
  applyChoice, clearRun, endingById, forcedEnding, loadRun, meetsRequirements,
  newRun, saveRun, sceneById, scoreRun,
} from './engine';

type View = 'title' | 'play' | 'ending' | 'board';

interface BoardRow {
  rank: number; userId: string; username: string; avatar: string; avatarUrl: string | null;
  score: number; endingId: string; tone: string; chapter: number;
}

const TONE_COLOR: Record<string, string> = {
  triumph: T.color.gold, survival: T.color.success, ruin: T.color.warn, death: T.color.danger,
};

/** Reveals text one character at a time; tapping anywhere completes it. */
function useTypewriter(text: string, cps = 55) {
  const [shown, setShown] = useState(0);
  useEffect(() => { setShown(0); }, [text]);
  useEffect(() => {
    if (shown >= text.length) return;
    const t = setTimeout(() => setShown(n => Math.min(text.length, n + 2)), 1000 / cps * 2);
    return () => clearTimeout(t);
  }, [shown, text, cps]);
  const done = shown >= text.length;
  return { visible: text.slice(0, shown), done, finish: () => setShown(text.length) };
}

export function NoirAdventure({ onClose }: { onClose: () => void }) {
  useFullscreenOverlay();
  const [view, setView] = useState<View>('title');
  const [run, setRun] = useState<RunState | null>(null);
  const [name, setName] = useState('');
  const [flash, setFlash] = useState<Beat | null>(null);
  const [delta, setDelta] = useState<Partial<Record<StatKey, number>>>({});
  const [board, setBoard] = useState<BoardRow[] | null>(null);
  const [best, setBest] = useState<{ best: number; runs: number; endings: string[] } | null>(null);
  const [submitted, setSubmitted] = useState<{ score: number; rank: number | null; isBest: boolean } | null>(null);
  const saved = useMemo(() => loadRun(), []);
  const openProfile = useSocialStore(s => s.openProfile);
  const myId = useAuthStore(s => s.profile?.id ?? s.uid);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scene = run && !run.endingId ? sceneById(run.sceneId) : null;
  const ending = run?.endingId ? endingById(run.endingId) : null;
  const body = scene ? (scene.speaker ? `${scene.speaker}: ${scene.text}` : scene.text) : '';
  const tw = useTypewriter(body);

  useEffect(() => { if (run && !run.endingId) saveRun(run); }, [run]);
  // A new scene starts at the top — long text otherwise opens mid-paragraph.
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [run?.sceneId]);

  useEffect(() => {
    emitWithAck<undefined, any>('noir:me').then(r => { if (r?.ok) setBest(r.data); }).catch(() => {});
  }, []);

  const start = (fresh: boolean) => {
    haptic('success');
    if (fresh || !saved) { clearRun(); setRun(newRun(name)); }
    else setRun(saved);
    setSubmitted(null);
    setView('play');
  };

  const pick = useCallback((c: Choice) => {
    if (!run || !tw.done) { tw.finish(); return; }
    if (!meetsRequirements(run, c)) { haptic('error'); return; }
    haptic(c.beat === 'violent' ? 'heavy' : 'selection');
    setFlash(c.beat ?? 'calm');
    setTimeout(() => setFlash(null), 420);
    setDelta(c.effects ?? {});
    setTimeout(() => setDelta({}), 1400);

    let next = applyChoice(run, c);
    const forced = forcedEnding(next);
    if (forced) next = { ...next, endingId: forced };
    setRun(next);
    if (next.endingId) { clearRun(); setView('ending'); }
  }, [run, tw]);

  // Submitting is what puts the run on the board; the server rescores it.
  useEffect(() => {
    if (view !== 'ending' || !run?.endingId || submitted) return;
    const e = endingById(run.endingId);
    emitWithAck<any, any>('noir:submit', {
      name: run.name, endingId: run.endingId, tone: e?.tone ?? 'death',
      chapter: run.chapter, scenesSeen: new Set(run.path).size, stats: run.stats,
    }).then(r => {
      if (r?.ok) { setSubmitted(r.data); setBest(b => b ? { ...b, best: r.data.best } : b); }
    }).catch(() => {});
  }, [view, run, submitted]);

  const openBoard = async () => {
    setView('board');
    try {
      const r = await emitWithAck<{ limit: number }, any>('noir:board', { limit: 50 });
      if (r?.ok) setBoard(r.data);
    } catch { setBoard([]); }
  };

  return createPortal(
    <div style={S.wrap} ref={scrollRef}>
      {/* beat flash — the whole screen reacts to what you just chose */}
      <AnimatePresence>
        {flash && (
          <motion.div key={flash} style={{ ...S.flash, background: BEAT_FLASH[flash] }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }} />
        )}
      </AnimatePresence>

      <div style={S.inner}>
        <div style={S.header}>
          <button onClick={onClose} style={S.icon} aria-label="დახურვა">‹</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={S.title}>ნუარი</div>
            <div style={S.sub}>
              {view === 'play' && run ? `თავი ${run.chapter} / 4` : 'ინტერაქტიული თავგადასავალი'}
            </div>
          </div>
          {best && <div style={S.bestChip}>რეკორდი {best.best}</div>}
        </div>

        {/* ══ title ══ */}
        {view === 'title' && (
          <>
            <div style={S.poster}><NoirBackdrop kind="rain_street" height={190} /></div>
            <p style={S.blurb}>
              ერთი ღამე, ერთი ვალი და ქალაქი, რომელსაც არავინ ეკითხება.
              ყოველი არჩევანი ცვლის იმას, ვინ ხდები — და რომელი კარი დაგრჩება ღია.
            </p>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="შენი სახელი"
              maxLength={18} style={S.input} />
            <button onClick={() => start(true)} style={S.primary}>ახალი ამბავი</button>
            {saved && !saved.endingId && (
              <button onClick={() => start(false)} style={S.ghost}>
                გააგრძელე — თავი {saved.chapter}
              </button>
            )}
            <button onClick={openBoard} style={S.ghost}>ლიდერბორდი</button>
            {best && best.runs > 0 && (
              <p style={S.note}>{best.runs} დასრულებული · ნანახი დასასრული {best.endings.length}/6</p>
            )}
          </>
        )}

        {/* ══ playing ══ */}
        {view === 'play' && scene && run && (
          <>
            <div style={S.poster}>
              <NoirBackdrop kind={scene.backdrop} height={190} />
              {scene.title && <div style={S.place}>{scene.title}</div>}
            </div>

            <StatBar stats={run.stats} delta={delta} />

            {/* Tap the prose to skip the reveal — never make someone wait. */}
            <div style={S.prose} onClick={() => !tw.done && tw.finish()}>
              {scene.speaker && <span style={S.speaker}>{scene.speaker}</span>}
              <span>{scene.speaker ? tw.visible.slice(scene.speaker.length + 2) : tw.visible}</span>
              {!tw.done && <span style={S.caret}>▌</span>}
            </div>

            <AnimatePresence>
              {tw.done && (
                <motion.div key={scene.id} style={{ display: 'grid', gap: T.space.md }}
                  initial="hide" animate="show"
                  variants={{ show: { transition: { staggerChildren: 0.07 } } }}>
                  {scene.choices.map((c, i) => {
                    const open = meetsRequirements(run, c);
                    return (
                      <motion.button key={i} onClick={() => pick(c)} disabled={!open}
                        variants={{ hide: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                        style={{ ...S.choice, ...(open ? null : S.choiceLocked) }}>
                        <span>{c.text}</span>
                        {/* A locked option stays visible: seeing the road you
                            did not build is the point of the stats. The hint sits
                            on its own line — beside the text it was `nowrap` and
                            ran off the edge of a phone on the longer gates. */}
                        {!open && <span style={S.lock}>🔒 {c.lockedHint ?? 'დაკეტილია'}</span>}
                      </motion.button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {/* ══ ending ══ */}
        {view === 'ending' && run && ending && (
          <>
            <div style={S.poster}><NoirBackdrop kind={ending.tone === 'death' ? 'alley' : 'rain_street'} height={190} /></div>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              style={{ ...S.endCard, borderColor: TONE_COLOR[ending.tone] }}>
              <div style={{ ...S.endLabel, color: TONE_COLOR[ending.tone] }}>{ending.label}</div>
              <p style={S.endBody}>{ending.body}</p>
            </motion.div>

            <div style={S.scoreRow}>
              <span style={S.scoreNum}>{submitted?.score ?? scoreRun(run).total}</span>
              <span style={S.scoreLbl}>
                ქულა{submitted?.rank ? ` · #${submitted.rank} ადგილი` : ''}
                {submitted?.isBest ? ' · ახალი რეკორდი' : ''}
              </span>
            </div>
            <div style={S.breakdown}>
              {scoreRun(run).breakdown.map((b, i) => (
                <div key={i} style={S.brRow}>
                  <span style={{ color: T.text.muted }}>{b.label}</span>
                  <span style={{ color: b.points >= 0 ? T.color.success : T.color.danger }}>
                    {b.points > 0 ? '+' : ''}{b.points}
                  </span>
                </div>
              ))}
            </div>

            <button onClick={() => { setRun(newRun(run.name)); setSubmitted(null); setView('play'); }} style={S.primary}>
              კიდევ ერთხელ
            </button>
            <button onClick={openBoard} style={S.ghost}>ლიდერბორდი</button>
            <button onClick={() => setView('title')} style={S.ghost}>მთავარი</button>
          </>
        )}

        {/* ══ leaderboard ══ */}
        {view === 'board' && (
          <>
            <div style={S.sectionTitle}>საუკეთესო გავლები</div>
            {!board && <p style={S.note}>იტვირთება…</p>}
            {board?.length === 0 && <p style={S.note}>ჯერ არავის დაუსრულებია. იყავი პირველი.</p>}
            {board?.map(r => (
              <button key={r.userId} onClick={() => r.userId !== myId && openProfile(r.userId)}
                style={{ ...S.boardRow, borderColor: r.userId === myId ? T.color.accent : T.surface.line }}>
                <span style={S.rank}>{r.rank}</span>
                <span style={S.avatar}>
                  {r.avatarUrl
                    ? <img src={r.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : (r.avatar || r.username.slice(0, 1))}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={S.bName}>{r.username}</span>
                  <span style={{ ...S.bSub, color: TONE_COLOR[r.tone] ?? T.text.muted }}>
                    {endingById(r.endingId)?.label ?? r.endingId}
                  </span>
                </span>
                <span style={S.bScore}>{r.score}</span>
              </button>
            ))}
            <button onClick={() => setView(run?.endingId ? 'ending' : 'title')} style={S.ghost}>უკან</button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** The five stats, with a short-lived +N / -N when a choice moves one. */
function StatBar({ stats, delta }: { stats: Record<StatKey, number>; delta: Partial<Record<StatKey, number>> }) {
  return (
    <div style={S.stats}>
      {(Object.keys(STAT_META) as StatKey[]).map(k => {
        const d = delta[k];
        // Heat is the one stat where up is bad, so its bar is coloured by the
        // danger role rather than the accent.
        const danger = k === 'heat';
        return (
          <div key={k} style={S.stat} title={STAT_META[k].hint}>
            <div style={S.statTop}>
              <span style={S.statName}>{STAT_META[k].ka}</span>
              <AnimatePresence>
                {d ? (
                  <motion.span key={`${k}${d}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }} style={{ ...S.dlt, color: (d > 0) === !danger ? T.color.success : T.color.danger }}>
                    {d > 0 ? `+${d}` : d}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </div>
            <div style={S.statTrack}>
              <div style={{
                ...S.statFill, width: `${stats[k] * 10}%`,
                background: danger ? T.color.danger : T.color.accent,
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const S: Record<string, any> = {
  wrap: {
    position: 'fixed', inset: 0, zIndex: 74, background: T.surface.page,
    overflowY: 'auto', overflowX: 'hidden',
    WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', touchAction: 'manipulation',
  },
  flash: { position: 'fixed', inset: 0, zIndex: 76, pointerEvents: 'none' },
  inner: { position: 'relative', maxWidth: 540, margin: '0 auto', padding: '12px 14px calc(env(safe-area-inset-bottom,0px) + 64px)', display: 'grid', gap: T.space.lg },
  header: { display: 'flex', alignItems: 'center', gap: T.space.lg, position: 'sticky', top: 0, zIndex: 6, background: T.surface.pageBlur, backdropFilter: 'blur(10px)', padding: '8px 0' },
  icon: { width: 34, height: 34, borderRadius: T.radius.md, border: `1px solid ${T.surface.lineStrong}`, background: T.surface.sunken, color: T.text.secondary, fontSize: T.font.headline, lineHeight: 1 },
  title: { fontFamily: '"Space Grotesk",monospace', fontSize: T.font.subhead, fontWeight: T.weight.heavy, color: T.text.primary, letterSpacing: 3 },
  sub: { fontSize: T.font.caption, color: T.text.muted },
  bestChip: { fontSize: T.font.caption, color: T.color.gold, border: `1px solid ${T.color.goldSoft}`, background: T.color.goldSoft, borderRadius: T.radius.full, padding: '3px 9px', whiteSpace: 'nowrap' },

  poster: { position: 'relative', borderRadius: T.radius.lg, overflow: 'hidden', border: hairline },
  place: { position: 'absolute', left: 12, bottom: 10, fontFamily: 'monospace', fontSize: T.font.caption, letterSpacing: 1.5, color: T.text.secondary, textShadow: '0 2px 8px rgba(0,0,0,.9)' },

  blurb: { fontSize: T.font.body, lineHeight: 1.65, color: T.text.secondary, margin: 0 },
  input: { width: '100%', padding: '11px 13px', borderRadius: T.radius.md, background: T.surface.sunken, border: `1px solid ${T.surface.lineStrong}`, color: T.text.primary, fontSize: T.font.subhead, outline: 'none' },
  primary: { width: '100%', padding: '13px', borderRadius: T.radius.md, border: 'none', background: T.gradient.accent, color: T.text.onAccent, fontWeight: T.weight.heavy, fontSize: T.font.subhead },
  ghost: { width: '100%', padding: '11px', borderRadius: T.radius.md, border: `1px solid ${T.surface.lineStrong}`, background: T.surface.sunken, color: T.text.secondary, fontSize: T.font.body },
  note: { fontSize: T.font.small, color: T.text.muted, textAlign: 'center', margin: 0 },

  stats: { display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: T.space.sm },
  stat: { minWidth: 0 },
  statTop: { display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 3 },
  statName: { fontSize: T.font.micro, color: T.text.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  dlt: { fontSize: T.font.micro, fontWeight: T.weight.bold },
  statTrack: { height: 4, borderRadius: 2, background: T.surface.line, overflow: 'hidden' },
  statFill: { height: '100%', borderRadius: 2, transition: 'width .5s ease' },

  prose: { fontSize: 14.5, lineHeight: 1.72, color: T.text.secondary, whiteSpace: 'pre-wrap', minHeight: 96 },
  speaker: { color: T.color.accent, fontWeight: T.weight.bold, marginRight: 6 },
  caret: { color: T.color.accent, opacity: 0.7 },

  choice: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 5, width: '100%', textAlign: 'left', padding: '12px 13px', borderRadius: T.radius.md, border: `1px solid ${T.surface.lineStrong}`, background: T.surface.card, color: T.text.secondary, fontSize: T.font.body, lineHeight: 1.45 },
  choiceLocked: { opacity: 0.42, borderStyle: 'dashed' },
  lock: { fontSize: T.font.micro, color: T.text.faint, lineHeight: 1.35 },

  endCard: { padding: T.space['2xl'], borderRadius: T.radius.lg, border: '1px solid', background: T.surface.card },
  endLabel: { fontFamily: '"Space Grotesk",monospace', fontSize: T.font.headline, fontWeight: T.weight.heavy, marginBottom: T.space.md },
  endBody: { fontSize: T.font.body, lineHeight: 1.7, color: T.text.secondary, whiteSpace: 'pre-wrap', margin: 0 },
  scoreRow: { display: 'flex', alignItems: 'baseline', gap: T.space.lg, justifyContent: 'center' },
  scoreNum: { fontFamily: '"Space Grotesk",monospace', fontSize: 34, fontWeight: T.weight.heavy, color: T.color.gold },
  scoreLbl: { fontSize: T.font.small, color: T.text.muted },
  breakdown: { display: 'grid', gap: 3, padding: T.space.xl, borderRadius: T.radius.md, background: T.surface.card, border: hairline },
  brRow: { display: 'flex', justifyContent: 'space-between', fontSize: T.font.small },

  sectionTitle: { fontSize: T.font.small, letterSpacing: 2, color: T.text.muted },
  boardRow: { display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 10px', borderRadius: T.radius.md, border: '1px solid', background: T.surface.card },
  rank: { width: 22, fontFamily: 'monospace', fontSize: T.font.small, color: T.text.muted },
  avatar: { width: 30, height: 30, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: T.color.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text.secondary, fontSize: T.font.body },
  bName: { display: 'block', fontSize: T.font.body, color: T.text.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  bSub: { display: 'block', fontSize: T.font.micro },
  bScore: { fontFamily: '"Space Grotesk",monospace', fontWeight: T.weight.heavy, fontSize: T.font.subhead, color: T.color.gold },
};

export default NoirAdventure;
