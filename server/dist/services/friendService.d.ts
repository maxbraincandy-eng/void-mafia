import type { Friend, FriendRequest, PlayerStatus, PlayerPresence } from '../types/index.js';
export declare function setInvisible(profileId: string, on: boolean): void;
export declare function isInvisible(profileId: string): boolean;
export declare function setGhost(profileId: string, on: boolean): void;
export declare function isGhost(profileId: string): boolean;
export declare function setLoungePresence(profileId: string, info: {
    spaceId: string;
    name: string;
    code: string;
}): void;
export declare function clearLoungePresence(profileId: string): void;
export declare function getPeakOnline(): number;
export declare function markOnline(profileId: string): void;
export declare function markOffline(profileId: string): void;
export declare function isOnline(profileId: string): boolean;
export declare function getOnlineCount(): number;
export declare function isOnlineRaw(profileId: string): boolean;
export declare function getOnlineCountRaw(): number;
export declare function getPlayerStatus(profileId: string): PlayerStatus;
export declare function getPlayerPresence(profileId: string): PlayerPresence | null;
export declare function getActiveStatusMapRaw(): Map<string, 'in_game' | 'spectating'>;
export declare function getActiveStatusMap(): Map<string, 'in_game' | 'spectating'>;
export declare function getSpectatingCount(): number;
export declare function sendFriendRequest(fromId: string, toId: string): Promise<void>;
export declare function acceptFriend(requestFrom: string, accepterId: string): Promise<void>;
export declare function declineFriend(requestFrom: string, declinerId: string): Promise<void>;
export declare function removeFriend(playerId: string, friendId: string): Promise<void>;
export declare function getFriends(playerId: string): Promise<Friend[]>;
/**
 * People this player can invite: accepted friends PLUS everyone they follow
 * or who follows them in the community. Deduplicated, with online status.
 */
export declare function getInvitablePeople(playerId: string): Promise<Friend[]>;
export declare function getFriendIds(playerId: string): Promise<string[]>;
export declare function getFriendSuggestions(playerId: string, limit?: number): Promise<{
    profileId: string;
    username: string;
    avatar: string;
    avatarUrl: string | null;
    mutualCount: number;
}[]>;
export declare function getPendingRequests(playerId: string): Promise<FriendRequest[]>;
export declare function getFriendshipStatus(userId: string, otherId: string): Promise<string>;
//# sourceMappingURL=friendService.d.ts.map