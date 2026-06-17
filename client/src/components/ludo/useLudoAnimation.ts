import { useState, useEffect, useRef } from 'react';
import type { LudoColor, LudoMatchPublic } from '@/types/ludo';

export const WIN_POS = 57;
export const STEP_MS = 155;

export type DisplayPositions = Map<string, number>;

function buildPath(from: number, to: number): number[] {
  if (to === -1) return [-1];
  if (from === -1) {
    const p: number[] = [];
    for (let i = 0; i <= to; i++) p.push(i);
    return p;
  }
  if (from === to) return [];
  const p: number[] = [];
  for (let i = from + 1; i <= to; i++) p.push(i);
  return p;
}

export function useLudoAnimation(match: LudoMatchPublic | null) {
  const [displayPos, setDisplayPos] = useState<DisplayPositions>(new Map());
  const [isAnimating, setIsAnimating]   = useState(false);
  const prevRef   = useRef<LudoMatchPublic | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!match) {
      prevRef.current = null;
      setDisplayPos(new Map());
      setIsAnimating(false);
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      return;
    }

    if (!prevRef.current) {
      const m = new Map<string, number>();
      for (const p of match.red.pieces) m.set(`red-${p.id}`, p.pos);
      if (match.blue) for (const p of match.blue.pieces) m.set(`blue-${p.id}`, p.pos);
      setDisplayPos(m);
      prevRef.current = match;
      return;
    }

    const prev = prevRef.current;
    const moves: Array<{ key: string; path: number[] }> = [];

    const detect = (color: LudoColor) => {
      const curr = color === 'red' ? match.red.pieces : (match.blue?.pieces ?? []);
      const prv  = color === 'red' ? prev.red.pieces  : (prev.blue?.pieces  ?? []);
      for (const cp of curr) {
        const pp = prv.find(p => p.id === cp.id);
        if (pp && pp.pos !== cp.pos) {
          moves.push({ key: `${color}-${cp.id}`, path: buildPath(pp.pos, cp.pos) });
        }
      }
    };
    detect('red');
    detect('blue');
    prevRef.current = match;

    if (!moves.length) return;

    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setIsAnimating(true);

    let maxDelay = 0;
    for (const { key, path } of moves) {
      let d = 0;
      for (const pos of path) {
        d += STEP_MS;
        const t = setTimeout(() => {
          setDisplayPos(p => new Map(p).set(key, pos));
        }, d);
        timersRef.current.push(t);
      }
      maxDelay = Math.max(maxDelay, d);
    }

    const done = setTimeout(() => setIsAnimating(false), maxDelay + 80);
    timersRef.current.push(done);

    return () => { timersRef.current.forEach(clearTimeout); };
  }, [match]);

  return { displayPos, isAnimating };
}
