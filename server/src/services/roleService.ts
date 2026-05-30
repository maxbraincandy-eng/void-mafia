import { Role, RoleKey, GameSettings, Team } from '../types/index.js';
import { shuffle } from '../utils/helpers.js';

export const ROLES: Record<RoleKey, Role> = {
  mafia: {
    key: 'mafia',
    name: 'Mafia',
    team: 'mafia',
    description: 'Member of the criminal underworld. You know your fellow mafia members.',
    ability: 'Each night, choose a citizen to eliminate.',
    wakeAtNight: true,
    color: 'pink',
    glowColor: '#ff00cc',
  },
  citizen: {
    key: 'citizen',
    name: 'Citizen',
    team: 'town',
    description: 'An ordinary resident fighting for survival. No special ability.',
    ability: 'Vote wisely during the day to eliminate mafia members.',
    wakeAtNight: false,
    color: 'cyan',
    glowColor: '#00f5ff',
  },
  sheriff: {
    key: 'sheriff',
    name: 'Sheriff',
    team: 'town',
    description: 'Law enforcement undercover. You can investigate players each night.',
    ability: 'Each night, investigate one player to learn if they are Mafia.',
    wakeAtNight: true,
    color: 'blue',
    glowColor: '#3b82f6',
  },
  doctor: {
    key: 'doctor',
    name: 'Doctor',
    team: 'town',
    description: 'A medic protecting the innocent. You can save one player each night.',
    ability: 'Each night, protect one player from elimination.',
    wakeAtNight: true,
    color: 'green',
    glowColor: '#00ff88',
  },
  bodyguard: {
    key: 'bodyguard',
    name: 'Bodyguard',
    team: 'town',
    description: 'An elite protector. You shield your target — and die in their place if attacked.',
    ability: 'Each night, guard one player. If mafia attacks them, you die instead.',
    wakeAtNight: true,
    color: 'green',
    glowColor: '#00cc66',
  },
  don: {
    key: 'don',
    name: 'Don',
    team: 'mafia',
    description: 'Leader of the mafia. You appear innocent to Sheriff investigations.',
    ability: 'Each night, choose a citizen to eliminate. Appears clean to Sheriff.',
    wakeAtNight: true,
    color: 'pink',
    glowColor: '#ff00cc',
  },
  maniac: {
    key: 'maniac',
    name: 'Maniac',
    team: 'neutral',
    description: 'A lone killer with no allegiance. Win by being the last one standing.',
    ability: 'Each night, eliminate one player. Win alone.',
    wakeAtNight: true,
    color: 'purple',
    glowColor: '#9b00ff',
  },
  jester: {
    key: 'jester',
    name: 'Jester',
    team: 'neutral',
    description: 'A trickster who wants to be eliminated. Win by getting voted out.',
    ability: 'Get the town to vote you out to win the game.',
    wakeAtNight: false,
    color: 'purple',
    glowColor: '#a855f7',
  },
};

// ── Role distribution table ───────────────────────────────────────────
// Keys: player count → { mafia, sheriff, doctor } (citizens fill the rest)
const DISTRIBUTION: Record<number, { mafia: number; sheriff: number; doctor: number }> = {
  4:  { mafia: 1, sheriff: 1, doctor: 0 },
  5:  { mafia: 1, sheriff: 1, doctor: 1 },
  6:  { mafia: 1, sheriff: 1, doctor: 1 },
  7:  { mafia: 2, sheriff: 1, doctor: 1 },
  8:  { mafia: 2, sheriff: 1, doctor: 1 },
  9:  { mafia: 2, sheriff: 1, doctor: 1 },
  10: { mafia: 3, sheriff: 1, doctor: 0 },  // no Doctor at 10 by spec
  11: { mafia: 3, sheriff: 1, doctor: 1 },
  12: { mafia: 3, sheriff: 1, doctor: 1 },
  13: { mafia: 4, sheriff: 1, doctor: 1 },
  14: { mafia: 4, sheriff: 1, doctor: 1 },
  15: { mafia: 4, sheriff: 2, doctor: 1 },
  16: { mafia: 5, sheriff: 2, doctor: 1 },
};

export function getRecommendedRoles(playerCount: number): { mafia: number; sheriff: number; doctor: number } {
  if (playerCount in DISTRIBUTION) return DISTRIBUTION[playerCount]!;
  const mafia = Math.max(1, Math.floor(playerCount / 3));
  return { mafia, sheriff: 1, doctor: 1 };
}

export function getRole(key: RoleKey): Role {
  return ROLES[key];
}

/**
 * Build a shuffled role deck.
 * Base distribution (mafia/sheriff/doctor) is determined by player count.
 * Optional extra roles (don/maniac/jester/bodyguard) come from room settings.
 * Citizens fill remaining slots.
 */
export function buildRoleDeck(settings: GameSettings, playerCount: number): RoleKey[] {
  const base = getRecommendedRoles(playerCount);
  const deck: RoleKey[] = [];

  // Base roles (auto by player count)
  for (let i = 0; i < base.mafia;    i++) deck.push('mafia');
  for (let i = 0; i < base.sheriff;  i++) deck.push('sheriff');
  for (let i = 0; i < base.doctor;   i++) deck.push('doctor');

  // Optional extra roles from room settings
  const r = settings.roles;
  for (let i = 0; i < (r.don ?? 0);        i++) deck.push('don');
  for (let i = 0; i < (r.maniac ?? 0);     i++) deck.push('maniac');
  for (let i = 0; i < (r.jester ?? 0);     i++) deck.push('jester');
  for (let i = 0; i < (r.bodyguard ?? 0);  i++) deck.push('bodyguard');

  // Fill remaining with citizens
  while (deck.length < playerCount) deck.push('citizen');

  return shuffle(deck).slice(0, playerCount);
}

export function getTeam(role: RoleKey): Team {
  return ROLES[role].team;
}

export function isSuspiciousToSheriff(role: RoleKey): boolean {
  return role === 'mafia'; // Don appears innocent
}
