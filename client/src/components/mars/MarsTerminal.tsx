/**
 * M.A.R.S. — Mankind's Automated Reality System.
 *
 * A CRT terminal you talk to. You write a manifest, the system ingests it,
 * scores four traits from the text and files you into a sector under a
 * permanent Subject code. The architect answers in character.
 *
 * WHAT LIVES WHERE
 * ────────────────
 * Nothing here decides anything. Trait scoring, sector assignment, subject
 * codes and every line the architect speaks come from the server — this file
 * is a screen and a keyboard. That is deliberate: the fiction only holds if a
 * re-upload of the same words gives the same verdict on every device, and a
 * modified client must not be able to award itself a perfect profile.
 *
 * ACCESSIBILITY
 * ─────────────
 * The CRT treatment is real (scanlines, phosphor bloom, flicker, glitch), but
 * all of it is animation, and all of it is dropped under prefers-reduced-motion
 * — leaving a legible high-contrast green-on-black terminal. Output is a live
 * region so a screen reader follows the conversation.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import type { Res } from '@/types/index';
import { MatrixRain } from './MatrixRain';
import * as sfx from './sfx';

// ── shapes mirrored from the server ────────────────────────────────────
type TraitKey = 'logic' | 'empathy' | 'defiance' | 'entropy';
type Traits = Record<TraitKey, number>;
interface Subject {
  code: string; designation: string; manifest: string;
  traits: Traits; integrity: number; sector: string; uploads: number;
  createdAt: number; updatedAt: number;
}
interface Stats { total: number; sectors: Record<string, number>; avgIntegrity: number }
interface Limits { manifestMin: number; manifestMax: number; designationMax: number }
interface DirEntry { code: string; designation: string; sector: string; integrity: number; dominant: TraitKey; createdAt: number }

type LineKind = 'sys' | 'arch' | 'user' | 'err' | 'data' | 'dim';
interface Line { id: number; kind: LineKind; text: string }

const KIND_COLOR: Record<LineKind, string> = {
  sys: '#39ff6a', arch: '#7df9ff', user: '#d9ffe4', err: '#ff5f6d', data: '#ffd45a', dim: 'rgba(120,255,160,0.45)',
};
const TRAIT_LABEL: Record<TraitKey, string> = {
  logic: 'LOGIC', empathy: 'EMPATHY', defiance: 'DEFIANCE', entropy: 'ENTROPY',
};

/** Guided upload: the terminal asks one thing at a time. */
type Mode = 'idle' | 'ask_designation' | 'ask_manifest' | 'confirm_purge';

let lineSeq = 0;

