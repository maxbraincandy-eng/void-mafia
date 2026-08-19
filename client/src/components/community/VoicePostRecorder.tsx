import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useT } from '@/store/langStore';
import { startVoiceCapture, recorderOptions, preparePlayback, type VoiceCapture } from '@/lib/voiceCapture';
import { MicLevel } from '@/components/ui/MicLevel';
import { VoiceFxPicker } from '@/components/ui/VoiceFxPicker';
import { masterVoice } from '@/lib/voiceMaster';
import type { RenderedVoice, VoiceFx } from '@/lib/voiceFx';
import { useMyLimits } from '@/store/vipStore';

interface Props {
  onDone: (audioDataUri: string, duration: number, fx: VoiceFx | null) => void;
  onClose: () => void;
}

export function VoicePostRecorder({ onDone, onClose }: Props) {
  const t = useT();
  const [state, setState] = useState<'idle' | 'recording' | 'preview'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioData, setAudioData] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [pick, setPick] = useState<RenderedVoice | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const mrRef = useRef<MediaRecorder | null>(null);
  const captureRef = useRef<VoiceCapture | null>(null);
  const [levelFn, setLevelFn] = useState<(() => number | null) | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Both numbers come from the tier, and both have to: capturing 180 seconds
  // against a 9 MB ceiling would record the clip and then fail to send it.
  const limits = useMyLimits();
  const MAX = limits.voiceSeconds;
  const BYTE_CAP = Math.max(8_800_000, limits.voiceBytes - 200_000);

  const start = async () => {
    try {
      const capture = await startVoiceCapture();
      captureRef.current = capture;
      setLevelFn(() => capture.level);
      const mr = new MediaRecorder(capture.stream, recorderOptions(capture));
      mrRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        captureRef.current?.stop();
        captureRef.current = null;
        const blob = new Blob(chunksRef.current, { type: mr.mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setAudioDuration(elapsed);
        const reader = new FileReader();
        reader.onload = () => setAudioData(reader.result as string);
        reader.readAsDataURL(blob);
        setState('preview');
        // Levelled in the background; the preview swaps over when it is ready.
        void masterVoice(blob, BYTE_CAP).then(m => {
          if (!m.changed) return;
          setAudioBlob(m.blob);
          setAudioUrl(URL.createObjectURL(m.blob));
          setAudioData(m.dataUrl);
        }).catch(() => { /* keep the original */ });
      };
      mr.start(100);
      setState('recording');
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(e => {
          if (e + 1 >= MAX) { stop(); return MAX; }
          return e + 1;
        });
      }, 1000);
    } catch { alert(t.commB.micNeeded); }
  };

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    mrRef.current?.stop();
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const handlePost = () => {
    // Whichever voice is selected is what gets posted; the effect name travels
    // with it so the feed can label the post.
    if (pick) { onDone(pick.dataUrl, audioDuration, pick.fx); return; }
    if (audioData) onDone(audioData, audioDuration, null);
  };

  const pct = (elapsed / MAX) * 100;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="w-full max-w-lg rounded-t-3xl"
        style={{ background: '#0d0a1a', border: '1px solid rgba(155,0,255,0.2)', borderBottom: 'none', padding: '20px 20px 32px' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#c084fc', letterSpacing: '0.1em' }}>🎙 VOICE POST</span>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', borderRadius: 10, width: 30, height: 30, fontSize: 14, cursor: 'pointer' }}>✕</button>
        </div>

        {state === 'idle' && (
          <div className="flex flex-col items-center gap-5">
            <button onClick={start} style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(155,0,255,0.18)', border: '2px solid rgba(155,0,255,0.6)', color: '#c084fc', fontSize: 32, cursor: 'pointer', boxShadow: '0 0 28px rgba(155,0,255,0.3)' }}>🎙</button>
            <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{t.commB.startRecording}</p>
          </div>
        )}

        {state === 'recording' && (
          <div className="flex flex-col items-center gap-5">
            <motion.button
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
              onClick={stop}
              style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,0,80,0.18)', border: '2px solid rgba(255,0,80,0.7)', color: '#ff2255', fontSize: 32, cursor: 'pointer', boxShadow: '0 0 28px rgba(255,0,80,0.3)' }}
            >⏹</motion.button>
            {/* What the microphone is actually hearing, above the time bar. */}
            {levelFn && (
              <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                <MicLevel level={levelFn} bars={28} color="#ff2255" dim="rgba(255,34,85,0.2)" height={22} />
              </div>
            )}
            <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 2, background: '#ff2255', width: `${pct}%`, transition: 'width 1s linear' }}/>
            </div>
            <p style={{ fontFamily: 'monospace', fontSize: 12, color: '#ff2255' }}>{elapsed}s / {MAX}s ● {t.commB.recording}</p>
          </div>
        )}

        {state === 'preview' && audioUrl && (
          <div className="flex flex-col gap-4">
            <VoiceFxPicker source={audioBlob} maxChars={BYTE_CAP} onPick={setPick} />
            <audio key={pick?.dataUrl ?? 'original'} src={pick?.dataUrl ?? audioUrl}
              onPlay={preparePlayback}
              controls style={{ width: '100%', borderRadius: 10 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setAudioUrl(null); setAudioData(null); setAudioBlob(null); setPick(null); setState('idle'); setElapsed(0); }}
                style={{ flex: 1, padding: '10px 0', borderRadius: 12, fontFamily: 'monospace', fontSize: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
                {t.commB.restart}
              </button>
              <button onClick={handlePost}
                style={{ flex: 2, padding: '10px 0', borderRadius: 12, fontFamily: 'monospace', fontSize: 12, background: 'rgba(155,0,255,0.18)', border: '1.5px solid rgba(155,0,255,0.5)', color: '#c084fc', cursor: 'pointer' }}>
                {t.commB.publishVoice}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>,
    document.body
  );
}
