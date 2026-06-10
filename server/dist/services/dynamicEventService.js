export const EVENT_CATALOG = [
    {
        key: 'blackout_night', label: 'BLACKOUT NIGHT',
        description: 'Signal lost. Investigation results are unclear tonight.',
        icon: '🌑', phase: 'night', allowedKey: 'blackoutNight',
    },
    {
        key: 'blood_moon', label: 'BLOOD MOON',
        description: 'Blood Moon rises. Mafia feels stronger tonight.',
        icon: '🔴', phase: 'night', allowedKey: 'bloodMoon',
    },
    {
        key: 'sheriff_fog', label: 'SHERIFF FOG',
        description: 'Thick fog obscures the truth. Investigation results may be inaccurate.',
        icon: '🌫️', phase: 'night', allowedKey: 'sheriffFog',
    },
    {
        key: 'doctor_pressure', label: 'DOCTOR PRESSURE',
        description: 'Doctor cannot protect the same player as last night.',
        icon: '💊', phase: 'night', allowedKey: 'doctorPressure',
    },
    {
        key: 'silent_day', label: 'SILENT DAY',
        description: 'No voice today. Use text chat only.',
        icon: '🔇', phase: 'day', allowedKey: 'silentDay',
    },
    {
        key: 'double_vote', label: 'DOUBLE VOTE',
        description: 'Every vote counts twice today.',
        icon: '2×', phase: 'voting', allowedKey: 'doubleVote',
    },
    {
        key: 'no_reveal_day', label: 'NO REVEAL',
        description: 'Eliminated player\'s role is hidden until game over.',
        icon: '🎭', phase: 'voting', allowedKey: 'noRevealDay',
    },
    {
        key: 'anonymous_voting', label: 'ANONYMOUS VOTE',
        description: 'Vote totals only — no names revealed.',
        icon: '👻', phase: 'voting', allowedKey: 'anonymousVoting',
    },
    {
        key: 'extended_final_words', label: 'FINAL WORDS EXTENDED',
        description: 'The eliminated player gets extra time to speak.',
        icon: '⏳', phase: 'final_words', allowedKey: 'extendedFinalWords',
    },
];
const FREQUENCY_CHANCE = {
    low: 0.10,
    medium: 0.20,
    high: 0.35,
};
export function tryTriggerEvent(room, phase) {
    const cfg = room.settings.dynamicEvents;
    if (!cfg?.enabled)
        return null;
    if (room.winner)
        return null;
    const aliveCount = [...room.players.values()].filter(p => p.isAlive && !p.isSpectator).length;
    if (aliveCount < 4)
        return null;
    const chance = FREQUENCY_CHANCE[cfg.frequency ?? 'low'];
    if (Math.random() > chance)
        return null;
    const allowed = cfg.allowed;
    const candidates = EVENT_CATALOG.filter(e => {
        if (e.phase !== phase)
            return false;
        return allowed[e.allowedKey] !== false;
    });
    if (candidates.length === 0)
        return null;
    // Avoid repeating most-recent event
    const recentKey = room.eventsLog.length > 0
        ? room.eventsLog[room.eventsLog.length - 1]?.eventKey
        : null;
    const pool = candidates.filter(e => e.key !== recentKey);
    const chosen = (pool.length > 0 ? pool : candidates)[Math.floor(Math.random() * (pool.length > 0 ? pool.length : candidates.length))];
    return {
        key: chosen.key,
        label: chosen.label,
        description: chosen.description,
        icon: chosen.icon,
        phase,
        day: room.day,
        expiresAtPhaseEnd: true,
    };
}
export function setRoomEvent(room, event) {
    room.activeEvent = event;
    if (event) {
        room.eventsLog.push({
            day: event.day,
            phase: event.phase,
            eventKey: event.key,
            eventLabel: event.label,
        });
    }
}
export function clearRoomEvent(room) {
    room.activeEvent = null;
}
export function getEventDef(key) {
    return EVENT_CATALOG.find(e => e.key === key);
}
//# sourceMappingURL=dynamicEventService.js.map