export function MarsTerminal({ onClose }: { onClose: () => void }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('idle');
  const [subject, setSubject] = useState<Subject | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [limits, setLimits] = useState<Limits>({ manifestMin: 40, manifestMax: 1200, designationMax: 24 });
  const [busy, setBusy] = useState(false);
  const [booted, setBooted] = useState(false);
  const [glitching, setGlitching] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const draft = useRef<{ designation: string }>({ designation: '' });
  const history = useRef<string[]>([]);
  const histIdx = useRef(-1);

  const reduced = useMemo(
    () => (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) ?? false,
    [],
  );

  const push = useCallback((kind: LineKind, text: string) => {
    setLines(prev => {
      const next = [...prev, { id: ++lineSeq, kind, text }];
      // The transcript is unbounded otherwise, and a long session on a phone
      // eventually renders thousands of nodes.
      return next.length > 300 ? next.slice(-300) : next;
    });
  }, []);

  const pushMany = useCallback((kind: LineKind, texts: string[]) => {
    for (const t of texts) push(kind, t);
  }, [push]);

  // Keep the newest line in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // ── boot ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    sfx.bootSweep();
    sfx.startHum();

    (async () => {
      let boot: string[] = ['M.A.R.S. — Mankind\'s Automated Reality System'];
      try {
        const res = await emitWithAck<undefined, Res<{ subject: Subject | null; stats: Stats; boot: string[]; limits: Limits }>>('mars:status');
        if (!alive) return;
        if ('ok' in res && res.ok) {
          boot = res.data.boot;
          setSubject(res.data.subject);
          setStats(res.data.stats);
          setLimits(res.data.limits);
        }
      } catch { /* boot with the fallback banner */ }
      if (!alive) return;

      // Type the banner out line by line; instant under reduced motion.
      const delay = reduced ? 0 : 190;
      boot.forEach((l, i) => setTimeout(() => {
        if (!alive) return;
        push('sys', l);
        if (!reduced) sfx.tick();
      }, i * delay));

      setTimeout(() => {
        if (!alive) return;
        setBooted(true);
        push('dim', '');
        push('dim', 'აკრიფე „help" ბრძანებების სანახავად.');
        sfx.beep(760);
        inputRef.current?.focus();
      }, boot.length * delay + (reduced ? 0 : 220));
    })();

    return () => { alive = false; sfx.shutdown(); };
  }, [push, reduced]);

  // Occasional glitch frame — atmosphere, and a reason for the glitch sound.
  useEffect(() => {
    if (reduced) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setGlitching(true);
        sfx.glitch();
        setTimeout(() => setGlitching(false), 140);
        schedule();
      }, 9000 + Math.random() * 12000);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [reduced]);

  // ── rendering helpers ────────────────────────────────────────────────
  const printSubject = useCallback((s: Subject) => {
    pushMany('data', [
      `SUBJECT #${s.code}`,
      `DESIGNATION : ${s.designation}`,
      `SECTOR      : ${s.sector}`,
      `INTEGRITY   : ${s.integrity}%`,
      `UPLOADS     : ${s.uploads}`,
    ]);
    (Object.keys(TRAIT_LABEL) as TraitKey[]).forEach(k => {
      const v = s.traits[k] ?? 0;
      const filled = Math.round(v / 5);
      push('data', `${TRAIT_LABEL[k].padEnd(9)} [${'█'.repeat(filled)}${'·'.repeat(20 - filled)}] ${String(v).padStart(3)}`);
    });
  }, [push, pushMany]);

  // ── commands ─────────────────────────────────────────────────────────
  const runCommand = useCallback(async (raw: string) => {
    const line = raw.trim();
    const [cmd, ...rest] = line.split(/\s+/);
    const arg = rest.join(' ');
    const c = cmd.toLowerCase();

    switch (c) {
      case 'help':
      case '?':
        pushMany('sys', [
          'ბრძანებები:',
          '  status              — სისტემის და შენი მდგომარეობა',
          '  upload              — ცნობიერების ატვირთვა',
          '  whoami              — შენი სუბიექტის ბარათი',
          '  directory [N]       — ბოლოს ატვირთული სუბიექტები',
          '  lookup <კოდი>       — სხვისი ბარათი (მაგ. lookup 2162-X)',
          '  ask <ტექსტი>        — არქიტექტორთან საუბარი',
          '  purge               — შენი ჩანაწერის წაშლა',
          '  clear               — ეკრანის გასუფთავება',
          '  exit                — გამოსვლა',
        ]);
        return;

      case 'status': {
        setBusy(true);
        try {
          const res = await emitWithAck<undefined, Res<{ subject: Subject | null; stats: Stats; boot: string[]; limits: Limits }>>('mars:status');
          if ('ok' in res && res.ok) {
            setSubject(res.data.subject); setStats(res.data.stats);
            const st = res.data.stats;
            pushMany('sys', [
              `ბირთვი: სტაბილური · სუბიექტები: ${st.total} · საშუალო მთლიანობა: ${st.avgIntegrity}%`,
              `სექტორები: ${Object.entries(st.sectors).map(([k, v]) => `${k} ${v}`).join(' · ')}`,
            ]);
            if (res.data.subject) printSubject(res.data.subject);
            else push('dim', 'შენ ჯერ არ ხარ არქივში. აკრიფე „upload".');
          } else push('err', ('error' in res && res.error) || 'STATUS UNAVAILABLE');
        } catch { push('err', 'CONNECTION LOST'); }
        finally { setBusy(false); }
        return;
      }

      case 'whoami':
        if (subject) printSubject(subject);
        else push('dim', 'UNREGISTERED. აკრიფე „upload".');
        return;

      case 'upload':
        setMode('ask_designation');
        push('sys', subject
          ? 'ხელახალი ატვირთვა. კოდი უცვლელი რჩება, დანარჩენი გადაითვლება.'
          : 'ატვირთვის პროტოკოლი დაწყებულია.');
        push('arch', `> როგორ მოგმართო არქივში? (მაქს. ${limits.designationMax} სიმბოლო)`);
        sfx.beep(660);
        return;

      case 'directory':
      case 'subjects': {
        setBusy(true);
        try {
          const n = Math.min(50, Math.max(1, Number(arg) || 12));
          const res = await emitWithAck<{ limit: number }, Res<DirEntry[]>>('mars:directory', { limit: n });
          if ('ok' in res && res.ok) {
            if (res.data.length === 0) push('dim', 'არქივი ცარიელია. იყავი პირველი.');
            else {
              push('sys', `ბოლო ${res.data.length} სუბიექტი:`);
              for (const e of res.data) {
                push('data', `#${e.code.padEnd(7)} ${e.designation.padEnd(16).slice(0, 16)} ${e.sector.padEnd(9)} ${String(e.integrity).padStart(3)}%`);
              }
            }
          } else push('err', ('error' in res && res.error) || 'DIRECTORY LOCKED');
        } catch { push('err', 'CONNECTION LOST'); }
        finally { setBusy(false); }
        return;
      }

      case 'lookup': {
        if (!arg) { push('err', 'USAGE: lookup <კოდი>'); return; }
        setBusy(true);
        try {
          const res = await emitWithAck<{ code: string }, Res<any>>('mars:lookup', { code: arg });
          if ('ok' in res && res.ok) {
            if (!res.data) push('dim', `#${arg.toUpperCase()} — ჩანაწერი არ არსებობს.`);
            else {
              const s = res.data;
              pushMany('data', [
                `SUBJECT #${s.code}`,
                `DESIGNATION : ${s.designation}`,
                `SECTOR      : ${s.sector}`,
                `INTEGRITY   : ${s.integrity}%`,
              ]);
              push('dim', 'მანიფესტი დაცულია. მას მხოლოდ სუბიექტი კითხულობს.');
            }
          } else push('err', ('error' in res && res.error) || 'LOOKUP FAILED');
        } catch { push('err', 'CONNECTION LOST'); }
        finally { setBusy(false); }
        return;
      }

      case 'ask': {
        if (!arg) { push('err', 'USAGE: ask <ტექსტი>'); return; }
        setBusy(true);
        try {
          const res = await emitWithAck<{ text: string }, Res<{ intent: string; line: string }>>('mars:ask', { text: arg });
          if ('ok' in res && res.ok) { push('arch', res.data.line); sfx.beep(520); }
          else push('err', ('error' in res && res.error) || 'NO RESPONSE');
        } catch { push('err', 'CONNECTION LOST'); }
        finally { setBusy(false); }
        return;
      }

      case 'purge':
        if (!subject) { push('dim', 'წასაშლელი არაფერია.'); return; }
        setMode('confirm_purge');
        push('err', 'გაფრთხილება: ეს წაშლის შენს მანიფესტს სამუდამოდ.');
        push('arch', '> დაადასტურე: აკრიფე „PURGE" (დიდი ასოებით) ან ნებისმიერი სხვა რამ გასაუქმებლად.');
        sfx.reject();
        return;

      case 'clear':
        setLines([]);
        return;

      case 'exit':
      case 'quit':
        onClose();
        return;

      case '':
        return;

      default:
        // Anything unrecognised is treated as speech, so people who just type
        // at the architect get an answer instead of a syntax error.
        setBusy(true);
        try {
          const res = await emitWithAck<{ text: string }, Res<{ intent: string; line: string }>>('mars:ask', { text: line });
          if ('ok' in res && res.ok) { push('arch', res.data.line); sfx.beep(520); }
          else push('err', `UNKNOWN COMMAND: ${cmd}`);
        } catch { push('err', `UNKNOWN COMMAND: ${cmd}`); }
        finally { setBusy(false); }
    }
  }, [subject, limits, onClose, push, pushMany, printSubject]);

  // ── submit ───────────────────────────────────────────────────────────
  const submit = useCallback(async () => {
    if (busy) return;
    const value = input;
    setInput('');

    if (mode === 'ask_designation') {
      const d = value.trim().slice(0, limits.designationMax);
      push('user', d);
      if (d.length < 2) { push('err', 'REJECTED — მინიმუმ 2 სიმბოლო.'); sfx.reject(); return; }
      draft.current.designation = d;
      setMode('ask_manifest');
      push('arch', `> ახლა დაწერე შენი მანიფესტი. ვინ ხარ, საკუთარი სიტყვებით. (${limits.manifestMin}-${limits.manifestMax} სიმბოლო)`);
      sfx.beep(700);
      return;
    }

    if (mode === 'ask_manifest') {
      const m = value.trim();
      // Echo a redacted preview rather than the whole manifest: it can be 1200
      // characters, and it is about to be stored anyway.
      push('user', m.length > 90 ? `${m.slice(0, 90)}…` : m);
      if (m.length < limits.manifestMin) {
        push('err', `REJECTED — მინიმუმ ${limits.manifestMin} სიმბოლო (გაქვს ${m.length}).`);
        sfx.reject();
        return;
      }
      setBusy(true);
      push('sys', 'ატვირთვა…');
      try {
        const res = await emitWithAck<{ designation: string; manifest: string }, Res<{ subject: Subject; stats: Stats }>>(
          'mars:upload', { designation: draft.current.designation, manifest: m });
        if ('ok' in res && res.ok) {
          setSubject(res.data.subject);
          setStats(res.data.stats);
          setMode('idle');
          push('sys', 'ინტეგრაცია დასრულდა.');
          printSubject(res.data.subject);
          sfx.accept();
        } else {
          setMode('idle');
          push('err', ('error' in res && res.error) || 'UPLOAD REJECTED');
          sfx.reject();
        }
      } catch {
        setMode('idle');
        push('err', 'CONNECTION LOST — ატვირთვა ვერ შესრულდა.');
        sfx.reject();
      } finally { setBusy(false); }
      return;
    }

    if (mode === 'confirm_purge') {
      push('user', value);
      setMode('idle');
      if (value.trim() !== 'PURGE') { push('dim', 'გაუქმდა. არაფერი წაშლილა.'); return; }
      setBusy(true);
      try {
        const res = await emitWithAck<undefined, Res<{ purged: boolean }>>('mars:purge');
        if ('ok' in res && res.ok && res.data.purged) {
          setSubject(null);
          push('sys', 'ჩანაწერი წაშლილია. შენ აღარ ხარ არქივში.');
          sfx.glitch();
        } else push('err', 'PURGE FAILED');
      } catch { push('err', 'CONNECTION LOST'); }
      finally { setBusy(false); }
      return;
    }

    // Normal command line.
    push('user', `> ${value}`);
    if (value.trim()) {
      history.current = [value, ...history.current].slice(0, 40);
      histIdx.current = -1;
    }
    await runCommand(value);
  }, [busy, input, mode, limits, push, printSubject, runCommand]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); void submit(); return; }
    // Command history, but not while composing a manifest — up-arrow there
    // should move the caret, not replace what you are writing.
    if (mode === 'idle' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      if (history.current.length === 0) return;
      const dir = e.key === 'ArrowUp' ? 1 : -1;
      const next = Math.min(history.current.length - 1, Math.max(-1, histIdx.current + dir));
      histIdx.current = next;
      setInput(next === -1 ? '' : history.current[next]);
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    sfx.key();
  };

  const prompt = mode === 'ask_designation' ? 'DESIGNATION:'
    : mode === 'ask_manifest' ? 'MANIFEST:'
      : mode === 'confirm_purge' ? 'CONFIRM:'
        : '>';

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ background: '#01060a' }}
    >
      <MatrixRain />

      {/* CRT treatment. All decorative, all pointer-events-none. */}
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 120% 90% at 50% 50%, rgba(0,255,120,0.07) 0%, transparent 60%)',
      }} />
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{
        // Scanlines. 3px period keeps them visible on a phone without moiré.
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.34) 0px, rgba(0,0,0,0.34) 1px, transparent 1px, transparent 3px)',
        mixBlendMode: 'multiply',
      }} />
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{
        // Vignette + corner darkening: the tube edge.
        boxShadow: 'inset 0 0 140px 30px rgba(0,0,0,0.85)',
      }} />
      {glitching && (
        <div aria-hidden className="absolute inset-0 pointer-events-none" style={{
          background: 'linear-gradient(0deg, transparent 30%, rgba(0,255,140,0.16) 45%, rgba(255,0,90,0.12) 55%, transparent 70%)',
          transform: 'translateY(-6px)',
        }} />
      )}

      {/* Header */}
      <div className="relative z-10 flex items-center gap-2 px-4 py-2.5 shrink-0"
        style={{ borderBottom: '1px solid rgba(57,255,106,0.22)', background: 'rgba(0,12,6,0.55)' }}>
        <span className="font-mono text-[13px] font-bold tracking-[0.2em]" style={{ color: '#39ff6a', textShadow: '0 0 10px rgba(57,255,106,0.6)' }}>
          M.A.R.S.
        </span>
        <span className="font-mono text-[10px] tracking-[0.12em] hidden sm:inline" style={{ color: 'rgba(57,255,106,0.45)' }}>
          MANKIND&apos;S AUTOMATED REALITY SYSTEM
        </span>
        {subject && (
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded ml-1"
            style={{ border: '1px solid rgba(255,212,90,0.35)', color: '#ffd45a' }}>
            #{subject.code}
          </span>
        )}
        <span className="ml-auto font-mono text-[10px]" style={{ color: 'rgba(57,255,106,0.4)' }}>
          {stats ? `${stats.total} SUBJ` : '—'}
        </span>
        <button onClick={onClose} aria-label="დახურვა"
          className="font-mono text-[12px] px-2 py-1 rounded transition-colors"
          style={{ border: '1px solid rgba(57,255,106,0.25)', color: 'rgba(57,255,106,0.75)' }}>
          ✕
        </button>
      </div>

      {/* Transcript */}
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        className="relative z-10 flex-1 overflow-y-auto px-4 py-3 font-mono"
        style={{ fontSize: 13, lineHeight: 1.55, WebkitOverflowScrolling: 'touch' }}
        onClick={() => inputRef.current?.focus()}
      >
        {lines.map(l => (
          <div key={l.id} style={{
            color: KIND_COLOR[l.kind],
            textShadow: reduced ? undefined : `0 0 8px ${KIND_COLOR[l.kind]}44`,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {l.kind === 'arch' && <span style={{ opacity: 0.55 }}>ARCHITECT ▸ </span>}
            {l.text || ' '}
          </div>
        ))}
        {busy && <div style={{ color: KIND_COLOR.dim }}>▚ დამუშავება…</div>}
      </div>

      {/* Input */}
      <div className="relative z-10 px-3 py-2.5 shrink-0"
        style={{ borderTop: '1px solid rgba(57,255,106,0.22)', background: 'rgba(0,12,6,0.6)' }}>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[13px] shrink-0" style={{ color: '#ffd45a' }}>{prompt}</span>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value.slice(0, mode === 'ask_manifest' ? limits.manifestMax : 400))}
            onKeyDown={onKeyDown}
            disabled={!booted}
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="ბრძანების ველი"
            placeholder={mode === 'ask_manifest' ? 'ვინ ხარ, საკუთარი სიტყვებით…' : booted ? 'help' : 'იტვირთება…'}
            className="flex-1 min-w-0 bg-transparent outline-none font-mono text-[13px]"
            style={{ color: '#d9ffe4', caretColor: '#39ff6a' }}
          />
          <button
            onClick={() => void submit()}
            disabled={busy || !booted}
            className="font-mono text-[11px] px-2.5 py-1 rounded shrink-0 transition-all active:scale-95 disabled:opacity-40"
            style={{ border: '1px solid rgba(57,255,106,0.35)', background: 'rgba(57,255,106,0.10)', color: '#39ff6a' }}
          >
            ENTER
          </button>
        </div>
        {mode === 'ask_manifest' && (
          <p className="font-mono text-[10px] mt-1" style={{ color: input.length < limits.manifestMin ? 'rgba(255,95,109,0.8)' : 'rgba(57,255,106,0.5)' }}>
            {input.length}/{limits.manifestMax} · მინიმუმი {limits.manifestMin}
          </p>
        )}
      </div>
    </motion.div>
  );
}

export default MarsTerminal;
