/**
 * Choose a voice for a recording you have already made.
 *
 * The row is a set of chips, not a dropdown, because trying voices is the
 * point: tapping one renders it and plays it immediately, and every voice
 * already tried is kept, so flicking back and forth costs nothing.
 *
 * The ORIGINAL is always first and always selected to begin with. A voice
 * changer that starts on an effect would be a trap — you would send an altered
 * voice without deciding to.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { VOICE_FX, renderVoiceFx, type RenderedVoice, type VoiceFx } from '@/lib/voiceFx';
import { useMyLimits } from '@/store/vipStore';

export function VoiceFxPicker({
  source, maxChars, accent = '#c084fc', onPick,
}: {
  /** The recording as it came off the microphone. */
  source: Blob | null;
  /** The server's size limit for wherever this is going. */
  maxChars?: number;
  accent?: string;
  /** Fires with the rendered result whenever the choice changes. */
  onPick: (result: RenderedVoice | null) => void;
}) {
  const [active, setActive] = useState<VoiceFx>('none');
  const [busy, setBusy] = useState<VoiceFx | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef(new Map<VoiceFx, RenderedVoice>());
  const audio = useRef<HTMLAudioElement | null>(null);

  // A new recording invalidates everything that was rendered from the old one.
  useEffect(() => {
    cache.current.clear();
    setActive('none');
    setError(null);
  }, [source]);

  useEffect(() => () => { audio.current?.pause(); audio.current = null; }, []);

  const play = useCallback((url: string) => {
    audio.current?.pause();
    const el = new Audio(url);
    audio.current = el;
    void el.play().catch(() => { /* a blocked autoplay is not a failure worth showing */ });
  }, []);

  const choose = async (fx: VoiceFx) => {
    if (!source || busy) return;
    setError(null);

    const had = cache.current.get(fx);
    if (had) {
      setActive(fx);
      onPick(fx === 'none' ? null : had);
      play(had.dataUrl);
      return;
    }

    setBusy(fx);
    try {
      const result = await renderVoiceFx(source, fx, maxChars);
      cache.current.set(fx, result);
      setActive(fx);
      onPick(fx === 'none' ? null : result);
      play(result.dataUrl);
    } catch {
      setError('ეს ხმა ვერ დამუშავდა.');
    } finally {
      setBusy(null);
    }
  };

  const { vipVoices } = useMyLimits();

  if (!source) return null;

  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {VOICE_FX.map(f => {
          const on = active === f.id;
          // Locked voices stay VISIBLE and greyed rather than hidden: a perk
          // nobody knows exists sells nothing, and the tap that explains it is
          // the only place the pitch is relevant.
          const locked = Boolean(f.vip) && !vipVoices;
          return (
            <button
              key={f.id}
              onClick={() => (locked ? setError('ეს ხმა ვერიფიცირებულებისთვისაა 💠') : void choose(f.id))}
              disabled={busy !== null}
              className="flex-shrink-0 px-2.5 py-1.5 rounded-full font-mono text-[11px] transition-all active:scale-95 disabled:opacity-50"
              style={{
                border: `1px solid ${on ? accent : locked ? 'rgba(167,139,250,0.35)' : 'rgba(255,255,255,0.14)'}`,
                background: on ? `${accent}26` : locked ? 'rgba(167,139,250,0.07)' : 'rgba(255,255,255,0.04)',
                color: on ? accent : locked ? 'rgba(167,139,250,0.65)' : 'rgba(255,255,255,0.6)',
              }}
            >
              {busy === f.id ? '…' : `${locked ? '🔒 ' : ''}${f.icon} ${f.label}`}
            </button>
          );
        })}
      </div>
      {error
        ? <p className="font-mono text-[10px] mt-1" style={{ color: '#ff5f6d' }}>{error}</p>
        : active !== 'none' && (
          <p className="font-mono text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
            შეცვლილი ხმა — მიმღები ამას დაინახავს.
          </p>
        )}
    </div>
  );
}
