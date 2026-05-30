import { useEffect, useRef } from 'react';

// Synthetic ambient drone using Web Audio API — no audio file required.
// Creates a low-frequency cyberpunk atmosphere on first user interaction.
export function useAmbientDrone(volume = 0.06) {
  const ctxRef = useRef<AudioContext | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const start = () => {
      if (startedRef.current) return;
      startedRef.current = true;

      try {
        const ctx = new AudioContext();
        ctxRef.current = ctx;

        const masterGain = ctx.createGain();
        masterGain.gain.value = 0;
        masterGain.connect(ctx.destination);

        // Sub-bass drone
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = 55;

        // Low harmonic
        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = 110;

        // Very subtle shimmer (slightly detuned)
        const osc3 = ctx.createOscillator();
        osc3.type = 'sine';
        osc3.frequency.value = 220.5;

        const g1 = ctx.createGain(); g1.gain.value = 1.0;
        const g2 = ctx.createGain(); g2.gain.value = 0.4;
        const g3 = ctx.createGain(); g3.gain.value = 0.08;

        osc1.connect(g1); g1.connect(masterGain);
        osc2.connect(g2); g2.connect(masterGain);
        osc3.connect(g3); g3.connect(masterGain);

        osc1.start(); osc2.start(); osc3.start();

        // Fade in over 3 seconds
        masterGain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 3);
      } catch {}
    };

    document.addEventListener('click',      start, { once: true });
    document.addEventListener('keydown',    start, { once: true });
    document.addEventListener('touchstart', start, { once: true });

    return () => {
      document.removeEventListener('click',      start);
      document.removeEventListener('keydown',    start);
      document.removeEventListener('touchstart', start);
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {});
        ctxRef.current = null;
      }
      startedRef.current = false;
    };
  }, [volume]);
}
