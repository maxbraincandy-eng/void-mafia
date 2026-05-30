import { useEffect, useRef } from 'react';

export function useAmbientAudio(src: string, volume = 0.18) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!src) return;
    const audio = new Audio(src);
    audio.loop = true;
    audio.volume = volume;
    audioRef.current = audio;

    // Browsers require user interaction before playing audio.
    // We try to play and silently ignore the NotAllowedError.
    const tryPlay = () => {
      audio.play().catch(() => {});
    };

    tryPlay();
    document.addEventListener('click', tryPlay, { once: true });
    document.addEventListener('keydown', tryPlay, { once: true });

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [src, volume]);

  const stop  = () => audioRef.current?.pause();
  const start = () => audioRef.current?.play().catch(() => {});
  const setVol = (v: number) => { if (audioRef.current) audioRef.current.volume = v; };

  return { stop, start, setVol };
}
