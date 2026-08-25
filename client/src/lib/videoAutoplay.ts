/**
 * One video plays at a time, and it is the one you are looking at.
 *
 * WHY A REGISTRY AND NOT JUST AN OBSERVER PER PLAYER
 * ──────────────────────────────────────────────────
 * An IntersectionObserver on its own will happily report three players as
 * visible at once on a tall screen, and all three start talking. What a feed
 * actually wants is a single winner: whichever player is most centred in the
 * viewport plays, everybody else stops. That decision cannot be made inside one
 * player, because no player can see the others — so it is made here, once, for
 * all of them.
 *
 * WHY IT IS NOT A CONTEXT
 * ───────────────────────
 * Players appear in the feed, in the profile grid's lightbox and in the
 * composer's preview, which are three different trees. A module-level registry
 * is the only thing all three share, and there is exactly one viewport anyway.
 *
 * SCROLLING IS NOT THE TRIGGER, VISIBILITY IS
 * ───────────────────────────────────────────
 * Listening to scroll would mean recomputing on every frame of a fling. The
 * observer fires only when a player crosses a threshold, so a long scroll costs
 * a handful of callbacks rather than a hundred.
 */

type Player = {
  el: HTMLElement;
  onPlay: () => void;
  onPause: () => void;
  /** Last known share of the element inside the viewport, 0…1. */
  ratio: number;
};

const players = new Set<Player>();
let current: Player | null = null;
let observer: IntersectionObserver | null = null;
let raf = 0;

/** Enough of the player on screen to be worth starting. */
const PLAY_AT = 0.55;

/**
 * Pick a winner.
 *
 * Coalesced into one frame because a single scroll can fire the observer for
 * several players at once, and settling after each one would start and stop the
 * same video twice on the way past.
 */
function settle(): void {
  raf = 0;
  let best: Player | null = null;
  for (const p of players) {
    if (p.ratio < PLAY_AT) continue;
    if (!best || p.ratio > best.ratio) best = p;
  }
  if (best === current) return;
  current?.onPause();
  current = best;
  current?.onPlay();
}

function schedule(): void {
  if (raf) return;
  raf = requestAnimationFrame(settle);
}

function ensureObserver(): IntersectionObserver | null {
  if (observer) return observer;
  if (typeof IntersectionObserver === 'undefined') return null;
  observer = new IntersectionObserver(
    entries => {
      for (const e of entries) {
        for (const p of players) {
          if (p.el === e.target) { p.ratio = e.intersectionRatio; break; }
        }
      }
      schedule();
    },
    // A spread of thresholds, so `ratio` is a real number rather than a
    // yes/no — that is what lets the most-visible player win.
    { threshold: [0, 0.25, 0.4, 0.55, 0.7, 0.85, 1] },
  );
  return observer;
}

/**
 * Put a player under the manager's control.
 *
 * `onPlay` and `onPause` are called when this player wins or loses the
 * viewport. Returns the unregister function.
 */
export function registerAutoplay(el: HTMLElement, onPlay: () => void, onPause: () => void): () => void {
  const obs = ensureObserver();
  const p: Player = { el, onPlay, onPause, ratio: 0 };
  players.add(p);
  obs?.observe(el);
  return () => {
    obs?.unobserve(el);
    players.delete(p);
    if (current === p) current = null;
    schedule();
  };
}

/**
 * Somebody pressed play by hand.
 *
 * A deliberate tap outranks the scroll position — otherwise starting a video
 * that is only half on screen would be undone by the next observer callback.
 * Everybody else stops, and this one becomes the current player.
 */
export function claimPlayback(el: HTMLElement): void {
  for (const p of players) {
    if (p.el === el) {
      if (current && current !== p) current.onPause();
      current = p;
      return;
    }
  }
  // Not a registered player (the composer preview, say) — still silence the feed.
  current?.onPause();
  current = null;
}
