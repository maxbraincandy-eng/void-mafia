/**
 * Create or update a memorial — a record for someone who has died, made by
 * someone who knew them.
 *
 * The tone here matters more than anywhere else in the app. Whoever is filling
 * this in has recently lost someone; the form asks for what it needs, explains
 * why, and asks for nothing it does not need.
 *
 * The sample block is a REGISTRY. It records that a sample exists and where —
 * it never asks anyone to send biological material, because nothing here is
 * licensed to receive it, and pretending otherwise would be the cruellest
 * possible thing to get wrong.
 */
import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { compressImage } from '@/lib/imageUtils';
import { SAMPLE_INFO, SAMPLE_KIND_LABEL, LIFE_INFO, type LifeStatus, type RecordView, type SampleStatus } from './types';
import * as sfx from './sfx';

const IMAGE_ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif';

const STORY_MIN = 40;
const STORY_MAX = 1200;

/** Same four questions, in the tense the record's status calls for. */
const PROMPTS: Record<LifeStatus, string[]> = {
  alive: [
    'როგორი ადამიანია?',
    'რას აკეთებს ყველაზე ხშირად?',
    'რას ამბობს ხშირად?',
    'რით გამოირჩევა?',
  ],
  deceased: [
    'როგორი ადამიანი იყო?',
    'რას აკეთებდა ყველაზე ხშირად?',
    'რას ამბობდა ხშირად?',
    'რით გახსოვს ყველაზე კარგად?',
  ],
};

export interface MemorialDraft {
  memorialId: string | null;
  lifeStatus: LifeStatus;
  personFirst: string; personLast: string;
  bornYear: string; diedYear: string;
  stewardRelation: string;
  manifest: string;
  portrait: string | null;
  sampleStatus: SampleStatus;
  sampleKind: string;
  sampleCustodian: string;
  sampleNote: string;
  sampleTakenAt: string;
  kin: string;
}

