import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useIncognitoStore } from '@/store/incognitoStore';
import { useMyLimits } from '@/store/vipStore';
import { VipSheet } from '@/components/ui/VipSheet';
import {
  NATURAL, SYNTHETIC, DISGUISE_LABEL, DISGUISE_ICON, buildDisguise, type Disguise,
} from '@/lib/voiceDisguise';

/**
 * The lobby's incognito control — verified only.
 *
 * Two halves, deliberately separate: hiding your NAME is a request to the
 * server, hiding your VOICE happens in this browser before anything is
 * published. Someone may well want one without the other — an alias with your
 * own voice fools nobody who has played with you, and your own name with a
 * different voice is just a costume — so neither implies the other, and the
 * panel says which one is actually on.
 *
 * The preview is not decoration. A voice you have not heard is a voice you will
 * not trust enough to use, and hearing yourself is the only way to know the
 * disguise is working.
 */

/** Record a couple of seconds and play it back through the chosen voice. */
function useVoicePreview() {
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

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
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

export function IncognitoPanel() {
  // Read from the same table the server enforces, rather than from "am I a
  // VIP" — one edit in vipService then moves the gate and the pitch together.
  const limits = useMyLimits();
  const vip = limits.incognito || limits.liveDisguise;
  const { hideName, alias, voice, busy, error, setNameHidden, setVoice, clearError } = useIncognitoStore();
  const [open, setOpen] = useState(false);
  const [pitch, setPitch] = useState(false);
  const preview = useVoicePreview();

  const on = hideName || !!voice;

  return (
    <>
      <button
        onClick={() => (vip ? setOpen(o => !o) : setPitch(true))}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono transition-all active:scale-95"
        style={{
          fontSize: 11,
          border: `1px solid ${on ? 'rgba(167,139,250,0.55)' : 'rgba(255,255,255,0.12)'}`,
          background: on ? 'rgba(167,139,250,0.16)' : 'rgba(255,255,255,0.04)',
          color: on ? '#c4b5fd' : 'rgba(255,255,255,0.5)',
        }}
      >
        <span style={{ fontSize: 13 }}>{vip ? (on ? '🕶' : '🎭') : '🔒'}</span>
        ინკოგნიტო
        {on && <span style={{ opacity: 0.7 }}>· {hideName && voice ? 'ორივე' : hideName ? 'სახელი' : 'ხმა'}</span>}
      </button>

      <AnimatePresence>
        {open && vip && (
          <motion.div
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            className="overflow-hidden w-full"
          >
            <div
              className="mt-2 rounded-2xl p-3"
              style={{ background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.22)' }}
            >
              {/* ── name ── */}
              <div className="flex items-center gap-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-display font-bold text-white" style={{ fontSize: 12.5 }}>სახელის დამალვა</p>
                  <p className="font-mono text-white/35" style={{ fontSize: 10.5, lineHeight: 1.4 }}>
                    {hideName && alias
                      ? <>ოთახი გხედავს როგორც <span style={{ color: '#c4b5fd' }}>{alias}</span></>
                      : 'ბეჯი, ფერი და პროფილიც იმალება'}
                  </p>
                </div>
                <button
                  onClick={() => void setNameHidden(!hideName)}
                  disabled={busy}
                  className="flex-shrink-0 rounded-full transition-all active:scale-95 disabled:opacity-50"
                  style={{
                    width: 46, height: 26,
                    background: hideName ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.1)',
                    border: `1px solid ${hideName ? 'rgba(167,139,250,0.7)' : 'rgba(255,255,255,0.16)'}`,
                  }}
                >
                  <motion.span
                    layout
                    transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                    className="block rounded-full"
                    style={{
                      width: 20, height: 20, margin: '2px',
                      marginLeft: hideName ? 23 : 2,
                      background: hideName ? '#fff' : 'rgba(255,255,255,0.5)',
                    }}
                  />
                </button>
              </div>

              <div className="my-2.5" style={{ height: 1, background: 'rgba(255,255,255,0.07)' }} />

              {/* ── voice ── */}
              <p className="font-display font-bold text-white" style={{ fontSize: 12.5 }}>ხმის შეცვლა</p>
              <p className="font-mono text-white/35 mb-2" style={{ fontSize: 10.5, lineHeight: 1.4 }}>
                არა ეფექტი — სხვა ხმა. სიტყვები სუფთად ისმის.
              </p>

              {/* Two groups, because they answer different questions. The
                  natural ones keep your own vocal folds and resize them: fully
                  clear, plainly a person, just not you. The synthetic ones
                  replace the source entirely — nobody can place you, at the
                  cost of sounding built. Saying which is which is the only way
                  a player can choose the trade they actually want. */}
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

              {error && (
                <p
                  className="font-mono mt-2 text-center"
                  style={{ fontSize: 10.5, color: '#ff5f6d' }}
                  onClick={clearError}
                >{error}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <VipSheet open={pitch} onClose={() => setPitch(false)} />
    </>
  );
}
