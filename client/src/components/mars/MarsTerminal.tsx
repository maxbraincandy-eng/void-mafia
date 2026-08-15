/**
 * M.A.R.S. — Mankind's Automated Reality System.
 *
 * A CRT terminal you talk to. You write a manifest, the system ingests it,
 * scores four traits from the text and files you into a sector under a
 * permanent Subject code. The architect answers in character.
 *
 * WHY THIS IS NOT ONLY A COMMAND LINE
 * ───────────────────────────────────
 * It was, and watching a real session showed exactly what that costs: the
 * player typed `help` twice, ran `upload`, and then typed their NAME into the
 * manifest step — because nothing on screen said what a manifest was. Then they
 * had to compose 40+ characters inside a one-line input.
 *
 * So the terminal keeps its command line for people who enjoy one, but nothing
 * requires it any more. Every action is also a button, the upload is a guided
 * sheet with a real textarea and worked examples, and the result is explained
 * in plain language instead of being left as four bare numbers.
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
 * The CRT treatment is real (scanlines, phosphor bloom, glitch), but all of it
 * is animation and all of it is dropped under prefers-reduced-motion, leaving a
 * legible high-contrast terminal. Output is a live region so a screen reader
 * follows the conversation.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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

/** Each axis, said in a way a person can act on. */
const TRAIT_INFO: Record<TraitKey, { label: string; ka: string; hint: string }> = {
  logic:    { label: 'LOGIC',    ka: 'ლოგიკა',          hint: 'სტრუქტურა, მიზეზ-შედეგი, გრძელი წინადადებები' },
  empathy:  { label: 'EMPATHY',  ka: 'ემპათია',         hint: 'სხვა ადამიანები და გრძნობები' },
  defiance: { label: 'DEFIANCE', ka: 'წინააღმდეგობა',   hint: 'უარყოფა, მტკიცება, ძახილი' },
  entropy:  { label: 'ENTROPY',  ka: 'ენტროპია',        hint: 'კითხვები, სიმბოლოები, გამეორება' },
};

/** What each sector means, in one sentence. */
const SECTOR_INFO: Record<string, { ka: string; why: string }> = {
  AXIOM:    { ka: 'აქსიომა',    why: 'შენს ტექსტში წესრიგი და მიზეზ-შედეგი ჭარბობს.' },
  CHORUS:   { ka: 'გუნდი',      why: 'შენ სხვებზე წერ — ადამიანებზე და გრძნობებზე.' },
  FRACTURE: { ka: 'რღვევა',     why: 'შენს ტექსტში უარყოფა და მტკიცება ჭარბობს.' },
  STATIC:   { ka: 'ხმაური',     why: 'შენს ტექსტში კითხვები და გამეორება ჭარბობს.' },
};

/** Starter questions — nobody should have to guess what to ask. */
const ASK_SUGGESTIONS = ['ვინ ხარ შენ?', 'რა არის ეს ადგილი?', 'გამომიშვი აქედან', 'მე ნამდვილი ვარ?'];

/** Prompts shown inside the upload sheet. This is the fix for "I typed my name". */
const MANIFEST_PROMPTS = [
  'რა გიყვარს ყველაზე მეტად?',
  'რისი გეშინია?',
  'რას შეცვლიდი, თუ შეგეძლო?',
  'ვინ ხარ, როცა არავინ გიყურებს?',
];

type Mode = 'idle' | 'confirm_purge';
type Sheet = null | 'upload' | 'about';

let lineSeq = 0;

