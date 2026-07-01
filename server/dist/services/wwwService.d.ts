export type WWWStatus = 'waiting' | 'question' | 'discussion' | 'judging' | 'round_result' | 'finished';
export interface WWWQuestion {
    id: string;
    category: string;
    difficulty: 'easy' | 'medium' | 'hard';
    questionText: string;
    correctAnswer: string;
    explanation: string;
}
export interface WWWSettings {
    maxTeams: number;
    maxPlayersPerTeam: number;
    questionsCount: number;
    discussionSeconds: number;
    spectatorsAllowed: boolean;
}
export interface WWWPlayer {
    userId: string;
    nickname: string;
    teamId: string | null;
    isCaptain: boolean;
    isSpectator: boolean;
    connected: boolean;
}
export interface WWWTeam {
    id: string;
    name: string;
    color: string;
    captainId: string | null;
    playerIds: string[];
}
export interface WWWAnswer {
    teamId: string;
    captainId: string;
    answerText: string;
    submittedAt: number;
    isCorrect?: boolean;
}
export interface WWWChatMsg {
    userId: string;
    nickname: string;
    text: string;
    ts: number;
}
export interface WWWMatch {
    id: string;
    code: string;
    status: WWWStatus;
    hostId: string;
    players: Record<string, WWWPlayer>;
    settings: WWWSettings;
    teams: WWWTeam[];
    questions: WWWQuestion[];
    currentQuestionIndex: number;
    answers: Record<string, WWWAnswer>;
    scores: Record<string, number>;
    timerEndsAt: number | null;
    voiceSessionId: string;
    chat: WWWChatMsg[];
    createdAt: number;
}
export interface WWWMatchPublic {
    id: string;
    code: string;
    status: WWWStatus;
    hostId: string;
    players: Record<string, WWWPlayer>;
    settings: WWWSettings;
    teams: WWWTeam[];
    currentQuestion: WWWQuestion | null;
    currentQuestionIndex: number;
    totalQuestions: number;
    answers: Record<string, WWWAnswer>;
    scores: Record<string, number>;
    timerEndsAt: number | null;
    voiceSessionId: string;
    chat: WWWChatMsg[];
}
export interface WWWListItem {
    id: string;
    code: string;
    status: WWWStatus;
    playerCount: number;
    hostNickname: string;
    questionsCount: number;
}
/** First team to this many points wins. */
export declare const WWW_WIN_SCORE = 10;
export declare function toPublic(m: WWWMatch, viewerId?: string): WWWMatchPublic;
export declare function createMatch(hostId: string, nickname: string, opts?: Partial<WWWSettings>): WWWMatch;
export declare function getMatch(id: string): WWWMatch | null;
export declare function getMatchByCode(code: string): WWWMatch | null;
export declare function getMatchIdForUser(userId: string): string | null;
export declare function listMatches(): WWWListItem[];
export declare function joinMatch(matchId: string, userId: string, nickname: string): {
    match: WWWMatch;
    isNew: boolean;
} | null;
export declare function spectateMatch(matchId: string, userId: string, nickname: string): WWWMatch | null;
export declare function leaveMatch(matchId: string, userId: string): WWWMatch | null;
export declare function assignCaptain(matchId: string, hostId: string, teamId: string, newCaptainId: string): WWWMatch | null;
/** Lobby role assignment: a participant picks Team A, Team B, or spectator.
 *  The host stays the moderator (cannot join a team). */
export declare function setRole(matchId: string, userId: string, role: 'team_a' | 'team_b' | 'spectator'): WWWMatch | null;
export declare function startMatch(matchId: string, hostId: string): WWWMatch | null;
export declare function advanceToDiscussion(matchId: string, hostId: string): WWWMatch | null;
export declare function submitAnswer(matchId: string, userId: string, answerText: string): WWWMatch | null;
export declare function judgeAnswer(matchId: string, hostId: string, teamId: string, isCorrect: boolean): WWWMatch | null;
export declare function autoAdvanceToJudging(matchId: string): WWWMatch | null;
export declare function nextQuestion(matchId: string, hostId: string): WWWMatch | null;
export declare function sendChat(matchId: string, userId: string, nickname: string, text: string): WWWMatch | null;
export declare function disconnectUser(userId: string): string | null;
//# sourceMappingURL=wwwService.d.ts.map