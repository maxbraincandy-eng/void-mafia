export type DebateSide = 'pro' | 'con' | 'spectator';
export type DebateStatus = 'open' | 'finished';
export interface Debate {
    id: string;
    topic: string;
    description: string;
    createdBy: string;
    status: DebateStatus;
    winnerSide: DebateSide | null;
    createdAt: number;
    endsAt: number | null;
}
export interface DebateParticipant {
    id: string;
    debateId: string;
    playerId: string;
    side: DebateSide;
    joinedAt: number;
    username?: string;
    avatarUrl?: string | null;
}
export interface DebateArgument {
    id: string;
    debateId: string;
    playerId: string;
    side: DebateSide;
    content: string;
    createdAt: number;
    username?: string;
    avatarUrl?: string | null;
}
export interface DebateVote {
    id: string;
    debateId: string;
    playerId: string;
    side: DebateSide;
    createdAt: number;
}
export interface DebateFull extends Debate {
    participants: DebateParticipant[];
    arguments: DebateArgument[];
    votesCounts: {
        pro: number;
        con: number;
    };
    myParticipation: DebateParticipant | null;
    myVote: DebateVote | null;
}
export declare function listDebates(status?: DebateStatus | 'all', limit?: number): Promise<Debate[]>;
export declare function getDebateFull(debateId: string, viewerId: string): Promise<DebateFull | null>;
export declare function createDebate(createdBy: string, topic: string, description: string): Promise<Debate>;
export declare function joinDebate(debateId: string, playerId: string, side: DebateSide): Promise<DebateParticipant>;
export declare function postArgument(debateId: string, playerId: string, content: string): Promise<DebateArgument>;
export declare function voteDebate(debateId: string, playerId: string, side: 'pro' | 'con'): Promise<{
    pro: number;
    con: number;
}>;
export declare function closeDebate(debateId: string, requesterId: string): Promise<Debate>;
//# sourceMappingURL=debateService.d.ts.map