import type { DilemmaScenario } from './types';
import { experienceMachine } from './scenarios/experienceMachine';

// Playable dilemmas. New ones: write a scenario file and append it here.
export const DILEMMAS: DilemmaScenario[] = [experienceMachine];

// Teasers for upcoming dilemmas — shown greyed ("მალე") in the hub so the
// category feels alive. Promote one by shipping its scenario into DILEMMAS.
export interface DilemmaTeaser { id: string; title: string; subtitle: string; emoji: string; accent: string }
export const DILEMMA_TEASERS: DilemmaTeaser[] = [
  { id: 'trolley', title: 'ისრის გადამრთველი', subtitle: 'ხუთი კაცი თუ ერთი — ტროლეის პრობლემა', emoji: '🚋', accent: '#ff8c6b' },
  { id: 'triage', title: 'ტრიაჟი', subtitle: 'ერთი აპარატი, ხუთი დაჭრილი', emoji: '🩺', accent: '#6bd6a0' },
  { id: 'judge', title: 'მოსამართლე', subtitle: 'უდანაშაულო თუ ამბოხი — ვის გასწირავ?', emoji: '⚖️', accent: '#d6b46b' },
  { id: 'confession', title: 'აღსარების საიდუმლო', subtitle: 'დაარღვევ ბეჭედს სიცოცხლის გადასარჩენად?', emoji: '🕯', accent: '#c9a0ff' },
];
