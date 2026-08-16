/**
 * The voice.
 *
 * WHY THIS IS THE MOST IMPORTANT THING ON THE PAGE
 * ───────────────────────────────────────────────
 * Photographs survive by accident — they are in every phone and every album.
 * A voice survives only if someone thought to record it, and it is the first
 * thing people say they can no longer remember. A record that holds a
 * grandmother's voice saying an ordinary sentence is worth more than everything
 * else here put together.
 *
 * So recording has to be possible RIGHT NOW, from the page, in two taps —
 * because the person whose voice it is may still be alive, and the window for
 * getting it does not stay open. Uploading an existing file works too, for
 * recordings already sitting in a phone.
 *
 * WHAT IS NOT DONE HERE
 * ─────────────────────
 * No transcoding, no noise reduction, no "enhancement". Whatever the browser
 * recorded is what is stored, and what is stored is what plays. A voice that
 * has been processed into something cleaner is no longer quite the voice.
 */
import { useEffect, useRef, useState } from 'react';
import { emitWithAck } from '@/lib/socket';
import type { Res } from '@/types/index';
import { genitive, type MarsVoiceClip } from './types';
import * as sfx from './sfx';

const AUDIO_ACCEPT = 'audio/*,.m4a,.mp3,.ogg,.wav,.webm';
const MAX_MS = 10 * 60 * 1000;
/** ~6 MB after base64, matching the server's cap. */
const MAX_CHARS = 8_400_000;

function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Whichever container this browser actually produces. */
function pickMime(): string | undefined {
  const R = (window as any).MediaRecorder;
  if (!R?.isTypeSupported) return undefined;
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (R.isTypeSupported(m)) return m;
  }
  return undefined;
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('ვერ წაიკითხა'));
    fr.readAsDataURL(blob);
  });
}

