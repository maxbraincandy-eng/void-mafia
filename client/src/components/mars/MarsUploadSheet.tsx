/**
 * The preservation record form.
 *
 * Two parts. The first is the archive entry itself — a name, a portrait and a
 * manifest, which is what the system reads to score you. The second is the
 * preservation record: a letter to whoever finds this, what you want known,
 * whether a biological sample exists, and who to contact.
 *
 * FILE SIZE — WHAT WAS BROKEN
 * ───────────────────────────
 * Images were rejected against their ORIGINAL size, before being downscaled.
 * A 4 MB phone photo — every photo a phone takes — was refused even though it
 * compresses to a couple of hundred kilobytes. Now only PDFs (which cannot be
 * recompressed without ceasing to be readable PDFs) are measured on the way in;
 * images are compressed first and measured after, against what is actually
 * being sent. The server caps are raised to match and are no longer reachable
 * by an ordinary photo.
 *
 * The accept lists are explicit rather than `image/*`: on iOS that is what
 * makes the picker hand over a JPEG instead of a HEIC the canvas cannot decode.
 */
import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { compressImage } from '@/lib/imageUtils';
import { fileSize, SAMPLE_INFO, LIFE_INFO, type LifeStatus, type Limits, type MarsDoc, type SampleStatus, type Subject } from './types';
import * as sfx from './sfx';

/** Prompts to write against — this is the fix for "I typed my name again". */
const PROMPTS = [
  'რა გიყვარს ყველაზე მეტად?',
  'რისი გეშინია?',
  'რას შეცვლიდი, თუ შეგეძლო?',
  'ვინ ხარ, როცა არავინ გიყურებს?',
];

const PLACEHOLDER =
  'დაწერე რამდენიმე წინადადება.\n\nმაგალითად: მიყვარს ჩემი ოჯახი. მეშინია იმის, რომ დრო სწრაფად გადის. მინდა, რომ ვინმეს გავახსენდე.';

const LETTER_PLACEHOLDER =
  'ვინც ამას წაიკითხავს, შენ ვერ გიცნობს.\n\nუთხარი ვინ იყავი, რა გიყვარდა, და რა გინდა რომ იცოდეს.';

/** Images the browser can reliably decode into a canvas. Explicit, not image/*. */
const IMAGE_ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif';
const DOC_ACCEPT = `application/pdf,${IMAGE_ACCEPT}`;

