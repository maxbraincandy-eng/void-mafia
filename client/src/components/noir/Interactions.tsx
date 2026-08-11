// ── ნუარი — skill tests ───────────────────────────────────────────────
// Four small acts that stand between a decision and its outcome, so the story
// is something you DO rather than only read. Each resolves to success or
// failure and hands the result back; the engine routes the run from there.
//
// Design rules they all follow:
//  · one gesture, learned in under a second, explained by a single Georgian line
//  · always winnable and always losable — never a coin flip, never a formality
//  · a visible clock, so losing never feels arbitrary
//  · they resolve themselves on timeout; no test can strand a run
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { T } from '@/design/tokens';
import { haptic } from '@/lib/haptics';
import { NoirAudio } from './sfx';
import type { ChoiceTest } from './types';

interface Props {
  test: ChoiceTest;
  onDone: (success: boolean) => void;
}

export function SkillTest({ test, onDone }: Props) {
  // A test resolves exactly once: a late timer firing after a win must not
  // overwrite the result.
  const settled = useRef(false);
  const finish = useCallback((ok: boolean) => {
    if (settled.current) return;
    settled.current = true;
    if (ok) { NoirAudio.success(); haptic('success'); }
    else { NoirAudio.failure(); haptic('error'); }
    // Let the win/lose sound register before the story moves on.
    setTimeout(() => onDone(ok), 620);
  }, [onDone]);

  return (
    <motion.div style={ST.scrim} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div style={ST.panel} initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }}>
        <div style={ST.prompt}>{test.prompt}</div>
        {test.kind === 'hold' && <HoldTest test={test} finish={finish} />}
        {test.kind === 'tap' && <TapTest test={test} finish={finish} />}
        {test.kind === 'timing' && <TimingTest test={test} finish={finish} />}
        {test.kind === 'search' && <SearchTest test={test} finish={finish} />}
      </motion.div>
    </motion.div>
  );
}

type Inner = { test: ChoiceTest; finish: (ok: boolean) => void };

/** Keep a finger down while the frame shakes. Lift early and you fail. */
function HoldTest({ test, finish }: Inner) {
  const [held, setHeld] = useState(0);
  const [down, setDown] = useState(false);
  const start = useRef(0);

  useEffect(() => {
    if (!down) return;
    start.current = Date.now() - held;
    const iv = setInterval(() => {
      const ms = Date.now() - start.current;
      setHeld(ms);
      if (ms % 400 < 40) NoirAudio.heart(ms > test.target * 0.6);
      if (ms >= test.target) finish(true);
    }, 40);
    return () => clearInterval(iv);
  }, [down, test.target, finish, held]);

  // Lifting before the target is the failure — that IS the test.
  const release = () => { if (down && held < test.target) finish(false); setDown(false); };
  const pct = Math.min(100, (held / test.target) * 100);

  return (
    <>
      <motion.button
        onPointerDown={() => { setDown(true); haptic('selection'); }}
        onPointerUp={release} onPointerLeave={release} onPointerCancel={release}
        animate={down ? { x: [0, -3, 3, -2, 2, 0] } : { x: 0 }}
        transition={down ? { duration: 0.25, repeat: Infinity } : { duration: 0.2 }}
        style={{ ...ST.bigButton, borderColor: down ? T.color.accent : T.surface.lineStrong }}
      >
        <Ring pct={pct} />
        <span style={ST.bigLabel}>{down ? 'გეჭიროს' : 'დააჭირე და გეჭიროს'}</span>
      </motion.button>
      <div style={ST.hint}>{((test.target - held) / 1000).toFixed(1)} წმ</div>
    </>
  );
}

/** Reach a tap count before the clock empties. */
function TapTest({ test, finish }: Inner) {
  const [taps, setTaps] = useState(0);
  const [left, setLeft] = useState(test.ms);

  useEffect(() => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const rem = test.ms - (Date.now() - t0);
      setLeft(rem);
      if (rem <= 0) { clearInterval(iv); finish(false); }
    }, 50);
    return () => clearInterval(iv);
  }, [test.ms, finish]);

  const hit = () => {
    setTaps(n => {
      const next = n + 1;
      NoirAudio.clock();
      haptic('tap');
      if (next >= test.target) finish(true);
      return next;
    });
  };
  const pct = Math.min(100, (taps / test.target) * 100);

  return (
    <>
      <button onPointerDown={hit} style={{ ...ST.bigButton, borderColor: T.color.accent }}>
        <Ring pct={pct} />
        <span style={ST.bigLabel}>{taps} / {test.target}</span>
      </button>
      <Clock left={left} total={test.ms} />
    </>
  );
}

/** Stop a sweeping marker inside the zone. One shot. */
function TimingTest({ test, finish }: Inner) {
  const [pos, setPos] = useState(0);
  const dir = useRef(1);
  const stopped = useRef(false);
  // A zone `target`% wide, centred — the marker is what moves, not the target.
  const half = test.target / 2;

  useEffect(() => {
    const iv = setInterval(() => {
      if (stopped.current) return;
      setPos(p => {
        let n = p + dir.current * 2.6;
        if (n >= 100) { n = 100; dir.current = -1; }
        if (n <= 0) { n = 0; dir.current = 1; }
        return n;
      });
    }, 16);
    const to = setTimeout(() => { if (!stopped.current) finish(false); }, test.ms);
    return () => { clearInterval(iv); clearTimeout(to); };
  }, [test.ms, finish]);

  const stop = () => {
    if (stopped.current) return;
    stopped.current = true;
    finish(Math.abs(pos - 50) <= half);
  };

  return (
    <>
      <button onPointerDown={stop} style={ST.track}>
        <span style={{ ...ST.zone, left: `${50 - half}%`, width: `${test.target}%` }} />
        <span style={{ ...ST.marker, left: `${pos}%` }} />
      </button>
      <div style={ST.hint}>დააჭირე, როცა ზოლში მოხვდება</div>
    </>
  );
}

