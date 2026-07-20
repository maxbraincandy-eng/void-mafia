import type { PhiloScenario } from './types';
import { chineseRoom } from './scenarios/chineseRoom';
import { brainInVat } from './scenarios/brainInVat';
import { teleporter } from './scenarios/teleporter';
import { newcomb } from './scenarios/newcomb';
import { marysRoom } from './scenarios/marysRoom';
import { shipOfTheseus } from './scenarios/shipOfTheseus';

// Playable thought experiments. New ones: write a scenario file and append here.
export const PHILOSOPHIES: PhiloScenario[] = [chineseRoom, brainInVat, teleporter, newcomb, marysRoom, shipOfTheseus];

// Teasers for upcoming experiments — shown greyed ("მალე") so the category
// feels alive. Promote one by shipping its scenario into PHILOSOPHIES.
export interface PhiloTeaser { id: string; title: string; subtitle: string; emoji: string; accent: string }
export const PHILO_TEASERS: PhiloTeaser[] = [
  { id: 'buridan', title: 'ბურიდანის ვირი', subtitle: 'ორ იდენტურ არჩევანს შორის გაყინული გონება', emoji: '🐴', accent: '#f2a65e' },
  { id: 'laplace', title: 'ლაპლასის დემონი', subtitle: 'თუ ყველაფერი წინასწარ განსაზღვრულია — ვინ ირჩევს?', emoji: '😈', accent: '#ff6b6b' },
];
