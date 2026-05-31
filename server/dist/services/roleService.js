import { shuffle } from '../utils/helpers.js';
export const ROLES = {
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
        name: 'Spy',
        team: 'town',
        description: 'A covert operative who watches from the shadows. You observe who the mafia targets each night.',
        ability: 'Each dawn, receive a private report naming the player mafia tried to kill — even if they were saved.',
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
};
export function getRole(key) {
    return ROLES[key];
}
/**
 * Build a shuffled role deck entirely from room settings.
 * Citizens fill any remaining slots.
 */
export function buildRoleDeck(settings, playerCount) {
    const r = settings.roles;
    const deck = [];
    const push = (role, count) => {
        for (let i = 0; i < count; i++)
            deck.push(role);
    };
    push('mafia', r.mafia ?? 0);
    push('don', r.don ?? 0);
    push('sheriff', r.sheriff ?? 0);
    push('doctor', r.doctor ?? 0);
    push('bodyguard', r.bodyguard ?? 0);
    push('spy', r.spy ?? 0);
    push('vigilante', r.vigilante ?? 0);
    push('escort', r.escort ?? 0);
    push('maniac', r.maniac ?? 0);
    push('jester', r.jester ?? 0);
    while (deck.length < playerCount)
        deck.push('citizen');
    return shuffle(deck).slice(0, playerCount);
}
export function getTeam(role) {
    return ROLES[role].team;
}
export function isSuspiciousToSheriff(role) {
    return role === 'mafia'; // Don appears innocent; all other roles are not suspicious
}
//# sourceMappingURL=roleService.js.map