/**
 * The shapes the table service owns, kept apart from the service itself so the
 * view builder can depend on them without depending on the machinery.
 */
export const DEFAULT_TABLE_CONFIG = {
    maxSeats: 6,
    smallBlind: 10,
    bigBlind: 20,
    ante: 0,
    buyIn: 2000,
    actionSeconds: 25,
    isPrivate: false,
    password: null,
    handIntervalSeconds: 5,
    disconnectGraceSeconds: 45,
};
//# sourceMappingURL=types.js.map