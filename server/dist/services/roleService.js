import { shuffle } from '../utils/helpers.js';
export const ROLES = {
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
        description: 'An ordinary resident fighting for survival. You have no special ability.',
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
        description: 'A lone killer with no allegiance. You win only by being the last one standing.',
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
 * Build a role deck based on room settings and player count.
 * Returns an array of RoleKey in random order.
 */
export function buildRoleDeck(settings, playerCount) {
    const deck = [];
    const r = settings.roles;
    // Add mafia-side roles
    for (let i = 0; i < r.mafia; i++)
        deck.push('mafia');
    for (let i = 0; i < r.don; i++)
        deck.push('don');
    // Add town special roles
    for (let i = 0; i < r.sheriff; i++)
        deck.push('sheriff');
    for (let i = 0; i < r.doctor; i++)
        deck.push('doctor');
    // Add neutral roles
    for (let i = 0; i < r.maniac; i++)
        deck.push('maniac');
    for (let i = 0; i < r.jester; i++)
        deck.push('jester');
    // Fill remaining slots with citizens
    while (deck.length < playerCount) {
        deck.push('citizen');
    }
    // Trim if over (shouldn't happen with valid settings)
    return shuffle(deck).slice(0, playerCount);
}
export function getTeam(role) {
    return ROLES[role].team;
}
/** Check if a role's result appears suspicious to the sheriff */
export function isSuspiciousToSheriff(role) {
    // Don appears clean (a feature of the Don role)
    return role === 'mafia';
}
//# sourceMappingURL=roleService.js.map