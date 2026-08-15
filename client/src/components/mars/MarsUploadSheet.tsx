/**
 * The join / update form.
 *
 * Everything that made the first version fail is handled here explicitly:
 * the manifest is a real textarea with a worked example and tappable prompts,
 * the submit button is disabled (not merely rejected) until the text is long
 * enough, and progress to the minimum is shown as a bar rather than a bare
 * "12/40" that only tells you that you failed.
 *
 * Attachments: one portrait (public, shown in the archive) and up to N private
 * documents (PDF or image). Images are downscaled in the browser before they
 * are ever sent — the server cap exists as a guard, not as the mechanism.
 */
import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { compressImage } from '@/lib/imageUtils';
import { fileSize, type Limits, type MarsDoc, type Subject } from './types';
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

/** Read any file as a data URL. Used for PDFs, which must not be re-encoded. */
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
  onSubmit: (v: { designation: string; manifest: string; portrait: string | null; docs: MarsDoc[] }) => void;
}) {
  const [designation, setDesignation] = useState(subject?.designation ?? '');
  const [manifest, setManifest] = useState(subject?.manifest ?? '');
  const [portrait, setPortrait] = useState<string | null>(subject?.portrait ?? null);
  const [docs, setDocs] = useState<MarsDoc[]>(subject?.docs ?? []);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const manifestRef = useRef<HTMLTextAreaElement | null>(null);
  const portraitInput = useRef<HTMLInputElement | null>(null);
  const docInput = useRef<HTMLInputElement | null>(null);

  const len = manifest.trim().length;
  const ready = len >= limits.manifestMin && designation.trim().length >= 2;
  const pct = Math.min(100, (len / limits.manifestMin) * 100);

  const pickPortrait = async (file: File | undefined) => {
    if (!file) return;
    setWorking(true); setError(null);
    try {
      // Downscaled here so a 6 MB phone photo never travels; 512px is plenty
      // for a 68px card thumbnail on any display.
      setPortrait(await compressImage(file, 512, 0.75));
      sfx.beep(700);
    } catch { setError('სურათი ვერ დამუშავდა.'); sfx.reject(); }
    finally { setWorking(false); }
  };

  const pickDocs = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setWorking(true); setError(null);
    try {
      const next = [...docs];
      for (const f of Array.from(files)) {
        if (next.length >= limits.docsMax) { setError(`მაქსიმუმ ${limits.docsMax} დოკუმენტი.`); break; }
        const isPdf = f.type === 'application/pdf';
        const isImg = f.type.startsWith('image/');
        if (!isPdf && !isImg) { setError('დაშვებულია მხოლოდ PDF ან სურათი.'); continue; }
        if (f.size > limits.docBytesMax) { setError(`„${f.name}" ძალიან დიდია (მაქს. ${fileSize(limits.docBytesMax)}).`); continue; }
        // Images are recompressed; a PDF must be byte-identical or it stops
        // being a readable PDF.
        const data = isPdf ? await readAsDataUrl(f) : await compressImage(f, 1400, 0.72);
        next.push({ name: f.name, type: isPdf ? 'application/pdf' : 'image/jpeg', size: f.size, data });
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
        : 'სახელი ძალიან მოკლეა — მინიმუმ 2 სიმბოლო.');
      sfx.reject();
      manifestRef.current?.focus();
      return;
    }
    onSubmit({ designation: designation.trim(), manifest: manifest.trim(), portrait, docs });
  };

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

        {/* 1 — portrait + name, side by side so step one is visibly small */}
        <div className="flex gap-3">
          <button
            onClick={() => portraitInput.current?.click()}
            className="shrink-0 rounded-xl overflow-hidden relative transition-all active:scale-95"
            style={{ width: 76, height: 76, border: '1px dashed rgba(57,255,106,0.4)', background: 'rgba(255,255,255,0.04)' }}
            aria-label="პორტრეტის არჩევა"
          >
            {portrait
              ? <img src={portrait} alt="" className="w-full h-full object-cover" />
              : (
                <span className="flex flex-col items-center justify-center w-full h-full font-mono"
                  style={{ color: 'rgba(57,255,106,0.6)', fontSize: 10, gap: 2 }}>
                  <span style={{ fontSize: 20 }}>🖼</span>
                  ფოტო
                </span>
              )}
          </button>
          <input ref={portraitInput} type="file" accept="image/*" hidden
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
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(57,255,106,0.25)', color: '#d9ffe4' }}
            />
            {portrait && (
              <button onClick={() => setPortrait(null)}
                className="mt-1 font-mono text-[10px]" style={{ color: 'rgba(255,95,109,0.75)' }}>
                ფოტოს მოხსნა
              </button>
            )}
          </div>
        </div>

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
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(57,255,106,0.25)', color: '#d9ffe4', lineHeight: 1.5 }}
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

        {/* 3 — documents */}
        <label className="block font-mono text-[11px] mt-3 mb-1" style={{ color: 'rgba(120,255,160,0.7)' }}>
          3. დოკუმენტები — არასავალდებულო
        </label>
        <p className="font-mono text-[10px] mb-1.5" style={{ color: 'rgba(255,255,255,0.32)' }}>
          PDF ან სურათი. ინახება შენს არქივში და მხოლოდ შენ ხედავ.
          ანალიზი მხოლოდ ზემოთ დაწერილ ტექსტს ეყრდნობა.
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
        <input ref={docInput} type="file" accept="application/pdf,image/*" multiple hidden
          onChange={e => void pickDocs(e.target.files)} />

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
            {busy ? '…' : subject ? 'განახლება' : 'შემოერთება'}
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
