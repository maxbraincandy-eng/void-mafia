export const MAX_LEVEL = 100;

// Levels 1–10: original thresholds (preserved — no existing XP reset)
// Levels 11–100: formula threshold(n) = 5400 + 1200k + 45k² where k = n - 10
export const LEVEL_THRESHOLDS: readonly number[] = [
  // 1–10
  0, 100, 250, 500, 900, 1400, 2100, 3000, 4100, 5400,
  // 11–20
  6645, 7980, 9405, 10920, 12525, 14220, 16005, 17880, 19845, 21900,
  // 21–30
  24045, 26280, 28605, 31020, 33525, 36120, 38805, 41580, 44445, 47400,
  // 31–40
  50445, 53580, 56805, 60120, 63525, 67020, 70605, 74280, 78045, 81900,
  // 41–50
  85845, 89880, 94005, 98220, 102525, 106920, 111405, 115980, 120645, 125400,
  // 51–60
  130245, 135180, 140205, 145320, 150525, 155820, 161205, 166680, 172245, 177900,
  // 61–70
  183645, 189480, 195405, 201420, 207525, 213720, 220005, 226380, 232845, 239400,
  // 71–80
  246045, 252780, 259605, 266520, 273525, 280620, 287805, 295080, 302445, 309900,
  // 81–90
  317445, 325080, 332805, 340620, 348525, 356520, 364605, 372780, 381045, 389400,
  // 91–100
  397845, 406380, 415005, 423720, 432525, 441420, 450405, 459480, 468645, 477900,
];

export function xpForLevel(level: number): number {
  return LEVEL_THRESHOLDS[level - 1] ?? 0;
}

export function xpForNextLevel(level: number): number {
  if (level >= MAX_LEVEL) return LEVEL_THRESHOLDS[MAX_LEVEL - 1]!;
  return LEVEL_THRESHOLDS[level] ?? LEVEL_THRESHOLDS[MAX_LEVEL - 1]!;
}

export function calculateLevel(totalXp: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalXp >= LEVEL_THRESHOLDS[i]!) return Math.min(i + 1, MAX_LEVEL);
  }
  return 1;
}

export function getLevelProgress(totalXp: number) {
  const level = calculateLevel(totalXp);
  if (level >= MAX_LEVEL) {
    return { level, currentXp: totalXp, nextLevelXp: null as null, progressPercent: 100, isMaxLevel: true };
  }
  const lo = xpForLevel(level);
  const hi = xpForNextLevel(level);
  const range = hi - lo;
  return {
    level,
    currentXp: totalXp - lo,
    nextLevelXp: range,
    progressPercent: range > 0 ? Math.min(100, Math.round(((totalXp - lo) / range) * 100)) : 100,
    isMaxLevel: false,
  };
}

export function levelColor(level: number): string {
  if (level >= 80) return '#facc15'; // gold — legendary
  if (level >= 60) return '#ff6b00'; // orange — blood
  if (level >= 40) return '#00e5ff'; // cyan — elite
  if (level >= 20) return '#c084fc'; // light purple — veteran
  return '#9b00ff';                  // deep purple — default
}

export const LEVEL_TITLES: Record<number, { en: string; ka: string }> = {
  5:   { en: 'Neon Rookie',         ka: 'ნეონის ახალბედა' },
  10:  { en: 'Void Initiate',       ka: 'ვოიდის ინიციატი' },
  15:  { en: 'Night Walker',        ka: 'ღამის მგზავრი' },
  20:  { en: 'Mask Bearer',         ka: 'ნიღბის მატარებელი' },
  25:  { en: 'Signal Hunter',       ka: 'სიგნალის მონადირე' },
  30:  { en: 'Shadow Player',       ka: 'ჩრდილის მოთამაშე' },
  40:  { en: 'Tribunal Voice',      ka: 'ტრიბუნალის ხმა' },
  50:  { en: 'Void Veteran',        ka: 'ვოიდის ვეტერანი' },
  60:  { en: 'Black Box Analyst',   ka: 'შავი ყუთის ანალიტიკოსი' },
  70:  { en: 'Blood Moon Survivor', ka: 'სისხლიანი მთვარის გადარჩენილი' },
  80:  { en: 'Master of Lies',      ka: 'ტყუილის ოსტატი' },
  90:  { en: 'The Silent Judge',    ka: 'ჩუმი მოსამართლე' },
  100: { en: 'Void Master',         ka: 'ვოიდის ოსტატი' },
};
