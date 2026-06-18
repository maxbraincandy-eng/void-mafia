export type ActivityEventType = 'posted' | 'followed' | 'became_friends' | 'joined_debate' | 'debate_argument';
export interface ActivityEvent {
    id: string;
    actorId: string;
    eventType: ActivityEventType;
    targetId: string | null;
    payload: Record<string, any>;
    createdAt: number;
    actorUsername?: string;
    actorAvatarUrl?: string | null;
}
export declare function recordActivity(actorId: string, eventType: ActivityEventType, targetId: string | null, payload?: Record<string, any>): Promise<void>;
export declare function getFriendActivityFeed(viewerId: string, limit?: number): Promise<ActivityEvent[]>;
export declare function getPlayerActivity(playerId: string, limit?: number): Promise<ActivityEvent[]>;
//# sourceMappingURL=activityService.d.ts.map