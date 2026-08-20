import { emitWithAck } from '@/lib/socket';

/**
 * Ask the server "am I still in a match?" every time this browser (re)connects.
 *
 * THE FAILURE THIS EXISTS FOR
 * ───────────────────────────
 * Every mini-game screen is a pure view of the last state the server pushed. A
 * phone that locks, changes network, or is backgrounded for half a minute gets
 * a brand-new socket, and the match is still holding the old one — so nothing
 * more arrives and the screen simply stops. From the outside it looks like a
 * player who has gone silent, except their voice is still there, because voice
 * runs over a connection that heals itself. That is precisely what happened in
 * ტყუილების ოსტატი: one player could be heard, but could no longer answer or
 * vote, from one question onwards.
 *
 * The server side re-points the row by profile id; this side asks for the
 * current state right away, so the player does not have to wait for the next
 * broadcast — which, mid-writing-phase, could be a minute away.
 *
 * A full reload is the same question with the same answer, so this doubles as
 * "put me back in the game I was in".
 *
 * `vm:auth-ready` (not the raw socket `connect`) is the trigger, because the
 * server identifies the player by the profile attached during authentication —
 * asking before that would be asking as a stranger.
 *
 * `onAnswer(null)` means the server has nothing for us. That is not always the
 * end: a player who drops while the match is still in its LOBBY is removed
 * outright, and the honest recovery there is to walk back in through the front
 * door, which is why each store decides for itself rather than just clearing.
 */
export function registerMatchResume<S>(event: string, onAnswer: (state: S | null) => void): void {
  let inFlight = false;
  const run = () => {
    if (inFlight) return;
    inFlight = true;
    emitWithAck<undefined, { ok: boolean; data?: S | null }>(event)
      .then(r => { if (r?.ok) onAnswer(r.data ?? null); })
      .catch(() => { /* still offline; the next connect asks again */ })
      .finally(() => { inFlight = false; });
  };
  window.addEventListener('vm:auth-ready', run);
}
