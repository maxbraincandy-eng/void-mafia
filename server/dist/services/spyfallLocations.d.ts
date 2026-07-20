/**
 * ჯაშუში (Spyfall) — locations + roles, Georgian. Every player except the spy
 * receives the round's location and a role from its list (roles cycle if the
 * lobby is bigger than the list). The full location list is public knowledge —
 * the spy uses it to guess.
 */
export interface SpyLocation {
    name: string;
    emoji: string;
    roles: string[];
}
export declare const SPYFALL_LOCATIONS: SpyLocation[];
export declare const SPYFALL_LOCATION_NAMES: {
    name: string;
    emoji: string;
}[];
//# sourceMappingURL=spyfallLocations.d.ts.map