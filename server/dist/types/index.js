export const DEFAULT_DYNAMIC_EVENTS = {
    enabled: false,
    frequency: 'medium',
    allowed: {
        blackoutNight: true, silentDay: true, doubleVote: true, noRevealDay: true,
        bloodMoon: true, anonymousVoting: true, sheriffFog: true, doctorPressure: true,
        extendedFinalWords: true,
    },
};
export function ok(data) { return { ok: true, data }; }
export function err(message) { return { ok: false, error: message }; }
//# sourceMappingURL=index.js.map