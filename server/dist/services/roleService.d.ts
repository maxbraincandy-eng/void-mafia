import { Role, RoleKey, GameSettings, Team } from '../types/index.js';
export declare const ROLES: Record<RoleKey, Role>;
export declare function getRole(key: RoleKey): Role;
/**
 * Build a role deck based on room settings and player count.
 * Returns an array of RoleKey in random order.
 */
export declare function buildRoleDeck(settings: GameSettings, playerCount: number): RoleKey[];
export declare function getTeam(role: RoleKey): Team;
/** Check if a role's result appears suspicious to the sheriff */
export declare function isSuspiciousToSheriff(role: RoleKey): boolean;
//# sourceMappingURL=roleService.d.ts.map