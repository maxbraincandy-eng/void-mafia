export declare function adminSearchUser(query: string): Promise<any[]>;
export declare function adminGetUserProfile(playerId: string): Promise<any | null>;
export declare function issueWarning(playerId: string, issuedBy: string, reason: string): Promise<void>;
export declare function suspendUser(playerId: string, suspendedBy: string, reason: string, durationSeconds: number): Promise<void>;
export declare function liftSuspension(playerId: string): Promise<void>;
export declare function muteUser(playerId: string, mutedBy: string, reason: string, durationSeconds: number): Promise<void>;
export declare function unmuteUser(playerId: string): Promise<void>;
export declare function isUserSuspended(playerId: string): Promise<boolean>;
export declare function isUserCommunityMuted(playerId: string): Promise<boolean>;
export declare function setProfileControls(playerId: string, controls: {
    profileLocked?: boolean;
    secretModeDisabled?: boolean;
    forcePublic?: boolean;
}): Promise<void>;
export declare function adminDeletePost(postId: string, deletedBy: string): Promise<void>;
export declare function adminRestorePost(postId: string): Promise<void>;
export declare function adminDeleteComment(commentId: string, deletedBy: string): Promise<void>;
export declare function adminRestoreComment(commentId: string): Promise<void>;
export declare function adminDeleteDebate(debateId: string, deletedBy: string): Promise<void>;
export declare function adminRestoreDebate(debateId: string): Promise<void>;
export declare function adminSetDebateFlags(debateId: string, flags: {
    pinned?: boolean;
    featured?: boolean;
    locked?: boolean;
}): Promise<void>;
export declare function listAllReports(limit?: number): Promise<any[]>;
export declare function listDeletedContent(type: 'posts' | 'comments' | 'debates', limit?: number): Promise<any[]>;
export declare function getAdminAuditLogs(limit?: number): Promise<any[]>;
//# sourceMappingURL=adminService.d.ts.map