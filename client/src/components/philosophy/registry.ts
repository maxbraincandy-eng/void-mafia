import type { PhiloScenario } from './types';
import { chineseRoom } from './scenarios/chineseRoom';
import { brainInVat } from './scenarios/brainInVat';
import { teleporter } from './scenarios/teleporter';
import { newcomb } from './scenarios/newcomb';

// Playable thought experiments. New ones: write a scenario file and append here.
export const PHILOSOPHIES: PhiloScenario[] = [chineseRoom, brainInVat, teleporter, newcomb];

// Teasers for upcoming experiments — shown greyed ("მალე") so the category
// feels alive. Promote one by shipping its scenario into PHILOSOPHIES.
export interface PhiloTeaser { id: string; title: string; subtitle: string; emoji: string; accent: string }
export const PHILO_TEASERS: PhiloTeaser[] = [
  { id: 'marys-room', title: 'მარიამის ოთახი', subtitle: 'ცოდნა vs განცდა — ქვალიას პრობლემა', emoji: '🎨', accent: '#6fd0ff' },
  { id: 'ship-of-theseus', title: 'თესევსის გემი', subtitle: 'ყველა ნაწილს შეცვლი — იგივე გემია?', emoji: '⛵', accent: '#9ad06f' },
];
