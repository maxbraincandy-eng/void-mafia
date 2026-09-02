/**
 * When the table bell rings.
 *
 * A moderator watching twelve tiles is not also watching a clock, and a speaker
 * who has run over does not know it — so the clock says so out loud. That is
 * one line of intent and three ways to get it wrong, all of which end in
 * somebody turning the sound off:
 *
 *   RINGING EVERY TICK. The countdown is recomputed from a clock that advances
 *   several times a second, so "time is up" is true for every one of them. It
 *   has to ring once per speaker, not once per frame.
 *
 *   RINGING TWICE. A speech that runs out advances itself, so "time is up" and
 *   "the floor moved" land within a frame of each other. Two bells in a row is
 *   precisely the noise this was meant to replace.
 *
 *   RINGING ON ARRIVAL. Entering the speech phase already has its own sound.
 *   Announcing the first speaker as well says one thing twice.
 *
 * Pure, and separate from the component, because every one of those is a rule
 * about sequences of states — which is the one thing a screenshot cannot check
 * and a test can.
 */

export type BellSound = 'timeUp' | 'next' | null;

export interface BellMemory {
  /** The speaker the summons has already rung for. */
  rungFor: string | null;
  /** When it rang, so the auto-advance that follows can be recognised. */
  rungAt: number;
  /** Who held the floor last time we looked. */
  prevSpeaker: string | null;
}

export const NO_BELL: BellMemory = { rungFor: null, rungAt: 0, prevSpeaker: null };

export interface BellInput {
  /** The match phase. Only `speech` has a floor and a clock. */
  phase: string;
  /** Who holds the floor, or null. */
  speaker: string | null;
  /** When their time runs out, in epoch ms. 0 when untimed. */
  endsAt: number;
  /** Now, from the component's ticking clock. */
  now: number;
}

/**
 * How long after the summons a change of speaker is treated as its consequence
 * rather than as the moderator cutting somebody off.
 *
 * The auto-advance is a server round trip, so it is not instant; two seconds is
 * far longer than that and far shorter than any real speech.
 */
const ADVANCE_WINDOW_MS = 2000;

export function nextBell(mem: BellMemory, i: BellInput): { mem: BellMemory; play: BellSound } {
  // Anywhere but a speech, the memory resets: the next round's first speaker
  // should arrive quietly rather than inherit the last one's state.
  if (i.phase !== 'speech' || !i.speaker) {
    return { mem: { ...NO_BELL, rungAt: mem.rungAt }, play: null };
  }

  const speakerChanged = mem.prevSpeaker !== null && mem.prevSpeaker !== i.speaker;
  const mem2: BellMemory = { ...mem, prevSpeaker: i.speaker };

  if (speakerChanged) {
    // The floor moved. If the clock just spoke, this is that speech ending and
    // the summons has already covered it.
    const play: BellSound = i.now - mem.rungAt < ADVANCE_WINDOW_MS ? null : 'next';
    return { mem: mem2, play };
  }

  // Same speaker (or the first one of the round): ring only as their time runs
  // out, and only the once.
  const expired = i.endsAt > 0 && i.endsAt - i.now <= 0;
  if (!expired || mem.rungFor === i.speaker) return { mem: mem2, play: null };
  return { mem: { ...mem2, rungFor: i.speaker, rungAt: i.now }, play: 'timeUp' };
}
