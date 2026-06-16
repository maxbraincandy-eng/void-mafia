import type { Friend, FriendRequest, PlayerStatus } from '../types/index.js';
export declare function markOnline(profileId: string): void;
export declare function markOffline(profileId: string): void;
export declare function isOnline(profileId: string): boolean;
export declare function getOnlineCount(): number;
export declare function getPlayerStatus(profileId: string): PlayerStatus;
export declare function getActiveStatusMap(): Map<string, 'in_game' | 'spectating'>;
export declare function getSpectatingCount(): number;
export declare function sendFriendRequest(fromId: string, toId: string): Promise<void>;
export declare function acceptFriend(requestFrom: string, accepterId: string): Promise<void>;
export declare function declineFriend(requestFrom: string, declinerId: string): Promise<void>;
export declare function removeFriend(playerId: string, friendId: string): Promise<void>;
export declare function getFriends(playerId: string): Promise<Friend[]>;
export declare function getPendingRequests(playerId: string): Promise<FriendRequest[]>;
export declare function getFriendshipStatus(userId: string, otherId: string): Promise<string>;
//# sourceMappingURL=friendService.d.ts.map