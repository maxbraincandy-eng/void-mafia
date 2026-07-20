// ფილოსოფიური ცდები — interactive thought-experiment engine.
// Mirrors the dilemma engine, but instead of a fixed deon/util axis each
// scenario defines its own two poles (e.g. "computation" vs "understanding").
// The ending names the player's philosophical position from the tally + flags.

export type Pole = 'a' | 'b';

export interface PhiloChoice {
  text: string;
  /** Which pole of this scenario's axis the choice leans toward. */
  lean?: Pole;
  setFlags?: Record<string, string | boolean>;
  /** Scene id, or '@end' to finish and resolve the position. */
  next: string;
}

export interface PhiloScene {
  id: string;
  title?: string;
  speaker?: string;
  text: string;
  choices: PhiloChoice[];
}

export interface PhiloTally { a: number; b: number }

export interface PhiloEnding {
  emoji: string;
  /** The philosophical-position label. */
  label: string;
  body: string;
  color: string;
}

export interface PhiloScenario {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  accent: string; // hex
  /** Meter end labels (short). poleA = left, poleB = right. */
  poleA: string;
  poleB: string;
  start: string;
  scenes: PhiloScene[];
  resolve: (tally: PhiloTally, flags: Record<string, string | boolean>) => PhiloEnding;
}