/** Read a file as a data URL. Used for PDFs, which must not be re-encoded. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error('ფაილი ვერ წაიკითხა.'));
    r.readAsDataURL(file);
  });
}

export function MarsUploadSheet({
  subject, limits, busy, onCancel, onSubmit,
}: {
  subject: Subject | null;
  limits: Limits;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: {
    designation: string; manifest: string; portrait: string | null; docs: MarsDoc[];
    letter: string; restoreNote: string; sampleStatus: SampleStatus; sampleNote: string; kin: string;
    lifeStatus: LifeStatus; bornYear: string; diedYear: string;
  }) => void;
}) {
  const [designation, setDesignation] = useState(subject?.designation ?? '');
  const [manifest, setManifest] = useState(subject?.manifest ?? '');
  const [portrait, setPortrait] = useState<string | null>(subject?.portrait ?? null);
  const [docs, setDocs] = useState<MarsDoc[]>(subject?.docs ?? []);
  const [letter, setLetter] = useState(subject?.letter ?? '');
  const [restoreNote, setRestoreNote] = useState(subject?.restoreNote ?? '');
  const [sampleStatus, setSampleStatus] = useState<SampleStatus>(subject?.sampleStatus ?? 'none');
  const [sampleNote, setSampleNote] = useState(subject?.sampleNote ?? '');
  const [kin, setKin] = useState(subject?.kin ?? '');
  const [lifeStatus, setLifeStatus] = useState<LifeStatus>(subject?.lifeStatus ?? 'alive');
  const [bornYear, setBornYear] = useState(subject?.bornYear ? String(subject.bornYear) : '');
  const [diedYear, setDiedYear] = useState(subject?.diedYear ? String(subject.diedYear) : '');
  const [showPreserve, setShowPreserve] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const manifestRef = useRef<HTMLTextAreaElement | null>(null);
  const portraitInput = useRef<HTMLInputElement | null>(null);
  const docInput = useRef<HTMLInputElement | null>(null);

  const len = manifest.trim().length;
  // A deceased record must carry a death year — that is the one fact the status
  // asserts. A living one is asked for no dates at all.
  const datesOk = lifeStatus === 'alive' || diedYear.trim().length === 4;
  const ready = len >= limits.manifestMin && designation.trim().length >= 2 && datesOk;
  const pct = Math.min(100, (len / limits.manifestMin) * 100);

  const pickPortrait = async (file: File | undefined) => {
    if (!file) return;
    setWorking(true); setError(null);
    try {
      // 720px: big enough to look like a real portrait on a retina card, small
      // enough that no phone photo ever approaches the server cap.
      const data = await compressImage(file, 720, 0.8);
      setPortrait(data);
      sfx.beep(700);
    } catch {
      setError('სურათი ვერ დამუშავდა. სცადე JPEG ან PNG.');
      sfx.reject();
    } finally {
      setWorking(false);
      if (portraitInput.current) portraitInput.current.value = '';
    }
  };

  const pickDocs = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setWorking(true); setError(null);
    try {
      const next = [...docs];
      for (const f of Array.from(files)) {
        if (next.length >= limits.docsMax) { setError(`მაქსიმუმ ${limits.docsMax} ფაილი.`); break; }
        const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

        if (isPdf) {
          // A PDF is stored byte-identical, so its incoming size IS its stored
          // size and is the only thing worth checking here.
          if (f.size > limits.docBytesMax) {
            setError(`„${f.name}" ძალიან დიდია (მაქს. ${fileSize(limits.docBytesMax)}).`);
            continue;
          }
          next.push({ name: f.name, type: 'application/pdf', size: f.size, data: await readAsDataUrl(f) });
          continue;
        }

        // Everything else is treated as an image and compressed FIRST. The old
        // code measured f.size here and refused every phone photo.
        try {
          const data = await compressImage(f, 1800, 0.75);
          next.push({ name: f.name, type: 'image/jpeg', size: Math.round(data.length * 0.75), data });
        } catch {
          setError(`„${f.name}" ვერ დამუშავდა — სცადე JPEG ან PNG.`);
        }
      }
      setDocs(next);
      sfx.beep(640);
    } catch { setError('ფაილი ვერ აიტვირთა.'); sfx.reject(); }
    finally {
      setWorking(false);
      if (docInput.current) docInput.current.value = '';
    }
  };

  const submit = () => {
    if (!ready) {
      setError(len < limits.manifestMin
        ? `მანიფესტი ძალიან მოკლეა — გჭირდება კიდევ ${limits.manifestMin - len} სიმბოლო.`
        : !datesOk ? 'გარდაცვალების წელი აუცილებელია.'
        : 'სახელი ძალიან მოკლეა — მინიმუმ 2 სიმბოლო.');
      sfx.reject();
      manifestRef.current?.focus();
      return;
    }
    onSubmit({
      designation: designation.trim(), manifest: manifest.trim(), portrait, docs,
      letter: letter.trim(), restoreNote: restoreNote.trim(), sampleStatus,
      sampleNote: sampleNote.trim(), kin: kin.trim(),
      lifeStatus, bornYear: bornYear.trim(), diedYear: lifeStatus === 'alive' ? '' : diedYear.trim(),
    });
  };

  const field = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(57,255,106,0.25)',
    color: '#d9ffe4',
  } as const;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex items-end sm:items-center justify-center p-3"
      style={{ background: 'rgba(0,6,3,0.85)', backdropFilter: 'blur(6px)' }}
      onClick={onCancel}
    >
      <motion.div
        initial={{ y: 26, scale: 0.99 }} animate={{ y: 0, scale: 1 }} exit={{ y: 18, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl p-4 max-h-[90vh] overflow-y-auto"
        style={{ border: '1px solid rgba(57,255,106,0.32)', background: 'linear-gradient(165deg, #04140c, #010806)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <p className="font-mono text-[13px] font-bold tracking-wider" style={{ color: '#39ff6a' }}>
            {subject ? 'ჩანაწერის განახლება' : 'შემოუერთდი M.A.R.S.-ს'}
          </p>
          <button onClick={onCancel} className="ml-auto font-mono text-[12px] px-2 py-0.5 rounded"
            style={{ border: '1px solid rgba(57,255,106,0.22)', color: 'rgba(57,255,106,0.7)' }}>✕</button>
        </div>

        {/* 1 — portrait + name */}
        <div className="flex gap-3">
          <button
            onClick={() => portraitInput.current?.click()}
            disabled={working}
            className="shrink-0 rounded-xl overflow-hidden relative transition-all active:scale-95 disabled:opacity-60"
            style={{ width: 76, height: 76, border: '1px dashed rgba(57,255,106,0.4)', background: 'rgba(255,255,255,0.04)' }}
            aria-label="პორტრეტის არჩევა"
          >
            {portrait
              ? <img src={portrait} alt="" className="w-full h-full object-cover" />
              : (
                <span className="flex flex-col items-center justify-center w-full h-full font-mono"
                  style={{ color: 'rgba(57,255,106,0.6)', fontSize: 10, gap: 2 }}>
                  <span style={{ fontSize: 20 }}>{working ? '…' : '🖼'}</span>
                  ფოტო
                </span>
              )}
          </button>
          <input ref={portraitInput} type="file" accept={IMAGE_ACCEPT} style={{ display: 'none' }}
            onChange={e => void pickPortrait(e.target.files?.[0])} />

          <div className="flex-1 min-w-0">
            <label className="block font-mono text-[11px] mb-1" style={{ color: 'rgba(120,255,160,0.7)' }}>
              1. სახელი არქივში
            </label>
            <input
              value={designation}
              onChange={e => setDesignation(e.target.value.slice(0, limits.designationMax))}
              placeholder="მაგ. ORPHEUS, ნიკა, ჩრდილი…"
              className="w-full rounded-lg px-3 py-2 font-mono text-[13px] outline-none"
              style={field}
            />
            {portrait && (
              <button onClick={() => setPortrait(null)}
                className="mt-1 font-mono text-[10px]" style={{ color: 'rgba(255,95,109,0.75)' }}>
                ფოტოს მოხსნა
              </button>
            )}
          </div>
        </div>

        {/* Status. A record can be switched later — that is how someone's own
            archive becomes a memorial without being rebuilt. */}
        <label className="block font-mono text-[11px] mt-3 mb-1.5" style={{ color: 'rgba(120,255,160,0.7)' }}>
          სტატუსი
        </label>
        <div className="flex gap-1.5">
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
            <input value={bornYear} onChange={e => setBornYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric" placeholder="დაბადების წელი"
              className="flex-1 rounded-lg px-3 py-2 font-mono text-[13px] outline-none" style={field} />
            <input value={diedYear} onChange={e => setDiedYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric" placeholder="გარდაცვალების *"
              className="flex-1 rounded-lg px-3 py-2 font-mono text-[13px] outline-none" style={field} />
          </div>
        )}

        {/* 2 — the manifest */}
        <label className="block font-mono text-[11px] mt-3 mb-1" style={{ color: 'rgba(120,255,160,0.7)' }}>
          2. მანიფესტი — ვინ ხარ, საკუთარი სიტყვებით
        </label>
        <div className="flex flex-wrap gap-1 mb-1.5">
          {PROMPTS.map(p => (
            <button key={p}
              onClick={() => { setManifest(m => (m ? `${m}\n${p} ` : `${p} `)); manifestRef.current?.focus(); }}
              className="font-mono text-[10px] px-1.5 py-0.5 rounded transition-all active:scale-95"
              style={{ border: '1px solid rgba(125,249,255,0.22)', color: 'rgba(125,249,255,0.75)' }}>
              + {p}
            </button>
          ))}
        </div>
        <textarea
          ref={manifestRef}
          value={manifest}
          onChange={e => setManifest(e.target.value.slice(0, limits.manifestMax))}
          rows={6}
          placeholder={PLACEHOLDER}
          className="w-full rounded-lg px-3 py-2 font-mono text-[13px] outline-none resize-none"
          style={{ ...field, lineHeight: 1.5 }}
        />
        <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div style={{
            width: `${pct}%`, height: '100%',
            background: len >= limits.manifestMin ? '#39ff6a' : '#ffd45a',
            transition: 'width 0.2s ease',
          }} />
        </div>
        <p className="font-mono text-[10px] mt-1" style={{ color: len >= limits.manifestMin ? 'rgba(57,255,106,0.7)' : 'rgba(255,212,90,0.85)' }}>
          {len >= limits.manifestMin ? `მზადაა · ${len}/${limits.manifestMax}` : `კიდევ ${limits.manifestMin - len} სიმბოლო`}
        </p>

        {/* 3 — files */}
        <label className="block font-mono text-[11px] mt-3 mb-1" style={{ color: 'rgba(120,255,160,0.7)' }}>
          3. ფაილები — არასავალდებულო
        </label>
        <p className="font-mono text-[10px] mb-1.5" style={{ color: 'rgba(255,255,255,0.32)' }}>
          ფოტოები, დოკუმენტები, სკანები. სურათები ავტომატურად იკუმშება — ზომაზე ფიქრი არ გჭირდება.
        </p>
        <div className="space-y-1">
          {docs.map((d, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
              style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
              <span className="text-[14px]">{d.type === 'application/pdf' ? '📄' : '🖼'}</span>
              <span className="font-mono text-[11px] truncate flex-1" style={{ color: 'rgba(255,255,255,0.7)' }}>{d.name}</span>
              <span className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{fileSize(d.size)}</span>
              <button onClick={() => setDocs(ds => ds.filter((_, j) => j !== i))}
                className="font-mono text-[12px] px-1" style={{ color: 'rgba(255,95,109,0.8)' }} aria-label="წაშლა">✕</button>
            </div>
          ))}
        </div>
        {docs.length < limits.docsMax && (
          <button onClick={() => docInput.current?.click()} disabled={working}
            className="w-full mt-1.5 py-2 rounded-lg font-mono text-[12px] transition-all active:scale-[0.98] disabled:opacity-50"
            style={{ border: '1px dashed rgba(125,249,255,0.35)', background: 'rgba(125,249,255,0.05)', color: 'rgba(125,249,255,0.85)' }}>
            {working ? 'მუშავდება…' : `+ ფაილის დამატება (${docs.length}/${limits.docsMax})`}
          </button>
        )}
        <input ref={docInput} type="file" accept={DOC_ACCEPT} multiple style={{ display: 'none' }}
          onChange={e => void pickDocs(e.target.files)} />

        {/* 4 — the preservation record */}
        <button onClick={() => setShowPreserve(v => !v)}
          className="w-full mt-4 py-2 rounded-xl flex items-center gap-2 px-3 transition-all active:scale-[0.99]"
          style={{ border: '1px solid rgba(255,212,90,0.3)', background: 'rgba(255,212,90,0.06)' }}>
          <span className="text-[14px]">🧬</span>
          <span className="font-mono text-[12px]" style={{ color: '#ffd45a' }}>4. აღდგენის პაკეტი</span>
          <span className="ml-auto font-mono text-[11px]" style={{ color: 'rgba(255,212,90,0.5)' }}>
            {showPreserve ? '▲' : (letter || restoreNote || sampleStatus !== 'none' || kin) ? '● შევსებული' : 'არასავალდებულო ▼'}
          </span>
        </button>

        {showPreserve && (
          <div className="mt-2 space-y-3">
            <p className="font-mono text-[10px] leading-relaxed px-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
              ეს ნაწილი მომავალს ეკუთვნის. თუ ოდესმე ტექნოლოგია იმ დონეს მიაღწევს, ეს ჩანაწერი
              იქნება ის, რაც შენგან დარჩა. ყველაფერი აქ <b>მხოლოდ შენ გხედავ</b>.
            </p>

            <div>
              <label className="block font-mono text-[11px] mb-1" style={{ color: 'rgba(120,255,160,0.7)' }}>
                წერილი მომავალს
              </label>
              <textarea
                value={letter}
                onChange={e => setLetter(e.target.value.slice(0, limits.letterMax))}
                rows={5}
                placeholder={LETTER_PLACEHOLDER}
                className="w-full rounded-lg px-3 py-2 font-mono text-[12px] outline-none resize-none"
                style={{ ...field, lineHeight: 1.5 }}
              />
              <p className="font-mono text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
                {letter.length}/{limits.letterMax}
              </p>
            </div>

            <div>
              <label className="block font-mono text-[11px] mb-1" style={{ color: 'rgba(120,255,160,0.7)' }}>
                რა უნდა იცოდნენ
              </label>
              <textarea
                value={restoreNote}
                onChange={e => setRestoreNote(e.target.value.slice(0, limits.restoreNoteMax))}
                rows={3}
                placeholder="ჯანმრთელობა, ალერგიები, ენა რომელზეც ლაპარაკობ, ვინ არის შენთვის მნიშვნელოვანი…"
                className="w-full rounded-lg px-3 py-2 font-mono text-[12px] outline-none resize-none"
                style={{ ...field, lineHeight: 1.5 }}
              />
            </div>

            <div>
              <label className="block font-mono text-[11px] mb-1.5" style={{ color: 'rgba(120,255,160,0.7)' }}>
                ბიოლოგიური ნიმუში
              </label>
              {/* Honest by design: nothing here collects DNA. It records whether
                  a sample exists and where the subject keeps it. */}
              <p className="font-mono text-[10px] mb-1.5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
                M.A.R.S. ბიოლოგიურ მასალას <b>არ აგროვებს</b> — მხოლოდ აღრიცხავს. ნიმუში შენთან რჩება.
              </p>
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
              <p className="font-mono text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {SAMPLE_INFO[sampleStatus].hint}
              </p>
              {sampleStatus !== 'none' && (
                <input
                  value={sampleNote}
                  onChange={e => setSampleNote(e.target.value.slice(0, limits.sampleNoteMax))}
                  placeholder="სად ინახება (მაგ. თმის ღერი, სახლში, დალუქულ კონვერტში)"
                  className="w-full mt-1.5 rounded-lg px-3 py-2 font-mono text-[12px] outline-none"
                  style={field}
                />
              )}
            </div>

            <div>
              <label className="block font-mono text-[11px] mb-1" style={{ color: 'rgba(120,255,160,0.7)' }}>
                საკონტაქტო პირი
              </label>
              <input
                value={kin}
                onChange={e => setKin(e.target.value.slice(0, limits.kinMax))}
                placeholder="ვის მიმართონ შენს შესახებ"
                className="w-full rounded-lg px-3 py-2 font-mono text-[12px] outline-none"
                style={field}
              />
            </div>
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
            style={{ border: '1px solid rgba(57,255,106,0.45)', background: 'rgba(57,255,106,0.14)', color: '#39ff6a' }}>
            {busy ? '…' : subject ? 'განახლება' : 'შენახვა'}
          </button>
        </div>
        {subject && (
          <p className="font-mono text-[10px] mt-2 text-center" style={{ color: 'rgba(120,255,160,0.45)' }}>
            კოდი #{subject.code} უცვლელი რჩება.
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}