export function MarsVoice({
  subjectId, clips, canEdit, accent, personName, onChange,
}: {
  subjectId: string;
  clips: MarsVoiceClip[];
  canEdit: boolean;
  accent: string;
  personName: string;
  onChange: (next: MarsVoiceClip[]) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ url: string; blob: Blob; ms: number } | null>(null);
  const [caption, setCaption] = useState('');

  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearInterval(timer.current);
    rec.current?.stream?.getTracks().forEach(t => t.stop());
  }, []);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const r = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        // Speech, not music: 32 kbps keeps ten minutes under a few megabytes
        // while staying clearly intelligible.
        audioBitsPerSecond: 32000,
      });
      chunks.current = [];
      r.ondataavailable = e => { if (e.data.size > 0) chunks.current.push(e.data); };
      r.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks.current, { type: r.mimeType || 'audio/webm' });
        const ms = Date.now() - startedAt.current;
        setPending({ url: URL.createObjectURL(blob), blob, ms });
      };
      startedAt.current = Date.now();
      r.start();
      rec.current = r;
      setRecording(true);
      setElapsed(0);
      timer.current = window.setInterval(() => {
        const ms = Date.now() - startedAt.current;
        setElapsed(ms);
        if (ms >= MAX_MS) stop();
      }, 200);
    } catch {
      setError('მიკროფონზე წვდომა ვერ მივიღე. შეამოწმე ბრაუზერის ნებართვა, ან ატვირთე ფაილი.');
    }
  };

  const stop = () => {
    if (timer.current) { window.clearInterval(timer.current); timer.current = null; }
    try { rec.current?.stop(); } catch { /* already stopped */ }
    rec.current = null;
    setRecording(false);
  };

  const send = async (blob: Blob, ms: number) => {
    setBusy(true); setError(null);
    try {
      const data = await toDataUrl(blob);
      if (data.length > MAX_CHARS) {
        setError('ჩანაწერი ძალიან დიდია. სცადე უფრო მოკლე, ან შეკუმშული ფაილი.');
        setBusy(false);
        return;
      }
      const res = await emitWithAck<any, Res<MarsVoiceClip>>('mars:media_add', {
        subjectId, kind: 'voice', data, caption: caption.trim(), durationMs: Math.round(ms),
      });
      if ('ok' in res && res.ok) {
        onChange([...clips, res.data]);
        setPending(null); setCaption('');
        sfx.accept();
      } else { setError(('error' in res && res.error) || 'ვერ აიტვირთა'); sfx.reject(); }
    } catch { setError('ვერ აიტვირთა.'); }
    finally { setBusy(false); }
  };

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    // Duration is read from the file itself where the container reports it;
    // when it does not, the clip is stored with no duration rather than a lie.
    let ms = 0;
    try {
      ms = await new Promise<number>(resolve => {
        const a = new Audio();
        a.preload = 'metadata';
        a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration * 1000 : 0);
        a.onerror = () => resolve(0);
        a.src = URL.createObjectURL(f);
      });
    } catch { ms = 0; }
    await send(f, ms);
    if (fileInput.current) fileInput.current.value = '';
  };

  const remove = async (id: string) => {
    const res = await emitWithAck<any, Res<{ deleted: boolean }>>('mars:media_delete', { mediaId: id });
    if ('ok' in res && res.ok && res.data.deleted) onChange(clips.filter(c => c.id !== id));
  };

  if (!canEdit && clips.length === 0) return null;

  return (
    <div>
      <p className="font-mono text-[12px] mb-2" style={{ color: accent }}>
        🎙 ხმა{clips.length ? ` (${clips.length})` : ''}
      </p>

      {clips.length === 0 && !canEdit && null}

      <div className="space-y-2">
        {clips.map(c => (
          <div key={c.id} className="rounded-xl p-2.5"
            style={{ border: '1px solid rgba(125,249,255,0.22)', background: 'rgba(125,249,255,0.05)' }}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-mono text-[12px] flex-1 min-w-0 truncate" style={{ color: '#7df9ff' }}>
                {c.caption || 'ჩანაწერი'}
                {c.year ? <span style={{ color: 'rgba(255,255,255,0.4)' }}> · {c.year}</span> : null}
              </span>
              {c.durationMs > 0 && (
                <span className="font-mono text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{clock(c.durationMs)}</span>
              )}
              {canEdit && (
                <button onClick={() => void remove(c.id)}
                  className="font-mono text-[10px]" style={{ color: 'rgba(255,95,109,0.7)' }}>წაშლა</button>
              )}
            </div>
            {/* preload="none": a page with eight clips must not fetch eight files. */}
            <audio controls preload="none" src={`/mars/voice/${c.id}`} className="w-full" style={{ height: 34 }} />
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="mt-2">
          {pending ? (
            <div className="rounded-xl p-2.5" style={{ border: `1px solid ${accent}55`, background: `${accent}0d` }}>
              <p className="font-mono text-[11px] mb-1.5" style={{ color: accent }}>
                მოისმინე, სანამ შეინახავ · {clock(pending.ms)}
              </p>
              <audio controls src={pending.url} className="w-full" style={{ height: 34 }} />
              <input value={caption} onChange={e => setCaption(e.target.value.slice(0, 160))}
                placeholder="რა არის ეს ჩანაწერი? (მაგ. სიმღერა, ზღაპარი, ჩვეულებრივი დილა)"
                className="w-full mt-2 rounded-lg px-2.5 py-2 font-mono text-[12px] outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#d9ffe4' }} />
              <div className="flex gap-2 mt-2">
                <button onClick={() => { URL.revokeObjectURL(pending.url); setPending(null); setCaption(''); }}
                  className="flex-1 py-2 rounded-lg font-mono text-[11px]"
                  style={{ border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.5)' }}>
                  გადაგდება
                </button>
                <button onClick={() => void send(pending.blob, pending.ms)} disabled={busy}
                  className="flex-1 py-2 rounded-lg font-mono text-[11px] font-bold disabled:opacity-40"
                  style={{ border: `1px solid ${accent}88`, background: `${accent}22`, color: accent }}>
                  {busy ? '…' : 'შენახვა'}
                </button>
              </div>
            </div>
          ) : recording ? (
            <button onClick={stop}
              className="w-full py-3 rounded-xl font-mono text-[13px] font-bold transition-all active:scale-[0.98]"
              style={{ border: '1px solid rgba(255,95,109,0.6)', background: 'rgba(255,95,109,0.16)', color: '#ff8a94' }}>
              ⏹ გაჩერება · {clock(elapsed)}
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => void start()} disabled={busy}
                className="flex-1 py-2.5 rounded-xl font-mono text-[12px] font-bold transition-all active:scale-[0.98] disabled:opacity-40"
                style={{ border: `1px solid ${accent}66`, background: `${accent}16`, color: accent }}>
                ● ჩაწერა
              </button>
              <button onClick={() => fileInput.current?.click()} disabled={busy}
                className="flex-1 py-2.5 rounded-xl font-mono text-[12px] transition-all active:scale-[0.98] disabled:opacity-40"
                style={{ border: '1px dashed rgba(255,255,255,0.22)', color: 'rgba(255,255,255,0.6)' }}>
                {busy ? '…' : '↑ ფაილი'}
              </button>
              <input ref={fileInput} type="file" accept={AUDIO_ACCEPT} style={{ display: 'none' }}
                onChange={e => void pickFile(e.target.files?.[0])} />
            </div>
          )}
          {clips.length === 0 && !pending && !recording && (
            <p className="font-mono text-[10px] mt-2 leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
              ერთი წინადადებაც კი საკმარისია. ხმა ის არის, რაც ყველაზე მალე ავიწყდებათ —
              ჩაიწერე {personName ? `${genitive(personName)} ხმა` : 'ხმა'}, სანამ შეგიძლია.
            </p>
          )}
        </div>
      )}

      {error && <p className="font-mono text-[10px] mt-1.5 leading-relaxed" style={{ color: '#ff5f6d' }}>{error}</p>}
    </div>
  );
}
