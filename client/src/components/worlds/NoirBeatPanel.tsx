// ── ნუარი in 3D — the scene panel ─────────────────────────────────────
// The 3D city announces which story beat you walked into (NOIR_BEAT_EVENT); this
// renders that scene over the world and lets you choose. Walking IS the
// navigation, so the panel deliberately does NOT drive the story onwards by
// itself: a choice resolves, the panel closes, and the next location is
// somewhere you have to go.
//
// Skill tests and the full engine are reused from components/noir — the 3D
// world is a different way into the same story, not a second copy of it.
import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { T, hairline } from '@/design/tokens';
import { haptic } from '@/lib/haptics';
import { SkillTest } from '@/components/noir/Interactions';
import { NoirAudio } from '@/components/noir/sfx';
import type { Choice, RunState } from '@/components/noir/types';
import { STAT_META, type StatKey } from '@/components/noir/types';
import {
  applyChoice, clearRun, endingById, forcedEnding, loadRun, meetsRequirements,
  newRun, saveRun, sceneById,
} from '@/components/noir/engine';
import { NOIR_BEAT_EVENT, NOIR_OBJECTIVE_EVENT, NOIR_PLACES } from './noirCity';

export function NoirBeatPanel({ playerName }: { playerName: string }) {
  // The run exists from the moment you enter the city: a saved one is resumed,
  // otherwise the story starts at its first scene. There is no "begin" button —
  // walking out of the spawn IS beginning.
  const [run, setRun] = useState<RunState>(() => loadRun() ?? newRun(playerName));
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Choice | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const state = run;
  const scene = run.endingId ? null : sceneById(run.sceneId) ?? null;
  const placeOf = (kind: string) => NOIR_PLACES.find(p => p.kind === kind);

  /**
   * Point the beacon at wherever the current scene happens. Re-emitted on every
   * change, and once on mount, because the world may have been built after this
   * panel and would otherwise have nothing to aim at.
   */
  useEffect(() => {
    const kind = scene?.backdrop ?? null;
    window.dispatchEvent(new CustomEvent(NOIR_OBJECTIVE_EVENT, { detail: { kind } }));
  }, [scene?.backdrop, scene?.id]);

  // Reaching a place plays whatever scene belongs there. If the story is
  // elsewhere the place still answers — with directions, not silence.
  useEffect(() => {
    const onBeat = (e: Event) => {
      const { kind, label } = (e as CustomEvent).detail as { kind: string; label: string };
      NoirAudio.unlock();
      setRun(cur => {
        const sc = cur.endingId ? null : sceneById(cur.sceneId);
        if (sc && sc.backdrop === kind) {
          setOpen(true);
          haptic('selection');
        } else if (cur.endingId) {
          setNote('ეს ამბავი დასრულდა — დაიწყე ახალი');
          setTimeout(() => setNote(null), 3600);
        } else {
          const dest = sc ? placeOf(sc.backdrop) : null;
          setNote(dest ? `${label} — აქ ახლა არაფერია. მიდი: ${dest.label}` : label);
          setTimeout(() => setNote(null), 4200);
        }
        return cur;
      });
    };
    window.addEventListener(NOIR_BEAT_EVENT, onBeat);
    return () => window.removeEventListener(NOIR_BEAT_EVENT, onBeat);
  }, []);

  const close = useCallback(() => { setOpen(false); setPending(null); }, []);

  const resolve = useCallback((c: Choice, failed: boolean) => {
    let next = applyChoice(state, c, failed);
    const forced = forcedEnding(next);
    if (forced) next = { ...next, endingId: forced };
    setRun(next);

    if (next.endingId) {
      const e = endingById(next.endingId);
      NoirAudio.ending(e?.tone ?? 'death');
      setNote(e ? `${e.label} — ამბავი დასრულდა` : null);
      clearRun();
      // A finished story leaves the city standing: after a beat, a new run
      // begins so the next walk out of the spawn starts chapter one again.
      setTimeout(() => setRun(newRun(playerName)), 6000);
    } else {
      saveRun(next);
      // Naming the PLACE, not the scene, is what turns the city into a map:
      // you are told where to go, and going there is the move.
      const dest = sceneById(next.sceneId);
      const where = dest ? placeOf(dest.backdrop) : null;
      setNote(where ? `შემდეგი: ${where.label}` : 'გააგრძელე ქალაქში');
    }
    setTimeout(() => setNote(null), 4200);
    close();
  }, [state, close, playerName]);

  const pick = (c: Choice) => {
    if (!meetsRequirements(state, c)) { haptic('error'); NoirAudio.warn(); return; }
    NoirAudio.choose(c.beat ?? 'calm');
    haptic(c.beat === 'violent' ? 'heavy' : 'selection');
    if (c.test) { setPending(c); return; }
    resolve(c, false);
  };

  return (
    <>
      <AnimatePresence>
        {pending && (
          <SkillTest test={pending.test!} onDone={ok => { const c = pending; setPending(null); resolve(c, !ok); }} />
        )}
      </AnimatePresence>

      {/* A short line naming where to go next, so the world stays the map. */}
      <AnimatePresence>
        {note && (
          <motion.div key={note} style={S.note}
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {note}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && scene && !pending && (
          <motion.div style={S.wrap}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div data-hud style={S.panel}
              initial={{ y: 26, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 26, opacity: 0 }}>
              <div style={S.top}>
                {scene.title && <span style={S.place}>{scene.title}</span>}
                <span style={{ flex: 1 }} />
                <button onPointerDown={close} style={S.close} aria-label="დახურვა">✕</button>
              </div>

              <StatStrip stats={state.stats} />

              <p style={S.prose}>
                {scene.speaker && <span style={S.speaker}>{scene.speaker}: </span>}
                {scene.text}
              </p>

              <div style={{ display: 'grid', gap: T.space.md }}>
                {scene.choices.map((c, i) => {
                  // `unlocked`, not `open`: the panel's own visibility flag is
                  // called open and shadowing it here is how you get a choice
                  // list that silently follows the wrong boolean.
                  const unlocked = meetsRequirements(state, c);
                  return (
                    <button key={i} onPointerDown={() => pick(c)} disabled={!unlocked}
                      style={{ ...S.choice, ...(unlocked ? null : S.locked) }}>
                      <span>{c.text}</span>
                      {!unlocked && <span style={S.lock}>🔒 {c.lockedHint ?? 'დაკეტილია'}</span>}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function StatStrip({ stats }: { stats: Record<StatKey, number> }) {
  return (
    <div style={S.stats}>
      {(Object.keys(STAT_META) as StatKey[]).map(k => (
        <div key={k} style={{ minWidth: 0 }}>
          <span style={S.statName}>{STAT_META[k].ka}</span>
          <div style={S.track}>
            <div style={{
              height: '100%', borderRadius: 2, width: `${stats[k] * 10}%`,
              background: k === 'heat' ? T.color.danger : T.color.accent,
              transition: 'width .4s ease',
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const S: Record<string, any> = {
  wrap: { position: 'absolute', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 12, background: 'linear-gradient(180deg, transparent 30%, rgba(0,0,0,0.55))' },
  panel: { width: 'min(520px, 96vw)', maxHeight: '72vh', overflowY: 'auto', display: 'grid', gap: T.space.lg, padding: T.space['2xl'], borderRadius: T.radius.lg, background: 'rgba(8,7,14,0.96)', border: hairline, backdropFilter: 'blur(14px)', marginBottom: 'max(96px, calc(env(safe-area-inset-bottom) + 84px))' },
  top: { display: 'flex', alignItems: 'center', gap: T.space.md },
  place: { fontFamily: 'monospace', fontSize: T.font.caption, letterSpacing: 1.5, color: T.color.accent },
  close: { width: 28, height: 28, borderRadius: T.radius.sm, border: `1px solid ${T.surface.lineStrong}`, background: T.surface.sunken, color: T.text.secondary, fontSize: T.font.small },
  stats: { display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: T.space.sm },
  statName: { display: 'block', fontSize: T.font.micro, color: T.text.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  track: { height: 4, borderRadius: 2, background: T.surface.line, overflow: 'hidden', marginTop: 3 },
  prose: { fontSize: 14, lineHeight: 1.68, color: T.text.secondary, whiteSpace: 'pre-wrap', margin: 0 },
  speaker: { color: T.color.accent, fontWeight: T.weight.bold },
  choice: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 5, width: '100%', textAlign: 'left', padding: '11px 12px', borderRadius: T.radius.md, border: `1px solid ${T.surface.lineStrong}`, background: T.surface.card, color: T.text.secondary, fontSize: T.font.body, lineHeight: 1.45 },
  locked: { opacity: 0.42, borderStyle: 'dashed' },
  lock: { fontSize: T.font.micro, color: T.text.faint, lineHeight: 1.35 },
  note: { position: 'absolute', top: 'max(66px, calc(env(safe-area-inset-top) + 54px))', left: '50%', transform: 'translateX(-50%)', zIndex: 55, padding: '7px 14px', borderRadius: T.radius.full, background: 'rgba(8,7,14,0.9)', border: `1px solid ${T.color.accentSoft}`, color: T.color.accent, fontSize: T.font.small, whiteSpace: 'nowrap', pointerEvents: 'none' },
};
