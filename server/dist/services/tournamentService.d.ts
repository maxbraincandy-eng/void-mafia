export interface Tournament {
    id: string;
    name: string;
    status: 'open' | 'in_progress' | 'finished';
    maxPlayers: number;
    prizeCoins: number;
    createdBy: string;
    createdAt: number;
    startedAt: number | null;
    endedAt: number | null;
    winnerId: string | null;
    participants: TournamentParticipant[];
}
export interface TournamentParticipant {
    playerId: string;
    username: string;
    avatar: string;
    avatarUrl: string | null;
    seed: number;
    eliminated: boolean;
}
export declare function createTournament(createdBy: string, name: string, maxPlayers: number, prizeCoins: number): Promise<Tournament>;
export declare function joinTournament(tournamentId: string, playerId: string): Promise<void>;
export declare function leaveTournament(tournamentId: string, playerId: string): Promise<void>;
export declare function startTournament(tournamentId: string, requesterId: string): Promise<void>;
export declare function eliminatePlayer(tournamentId: string, playerId: string): Promise<void>;
export declare function finishTournament(tournamentId: string, winnerId: string): Promise<void>;
export declare function getTournament(id: string): Promise<Tournament | null>;
export declare function listOpenTournaments(): Promise<Tournament[]>;
//# sourceMappingURL=tournamentService.d.ts.map