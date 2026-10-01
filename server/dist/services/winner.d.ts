import type { Room, Player } from '../types/index.js';
/**
 * Did this player win? Their team won — except that Halloween's monsters
 * hunt alone: when the vampire wins, a werewolf it outlived did not, and the
 * other way round. One rule, so stats, XP, ratings and history all agree.
 */
export declare function isWinner(room: Room, p: Player): boolean;
//# sourceMappingURL=winner.d.ts.map