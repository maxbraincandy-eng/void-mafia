import type { Friend, FriendRequest } from '../types/index.js';
export declare function markOnline(profileId: string): void;
export declare function markOffline(profileId: string): void;
export declare function isOnline(profileId: string): boolean;
export declare function sendFriendRequest(fromId: string, toId: string): void;
export declare function acceptFriend(requestFrom: string, accepterId: string): void;
export declare function declineFriend(requestFrom: string, declinerId: string): void;
export declare function removeFriend(playerId: string, friendId: string): void;
export declare function getFriends(playerId: string): Friend[];
export declare function getPendingRequests(playerId: string): FriendRequest[];
//# sourceMappingURL=friendService.d.ts.map