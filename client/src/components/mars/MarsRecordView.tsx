/**
 * A person's page — the memorial itself.
 *
 * Three things live here: who they were, what people remember, and the ability
 * to ask the record a question.
 *
 * ON "SPEAKING" TO SOMEONE WHO DIED
 * ─────────────────────────────────
 * Every answer is a QUOTE, shown as a quote, with the name of whoever wrote it
 * and when. The screen never renders a reply as if the dead person were typing.
 * That restraint is the feature, not a limitation of it: a system that invents
 * plausible sentences in a dead parent's voice is lying to their child. When
 * the record holds no answer, it says so — and that silence is honest.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import { compressImage } from '@/lib/imageUtils';
import type { Res } from '@/types/index';
import {
  lifespan, sectorOf, SAMPLE_INFO, SAMPLE_KIND_LABEL, REPORT_REASON_LABEL, LIFE_INFO,
  type Memory, type PrivateFields, type RecordView, type SpeakReply,
} from './types';
import * as sfx from './sfx';

type Tab = 'about' | 'memories' | 'speak';

const IMAGE_ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif';

function whenText(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString('ka-GE', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function MarsRecordView({
  code, onClose, onEdit,
}: {
  code: string;
  onClose: () => void;
  onEdit?: (rec: RecordView) => void;
}) {
  const [rec, setRec] = useState<RecordView | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [priv, setPriv] = useState<PrivateFields | null>(null);
  const [tab, setTab] = useState<Tab>('about');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // memory composer
  const [memText, setMemText] = useState('');
  const [memRelation, setMemRelation] = useState('');
  const [memPhoto, setMemPhoto] = useState<string | null>(null);
  const memPhotoInput = useRef<HTMLInputElement | null>(null);

  // speak
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState('alive');
  const [reportNote, setReportNote] = useState('');
  const [reported, setReported] = useState(false);

  const [question, setQuestion] = useState('');
  const [replies, setReplies] = useState<Array<{ q: string; r: SpeakReply }>>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const speakRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await emitWithAck<{ code: string }, Res<{ record: RecordView; memories: Memory[]; privateFields: PrivateFields | null } | null>>(
        'mars:open', { code });
      if ('ok' in res && res.ok && res.data) {
        setRec(res.data.record);
        setMemories(res.data.memories);
        setPriv(res.data.privateFields);
      } else setError('ჩანაწერი ვერ მოიძებნა.');
    } catch { setError('კავშირი დაიკარგა.'); }
    finally { setLoading(false); }
  }, [code]);

  useEffect(() => { void load(); }, [load]);

  // Ask once with an empty-ish probe when the speak tab opens, purely to learn
  // what the record can answer. Cheap, and it means the chips are there before
  // the visitor's first question rather than after their first dead end.
  useEffect(() => {
    if (tab !== 'speak' || !rec || topics.length > 0) return;
    let alive = true;
    emitWithAck<{ code: string; text: string }, Res<SpeakReply>>('mars:speak', { code: rec.code, text: 'გამარჯობა' })
      .then(r => { if (alive && 'ok' in r && r.ok && r.data.topics?.length) setTopics(r.data.topics); })
      .catch(() => { /* chips are optional */ });
    return () => { alive = false; };
  }, [tab, rec, topics.length]);
  useEffect(() => {
    const el = speakRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [replies]);

  const addMemory = async () => {
    if (!rec || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await emitWithAck<any, Res<Memory>>('mars:memory_add', {
        subjectId: rec.id, text: memText.trim(), relation: memRelation.trim(), photo: memPhoto,
      });
      if ('ok' in res && res.ok) {
        setMemories(m => [res.data, ...m]);
        setMemText(''); setMemPhoto(null);
        sfx.accept();
      } else { setError(('error' in res && res.error) || 'ვერ დაემატა'); sfx.reject(); }
    } catch { setError('კავშირი დაიკარგა.'); }
    finally { setBusy(false); }
  };

  const removeMemory = async (id: string) => {
    try {
      const res = await emitWithAck<{ memoryId: string }, Res<{ deleted: boolean }>>('mars:memory_delete', { memoryId: id });
      if ('ok' in res && res.ok) setMemories(m => m.filter(x => x.id !== id));
    } catch { /* leave as-is */ }
  };

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || busy || !rec) return;
    setBusy(true); setQuestion('');
    try {
      const res = await emitWithAck<{ code: string; text: string }, Res<SpeakReply>>('mars:speak', { code: rec.code, text: q });
      if ('ok' in res && res.ok) {
        setReplies(r => [...r, { q, r: res.data }]);
        if (res.data.topics?.length) setTopics(res.data.topics);
        sfx.beep(560);
      }
    } catch { /* leave */ }
    finally { setBusy(false); }
  };

  const sendReport = async () => {
    if (!rec || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await emitWithAck<any, Res<{ autoHidden: boolean }>>('mars:report', {
        subjectId: rec.id, reason: reportReason, note: reportNote.trim(),
      });
      if ('ok' in res && res.ok) {
        setReporting(false); setReported(true);
        if (res.data.autoHidden) await load();
      } else setError(('error' in res && res.error) || 'ვერ გაიგზავნა');
    } catch { setError('კავშირი დაიკარგა.'); }
    finally { setBusy(false); }
  };

  const pickMemPhoto = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try { setMemPhoto(await compressImage(f, 1200, 0.75)); }
    catch { setError('სურათი ვერ დამუშავდა.'); }
    finally { setBusy(false); if (memPhotoInput.current) memPhotoInput.current.value = ''; }
  };

  if (loading) {
    return <Shell onClose={onClose}><p className="font-mono text-[12px] text-center py-10" style={{ color: 'rgba(57,255,106,0.45)' }}>იტვირთება…</p></Shell>;
  }
  if (!rec) {
    return <Shell onClose={onClose}><p className="font-mono text-[12px] text-center py-10" style={{ color: '#ff5f6d' }}>{error ?? 'ვერ მოიძებნა'}</p></Shell>;
  }

  if (rec.withdrawn) {
    return (
      <Shell onClose={onClose}>
        <div className="text-center py-8">
          <div className="text-[34px] mb-2">🕯</div>
          <p className="font-display font-bold text-[16px] text-white/80">ჩანაწერი დაფარულია</p>
          <p className="font-mono text-[12px] mt-2 leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {rec.withdrawnReason}
          </p>
          <p className="font-mono text-[10px] mt-3" style={{ color: 'rgba(255,255,255,0.28)' }}>#{rec.code}</p>
        </div>
      </Shell>
    );
  }

  const sec = sectorOf(rec.sector);
  const isMemorial = rec.kind === 'memorial';
  const name = isMemorial ? `${rec.personFirst} ${rec.personLast}` : rec.designation;
  const years = lifespan(rec.bornYear, rec.diedYear);

  return (
    <Shell onClose={onClose}>
      {/* Identity */}
      <div className="flex flex-col items-center text-center pb-3">
        <div className="rounded-2xl overflow-hidden mb-2"
          style={{ width: 96, height: 96, border: `1px solid ${sec.color}55`, background: 'rgba(0,0,0,0.4)' }}>
          {rec.portrait
            ? <img src={rec.portrait} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center font-mono" style={{ color: `${sec.color}66`, fontSize: 34 }}>
                {name.slice(0, 1).toUpperCase() || '?'}
              </div>}
        </div>
        <p className="font-display font-bold text-[20px] text-white leading-tight">{name}</p>
        {rec.lifeStatus === 'deceased' && years && (
          <p className="font-mono text-[13px] mt-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>{years}</p>
        )}
        <span className="inline-block mt-1 font-mono text-[10px] px-2 py-0.5 rounded-full"
          style={{
            border: `1px solid rgba(${LIFE_INFO[rec.lifeStatus].color},0.4)`,
            background: `rgba(${LIFE_INFO[rec.lifeStatus].color},0.10)`,
            color: `rgb(${LIFE_INFO[rec.lifeStatus].color})`,
          }}>
          {LIFE_INFO[rec.lifeStatus].icon} {LIFE_INFO[rec.lifeStatus].label}
        </span>
        <p className="font-mono text-[10px] mt-1" style={{ color: `${sec.color}aa` }}>#{rec.code}</p>
        {isMemorial && rec.stewardName && (
          <p className="font-mono text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
            ჩანაწერს უვლის {rec.stewardName}{rec.stewardRelation ? ` · ${rec.stewardRelation}` : ''}
          </p>
        )}
        {rec.canEdit && onEdit && (
          <button onClick={() => onEdit(rec)}
            className="mt-2 px-3 py-1.5 rounded-lg font-mono text-[11px] transition-all active:scale-95"
            style={{ border: `1px solid ${sec.color}55`, background: `${sec.color}12`, color: sec.color }}>
            ↻ რედაქტირება
          </button>
        )}
        {/* Anyone but the steward can flag a record. Records publish instantly,
            so this is the safety net — see marsReports for why. */}
        {!rec.canEdit && (
          reported
            ? <p className="mt-2 font-mono text-[10px]" style={{ color: 'rgba(57,255,106,0.7)' }}>
                რეპორტი გაიგზავნა — მოდერატორი განიხილავს.
              </p>
            : <button onClick={() => setReporting(true)}
                className="mt-2 font-mono text-[10px]" style={{ color: 'rgba(255,95,109,0.6)' }}>
                ⚑ პრობლემის შეტყობინება
              </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-3">
        {/* Tense follows the status: a living person "is", not "was". */}
        {([
          ['about', rec.lifeStatus === 'alive' ? 'ვინ არის' : 'ვინ იყო'],
          ['memories', `მოგონებები${memories.length ? ` (${memories.length})` : ''}`],
          ['speak', 'ესაუბრე'],
        ] as const)
          .map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className="flex-1 py-2 rounded-lg font-mono text-[11px] transition-all active:scale-[0.98]"
              style={{
                border: `1px solid ${tab === id ? sec.color + '66' : 'rgba(255,255,255,0.10)'}`,
                background: tab === id ? `${sec.color}14` : 'rgba(255,255,255,0.02)',
                color: tab === id ? sec.color : 'rgba(255,255,255,0.45)',
              }}>
              {label}
            </button>
          ))}
      </div>

      {tab === 'about' && (
        <div className="space-y-3">
          {rec.manifest
            ? <p className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(230,255,240,0.88)' }}>{rec.manifest}</p>
            : <p className="font-mono text-[12px] text-center py-6" style={{ color: 'rgba(255,255,255,0.35)' }}>
                ეს ჩანაწერი პირადია — ტექსტს მხოლოდ მისი ავტორი ხედავს.
              </p>}

          {/* Private preservation package, owner only. */}
          {priv && (priv.letter || priv.restoreNote || priv.kin || priv.sampleKind || priv.sampleNote) && (
            <div className="rounded-xl p-2.5" style={{ border: '1px solid rgba(255,212,90,0.24)', background: 'rgba(255,212,90,0.05)' }}>
              <p className="font-mono text-[10px] mb-1.5" style={{ color: '#ffd45a' }}>
                🧬 აღდგენის პაკეტი <span style={{ color: 'rgba(255,255,255,0.28)' }}>· მხოლოდ შენ ხედავ</span>
              </p>
              {rec.sampleStatus !== 'none' && (
                <p className="font-mono text-[11px]" style={{ color: `rgb(${SAMPLE_INFO[rec.sampleStatus].color})` }}>
                  {SAMPLE_INFO[rec.sampleStatus].icon} ნიმუში: {SAMPLE_INFO[rec.sampleStatus].label}
                  {priv.sampleKind && ` · ${SAMPLE_KIND_LABEL[priv.sampleKind] ?? priv.sampleKind}`}
                </p>
              )}
              {priv.sampleCustodian && <p className="font-mono text-[11px]" style={{ color: 'rgba(255,255,255,0.6)' }}>ინახავს: {priv.sampleCustodian}</p>}
              {priv.sampleNote && <p className="font-mono text-[11px]" style={{ color: 'rgba(255,255,255,0.6)' }}>სად: {priv.sampleNote}</p>}
              {priv.sampleTakenAt && <p className="font-mono text-[11px]" style={{ color: 'rgba(255,255,255,0.6)' }}>აღებულია: {priv.sampleTakenAt}</p>}
              {priv.letter && <p className="font-mono text-[11px] mt-1 whitespace-pre-wrap" style={{ color: 'rgba(255,255,255,0.7)' }}>✉ {priv.letter}</p>}
              {priv.restoreNote && <p className="font-mono text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>⌘ {priv.restoreNote}</p>}
              {priv.kin && <p className="font-mono text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>☎ {priv.kin}</p>}
            </div>
          )}

          {priv && priv.docs.length > 0 && (
            <div className="space-y-1">
              {priv.docs.map((d, i) => (
                <a key={i} href={d.data} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                  style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                  <span className="text-[14px]">{d.type === 'application/pdf' ? '📄' : '🖼'}</span>
                  <span className="font-mono text-[11px] truncate flex-1" style={{ color: 'rgba(255,255,255,0.7)' }}>{d.name}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'memories' && (
        <div className="space-y-3">
          {/* Composer */}
          <div className="rounded-xl p-2.5" style={{ border: '1px solid rgba(125,249,255,0.22)', background: 'rgba(125,249,255,0.04)' }}>
            <p className="font-mono text-[11px] mb-1.5" style={{ color: 'rgba(125,249,255,0.8)' }}>
              {rec.lifeStatus === 'alive' ? `დაწერე რამე ${name}-ზე` : `დაამატე მოგონება ${name}-ზე`}
            </p>
            <input
              value={memRelation}
              onChange={e => setMemRelation(e.target.value.slice(0, 40))}
              placeholder="ვინ ხარ მისთვის (შვილი, მეგობარი, კოლეგა…)"
              className="w-full rounded-lg px-2.5 py-1.5 font-mono text-[12px] outline-none mb-1.5"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: '#d9ffe4' }}
            />
            <textarea
              value={memText}
              onChange={e => setMemText(e.target.value.slice(0, 2000))}
              rows={4}
              placeholder={rec.lifeStatus === 'alive'
                ? 'ერთი კონკრეტული დღე, ჩვევა, ფრაზა რომელსაც ხშირად ამბობს…'
                : 'რას იხსენებ? ერთი კონკრეტული დღე, ჩვევა, ფრაზა რომელსაც ხშირად ამბობდა…'}
              className="w-full rounded-lg px-2.5 py-2 font-mono text-[12px] outline-none resize-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: '#d9ffe4', lineHeight: 1.5 }}
            />
            {memPhoto && (
              <div className="mt-1.5 flex items-center gap-2">
                <img src={memPhoto} alt="" className="rounded-lg object-cover" style={{ width: 44, height: 44 }} />
                <button onClick={() => setMemPhoto(null)} className="font-mono text-[10px]" style={{ color: 'rgba(255,95,109,0.8)' }}>მოხსნა</button>
              </div>
            )}
            <div className="flex gap-2 mt-2">
              <button onClick={() => memPhotoInput.current?.click()} disabled={busy}
                className="px-2.5 py-1.5 rounded-lg font-mono text-[11px] transition-all active:scale-95 disabled:opacity-50"
                style={{ border: '1px dashed rgba(125,249,255,0.3)', color: 'rgba(125,249,255,0.8)' }}>
                🖼 ფოტო
              </button>
              <input ref={memPhotoInput} type="file" accept={IMAGE_ACCEPT} style={{ display: 'none' }}
                onChange={e => void pickMemPhoto(e.target.files?.[0])} />
              <button onClick={() => void addMemory()} disabled={busy || memText.trim().length < 15}
                className="flex-1 py-1.5 rounded-lg font-mono text-[11px] font-bold transition-all active:scale-[0.98] disabled:opacity-40"
                style={{ border: '1px solid rgba(125,249,255,0.45)', background: 'rgba(125,249,255,0.14)', color: '#7df9ff' }}>
                {busy ? '…' : 'დამატება'}
              </button>
            </div>
            {memText.trim().length > 0 && memText.trim().length < 15 && (
              <p className="font-mono text-[10px] mt-1" style={{ color: 'rgba(255,212,90,0.8)' }}>
                კიდევ {15 - memText.trim().length} სიმბოლო
              </p>
            )}
          </div>

          {memories.length === 0 && (
            <p className="font-mono text-[12px] text-center py-6" style={{ color: 'rgba(255,255,255,0.35)' }}>
              ჯერ არავის დაუწერია. იყავი პირველი.
            </p>
          )}
          {memories.map(m => (
            <div key={m.id} className="rounded-xl p-2.5" style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.025)' }}>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[12px]" style={{ color: '#7df9ff' }}>{m.authorName}</span>
                {m.relation && <span className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{m.relation}</span>}
                <span className="ml-auto font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>{whenText(m.createdAt)}</span>
              </div>
              <p className="font-mono text-[12px] mt-1 leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(230,255,240,0.85)' }}>{m.text}</p>
              {m.photo && <img src={m.photo} alt="" className="mt-2 rounded-lg w-full object-cover" style={{ maxHeight: 260 }} />}
              {rec.canEdit && (
                <button onClick={() => void removeMemory(m.id)}
                  className="mt-1.5 font-mono text-[10px]" style={{ color: 'rgba(255,95,109,0.6)' }}>წაშლა</button>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'speak' && (
        <div>
          {/* The promise this screen makes, made once and made plainly. */}
          <div className="rounded-xl p-2.5 mb-3" style={{ border: '1px solid rgba(255,212,90,0.28)', background: 'rgba(255,212,90,0.05)' }}>
            <p className="font-mono text-[10px] leading-relaxed" style={{ color: 'rgba(255,212,90,0.85)' }}>
              აქ {name} არ პასუხობს — აქ მისი ჩანაწერი პასუხობს. ყოველი პასუხი ნამდვილი ციტატაა
              იმისა, რაც მან ან მისმა ახლობლებმა დაწერეს. სისტემა არაფერს იგონებს.
            </p>
          </div>

          <div ref={speakRef} className="space-y-3">
            {replies.map((x, i) => (
              <div key={i}>
                <div className="flex justify-end mb-1.5">
                  <div className="rounded-2xl px-3 py-2 max-w-[85%]" style={{ border: '1px solid rgba(57,255,106,0.3)', background: 'rgba(57,255,106,0.10)' }}>
                    <p className="font-mono text-[12px]" style={{ color: '#d9ffe4' }}>{x.q}</p>
                  </div>
                </div>
                {x.r.passage ? (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl px-3 py-2.5" style={{ border: `1px solid ${sec.color}44`, background: `${sec.color}0d` }}>
                    <p className="font-mono text-[13px] leading-relaxed" style={{ color: 'rgba(240,255,246,0.92)' }}>
                      „{x.r.passage.text}"
                    </p>
                    <p className="font-mono text-[10px] mt-1.5" style={{ color: `${sec.color}bb` }}>
                      — {x.r.note}
                      {x.r.passage.sourceAt > 0 && <span style={{ color: 'rgba(255,255,255,0.28)' }}> · {whenText(x.r.passage.sourceAt)}</span>}
                    </p>
                  </motion.div>
                ) : (
                  <div className="rounded-2xl px-3 py-2.5" style={{ border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.02)' }}>
                    <p className="font-mono text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>{x.r.note}</p>
                  </div>
                )}
              </div>
            ))}
            {busy && <p className="font-mono text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>▚ …</p>}
          </div>

          {/* What this record can actually answer, taken from its own text. A
              retrieval system that only ever says "no" reads as broken; showing
              what IS there turns a dead end into the next question. */}
          {topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {topics.slice(0, 6).map(t => (
                <button key={t} onClick={() => void ask(t)} disabled={busy}
                  className="font-mono text-[11px] px-2 py-1 rounded-lg transition-all active:scale-95 disabled:opacity-40"
                  style={{ border: `1px solid ${sec.color}44`, background: `${sec.color}0d`, color: sec.color }}>
                  {t}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <input
              value={question}
              onChange={e => setQuestion(e.target.value.slice(0, 300))}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void ask(question); } }}
              placeholder={`ჰკითხე ${name}-ის ჩანაწერს…`}
              aria-label="შეკითხვა ჩანაწერს"
              className="flex-1 min-w-0 rounded-xl px-3 py-2 font-mono text-[13px] outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${sec.color}44`, color: '#d9ffe4' }}
            />
            <button onClick={() => void ask(question)} disabled={busy || !question.trim()}
              className="px-3 py-2 rounded-xl font-mono text-[12px] font-bold transition-all active:scale-95 disabled:opacity-40"
              style={{ border: `1px solid ${sec.color}66`, background: `${sec.color}18`, color: sec.color }}>
              →
            </button>
          </div>
        </div>
      )}

      {reporting && (
        <div className="mt-3 rounded-xl p-3" style={{ border: '1px solid rgba(255,95,109,0.35)', background: 'rgba(255,95,109,0.06)' }}>
          <p className="font-mono text-[12px] mb-2" style={{ color: '#ff5f6d' }}>რა პრობლემაა?</p>
          <div className="space-y-1">
            {Object.entries(REPORT_REASON_LABEL).map(([k, label]) => (
              <button key={k} onClick={() => setReportReason(k)}
                className="w-full text-left px-2.5 py-1.5 rounded-lg font-mono text-[11px] transition-all"
                style={{
                  border: `1px solid rgba(255,95,109,${reportReason === k ? 0.5 : 0.14})`,
                  background: reportReason === k ? 'rgba(255,95,109,0.12)' : 'rgba(255,255,255,0.02)',
                  color: reportReason === k ? '#ff8a94' : 'rgba(255,255,255,0.5)',
                }}>
                {label}
              </button>
            ))}
          </div>
          <textarea value={reportNote} onChange={e => setReportNote(e.target.value.slice(0, 400))} rows={2}
            placeholder="დამატებითი დეტალები (არასავალდებულო)"
            className="w-full mt-2 rounded-lg px-2.5 py-2 font-mono text-[11px] outline-none resize-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: '#d9ffe4' }} />
          <div className="flex gap-2 mt-2">
            <button onClick={() => setReporting(false)}
              className="flex-1 py-2 rounded-lg font-mono text-[11px]"
              style={{ border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)' }}>
              გაუქმება
            </button>
            <button onClick={() => void sendReport()} disabled={busy}
              className="flex-1 py-2 rounded-lg font-mono text-[11px] font-bold disabled:opacity-40"
              style={{ border: '1px solid rgba(255,95,109,0.5)', background: 'rgba(255,95,109,0.14)', color: '#ff8a94' }}>
              {busy ? '…' : 'გაგზავნა'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="font-mono text-[11px] mt-2 text-center" style={{ color: '#ff5f6d' }}>{error}</p>}
    </Shell>
  );
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex items-end sm:items-center justify-center p-3"
      style={{ background: 'rgba(0,6,3,0.88)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 26, scale: 0.99 }} animate={{ y: 0, scale: 1 }} exit={{ y: 18, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl p-4 max-h-[90vh] overflow-y-auto"
        style={{ border: '1px solid rgba(57,255,106,0.3)', background: 'linear-gradient(165deg, #04140c, #010806)' }}
      >
        <button onClick={onClose} className="float-right font-mono text-[12px] px-2 py-0.5 rounded"
          style={{ border: '1px solid rgba(57,255,106,0.22)', color: 'rgba(57,255,106,0.7)' }}>✕</button>
        {children}
      </motion.div>
    </motion.div>
  );
}

export { AnimatePresence };
