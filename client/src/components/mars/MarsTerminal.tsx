/**
 * M.A.R.S. — Mankind's Automated Reality System.
 *
 * A graphical console with three tabs: your ID card, the public archive, and
 * the architect. You join by writing a short manifest; the system scores four
 * traits from that text, files you into a sector and issues a permanent
 * Subject code.
 *
 * WHY IT IS NOT A COMMAND LINE
 * ────────────────────────────
 * It was. A real production session showed the cost: the player typed `help`
 * twice, ran `upload`, then typed their NAME into the manifest step because
 * nothing said what a manifest was, and finally stared at a screen that was
 * 90% empty black with a paragraph of green text in the corner. Terminal
 * aesthetics are worth keeping; a terminal interface was not.
 *
 * The CRT treatment survives as decoration — scanlines, phosphor bloom, matrix
 * rain, a boot sequence — over an interface made of cards and buttons.
 *
 * WHAT LIVES WHERE
 * ────────────────
 * Nothing here decides anything. Trait scoring, sector assignment, subject
 * codes and every line the architect speaks come from the server. The fiction
 * only holds if re-uploading the same words gives the same verdict on every
 * device, and a modified client must not be able to award itself a profile.
 *
 * ACCESSIBILITY
 * ─────────────
 * All the CRT work is animation and all of it drops under
 * prefers-reduced-motion, leaving a legible high-contrast interface.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import type { Res } from '@/types/index';
import { MatrixRain } from './MatrixRain';
import { MarsCard } from './MarsCard';
import { MarsUploadSheet } from './MarsUploadSheet';
import { sectorOf, SAMPLE_INFO, type DirEntry, type Limits, type MarsDoc, type SampleStatus, type Stats, type Subject } from './types';
import * as sfx from './sfx';

type Tab = 'card' | 'archive' | 'architect';
interface ChatMsg { id: number; from: 'me' | 'arch'; text: string }

const ASK_SUGGESTIONS = ['ვინ ხარ შენ?', 'მართლა დამაბრუნებ?', 'დნმ როგორ მოგაწოდო?', 'რა არის ეს ადგილი?', 'ჩემი ქულები'];

let msgSeq = 0;

export function MarsTerminal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('card');
  const [subject, setSubject] = useState<Subject | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [limits, setLimits] = useState<Limits>({
    manifestMin: 40, manifestMax: 1200, designationMax: 24, docsMax: 5, docBytesMax: 9_000_000,
    letterMax: 4000, restoreNoteMax: 1500, kinMax: 200, sampleNoteMax: 400,
  });
  const [dir, setDir] = useState<DirEntry[] | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(true);
  const [bootLines, setBootLines] = useState<string[]>([]);
  const [sheet, setSheet] = useState<null | 'upload' | 'about' | 'purge'>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [glitching, setGlitching] = useState(false);

  const chatRef = useRef<HTMLDivElement | null>(null);
  const reduced = useMemo(
    () => (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) ?? false,
    [],
  );

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(id);
  }, [toast]);

  // NOTE: no body scroll-lock here on purpose. globals.css already pins html
  // and body to `position: fixed; height: 100%; overflow: hidden` (to kill iOS
  // bounce), so the window never scrolls — the app scrolls inner containers.
  // Locking body would be dead code, and "restoring" a window scroll offset
  // that is always 0 would be worse than dead: it would look like it did
  // something. The container behind simply keeps its own scroll position,
  // which is why closing M.A.R.S. returns you exactly where you were.

  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat, busy]);

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

      const delay = reduced ? 0 : 150;
      boot.forEach((l, i) => setTimeout(() => {
        if (!alive) return;
        setBootLines(p => [...p, l]);
        if (!reduced) sfx.tick();
      }, i * delay));

      setTimeout(() => {
        if (!alive) return;
        setBooting(false);
        sfx.beep(760);
        if (firstTime) setSheet('about');
      }, boot.length * delay + (reduced ? 0 : 420));
    })();

    return () => { alive = false; sfx.shutdown(); };
  }, [reduced]);

  useEffect(() => {
    if (reduced) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setGlitching(true);
        sfx.glitch();
        setTimeout(() => setGlitching(false), 130);
        schedule();
      }, 11000 + Math.random() * 14000);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [reduced]);

  // ── data ─────────────────────────────────────────────────────────────
  const loadArchive = useCallback(async () => {
    setBusy(true);
    try {
      const res = await emitWithAck<{ limit: number }, Res<DirEntry[]>>('mars:directory', { limit: 30 });
      if ('ok' in res && res.ok) setDir(res.data);
      else setDir([]);
    } catch { setDir([]); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => {
    if (tab === 'archive' && dir === null) void loadArchive();
  }, [tab, dir, loadArchive]);

  const doUpload = useCallback(async (v: {
    designation: string; manifest: string; portrait: string | null; docs: MarsDoc[];
    letter: string; restoreNote: string; sampleStatus: SampleStatus; sampleNote: string; kin: string;
  }) => {
    setBusy(true);
    try {
      const res = await emitWithAck<typeof v, Res<{ subject: Subject; stats: Stats }>>('mars:upload', v);
      if ('ok' in res && res.ok) {
        setSubject(res.data.subject);
        setStats(res.data.stats);
        setDir(null);                 // the archive now has a new/updated row
        setSheet(null);
        setTab('card');
        setToast('ჩანაწერი დაცულია.');
        sfx.accept();
      } else { setToast(('error' in res && res.error) || 'ატვირთვა უარყოფილია'); sfx.reject(); }
    } catch { setToast('კავშირი დაიკარგა.'); sfx.reject(); }
    finally { setBusy(false); }
  }, []);

  const doPurge = useCallback(async () => {
    setBusy(true);
    try {
      const res = await emitWithAck<undefined, Res<{ purged: boolean }>>('mars:purge');
      if ('ok' in res && res.ok && res.data.purged) {
        setSubject(null); setDir(null); setSheet(null);
        setToast('ჩანაწერი წაშლილია.');
        sfx.glitch();
      } else setToast('წაშლა ვერ შესრულდა.');
    } catch { setToast('კავშირი დაიკარგა.'); }
    finally { setBusy(false); }
  }, []);

  const ask = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setChat(c => [...c, { id: ++msgSeq, from: 'me', text: t }]);
    setChatInput('');
    setBusy(true);
    try {
      const res = await emitWithAck<{ text: string }, Res<{ intent: string; line: string }>>('mars:ask', { text: t });
      if ('ok' in res && res.ok) { setChat(c => [...c, { id: ++msgSeq, from: 'arch', text: res.data.line }]); sfx.beep(520); }
      else setChat(c => [...c, { id: ++msgSeq, from: 'arch', text: 'კავშირი არასტაბილურია.' }]);
    } catch { setChat(c => [...c, { id: ++msgSeq, from: 'arch', text: 'კავშირი დაიკარგა.' }]); }
    finally { setBusy(false); }
  }, [busy]);

  const sec = subject ? sectorOf(subject.sector) : null;

  // PORTALLED TO <body> ON PURPOSE.
  // This renders from inside GamesPage, whose motion.div animates `y` — and an
  // ancestor with a transform makes `position: fixed` resolve against THAT
  // element instead of the viewport. The console then inherited the page's
  // scroll position (it opened halfway down), sat above the app's bottom nav
  // instead of over it, and pushed its own tab bar below the fold. A portal to
  // body escapes the transformed ancestor, so `fixed` means fixed again.
  //
  // Height is 100dvh, not 100vh: on mobile Safari 100vh is the tallest possible
  // viewport, so with the URL bar showing, the tab bar would sit under it.
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 flex flex-col"
      style={{ background: '#01060a', height: '100dvh', zIndex: 2147483000 }}
    >
      <MatrixRain opacity={0.11} />
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 120% 90% at 50% 40%, rgba(0,255,120,0.07) 0%, transparent 62%)',
      }} />
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.30) 0px, rgba(0,0,0,0.30) 1px, transparent 1px, transparent 3px)',
        mixBlendMode: 'multiply',
      }} />
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 140px 30px rgba(0,0,0,0.85)' }} />
      {glitching && (
        <div aria-hidden className="absolute inset-0 pointer-events-none" style={{
          background: 'linear-gradient(0deg, transparent 30%, rgba(0,255,140,0.14) 45%, rgba(255,0,90,0.10) 55%, transparent 70%)',
          transform: 'translateY(-6px)',
        }} />
      )}

      {/* Header */}
      <div className="relative z-10 flex items-center gap-2 px-4 py-2.5 shrink-0"
        style={{ borderBottom: '1px solid rgba(57,255,106,0.2)', background: 'rgba(0,12,6,0.6)' }}>
        <span className="font-mono text-[13px] font-bold tracking-[0.2em]" style={{ color: '#39ff6a', textShadow: '0 0 10px rgba(57,255,106,0.6)' }}>
          M.A.R.S.
        </span>
        {subject && sec && (
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded"
            style={{ border: `1px solid ${sec.color}55`, color: sec.color }}>
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
          style={{ border: '1px solid rgba(57,255,106,0.25)', color: 'rgba(57,255,106,0.75)' }}>✕</button>
      </div>

      {/* Boot overlay */}
      <AnimatePresence>
        {booting && (
          <motion.div exit={{ opacity: 0 }} transition={{ duration: 0.4 }}
            className="absolute inset-0 z-20 flex items-center justify-center px-6" style={{ background: '#01060a' }}>
            <div className="font-mono text-[12px] leading-relaxed" style={{ color: '#39ff6a', maxWidth: 560 }}>
              {bootLines.map((l, i) => <div key={i} style={{ textShadow: '0 0 8px rgba(57,255,106,0.4)' }}>{l}</div>)}
              <span className="inline-block mt-1" style={{ animation: reduced ? undefined : 'vm-blink 1s steps(2) infinite' }}>▍</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Body */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 py-4" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div style={{ maxWidth: 620, marginInline: 'auto' }}>

          {tab === 'card' && (
            subject ? (
              <MarsCard subject={subject} onEdit={() => setSheet('upload')} onPurge={() => setSheet('purge')} />
            ) : (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl p-5 text-center"
                style={{ border: '1px solid rgba(57,255,106,0.3)', background: 'linear-gradient(160deg, rgba(57,255,106,0.07), rgba(1,10,6,0.85))' }}>
                <div className="text-[38px] mb-1">🧬</div>
                <p className="font-display font-bold text-[17px] text-white">შენ ჯერ არ ხარ არქივში</p>
                <p className="font-mono text-[12px] mt-2 leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  M.A.R.S. ინახავს იმას, რაც ადამიანისგან რჩება — მის სიტყვებს, სახეს, დოკუმენტებს.
                  თუ ოდესმე ტექნოლოგია იმ დონეს მიაღწევს, ეს ჩანაწერი იქნება საწყისი წერტილი.
                </p>
                <button onClick={() => setSheet('upload')}
                  className="w-full mt-4 py-3 rounded-xl font-mono text-[14px] font-bold transition-all active:scale-[0.98]"
                  style={{ border: '1px solid rgba(57,255,106,0.5)', background: 'rgba(57,255,106,0.16)', color: '#39ff6a' }}>
                  დაიცავი შენი ჩანაწერი
                </button>
                <button onClick={() => setSheet('about')}
                  className="mt-2 font-mono text-[11px]" style={{ color: 'rgba(125,249,255,0.7)' }}>
                  როგორ მუშაობს?
                </button>
              </motion.div>
            )
          )}

          {tab === 'archive' && (
            <div>
              {stats && (
                <div className="flex gap-2 mb-3">
                  {Object.entries(stats.sectors).map(([name, n]) => {
                    const s = sectorOf(name);
                    return (
                      <div key={name} className="flex-1 rounded-xl px-2 py-1.5 text-center"
                        style={{ border: `1px solid ${s.color}33`, background: `${s.color}0d` }}>
                        <p className="font-mono text-[13px] font-bold" style={{ color: s.color }}>{n}</p>
                        <p className="font-mono text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{name}</p>
                      </div>
                    );
                  })}
                </div>
              )}
              {dir === null && <p className="font-mono text-[12px] text-center py-8" style={{ color: 'rgba(57,255,106,0.4)' }}>იტვირთება…</p>}
              {dir?.length === 0 && (
                <div className="rounded-2xl p-6 text-center" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                  <p className="font-mono text-[12px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    არქივი ცარიელია. იყავი პირველი.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {dir?.map(e => {
                  const s = sectorOf(e.sector);
                  const mine = subject?.code === e.code;
                  return (
                    <div key={e.code} className="rounded-xl p-2.5 flex flex-col items-center text-center"
                      style={{
                        border: `1px solid ${mine ? s.color + '88' : s.color + '2e'}`,
                        background: mine ? `${s.color}14` : 'rgba(255,255,255,0.025)',
                      }}>
                      <div className="rounded-lg overflow-hidden mb-1.5" style={{ width: 52, height: 52, border: `1px solid ${s.color}44`, background: 'rgba(0,0,0,0.35)' }}>
                        {e.portrait
                          ? <img src={e.portrait} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center font-mono" style={{ color: `${s.color}66`, fontSize: 18 }}>
                              {e.designation.slice(0, 1).toUpperCase() || '?'}
                            </div>}
                      </div>
                      <p className="font-mono text-[10px]" style={{ color: `${s.color}aa` }}>#{e.code}</p>
                      <p className="font-mono text-[11px] text-white/85 truncate w-full">{e.designation}</p>
                      <p className="font-mono text-[9px] mt-0.5" style={{ color: s.color }}>{e.sector} · {e.integrity}%</p>
                      {/* Public signals only: that a sample is pledged and that a
                          letter exists. Never their contents. */}
                      {(e.sampleStatus !== 'none' || e.hasLetter) && (
                        <div className="flex gap-1 mt-1">
                          {e.sampleStatus !== 'none' && (
                            <span className="font-mono text-[9px] px-1 rounded" title={SAMPLE_INFO[e.sampleStatus].hint}
                              style={{ color: `rgb(${SAMPLE_INFO[e.sampleStatus].color})`, border: `1px solid rgba(${SAMPLE_INFO[e.sampleStatus].color},0.35)` }}>
                              🧬
                            </span>
                          )}
                          {e.hasLetter && (
                            <span className="font-mono text-[9px] px-1 rounded" title="დატოვა წერილი მომავალს"
                              style={{ color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.18)' }}>
                              ✉
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {dir && dir.length > 0 && (
                <p className="font-mono text-[10px] text-center mt-3" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  მანიფესტები დაცულია — მათ მხოლოდ ავტორი კითხულობს.
                </p>
              )}
            </div>
          )}

          {tab === 'architect' && (
            <div ref={chatRef}>
              {chat.length === 0 && (
                <div className="rounded-2xl p-4 mb-3" style={{ border: '1px solid rgba(125,249,255,0.22)', background: 'rgba(125,249,255,0.05)' }}>
                  <p className="font-mono text-[12px] leading-relaxed" style={{ color: 'rgba(217,255,228,0.8)' }}>
                    სისტემას მართავს <b>ს. კამილო</b> — არქიტექტორი. ჰკითხე აღდგენაზე, ნიმუშზე ან რაც გინდა.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                {chat.map(m => (
                  <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
                    <div className="rounded-2xl px-3 py-2 max-w-[85%]" style={{
                      border: m.from === 'me' ? '1px solid rgba(57,255,106,0.3)' : '1px solid rgba(125,249,255,0.3)',
                      background: m.from === 'me' ? 'rgba(57,255,106,0.10)' : 'rgba(125,249,255,0.08)',
                    }}>
                      {m.from === 'arch' && (
                        <p className="font-mono text-[9px] mb-0.5 tracking-wider" style={{ color: 'rgba(125,249,255,0.55)' }}>ARCHITECT</p>
                      )}
                      <p className="font-mono text-[12px] leading-relaxed" style={{ color: m.from === 'me' ? '#d9ffe4' : '#bfefff', whiteSpace: 'pre-wrap' }}>
                        {m.text}
                      </p>
                    </div>
                  </motion.div>
                ))}
                {busy && <p className="font-mono text-[11px]" style={{ color: 'rgba(125,249,255,0.5)' }}>▚ …</p>}
              </div>

              <div className="flex flex-wrap gap-1.5 mt-3">
                {ASK_SUGGESTIONS.map(q => (
                  <button key={q} onClick={() => void ask(q)} disabled={busy}
                    className="font-mono text-[11px] px-2 py-1 rounded-lg transition-all active:scale-95 disabled:opacity-40"
                    style={{ border: '1px solid rgba(125,249,255,0.28)', background: 'rgba(125,249,255,0.06)', color: '#7df9ff' }}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Architect input — only on its own tab, so it never sits under the card */}
      {tab === 'architect' && !booting && (
        <div className="relative z-10 px-3 py-2 shrink-0" style={{ background: 'rgba(0,12,6,0.7)', borderTop: '1px solid rgba(125,249,255,0.2)' }}>
          <div className="flex items-center gap-2" style={{ maxWidth: 620, marginInline: 'auto' }}>
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value.slice(0, 400))}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void ask(chatInput); } else sfx.key(); }}
              placeholder="დაწერე შეკითხვა…"
              aria-label="შეკითხვა არქიტექტორს"
              className="flex-1 min-w-0 rounded-xl px-3 py-2 font-mono text-[13px] outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(125,249,255,0.25)', color: '#d9ffe4' }}
            />
            <button onClick={() => void ask(chatInput)} disabled={busy || !chatInput.trim()}
              className="px-3 py-2 rounded-xl font-mono text-[12px] font-bold transition-all active:scale-95 disabled:opacity-40"
              style={{ border: '1px solid rgba(125,249,255,0.4)', background: 'rgba(125,249,255,0.12)', color: '#7df9ff' }}>
              →
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="relative z-10 flex shrink-0" style={{ background: 'rgba(0,12,6,0.85)', borderTop: '1px solid rgba(57,255,106,0.2)' }}>
        {([
          ['card', '🪪', 'ბარათი'],
          ['archive', '🗂', 'არქივი'],
          ['architect', '💬', 'არქიტექტორი'],
        ] as const).map(([id, icon, label]) => (
          <button key={id} onClick={() => { setTab(id); sfx.beep(620); }}
            className="flex-1 py-2.5 flex flex-col items-center gap-0.5 transition-colors"
            style={{
              color: tab === id ? '#39ff6a' : 'rgba(255,255,255,0.35)',
              borderTop: tab === id ? '2px solid #39ff6a' : '2px solid transparent',
              background: tab === id ? 'rgba(57,255,106,0.07)' : 'transparent',
            }}>
            <span style={{ fontSize: 16 }}>{icon}</span>
            <span className="font-mono text-[10px]">{label}</span>
          </button>
        ))}
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute left-1/2 -translate-x-1/2 z-40 px-3 py-2 rounded-xl font-mono text-[12px]"
            style={{ bottom: 76, border: '1px solid rgba(57,255,106,0.4)', background: 'rgba(2,20,10,0.95)', color: '#39ff6a' }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sheets */}
      <AnimatePresence>
        {sheet === 'upload' && (
          <MarsUploadSheet
            subject={subject} limits={limits} busy={busy}
            onCancel={() => setSheet(null)} onSubmit={doUpload}
          />
        )}

        {sheet === 'about' && (
          <Modal title="რა არის M.A.R.S." onClose={() => setSheet(null)}>
            <p className="font-mono text-[12px] leading-relaxed" style={{ color: 'rgba(217,255,228,0.9)' }}>
              ხვალ თუ ზეგ, ტექნოლოგია იმ დონეს მიაღწევს, რომ ადამიანი DNA-დან აღდგეს.
              მაშინ ერთი კითხვა დარჩება: <b>რა გვექნება იმ ადამიანზე?</b>
            </p>
            <p className="font-mono text-[12px] leading-relaxed mt-2" style={{ color: 'rgba(217,255,228,0.75)' }}>
              M.A.R.S. სწორედ ამას აგროვებს — შენს სიტყვებს, სახეს, დოკუმენტებს, წერილს მომავლისთვის.
              სხეული ბიოლოგიის საქმეა. დანარჩენი — ჩვენი.
            </p>
            <div className="mt-3 rounded-xl p-2.5" style={{ border: '1px solid rgba(57,255,106,0.22)', background: 'rgba(57,255,106,0.05)' }}>
              <p className="font-mono text-[11px] leading-relaxed" style={{ color: 'rgba(217,255,228,0.7)' }}>
                <b>რას ინახავს:</b> მანიფესტს (ვინ ხარ, საკუთარი სიტყვებით), პორტრეტს,
                ფაილებს, წერილს მომავლისთვის, მითითებებს და ბიოლოგიური ნიმუშის აღრიცხვას.
              </p>
            </div>
            <p className="font-mono text-[12px] leading-relaxed mt-3" style={{ color: 'rgba(217,255,228,0.8)' }}>
              შენი <b>მანიფესტი</b> ამავე დროს იკითხება სისტემის მიერ: გაძლევს მუდმივ კოდს,
              ზომავს ოთხ მახასიათებელს და გამოგყოფს სექტორს.
            </p>
            <div className="mt-3 space-y-1.5">
              {[
                ['ლოგიკა', 'სტრუქტურა და მიზეზ-შედეგი', '#39ff6a'],
                ['ემპათია', 'სხვები და გრძნობები', '#7df9ff'],
                ['წინააღმდეგობა', 'უარყოფა და მტკიცება', '#ff5f6d'],
                ['ენტროპია', 'კითხვები და გამეორება', '#ffd45a'],
              ].map(([k, v, c]) => (
                <div key={k} className="font-mono text-[11px]">
                  <span style={{ color: c }}>{k}</span>
                  <span style={{ color: 'rgba(217,255,228,0.5)' }}> — {v}</span>
                </div>
              ))}
            </div>
            <p className="font-mono text-[11px] mt-3 leading-relaxed" style={{ color: 'rgba(120,255,160,0.55)' }}>
              ანალიზი შენს ტექსტს ზომავს და არა შენს პიროვნებას. მანიფესტს, წერილს, ფაილებსა და
              აღდგენის პაკეტს <b>მხოლოდ შენ ხედავ</b> — არქივში სხვები მხოლოდ კოდს, სახელს, ფოტოსა
              და სექტორს ხედავენ.
            </p>
            {/* Said plainly, because the idea invites a bigger promise than
                anyone can keep, and because it protects whoever joins. */}
            <div className="mt-3 rounded-xl p-2.5" style={{ border: '1px solid rgba(255,212,90,0.28)', background: 'rgba(255,212,90,0.05)' }}>
              <p className="font-mono text-[10px] leading-relaxed" style={{ color: 'rgba(255,212,90,0.85)' }}>
                გულახდილად: ეს არქივია და არა დაპირება. M.A.R.S. ბიოლოგიურ მასალას არ აგროვებს და
                აღდგენას ვერავინ გპირდება. ის, რასაც ვაკეთებთ, ერთი რამაა — რომ შენი კვალი არ
                დაიკარგოს. ნიმუში, თუ გექნება, შენთან რჩება.
              </p>
            </div>
            <button onClick={() => { setSheet('upload'); }}
              className="w-full mt-4 py-2.5 rounded-xl font-mono text-[13px] font-bold transition-all active:scale-[0.98]"
              style={{ border: '1px solid rgba(57,255,106,0.45)', background: 'rgba(57,255,106,0.14)', color: '#39ff6a' }}>
              {subject ? 'ჩანაწერის განახლება' : 'დაიცავი შენი ჩანაწერი'}
            </button>
          </Modal>
        )}

        {sheet === 'purge' && (
          <Modal title="ჩანაწერის წაშლა" onClose={() => setSheet(null)}>
            <p className="font-mono text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
              შენი მანიფესტი, ფოტო და დოკუმენტები სამუდამოდ წაიშლება. კოდი #{subject?.code} გათავისუფლდება.
            </p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setSheet(null)}
                className="flex-1 py-2.5 rounded-xl font-mono text-[12px]"
                style={{ border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)' }}>
                გაუქმება
              </button>
              <button onClick={() => void doPurge()} disabled={busy}
                className="flex-1 py-2.5 rounded-xl font-mono text-[12px] font-bold disabled:opacity-40"
                style={{ border: '1px solid rgba(255,95,109,0.5)', background: 'rgba(255,95,109,0.14)', color: '#ff5f6d' }}>
                წაშლა
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <style>{'@keyframes vm-blink{0%,49%{opacity:1}50%,100%{opacity:0}}'}</style>
    </motion.div>,
    document.body,
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex items-end sm:items-center justify-center p-3"
      style={{ background: 'rgba(0,6,3,0.85)', backdropFilter: 'blur(5px)' }}
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
