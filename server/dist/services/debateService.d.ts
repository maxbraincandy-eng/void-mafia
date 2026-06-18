export type DebateSide = 'pro' | 'con' | 'spectator';
export type DebateStatus = 'open' | 'finished';
export type DebatePhase = 'waiting' | 'opening_pro' | 'opening_con' | 'argument_pro' | 'argument_con' | 'rebuttal_con' | 'rebuttal_pro' | 'closing_pro' | 'closing_con' | 'voting' | 'finished';
export declare const PHASE_DURATION_SECONDS: Partial<Record<DebatePhase, number>>;
export declare function getActiveSide(phase: DebatePhase): 'pro' | 'con' | null;
export declare function getNextPhase(current: DebatePhase): DebatePhase;
export interface Debate {
    id: string;
    topic: string;
    description: string;
    createdBy: string;
    status: DebateStatus;
    phase: DebatePhase;
    phaseStartedAt: number | null;
    phaseDuration: number;
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
    raisedHands: Array<{
        playerId: string;
        side: 'pro' | 'con';
        raisedAt: number;
        username?: string;
    }>;
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
export declare function startDebate(debateId: string, requesterId: string): Promise<Debate>;
export declare function advancePhase(debateId: string): Promise<Debate>;
export declare function skipPhase(debateId: string, requesterId: string): Promise<Debate>;
export declare function raiseHand(debateId: string, playerId: string, side: 'pro' | 'con'): Promise<void>;
export declare function lowerHand(debateId: string, playerId: string): Promise<void>;
export declare function getRaisedHands(debateId: string): Promise<Array<{
    playerId: string;
    side: 'pro' | 'con';
    raisedAt: number;
    username?: string;
}>>;
export declare function promoteSpeaker(debateId: string, targetPlayerId: string, promotedBy: string): Promise<DebateParticipant>;
//# sourceMappingURL=debateService.d.ts.map