export function MarsMemorialSheet({
  existing, busy, onCancel, onSubmit,
}: {
  existing?: (RecordView & { priv?: any }) | null;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: MemorialDraft) => void;
}) {
  const [first, setFirst] = useState(existing?.personFirst ?? '');
  const [last, setLast] = useState(existing?.personLast ?? '');
  const [born, setBorn] = useState(existing?.bornYear ? String(existing.bornYear) : '');
  const [died, setDied] = useState(existing?.diedYear ? String(existing.diedYear) : '');
  const [relation, setRelation] = useState(existing?.stewardRelation ?? '');
  const [lifeStatus, setLifeStatus] = useState<LifeStatus>(existing?.lifeStatus ?? 'deceased');
  const [story, setStory] = useState(existing?.manifest ?? '');
  const [portrait, setPortrait] = useState<string | null>(existing?.portrait ?? null);
  const [sampleStatus, setSampleStatus] = useState<SampleStatus>(existing?.sampleStatus ?? 'none');
  const [sampleKind, setSampleKind] = useState(existing?.priv?.sampleKind ?? '');
  const [custodian, setCustodian] = useState(existing?.priv?.sampleCustodian ?? '');
  const [sampleNote, setSampleNote] = useState(existing?.priv?.sampleNote ?? '');
  const [takenAt, setTakenAt] = useState(existing?.priv?.sampleTakenAt ?? '');
  const [kin, setKin] = useState(existing?.priv?.kin ?? '');
  const [showSample, setShowSample] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const storyRef = useRef<HTMLTextAreaElement | null>(null);
  const portraitInput = useRef<HTMLInputElement | null>(null);

  const len = story.trim().length;
  // Only a deceased record needs a death year; a living person is asked for
  // nothing beyond a name.
  const datesOk = lifeStatus === 'alive' || died.trim().length === 4;
  const ready = first.trim().length >= 2 && last.trim().length >= 2 && len >= STORY_MIN && datesOk;

  const pickPortrait = async (f: File | undefined) => {
    if (!f) return;
    setWorking(true); setError(null);
    try { setPortrait(await compressImage(f, 720, 0.8)); sfx.beep(700); }
    catch { setError('სურათი ვერ დამუშავდა. სცადე JPEG ან PNG.'); sfx.reject(); }
    finally { setWorking(false); if (portraitInput.current) portraitInput.current.value = ''; }
  };

  const submit = () => {
    if (!ready) {
      setError(len < STORY_MIN
        ? `ტექსტი ძალიან მოკლეა — გჭირდება კიდევ ${STORY_MIN - len} სიმბოლო.`
        : !datesOk ? 'გარდაცვალების წელი აუცილებელია.'
        : 'სახელი და გვარი აუცილებელია.');
      sfx.reject();
      return;
    }
    onSubmit({
      memorialId: existing?.id ?? null,
      lifeStatus,
      personFirst: first.trim(), personLast: last.trim(),
      bornYear: born.trim(), diedYear: lifeStatus === 'alive' ? '' : died.trim(),
      stewardRelation: relation.trim(),
      manifest: story.trim(), portrait,
      sampleStatus, sampleKind, sampleCustodian: custodian.trim(),
      sampleNote: sampleNote.trim(), sampleTakenAt: takenAt.trim(),
      kin: kin.trim(),
    });
  };

  const field = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(125,249,255,0.25)',
    color: '#d9ffe4',
  } as const;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex items-end sm:items-center justify-center p-3"
      style={{ background: 'rgba(0,6,3,0.88)', backdropFilter: 'blur(6px)' }}
      onClick={onCancel}
    >
      <motion.div
        initial={{ y: 26, scale: 0.99 }} animate={{ y: 0, scale: 1 }} exit={{ y: 18, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl p-4 max-h-[90vh] overflow-y-auto"
        style={{ border: '1px solid rgba(125,249,255,0.32)', background: 'linear-gradient(165deg, #041016, #010608)' }}
      >
        <div className="flex items-center gap-2 mb-1">
          <p className="font-mono text-[13px] font-bold tracking-wider" style={{ color: '#7df9ff' }}>
            {existing ? 'ჩანაწერის განახლება' : 'ჩანაწერი ადამიანზე'}
          </p>
          <button onClick={onCancel} className="ml-auto font-mono text-[12px] px-2 py-0.5 rounded"
            style={{ border: '1px solid rgba(125,249,255,0.22)', color: 'rgba(125,249,255,0.7)' }}>✕</button>
        </div>
        <p className="font-mono text-[11px] mb-3 leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
          შექმენი ჩანაწერი ადამიანზე — ცოცხალზე ან იმაზე, ვინც აღარ არის. ის საჯარო იქნება:
          ვისაც ის უყვარს, შეძლებს მოსვლას, მოგონების დამატებას და ჩანაწერისთვის კითხვის დასმას.
        </p>

        {/* Identity */}
        <div className="flex gap-3">
          <button onClick={() => portraitInput.current?.click()} disabled={working}
            className="shrink-0 rounded-xl overflow-hidden transition-all active:scale-95 disabled:opacity-60"
            style={{ width: 76, height: 76, border: '1px dashed rgba(125,249,255,0.4)', background: 'rgba(255,255,255,0.04)' }}
            aria-label="ფოტოს არჩევა">
            {portrait
              ? <img src={portrait} alt="" className="w-full h-full object-cover" />
              : <span className="flex flex-col items-center justify-center w-full h-full font-mono"
                  style={{ color: 'rgba(125,249,255,0.6)', fontSize: 10, gap: 2 }}>
                  <span style={{ fontSize: 20 }}>{working ? '…' : '🖼'}</span>ფოტო
                </span>}
          </button>
          <input ref={portraitInput} type="file" accept={IMAGE_ACCEPT} style={{ display: 'none' }}
            onChange={e => void pickPortrait(e.target.files?.[0])} />

          <div className="flex-1 min-w-0 space-y-1.5">
            <input value={first} onChange={e => setFirst(e.target.value.slice(0, 40))} placeholder="სახელი"
              className="w-full rounded-lg px-3 py-2 font-mono text-[13px] outline-none" style={field} />
            <input value={last} onChange={e => setLast(e.target.value.slice(0, 40))} placeholder="გვარი"
              className="w-full rounded-lg px-3 py-2 font-mono text-[13px] outline-none" style={field} />
          </div>
        </div>

        {/* Status first: it decides whether dates are asked for at all. */}
        <div className="flex gap-1.5 mt-3">
          {(['alive', 'deceased'] as LifeStatus[]).map(v => {
            const info = LIFE_INFO[v];
            const on = lifeStatus === v;
            return (
              <button key={v} onClick={() => setLifeStatus(v)}
                className="flex-1 py-2 rounded-lg font-mono text-[12px] transition-all active:scale-95"
                style={{
                  border: `1px solid rgba(${info.color},${on ? 0.55 : 0.16})`,
                  background: on ? `rgba(${info.color},0.14)` : 'rgba(255,255,255,0.03)',
                  color: on ? `rgb(${info.color})` : 'rgba(255,255,255,0.45)',
                }}>
                {info.icon} {info.label}
              </button>
            );
          })}
        </div>
        {lifeStatus === 'deceased' && (
          <div className="flex gap-2 mt-2">
            <input value={born} onChange={e => setBorn(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric" placeholder="დაბადების წელი"
              className="flex-1 rounded-lg px-3 py-2 font-mono text-[13px] outline-none" style={field} />
            <input value={died} onChange={e => setDied(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric" placeholder="გარდაცვალების *"
              className="flex-1 rounded-lg px-3 py-2 font-mono text-[13px] outline-none" style={field} />
          </div>
        )}
        <input value={relation} onChange={e => setRelation(e.target.value.slice(0, 40))}
          placeholder="ვინ ხარ მისთვის (შვილი, მეუღლე, მეგობარი…)"
          className="w-full mt-2 rounded-lg px-3 py-2 font-mono text-[13px] outline-none" style={field} />

        {/* Story */}
        <label className="block font-mono text-[11px] mt-3 mb-1" style={{ color: 'rgba(125,249,255,0.75)' }}>
          {lifeStatus === 'alive' ? 'ვინ არის ის' : 'ვინ იყო ის'}
        </label>
        <div className="flex flex-wrap gap-1 mb-1.5">
          {PROMPTS[lifeStatus].map(p => (
            <button key={p} onClick={() => { setStory(s => (s ? `${s}\n${p} ` : `${p} `)); storyRef.current?.focus(); }}
              className="font-mono text-[10px] px-1.5 py-0.5 rounded transition-all active:scale-95"
              style={{ border: '1px solid rgba(125,249,255,0.22)', color: 'rgba(125,249,255,0.75)' }}>
              + {p}
            </button>
          ))}
        </div>
        <textarea ref={storyRef} value={story} onChange={e => setStory(e.target.value.slice(0, STORY_MAX))} rows={6}
          placeholder={'დაწერე მასზე საკუთარი სიტყვებით.\n\nეს ტექსტი გახდება ის, რასაც ჩანაწერი პასუხობს, როცა ვინმე კითხვას დაუსვამს.'}
          className="w-full rounded-lg px-3 py-2 font-mono text-[13px] outline-none resize-none"
          style={{ ...field, lineHeight: 1.5 }} />
        <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div style={{ width: `${Math.min(100, (len / STORY_MIN) * 100)}%`, height: '100%', background: len >= STORY_MIN ? '#7df9ff' : '#ffd45a', transition: 'width 0.2s ease' }} />
        </div>
        <p className="font-mono text-[10px] mt-1" style={{ color: len >= STORY_MIN ? 'rgba(125,249,255,0.7)' : 'rgba(255,212,90,0.85)' }}>
          {len >= STORY_MIN ? `მზადაა · ${len}/${STORY_MAX}` : `კიდევ ${STORY_MIN - len} სიმბოლო`}
        </p>

        {/* Sample registry */}
        <button onClick={() => setShowSample(v => !v)}
          className="w-full mt-3 py-2 rounded-xl flex items-center gap-2 px-3 transition-all active:scale-[0.99]"
          style={{ border: '1px solid rgba(255,212,90,0.3)', background: 'rgba(255,212,90,0.06)' }}>
          <span className="text-[14px]">🧬</span>
          <span className="font-mono text-[12px]" style={{ color: '#ffd45a' }}>ბიოლოგიური ნიმუშის რეესტრი</span>
          <span className="ml-auto font-mono text-[11px]" style={{ color: 'rgba(255,212,90,0.5)' }}>
            {showSample ? '▲' : sampleStatus !== 'none' ? '● აღრიცხულია' : 'არასავალდებულო ▼'}
          </span>
        </button>

        {showSample && (
          <div className="mt-2 space-y-2">
            <div className="rounded-xl p-2.5" style={{ border: '1px solid rgba(255,95,109,0.3)', background: 'rgba(255,95,109,0.06)' }}>
              <p className="font-mono text-[10px] leading-relaxed" style={{ color: 'rgba(255,150,160,0.9)' }}>
                <b>არაფერს გვიგზავნი.</b> M.A.R.S. ბიოლოგიურ მასალას არ იღებს და არ ინახავს — ამას
                ლიცენზირებული ბიობანკი აკეთებს. აქ მხოლოდ აღირიცხება, რომ ნიმუში არსებობს და სად.
                ნიმუში თქვენთან რჩება.
              </p>
            </div>

            <div className="flex gap-1.5">
              {(['none', 'pledged', 'stored'] as SampleStatus[]).map(v => {
                const info = SAMPLE_INFO[v];
                const on = sampleStatus === v;
                return (
                  <button key={v} onClick={() => setSampleStatus(v)}
                    className="flex-1 py-1.5 rounded-lg font-mono text-[11px] transition-all active:scale-95"
                    style={{
                      border: `1px solid rgba(${info.color},${on ? 0.55 : 0.16})`,
                      background: on ? `rgba(${info.color},0.14)` : 'rgba(255,255,255,0.03)',
                      color: on ? `rgb(${info.color})` : 'rgba(255,255,255,0.45)',
                    }}>
                    {info.label}
                  </button>
                );
              })}
            </div>

            {sampleStatus !== 'none' && (
              <>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(SAMPLE_KIND_LABEL).map(([k, label]) => (
                    <button key={k} onClick={() => setSampleKind(k)}
                      className="font-mono text-[10px] px-2 py-1 rounded transition-all active:scale-95"
                      style={{
                        border: `1px solid rgba(255,212,90,${sampleKind === k ? 0.5 : 0.16})`,
                        background: sampleKind === k ? 'rgba(255,212,90,0.14)' : 'rgba(255,255,255,0.03)',
                        color: sampleKind === k ? '#ffd45a' : 'rgba(255,255,255,0.45)',
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
                <input value={custodian} onChange={e => setCustodian(e.target.value.slice(0, 120))}
                  placeholder="ვისთან ინახება (სახელი)"
                  className="w-full rounded-lg px-3 py-2 font-mono text-[12px] outline-none" style={field} />
                <input value={sampleNote} onChange={e => setSampleNote(e.target.value.slice(0, 400))}
                  placeholder="სად ინახება (მაგ. სახლში, დალუქულ კონვერტში)"
                  className="w-full rounded-lg px-3 py-2 font-mono text-[12px] outline-none" style={field} />
                <input value={takenAt} onChange={e => setTakenAt(e.target.value.slice(0, 20))}
                  placeholder="როდის აღებულია (მაგ. 2021-03)"
                  className="w-full rounded-lg px-3 py-2 font-mono text-[12px] outline-none" style={field} />

                {/* Real, checkable guidance — not flavour text. */}
                <div className="rounded-xl p-2.5" style={{ border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.03)' }}>
                  <p className="font-mono text-[10px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    <b>როგორ შეინახოს სწორად:</b> თმა ფესვით (არა მოჭრილი), ან ლოყის ნაცხი.
                    სრულად გააშრე, ჩადე ქაღალდის კონვერტში (არა პოლიეთილენში — ტენი აჩენს ობს),
                    შეინახე გრილ, მშრალ და ბნელ ადგილას. ხანგრძლივი შენახვისთვის საჭიროა
                    პროფესიული ბიობანკი.
                  </p>
                </div>
              </>
            )}

            <input value={kin} onChange={e => setKin(e.target.value.slice(0, 200))}
              placeholder="საკონტაქტო პირი ამ ჩანაწერზე"
              className="w-full rounded-lg px-3 py-2 font-mono text-[12px] outline-none" style={field} />
          </div>
        )}

        {error && <p className="font-mono text-[11px] mt-2" style={{ color: '#ff5f6d' }}>{error}</p>}

        <div className="flex gap-2 mt-4">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl font-mono text-[12px] transition-all active:scale-[0.98]"
            style={{ border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)' }}>
            გაუქმება
          </button>
          <button onClick={submit} disabled={busy || working || !ready}
            className="flex-1 py-2.5 rounded-xl font-mono text-[12px] font-bold transition-all active:scale-[0.98] disabled:opacity-40"
            style={{ border: '1px solid rgba(125,249,255,0.45)', background: 'rgba(125,249,255,0.14)', color: '#7df9ff' }}>
            {busy ? '…' : existing ? 'განახლება' : 'ჩანაწერის შექმნა'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
