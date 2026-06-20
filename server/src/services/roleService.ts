import { Role, RoleKey, GameSettings, Team } from '../types/index.js';
import { shuffle } from '../utils/helpers.js';

export function validateRoleDistribution(playerCount: number, settings: GameSettings): void {
  const r = settings.roles;
  const mafiaCount = (r.mafia ?? 0) + (r.don ?? 0);
  const nonMafiaCount = playerCount - mafiaCount;
  if (mafiaCount >= nonMafiaCount) {
    throw new Error(
      `Invalid role balance: Mafia count (${mafiaCount}) cannot be equal to or greater than non-Mafia count (${nonMafiaCount}).`,
    );
  }
  if ((r.shogun ?? 0) > 0 && (r.yakuza ?? 0) === 0) {
    throw new Error('Invalid setup: Shogun requires at least 1 Yakuza.');
  }
}

export function buildAutoRoleDeck(count: number): RoleKey[] {
  const presets: Partial<Record<number, RoleKey[]>> = {
    4:  ['mafia', 'sheriff', 'citizen', 'citizen'],
    5:  ['mafia', 'sheriff', 'doctor', 'citizen', 'citizen'],
    6:  ['mafia', 'sheriff', 'doctor', 'citizen', 'citizen', 'citizen'],
    7:  ['mafia', 'mafia', 'sheriff', 'doctor', 'citizen', 'citizen', 'citizen'],
    8:  ['mafia', 'mafia', 'sheriff', 'doctor', 'citizen', 'citizen', 'citizen', 'citizen'],
    9:  ['mafia', 'mafia', 'sheriff', 'doctor', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen'],
    10: ['mafia', 'mafia', 'mafia', 'sheriff', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen'],
  };
  if (presets[count]) return shuffle([...presets[count]!]);
  const mafiaCount = Math.max(1, Math.floor(count * 0.28));
  const deck: RoleKey[] = Array(mafiaCount).fill('mafia' as RoleKey);
  deck.push('sheriff');
  if (count >= 6) deck.push('doctor');
  while (deck.length < count) deck.push('citizen');
  return shuffle(deck);
}

/** Fixed role decks for Don Card mode. Only 10 and 12 players are valid. */
export function buildDonModeRoleDeck(count: number): RoleKey[] {
  if (count === 10) {
    // 1 Don + 2 Mafia + 1 Sheriff + 6 Citizens
    return shuffle(['don', 'mafia', 'mafia', 'sheriff', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen']);
  }
  if (count === 12) {
    // 1 Don + 2 Mafia + 1 Sheriff + 8 Citizens
    return shuffle(['don', 'mafia', 'mafia', 'sheriff', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen']);
  }
  throw new Error('Don Mode requires exactly 10 or 12 players.');
}

export const ROLES: Record<RoleKey, Role> = {
  mafia: {
    key: 'mafia',
    name: 'Mafia',
    team: 'mafia',
    description: 'Member of the criminal underworld. You know your fellow mafia members.',
    ability: 'Each night, choose a player to eliminate.',
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
  spy: {
    key: 'spy',
    name: 'Fortune Teller',
    team: 'town',
    description: 'A mystic who senses danger before it strikes. You peer into the night and see the mafia\'s target.',
    ability: 'Each dawn, receive a private vision naming the player mafia tried to kill — even if they were saved.',
    wakeAtNight: false,
    color: 'cyan',
    glowColor: '#00e5ff',
  },
  vigilante: {
    key: 'vigilante',
    name: 'Vigilante',
    team: 'town',
    description: 'A lone crusader who takes justice into their own hands. You can eliminate players at night.',
    ability: 'Each night, choose a player to eliminate. Be careful — you might kill an innocent.',
    wakeAtNight: true,
    color: 'yellow',
    glowColor: '#fbbf24',
  },
  escort: {
    key: 'escort',
    name: 'Escort',
    team: 'town',
    description: 'A charming distraction who prevents players from acting at night.',
    ability: 'Each night, roleblock one player — cancelling their night action.',
    wakeAtNight: true,
    color: 'pink',
    glowColor: '#f472b6',
  },
  don: {
    key: 'don',
    name: 'Don',
    team: 'mafia',
    description: 'Leader of the mafia. You appear innocent to Sheriff investigations.',
    ability: 'Each night, choose a player to eliminate. Appears clean to Sheriff.',
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
  cult_leader: {
    key: 'cult_leader',
    name: 'Cult Leader',
    team: 'cult',
    description: 'A charismatic manipulator who bends others to their will. Grow your cult and seize control.',
    ability: 'Each night, recruit one player to your cult — they lose their old allegiance and win with you.',
    wakeAtNight: true,
    color: 'purple',
    glowColor: '#c026d3',
  },
  cultist: {
    key: 'cultist',
    name: 'Cultist',
    team: 'cult',
    description: 'You have been drawn into the cult. Your old life is gone — the Cult Leader is your master now.',
    ability: 'Win when the cult outnumbers all other factions.',
    wakeAtNight: false,
    color: 'purple',
    glowColor: '#c026d3',
  },
  veteran: {
    key: 'veteran',
    name: 'Veteran',
    team: 'town',
    description: 'A battle-hardened soldier who trusts no one at night. Your paranoia is your protection.',
    ability: 'Go on alert: target yourself to kill anyone who visits you tonight.',
    wakeAtNight: true,
    color: 'yellow',
    glowColor: '#eab308',
  },
  tracker: {
    key: 'tracker',
    name: 'Tracker',
    team: 'town',
    description: 'A surveillance expert who follows suspects through the night.',
    ability: 'Each night, follow a player to discover who they visited.',
    wakeAtNight: true,
    color: 'blue',
    glowColor: '#60a5fa',
  },
  arsonist: {
    key: 'arsonist',
    name: 'Arsonist',
    team: 'neutral',
    description: 'A pyromaniac preparing the perfect massacre. You act in two stages.',
    ability: 'Target a player to douse them with gasoline. Target yourself to ignite — killing all doused players at once.',
    wakeAtNight: true,
    color: 'yellow',
    glowColor: '#f97316',
  },
  mayor: {
    key: 'mayor',
    name: 'Mayor',
    team: 'town',
    description: 'An elected official with the trust of the people. Your word carries more weight.',
    ability: 'Your vote counts twice during the tribunal.',
    wakeAtNight: false,
    color: 'yellow',
    glowColor: '#fbbf24',
  },
  yakuza: {
    key: 'yakuza',
    name: 'Yakuza',
    team: 'yakuza',
    description: 'Enforcer of the Yakuza clan. You and your Shogun share a silent pact — you kill, they hide.',
    ability: 'Each night, choose one player to eliminate. You know who the Shogun is.',
    wakeAtNight: true,
    color: 'red',
    glowColor: '#ef4444',
  },
  shogun: {
    key: 'shogun',
    name: 'Shogun',
    team: 'yakuza',
    description: 'The hidden blade of the Yakuza. You appear innocent — your true allegiance is secret.',
    ability: 'No night kill. You are hidden support. You win with the Yakuza faction.',
    wakeAtNight: false,
    color: 'red',
    glowColor: '#dc2626',
  },
};

export function getRole(key: RoleKey): Role {
  return ROLES[key];
}

/**
 * Build a shuffled role deck entirely from room settings.
 * Citizens fill any remaining slots.
 */
export function buildRoleDeck(settings: GameSettings, playerCount: number): RoleKey[] {
  const r = settings.roles;
  const deck: RoleKey[] = [];

  const push = (role: RoleKey, count: number) => {
    for (let i = 0; i < count; i++) deck.push(role);
  };

  push('mafia',      r.mafia      ?? 0);
  push('don',        r.don        ?? 0);
  push('sheriff',    r.sheriff    ?? 0);
  push('doctor',     r.doctor     ?? 0);
  push('bodyguard',  r.bodyguard  ?? 0);
  push('spy',        r.spy        ?? 0);
  push('vigilante',  r.vigilante  ?? 0);
  push('escort',     r.escort     ?? 0);
  push('maniac',      r.maniac      ?? 0);
  push('jester',      r.jester      ?? 0);
  push('cult_leader', r.cult_leader ?? 0);
  push('veteran',     r.veteran     ?? 0);
  push('tracker',     r.tracker     ?? 0);
  push('arsonist',    r.arsonist    ?? 0);
  push('mayor',       r.mayor       ?? 0);
  push('yakuza',      r.yakuza      ?? 0);
  push('shogun',      r.shogun      ?? 0);

  while (deck.length < playerCount) deck.push('citizen');

  return shuffle(deck).slice(0, playerCount);
}

export function getTeam(role: RoleKey): Team {
  return ROLES[role].team;
}

export function isSuspiciousToSheriff(role: RoleKey): boolean {
  // Yakuza checks suspicious; Shogun checks clean (hidden support)
  // Don appears innocent; cult_leader and arsonist are suspicious
  return role === 'mafia' || role === 'cult_leader' || role === 'arsonist' || role === 'yakuza';
}
