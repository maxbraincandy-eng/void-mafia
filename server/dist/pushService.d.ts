export declare function initPushService(): Promise<void>;
export declare function getVapidPublicKey(): string;
export declare function sendPushToUser(userId: string, payload: {
    title: string;
    body: string;
    icon?: string;
    tag?: string;
    requireInteraction?: boolean;
    vibrate?: number[];
}): Promise<void>;
//# sourceMappingURL=pushService.d.ts.map