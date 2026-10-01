/**
 * Did this player win? Their team won — except that Halloween's monsters
 * hunt alone: when the vampire wins, a werewolf it outlived did not, and the
 * other way round. One rule, so stats, XP, ratings and history all agree.
 */
export function isWinner(room, p) {
    if (!room.winner || p.team !== room.winner)
        return false;
    if ((p.role === 'vampire' || p.role === 'werewolf') && !p.isAlive)
        return false;
    return true;
}
//# sourceMappingURL=winner.js.map