/** Find the glints hidden in the dark before the clock empties. */
function SearchTest({ test, finish }: Inner) {
  const [found, setFound] = useState<number[]>([]);
  const [left, setLeft] = useState(test.ms);
  // Seeded from the prompt so the same scene hides them in the same places.
  // One glint per COLUMN with only vertical jitter: a plain hash over the whole
  // area clustered two of three on top of each other, which turned a search
  // into a single tap.
  const spots = useRef(
    Array.from({ length: test.target }, (_, i) => {
      const h = [...test.prompt].reduce((n, c) => n + c.charCodeAt(0), i * 97);
      const band = 86 / test.target;             // usable width per glint
      return {
        x: 7 + i * band + (h % Math.max(1, Math.floor(band - 10))),
        y: 12 + ((h * 53) % 70),
      };
    }),
  );

  useEffect(() => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const rem = test.ms - (Date.now() - t0);
      setLeft(rem);
      if (rem <= 0) { clearInterval(iv); finish(false); }
    }, 50);
    return () => clearInterval(iv);
  }, [test.ms, finish]);

  const tap = (i: number) => {
    if (found.includes(i)) return;
    NoirAudio.clock(); haptic('selection');
    const next = [...found, i];
    setFound(next);
    if (next.length >= test.target) finish(true);
  };

  return (
    <>
      <div style={ST.searchArea}>
        {spots.current.map((s, i) => (
          <button key={i} onPointerDown={() => tap(i)}
            style={{
              ...ST.glint, left: `${s.x}%`, top: `${s.y}%`,
              opacity: found.includes(i) ? 1 : 0.5,
              background: found.includes(i) ? T.color.success : T.color.gold,
              animation: found.includes(i) ? 'none' : 'nr-pulse 1.4s ease-in-out infinite',
            }} />
        ))}
        <span style={ST.searchLabel}>{found.length} / {test.target}</span>
      </div>
      <Clock left={left} total={test.ms} />
    </>
  );
}

/** Progress ring drawn round the big button. */
function Ring({ pct }: { pct: number }) {
  const r = 46, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 110 110" style={ST.ring} aria-hidden="true">
      <circle cx="55" cy="55" r={r} fill="none" stroke={T.surface.line} strokeWidth="5" />
      <circle cx="55" cy="55" r={r} fill="none" stroke={T.color.accent} strokeWidth="5"
        strokeLinecap="round" strokeDasharray={c}
        strokeDashoffset={c * (1 - pct / 100)}
        transform="rotate(-90 55 55)" style={{ transition: 'stroke-dashoffset .06s linear' }} />
    </svg>
  );
}

function Clock({ left, total }: { left: number; total: number }) {
  const pct = Math.max(0, (left / total) * 100);
  return (
    <div style={ST.clockTrack}>
      <div style={{ ...ST.clockFill, width: `${pct}%`, background: pct < 30 ? T.color.danger : T.color.accent }} />
    </div>
  );
}

const ST: Record<string, any> = {
  scrim: { position: 'fixed', inset: 0, zIndex: 78, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  panel: { width: 'min(360px, 92vw)', display: 'grid', gap: 14, justifyItems: 'center' },
  prompt: { fontSize: T.font.subhead, color: T.text.primary, textAlign: 'center', lineHeight: 1.5, fontWeight: T.weight.bold },
  bigButton: { position: 'relative', width: 150, height: 150, borderRadius: '50%', border: '2px solid', background: T.surface.card, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', userSelect: 'none' },
  bigLabel: { fontSize: T.font.body, color: T.text.secondary, fontWeight: T.weight.bold, textAlign: 'center', padding: '0 18px', lineHeight: 1.3 },
  ring: { position: 'absolute', inset: 0, width: '100%', height: '100%' },
  hint: { fontSize: T.font.small, color: T.text.muted, textAlign: 'center' },
  track: { position: 'relative', width: '100%', height: 46, borderRadius: T.radius.md, background: T.surface.sunken, border: `1px solid ${T.surface.lineStrong}`, overflow: 'hidden', touchAction: 'none' },
  zone: { position: 'absolute', top: 0, bottom: 0, background: T.color.successSoft, borderLeft: `2px solid ${T.color.success}`, borderRight: `2px solid ${T.color.success}` },
  marker: { position: 'absolute', top: 4, bottom: 4, width: 4, marginLeft: -2, borderRadius: 2, background: T.color.gold, boxShadow: `0 0 10px ${T.color.gold}` },
  clockTrack: { width: '100%', height: 5, borderRadius: 3, background: T.surface.line, overflow: 'hidden' },
  clockFill: { height: '100%', borderRadius: 3, transition: 'width .06s linear' },
  searchArea: { position: 'relative', width: '100%', height: 190, borderRadius: T.radius.md, border: `1px solid ${T.surface.lineStrong}`, background: 'radial-gradient(ellipse at 50% 40%, rgba(255,255,255,0.05), rgba(0,0,0,0.5))', overflow: 'hidden', touchAction: 'none' },
  glint: { position: 'absolute', width: 22, height: 22, marginLeft: -11, marginTop: -11, borderRadius: '50%', border: 'none' },
  searchLabel: { position: 'absolute', right: 10, bottom: 8, fontSize: T.font.small, color: T.text.muted, fontFamily: 'monospace' },
};
