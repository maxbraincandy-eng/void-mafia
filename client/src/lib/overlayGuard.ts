// ── Full-screen overlay guard ─────────────────────────────────────────
// MainApp turns a horizontal swipe into tab navigation. React portals bubble
// events through the REACT tree rather than the DOM one, so a full-screen panel
// portalled to <body> is still, as far as React is concerned, a descendant of
// MainApp — and its swipes navigated the tab underneath, closing the panel.
//
// Every overlay that covers the screen registers here, and the swipe handler
// consults `overlayOpen()`. That is one guard for all of them instead of every
// panel having to remember to call stopPropagation on its own root.
import { useEffect } from 'react';

let depth = 0;
const listeners = new Set<() => void>();

/** True while any full-screen overlay is mounted. */
export function overlayOpen(): boolean { return depth > 0; }

/** Register an overlay; call the returned function to unregister. */
export function pushOverlay(): () => void {
  depth++;
  listeners.forEach(f => f());
  let released = false;
  return () => {
    if (released) return;                 // StrictMode double-invokes cleanups
    released = true;
    depth = Math.max(0, depth - 1);
    listeners.forEach(f => f());
  };
}

export function onOverlayChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * What a full-screen panel should call: blocks the app's swipe navigation and
 * stops the page behind from scrolling, both undone on unmount.
 */
export function useFullscreenOverlay(): void {
  useEffect(() => {
    const release = pushOverlay();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { release(); document.body.style.overflow = prevOverflow; };
  }, []);
}
