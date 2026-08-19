import React, { useEffect, useRef, useState } from 'react';
import { useIncognitoStore } from '@/store/incognitoStore';
import {
  NATURAL, SYNTHETIC, DISGUISE_LABEL, DISGUISE_ICON, buildDisguise, type Disguise,
} from '@/lib/voiceDisguise';

/**
 * Choosing a voice — the half of incognito that is not about your name.
 *
 * Extracted so the mafia lobby and every other game that has voice chat run the
 * SAME picker rather than a copy of it. The choice lives in one store and is
 * applied to whichever LiveKit room is currently connected, so switching from
 * mafia to Lies keeps the voice you picked without asking again.
 *
 * Hiding your NAME is deliberately not here: that is a request to the mafia
 * server about a seat in a mafia room, and there is no equivalent in a game
 * where everybody already knows who is playing.
 */

/** Record a couple of seconds and play it back through the chosen voice. */
export function useVoicePreview() {
  const [state, setState] = useState<'idle' | 'rec' | 'playing'>('idle');
  const stop = useRef<(() => void) | null>(null);

  useEffect(() => () => { stop.current?.(); }, []);

  const run = async (voice: Disguise) => {
    if (state !== 'idle') return;
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      const done = new Promise<Blob>(res => { mr.onstop = () => res(new Blob(chunks, { type: mr.mimeType })); });
      mr.start();
      setState('rec');
      stop.current = () => { try { mr.stop(); } catch { /* already stopped */ } };
      await new Promise(r => setTimeout(r, 2600));
      mr.stop();
      const blob = await done;
      stream.getTracks().forEach(t => t.stop());
      stream = null;

      setState('playing');
      const AC: typeof AudioContext = (window as any).AudioContext ?? (window as any).webkitAudioContext;
      const decodeCtx = new AC();
      const buf = await decodeCtx.decodeAudioData(await blob.arrayBuffer());
      await decodeCtx.close();

      // Rendered offline, then played: the whole point is to hear the finished
      // voice, and rendering is far faster than real time.
      const off = new OfflineAudioContext(1, Math.ceil(buf.duration * 48000), 48000);
      const src = off.createBufferSource();
      const mono = off.createBuffer(1, buf.length, buf.sampleRate);
      mono.getChannelData(0).set(buf.getChannelData(0));
      src.buffer = mono;
      const g = await buildDisguise(off, src, voice);
      g.output.connect(off.destination);
      src.start();
      const out = await off.startRendering();
      g.stop();

      const play = new AC();
      const node = play.createBufferSource();
      node.buffer = out;
      node.connect(play.destination);
      node.onended = () => { void play.close(); setState('idle'); };
      node.start();
      stop.current = () => { try { node.stop(); } catch { /* ended */ } void play.close(); setState('idle'); };
    } catch {
      stream?.getTracks().forEach(t => t.stop());
      setState('idle');
    }
  };

  return { state, run };
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1.5 rounded-full font-mono transition-all active:scale-95"
      style={{
        fontSize: 11,
        border: `1px solid ${on ? 'rgba(167,139,250,0.6)' : 'rgba(255,255,255,0.12)'}`,
        background: on ? 'rgba(167,139,250,0.18)' : 'rgba(255,255,255,0.04)',
        color: on ? '#c4b5fd' : 'rgba(255,255,255,0.5)',
      }}
    >{children}</button>
  );
}

/** The two groups of voices, the preview, and nothing else. */
export function VoiceDisguisePicker() {
  const voice = useIncognitoStore(s => s.voice);
  const setVoice = useIncognitoStore(s => s.setVoice);
  const preview = useVoicePreview();

  return (
    <>
      <p className="font-display font-bold text-white" style={{ fontSize: 12.5 }}>ხმის შეცვლა</p>
      <p className="font-mono text-white/35 mb-2" style={{ fontSize: 10.5, lineHeight: 1.4 }}>
        არა ეფექტი — სხვა ხმა. სიტყვები სუფთად ისმის.
      </p>

      {/* Two groups, because they answer different questions. The natural ones
          keep your own vocal folds and resize them: fully clear, plainly a
          person, just not you. The synthetic ones replace the source entirely —
          nobody can place you, at the cost of sounding built. Saying which is
          which is the only way a player can choose the trade they want. */}
      <Chip on={!voice} onClick={() => void setVoice(null)}>🎙 ჩემი ხმა</Chip>

      <p className="font-mono text-white/25 mt-2.5 mb-1" style={{ fontSize: 9.5, letterSpacing: 0.4 }}>
        ბუნებრივი — სუფთად ისმის, სხვა ადამიანი
      </p>
      <div className="flex flex-wrap gap-1.5">
        {NATURAL.map(d => (
          <Chip key={d} on={voice === d} onClick={() => void setVoice(d)}>
            {DISGUISE_ICON[d]} {DISGUISE_LABEL[d]}
          </Chip>
        ))}
      </div>

      <p className="font-mono text-white/25 mt-2.5 mb-1" style={{ fontSize: 9.5, letterSpacing: 0.4 }}>
        სინთეზური — ვერავინ გიცნობს, ოდნავ მექანიკური
      </p>
      <div className="flex flex-wrap gap-1.5">
        {SYNTHETIC.map(d => (
          <Chip key={d} on={voice === d} onClick={() => void setVoice(d)}>
            {DISGUISE_ICON[d]} {DISGUISE_LABEL[d]}
          </Chip>
        ))}
      </div>

      {voice && (
        <button
          onClick={() => void preview.run(voice)}
          disabled={preview.state !== 'idle'}
          className="w-full mt-2 py-2 rounded-xl font-mono transition-all active:scale-[0.98] disabled:opacity-70"
          style={{ fontSize: 11, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)' }}
        >
          {preview.state === 'rec' ? '● ილაპარაკე…' : preview.state === 'playing' ? '▶ უსმენ შენს ახალ ხმას' : '🎧 მოისმინე როგორ გესმით'}
        </button>
      )}
    </>
  );
}