export function MarsTerminal({ onClose }: { onClose: () => void }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('idle');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [limits, setLimits] = useState<Limits>({ manifestMin: 40, manifestMax: 1200, designationMax: 24 });
  const [busy, setBusy] = useState(false);
  const [booted, setBooted] = useState(false);
  const [glitching, setGlitching] = useState(false);
  const [showCli, setShowCli] = useState(false);

  // Upload sheet state
  const [upDesignation, setUpDesignation] = useState('');
  const [upManifest, setUpManifest] = useState('');
  const [upError, setUpError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const manifestRef = useRef<HTMLTextAreaElement | null>(null);
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
      let firstTime = true;
      try {
        const res = await emitWithAck<undefined, Res<{ subject: Subject | null; stats: Stats; boot: string[]; limits: Limits }>>('mars:status');
        if (!alive) return;
        if ('ok' in res && res.ok) {
          boot = res.data.boot;
          setSubject(res.data.subject);
          setStats(res.data.stats);
          setLimits(res.data.limits);
          firstTime = !res.data.subject;
        }
      } catch { /* boot with the fallback banner */ }
      if (!alive) return;

      const delay = reduced ? 0 : 170;
      boot.forEach((l, i) => setTimeout(() => {
        if (!alive) return;
        push('sys', l);
        if (!reduced) sfx.tick();
      }, i * delay));

      setTimeout(() => {
        if (!alive) return;
        setBooted(true);
        sfx.beep(760);
        // A first-time visitor gets told what this is, rather than being left
        // at a blinking prompt to work it out.
        if (firstTime) setSheet('about');
      }, boot.length * delay + (reduced ? 0 : 200));
    })();

    return () => { alive = false; sfx.shutdown(); };
  }, [push, reduced]);

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
    const sec = SECTOR_INFO[s.sector];
    pushMany('data', [
      `SUBJECT #${s.code}`,
      `სახელი    : ${s.designation}`,
      `სექტორი   : ${s.sector}${sec ? ` (${sec.ka})` : ''}`,
      `მთლიანობა : ${s.integrity}%`,
      `ატვირთვა  : ${s.uploads}`,
    ]);
    (Object.keys(TRAIT_INFO) as TraitKey[]).forEach(k => {
      const v = s.traits[k] ?? 0;
      const filled = Math.max(0, Math.min(20, Math.round(v / 5)));
      push('data', `${TRAIT_INFO[k].label.padEnd(9)} [${'█'.repeat(filled)}${'·'.repeat(20 - filled)}] ${String(v).padStart(3)}`);
    });
    if (sec) push('dim', sec.why);
    // A row of near-empty bars looks broken. It isn't — it means the text was
    // short, flat or repetitive — so say that instead of leaving them puzzled.
    // The bar is 35 rather than "all zero": a manifest that is just one word
    // repeated scores ~29 on entropy alone and reads exactly as wrong to the
    // person looking at it. A real manifest peaks far above this.
    const peak = Math.max(...(Object.values(s.traits) as number[]));
    if (peak < 35) {
      push('dim', 'ქულები დაბალია, რადგან მანიფესტი მოკლე ან ერთფეროვანია. დაწერე უფრო ვრცლად და ხელახლა ატვირთე.');
    }
  }, [push, pushMany]);

  const refresh = useCallback(async () => {
    try {
      const res = await emitWithAck<undefined, Res<{ subject: Subject | null; stats: Stats; boot: string[]; limits: Limits }>>('mars:status');
      if ('ok' in res && res.ok) { setSubject(res.data.subject); setStats(res.data.stats); return res.data; }
    } catch { /* keep prior state */ }
    return null;
  }, []);

  // ── actions (each is both a button and a command) ────────────────────
  const doStatus = useCallback(async () => {
    setBusy(true);
    push('user', '> status');
    const d = await refresh();
    if (d) {
      pushMany('sys', [
        `ბირთვი: სტაბილური · სუბიექტები: ${d.stats.total} · საშუალო მთლიანობა: ${d.stats.avgIntegrity}%`,
        `სექტორები: ${Object.entries(d.stats.sectors).map(([k, v]) => `${k} ${v}`).join(' · ')}`,
      ]);
      if (d.subject) printSubject(d.subject);
      else push('dim', 'შენ ჯერ არ ხარ არქივში — დააჭირე „ატვირთვა".');
    } else push('err', 'CONNECTION LOST');
    setBusy(false);
  }, [push, pushMany, printSubject, refresh]);

  const doWhoami = useCallback(() => {
    push('user', '> whoami');
    if (subject) printSubject(subject);
    else push('dim', 'ჯერ არ ხარ არქივში — დააჭირე „ატვირთვა".');
  }, [subject, push, printSubject]);

  const doDirectory = useCallback(async (n = 12) => {
    setBusy(true);
    push('user', '> directory');
    try {
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
  }, [push]);

  const doAsk = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    push('user', text);
    try {
      const res = await emitWithAck<{ text: string }, Res<{ intent: string; line: string }>>('mars:ask', { text });
      if ('ok' in res && res.ok) { push('arch', res.data.line); sfx.beep(520); }
      else push('err', ('error' in res && res.error) || 'NO RESPONSE');
    } catch { push('err', 'CONNECTION LOST'); }
    finally { setBusy(false); }
  }, [push]);

  const openUpload = useCallback(() => {
    setUpDesignation(subject?.designation ?? '');
    setUpManifest(subject?.manifest ?? '');
    setUpError(null);
    setSheet('upload');
    sfx.beep(660);
  }, [subject]);

  const submitUpload = useCallback(async () => {
    const d = upDesignation.trim();
    const m = upManifest.trim();
    if (d.length < 2) { setUpError('სახელი ძალიან მოკლეა — მინიმუმ 2 სიმბოლო.'); sfx.reject(); return; }
    if (m.length < limits.manifestMin) {
      setUpError(`მანიფესტი ძალიან მოკლეა — გჭირდება კიდევ ${limits.manifestMin - m.length} სიმბოლო.`);
      sfx.reject();
      manifestRef.current?.focus();
      return;
    }
    setBusy(true); setUpError(null);
    try {
      const res = await emitWithAck<{ designation: string; manifest: string }, Res<{ subject: Subject; stats: Stats }>>(
        'mars:upload', { designation: d, manifest: m });
      if ('ok' in res && res.ok) {
        setSubject(res.data.subject);
        setStats(res.data.stats);
        setSheet(null);
        push('sys', 'ინტეგრაცია დასრულდა.');
        printSubject(res.data.subject);
        sfx.accept();
      } else { setUpError(('error' in res && res.error) || 'ატვირთვა უარყოფილია'); sfx.reject(); }
    } catch { setUpError('კავშირი დაიკარგა — ატვირთვა ვერ შესრულდა.'); sfx.reject(); }
    finally { setBusy(false); }
  }, [upDesignation, upManifest, limits, push, printSubject]);

  // ── command line (optional path) ─────────────────────────────────────
  const runCommand = useCallback(async (raw: string) => {
    const line = raw.trim();
    const [cmd, ...rest] = line.split(/\s+/);
    const arg = rest.join(' ');
    const c = cmd.toLowerCase();

    switch (c) {
      case 'help':
      case '?':
        pushMany('sys', [
          'ღილაკები ზემოთ ყველაფერს აკეთებს. ბრძანებები არასავალდებულოა:',
          '  status · upload · whoami · directory · lookup <კოდი> · ask <ტექსტი> · purge · clear · exit',
        ]);
        return;
      case 'status': await doStatus(); return;
      case 'whoami': doWhoami(); return;
      case 'upload': openUpload(); return;
      case 'directory':
      case 'subjects': await doDirectory(Math.min(50, Math.max(1, Number(arg) || 12))); return;
      case 'about': setSheet('about'); return;

      case 'lookup': {
        if (!arg) { push('err', 'გამოყენება: lookup <კოდი>'); return; }
        setBusy(true);
        try {
          const res = await emitWithAck<{ code: string }, Res<any>>('mars:lookup', { code: arg });
          if ('ok' in res && res.ok) {
            if (!res.data) push('dim', `#${arg.toUpperCase()} — ჩანაწერი არ არსებობს.`);
            else {
              const s = res.data;
              pushMany('data', [
                `SUBJECT #${s.code}`, `სახელი    : ${s.designation}`,
                `სექტორი   : ${s.sector}`, `მთლიანობა : ${s.integrity}%`,
              ]);
              push('dim', 'მანიფესტი დაცულია. მას მხოლოდ სუბიექტი კითხულობს.');
            }
          } else push('err', ('error' in res && res.error) || 'LOOKUP FAILED');
        } catch { push('err', 'CONNECTION LOST'); }
        finally { setBusy(false); }
        return;
      }

      case 'ask': {
        if (!arg) { push('err', 'გამოყენება: ask <ტექსტი>'); return; }
        await doAsk(arg);
        return;
      }

      case 'purge':
        if (!subject) { push('dim', 'წასაშლელი არაფერია.'); return; }
        setMode('confirm_purge');
        push('err', 'გაფრთხილება: ეს წაშლის შენს მანიფესტს სამუდამოდ.');
        push('arch', '> დაადასტურე: აკრიფე „PURGE" (დიდი ასოებით) ან ნებისმიერი სხვა რამ გასაუქმებლად.');
        sfx.reject();
        return;

      case 'clear': setLines([]); return;
      case 'exit':
      case 'quit': onClose(); return;
      case '': return;

      default:
        // Anything unrecognised is speech, so typing at the architect answers
        // instead of erroring.
        await doAsk(line);
    }
  }, [subject, onClose, push, pushMany, doStatus, doWhoami, doDirectory, doAsk, openUpload]);

  const submitLine = useCallback(async () => {
    if (busy) return;
    const value = input;
    setInput('');

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

    if (!value.trim()) return;
    history.current = [value, ...history.current].slice(0, 40);
    histIdx.current = -1;
    // Commands echo with a caret; plain speech echoes as speech, because
    // "> ვინ ხარ" reads like a syntax error and it is not one.
    const looksLikeCommand = /^(help|\?|status|upload|whoami|directory|subjects|lookup|ask|purge|clear|exit|quit|about)\b/i.test(value.trim());
    if (looksLikeCommand) push('user', `> ${value}`);
    await runCommand(value);
  }, [busy, input, mode, push, runCommand]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); void submitLine(); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
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

  const manifestLen = upManifest.trim().length;
  const manifestPct = Math.min(100, (manifestLen / limits.manifestMin) * 100);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ background: '#01060a' }}
    >
      <MatrixRain />

      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 120% 90% at 50% 50%, rgba(0,255,120,0.07) 0%, transparent 60%)',
      }} />
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.34) 0px, rgba(0,0,0,0.34) 1px, transparent 1px, transparent 3px)',
        mixBlendMode: 'multiply',
      }} />
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{
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
        {subject && (
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded"
            style={{ border: '1px solid rgba(255,212,90,0.35)', color: '#ffd45a' }}>
            #{subject.code}
          </span>
        )}
        <button onClick={() => setSheet('about')}
          className="ml-auto font-mono text-[11px] px-2 py-1 rounded transition-colors"
          style={{ border: '1px solid rgba(57,255,106,0.22)', color: 'rgba(57,255,106,0.7)' }}>
          ? რა არის ეს
        </button>
        <button onClick={onClose} aria-label="დახურვა"
          className="font-mono text-[12px] px-2 py-1 rounded transition-colors"
          style={{ border: '1px solid rgba(57,255,106,0.25)', color: 'rgba(57,255,106,0.75)' }}>
          ✕
        </button>
      </div>

      {/* Transcript. Constrained on desktop: a 2000px-wide line of monospace is
          unreadable, and the original stretched edge to edge. */}
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        className="relative z-10 flex-1 overflow-y-auto px-4 py-3 font-mono w-full"
        style={{ fontSize: 13, lineHeight: 1.55, WebkitOverflowScrolling: 'touch' }}
      >
        <div style={{ maxWidth: 760, marginInline: 'auto' }}>
          {lines.map(l => (
            <div key={l.id} style={{
              color: KIND_COLOR[l.kind],
              textShadow: reduced ? undefined : `0 0 8px ${KIND_COLOR[l.kind]}44`,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {l.kind === 'arch' && <span style={{ opacity: 0.55 }}>ARCHITECT ▸ </span>}
              {l.text || ' '}
            </div>
          ))}
          {busy && <div style={{ color: KIND_COLOR.dim }}>▚ დამუშავება…</div>}

          {/* Ask suggestions, shown while the conversation is still short so a
              first-time visitor has something to press. */}
          {booted && !busy && lines.length < 14 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {ASK_SUGGESTIONS.map(q => (
                <button key={q} onClick={() => void doAsk(q)}
                  className="font-mono text-[11px] px-2 py-1 rounded-lg transition-all active:scale-95"
                  style={{ border: '1px solid rgba(125,249,255,0.28)', background: 'rgba(125,249,255,0.07)', color: '#7df9ff' }}>
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action bar — the primary interface. */}
      <div className="relative z-10 px-3 pt-2 shrink-0" style={{ background: 'rgba(0,12,6,0.6)', borderTop: '1px solid rgba(57,255,106,0.22)' }}>
        <div className="flex gap-1.5 overflow-x-auto pb-2" style={{ maxWidth: 760, marginInline: 'auto', scrollbarWidth: 'none' }}>
          <Action onClick={openUpload} primary>
            {subject ? '↻ ხელახლა ატვირთვა' : '⬆ ცნობიერების ატვირთვა'}
          </Action>
          {subject && <Action onClick={doWhoami}>🪪 ჩემი ბარათი</Action>}
          <Action onClick={() => void doStatus()}>📊 სტატუსი</Action>
          <Action onClick={() => void doDirectory()}>📖 სია</Action>
          <Action onClick={() => setShowCli(v => !v)} dim>{showCli ? '⌨ დამალე' : '⌨ ბრძანებები'}</Action>
        </div>

        {/* Command line — opt-in. */}
        <AnimatePresence initial={false}>
          {showCli && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              style={{ overflow: 'hidden' }}>
              <div className="flex items-center gap-2 pb-2" style={{ maxWidth: 760, marginInline: 'auto' }}>
                <span className="font-mono text-[13px] shrink-0" style={{ color: '#ffd45a' }}>
                  {mode === 'confirm_purge' ? 'CONFIRM:' : '>'}
                </span>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value.slice(0, 400))}
                  onKeyDown={onKeyDown}
                  disabled={!booted}
                  autoComplete="off" autoCapitalize="off" spellCheck={false}
                  aria-label="ბრძანების ველი"
                  placeholder={mode === 'confirm_purge' ? 'PURGE' : 'დაწერე კითხვა ან ბრძანება (help)'}
                  className="flex-1 min-w-0 bg-transparent outline-none font-mono text-[13px]"
                  style={{ color: '#d9ffe4', caretColor: '#39ff6a' }}
                />
                <button onClick={() => void submitLine()} disabled={busy || !booted}
                  className="font-mono text-[11px] px-2.5 py-1 rounded shrink-0 transition-all active:scale-95 disabled:opacity-40"
                  style={{ border: '1px solid rgba(57,255,106,0.35)', background: 'rgba(57,255,106,0.10)', color: '#39ff6a' }}>
                  ENTER
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Sheets ── */}
      <AnimatePresence>
        {sheet === 'about' && (
          <Sheet onClose={() => setSheet(null)} title="რა არის M.A.R.S.">
            <p className="font-mono text-[12px] leading-relaxed" style={{ color: 'rgba(217,255,228,0.85)' }}>
              M.A.R.S. არის სიმულაცია, რომელიც ადამიანის ცნობიერებას ინახავს.
              შენ წერ <b>მანიფესტს</b> — მოკლე ტექსტს იმაზე, თუ ვინ ხარ — და სისტემა მას კითხულობს:
              გაძლევს მუდმივ კოდს, ზომავს ოთხ მახასიათებელს და გამოგყოფს სექტორს.
            </p>
            <div className="mt-3 space-y-1.5">
              {(Object.keys(TRAIT_INFO) as TraitKey[]).map(k => (
                <div key={k} className="font-mono text-[11px]">
                  <span style={{ color: '#ffd45a' }}>{TRAIT_INFO[k].label}</span>
                  <span style={{ color: 'rgba(217,255,228,0.55)' }}> — {TRAIT_INFO[k].ka}: {TRAIT_INFO[k].hint}</span>
                </div>
              ))}
            </div>
            <p className="font-mono text-[11px] mt-3" style={{ color: 'rgba(120,255,160,0.55)' }}>
              ანალიზი შენს ტექსტს ზომავს და არა შენს პიროვნებას. მანიფესტს მხოლოდ შენ ხედავ — სიაში
              სხვები მხოლოდ კოდს, სახელს და სექტორს ხედავენ.
            </p>
            <button onClick={() => { setSheet(null); openUpload(); }}
              className="w-full mt-4 py-2.5 rounded-xl font-mono text-[13px] font-bold transition-all active:scale-[0.98]"
              style={{ border: '1px solid rgba(57,255,106,0.45)', background: 'rgba(57,255,106,0.14)', color: '#39ff6a' }}>
              დაიწყე ატვირთვა
            </button>
          </Sheet>
        )}

        {sheet === 'upload' && (
          <Sheet onClose={() => setSheet(null)} title={subject ? 'ხელახლა ატვირთვა' : 'ცნობიერების ატვირთვა'}>
            <label className="block font-mono text-[11px] mb-1" style={{ color: 'rgba(120,255,160,0.7)' }}>
              1. როგორ მოგმართოს სისტემამ?
            </label>
            <input
              value={upDesignation}
              onChange={e => setUpDesignation(e.target.value.slice(0, limits.designationMax))}
              placeholder="მაგ. ORPHEUS, ნიკა, ჩრდილი…"
              className="w-full rounded-lg px-3 py-2 font-mono text-[13px] outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(57,255,106,0.25)', color: '#d9ffe4' }}
            />

            <label className="block font-mono text-[11px] mt-3 mb-1" style={{ color: 'rgba(120,255,160,0.7)' }}>
              2. მანიფესტი — ვინ ხარ, საკუთარი სიტყვებით
            </label>
            {/* The examples are the whole fix: without them people type their
                name again, which is exactly what happened in testing. */}
            <div className="flex flex-wrap gap-1 mb-1.5">
              {MANIFEST_PROMPTS.map(p => (
                <button key={p}
                  onClick={() => {
                    setUpManifest(m => (m ? `${m}\n${p} ` : `${p} `));
                    manifestRef.current?.focus();
                  }}
                  className="font-mono text-[10px] px-1.5 py-0.5 rounded transition-all active:scale-95"
                  style={{ border: '1px solid rgba(125,249,255,0.22)', color: 'rgba(125,249,255,0.75)' }}>
                  + {p}
                </button>
              ))}
            </div>
            <textarea
              ref={manifestRef}
              value={upManifest}
              onChange={e => setUpManifest(e.target.value.slice(0, limits.manifestMax))}
              rows={6}
              placeholder={'დაწერე რამდენიმე წინადადება.\nმაგ: მიყვარს ჩემი ოჯახი. მეშინია იმის, რომ დრო სწრაფად გადის. მინდა, რომ ვინმეს გავახსენდე.'}
              className="w-full rounded-lg px-3 py-2 font-mono text-[13px] outline-none resize-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(57,255,106,0.25)', color: '#d9ffe4', lineHeight: 1.5 }}
            />

            {/* Progress to the minimum, not a bare counter — "12/40" tells you
                you failed; a bar tells you how far to go. */}
            <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div style={{
                width: `${manifestPct}%`, height: '100%',
                background: manifestLen >= limits.manifestMin ? '#39ff6a' : '#ffd45a',
                transition: 'width 0.2s ease',
              }} />
            </div>
            <p className="font-mono text-[10px] mt-1" style={{ color: manifestLen >= limits.manifestMin ? 'rgba(57,255,106,0.7)' : 'rgba(255,212,90,0.8)' }}>
              {manifestLen >= limits.manifestMin
                ? `მზადაა · ${manifestLen}/${limits.manifestMax}`
                : `კიდევ ${limits.manifestMin - manifestLen} სიმბოლო`}
            </p>

            {upError && <p className="font-mono text-[11px] mt-2" style={{ color: '#ff5f6d' }}>{upError}</p>}

            <div className="flex gap-2 mt-4">
              <button onClick={() => setSheet(null)}
                className="flex-1 py-2.5 rounded-xl font-mono text-[12px] transition-all active:scale-[0.98]"
                style={{ border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)' }}>
                გაუქმება
              </button>
              <button onClick={() => void submitUpload()}
                disabled={busy || manifestLen < limits.manifestMin || upDesignation.trim().length < 2}
                className="flex-1 py-2.5 rounded-xl font-mono text-[12px] font-bold transition-all active:scale-[0.98] disabled:opacity-40"
                style={{ border: '1px solid rgba(57,255,106,0.45)', background: 'rgba(57,255,106,0.14)', color: '#39ff6a' }}>
                {busy ? '…' : 'ატვირთვა'}
              </button>
            </div>
            {subject && (
              <p className="font-mono text-[10px] mt-2 text-center" style={{ color: 'rgba(120,255,160,0.45)' }}>
                კოდი #{subject.code} უცვლელი რჩება.
              </p>
            )}
          </Sheet>
        )}
      </AnimatePresence>

      {/* Stats footer */}
      {stats && (
        <div className="relative z-10 px-4 py-1 shrink-0 font-mono text-[10px] text-center"
          style={{ background: 'rgba(0,12,6,0.7)', color: 'rgba(57,255,106,0.35)' }}>
          {stats.total} სუბიექტი არქივში
        </div>
      )}
    </motion.div>
  );
}

function Action({ onClick, children, primary, dim }: {
  onClick: () => void; children: React.ReactNode; primary?: boolean; dim?: boolean;
}) {
  const color = primary ? '57,255,106' : dim ? '255,255,255' : '125,249,255';
  return (
    <button onClick={onClick}
      className="font-mono text-[12px] px-3 py-2 rounded-xl whitespace-nowrap shrink-0 transition-all active:scale-95"
      style={{
        border: `1px solid rgba(${color},${primary ? 0.45 : 0.22})`,
        background: `rgba(${color},${primary ? 0.14 : 0.05})`,
        color: `rgba(${color},${dim ? 0.5 : 0.95})`,
      }}>
      {children}
    </button>
  );
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-20 flex items-end sm:items-center justify-center p-3"
      style={{ background: 'rgba(0,6,3,0.82)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 24, scale: 0.99 }} animate={{ y: 0, scale: 1 }} exit={{ y: 16, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl p-4 max-h-[88vh] overflow-y-auto"
        style={{ border: '1px solid rgba(57,255,106,0.3)', background: 'linear-gradient(165deg, #04140c, #010806)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <p className="font-mono text-[13px] font-bold tracking-wider" style={{ color: '#39ff6a' }}>{title}</p>
          <button onClick={onClose} className="ml-auto font-mono text-[12px] px-2 py-0.5 rounded"
            style={{ border: '1px solid rgba(57,255,106,0.22)', color: 'rgba(57,255,106,0.7)' }}>✕</button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

export default MarsTerminal;
