export interface LiveKitConfig {
    apiKey: string;
    apiSecret: string;
    url: string;
}
/** Read + validate LiveKit env. Returns null (not throws) when unconfigured. */
export declare function getLiveKitConfig(): LiveKitConfig | null;
/** True when all three LiveKit env vars are present. */
export declare function isLiveKitEnabled(): boolean;
export interface TokenOptions {
    /** When false the participant joins muted/listen-only (e.g. dead players). */
    canPublish?: boolean;
    /** Token lifetime in seconds (default 6h — long enough for a full match). */
    ttlSeconds?: number;
}
/**
 * Mint a LiveKit JWT for `identity` to join `room`.
 * Throws if LiveKit is not configured — callers should guard with isLiveKitEnabled().
 */
export declare function createAccessToken(identity: string, room: string, opts?: TokenOptions): Promise<{
    token: string;
    url: string;
}>;
//# sourceMappingURL=livekitService.d.ts.map