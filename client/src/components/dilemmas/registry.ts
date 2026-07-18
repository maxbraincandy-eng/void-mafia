import type { DilemmaScenario } from './types';
import { experienceMachine } from './scenarios/experienceMachine';
import { trolley } from './scenarios/trolley';
import { triage } from './scenarios/triage';
import { judge } from './scenarios/judge';
import { confession } from './scenarios/confession';

// Playable dilemmas. New ones: write a scenario file and append it here.
export const DILEMMAS: DilemmaScenario[] = [experienceMachine, trolley, triage, judge, confession];

// Teasers for upcoming dilemmas — shown greyed ("მალე") in the hub so the
// category feels alive. Promote one by shipping its scenario into DILEMMAS.
export interface DilemmaTeaser { id: string; title: string; subtitle: string; emoji: string; accent: string }
export const DILEMMA_TEASERS: DilemmaTeaser[] = [];
