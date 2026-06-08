/**
 * Centralised ICE / TURN configuration for Void Mafia.
 *
 * Railway server environment variables:
 *   TURN_URL        — comma-separated full TURN URLs  OR  bare hostname
 *                     Examples:
 *                       "turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:443?transport=tcp"
 *                       "global.relay.metered.ca"   (auto-generates 4 Metered variants)
 *   TURN_USERNAME   — TURN username / Metered API key username
 *   TURN_CREDENTIAL — TURN credential / Metered API key password
 *   FORCE_TURN_RELAY=true   — diagnostic: relay-only iceTransportPolicy
 *   STUN_URL        — override primary STUN URL (optional)
 */
export interface IceServerEntry {
    urls: string | string[];
    username?: string;
    credential?: string;
}
export interface IceConfig {
    iceServers: IceServerEntry[];
    iceTransportPolicy: 'all' | 'relay';
}
export declare function buildIceConfig(): IceConfig;
/** Convenience: just the servers array (for backward-compat callers). */
export declare function buildIceServers(): IceServerEntry[];
//# sourceMappingURL=iceConfig.d.ts.map