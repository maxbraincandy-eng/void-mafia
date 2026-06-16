import type { CommunityLoungeMember, CommunityLoungeRole } from '../types/index.js';
/** Add a member. Returns existing members (for offer negotiation). */
export declare function join(loungeId: string, member: CommunityLoungeMember): CommunityLoungeMember[];
/** Remove a socket from whichever lounge it's in. Returns what was removed. */
export declare function leave(socketId: string): Array<{
    loungeId: string;
    remaining: CommunityLoungeMember[];
}>;
export declare function getMembers(loungeId: string): CommunityLoungeMember[];
export declare function getMember(loungeId: string, socketId: string): CommunityLoungeMember | null;
export declare function getMemberByPlayerId(loungeId: string, playerId: string): CommunityLoungeMember | null;
export declare function setRole(loungeId: string, socketId: string, role: CommunityLoungeRole): CommunityLoungeMember | null;
export declare function setHandRaised(loungeId: string, socketId: string, raised: boolean): CommunityLoungeMember | null;
/** Remove a specific member from a lounge (kick). Returns the removed member, if any. */
export declare function removeMember(loungeId: string, targetSocketId: string): CommunityLoungeMember | null;
export declare function getLoungeIdForSocket(socketId: string): string | null;
export declare function getCounts(loungeId: string): {
    listenerCount: number;
    speakerCount: number;
};
/** Returns the lounge both sockets share (for offer-relay authorization), or null. */
export declare function getSharedLounge(socketId1: string, socketId2: string): string | null;
//# sourceMappingURL=loungeVoiceService.d.ts.map