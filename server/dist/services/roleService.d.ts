import { Role, RoleKey, GameSettings, Team } from '../types/index.js';
export declare const ROLES: Record<RoleKey, Role>;
export declare function getRecommendedRoles(playerCount: number): {
    mafia: number;
    sheriff: number;
    doctor: number;
};
export declare function getRole(key: RoleKey): Role;
/**
 * Build a shuffled role deck.
 * Base distribution (mafia/sheriff/doctor) is determined by player count.
 * Optional extra roles (don/maniac/jester/bodyguard) come from room settings.
 * Citizens fill remaining slots.
 */
export declare function buildRoleDeck(settings: GameSettings, playerCount: number): RoleKey[];
export declare function getTeam(role: RoleKey): Team;
export declare function isSuspiciousToSheriff(role: RoleKey): boolean;
//# sourceMappingURL=roleService.d.ts.map