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
/** Everyone online right now, invisible owners excluded. */
export declare function getOnlineProfileIds(): string[];
export interface InvitePerson extends Friend {
    /** Already connected to this player — friend, follower, or followed. */
    isKnown: boolean;
}
/**
 * Who this player can invite to a match: ANYONE, not just their friends.
 *
 * A table needs three more people and the friends list is empty at that
 * moment — so a picker that only shows friends is a picker that usually shows
 * nobody. With no query it opens on the people you know plus everyone who is
 * online right now (the only ones who can be pulled in immediately); typing a
 * name searches every account, so someone met once in a room can be found by
 * name without a friend request first.
 *
 * Sorted online-first because an invite to an online player is a game starting
 * in ten seconds, while an invite to an offline one is a notification they may
 * read tomorrow.
 */
export declare function getPeopleToInvite(playerId: string, q?: string, limit?: number): Promise<InvitePerson[]>;
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