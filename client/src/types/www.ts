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
  /** Isolation channel: 'broadcast' | 'team_a' | 'team_b'. */
  channel?: string;
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
