import { Role, RoleKey, GameSettings, Team } from '../types/index.js';
export declare const ROLES: Record<RoleKey, Role>;
export declare function getRole(key: RoleKey): Role;
/**
 * Build a shuffled role deck entirely from room settings.
 * Citizens fill any remaining slots.
 */
export declare function buildRoleDeck(settings: GameSettings, playerCount: number): RoleKey[];
export declare function getTeam(role: RoleKey): Team;
export declare function isSuspiciousToSheriff(role: RoleKey): boolean;
//# sourceMappingURL=roleService.d.ts.map