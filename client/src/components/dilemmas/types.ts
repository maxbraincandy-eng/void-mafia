// დილემები — reusable moral-dilemma engine.
// Choices are tagged with an ethical leaning (deontology vs utilitarianism);
// the ending names the player's "ethical fingerprint" from the tally + final act.

export type Ethic = 'deon' | 'util' | 'neutral';

export interface DilemmaChoice {
  text: string;
  /** Which ethical framework this choice expresses. */
  ethic?: Ethic;
  setFlags?: Record<string, string | boolean>;
  /** Scene id, or '@end' to finish and resolve the ending. */
  next: string;
}

export interface DilemmaScene {
  id: string;
  title?: string;
  speaker?: string;
  text: string;
  choices: DilemmaChoice[];
}

export interface DilemmaTally {
  deon: number;
  util: number;
}

export interface DilemmaEnding {
  emoji: string;
  /** The ethical-fingerprint label. */
  label: string;
  /** The consequence of the final act. */
  body: string;
  color: string;
}

export interface DilemmaScenario {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  accent: string; // hex
  start: string;
  scenes: DilemmaScene[];
  resolve: (tally: DilemmaTally, flags: Record<string, string | boolean>) => DilemmaEnding;
}
