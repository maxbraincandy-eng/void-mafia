// VOID IQ — client mirrors of server/src/services/iqBank.ts + iqScoring.ts + iqService.ts.
export type IQDomain = 'pattern' | 'matrix' | 'numeric' | 'logic' | 'spatial' | 'verbal';

export interface IQShape {
  t: 'poly' | 'circle' | 'ring' | 'dots' | 'arrow' | 'flag' | 'grid' | 'bars';
  sides?: number; rot?: number; fill?: boolean; size?: number; mirror?: boolean; n?: number;
  top?: boolean; bottom?: boolean; left?: boolean; right?: boolean;
}
export type IQCell = { shapes: IQShape[] } | { empty: true };

export type IQVisual =
  | { type: 'sequence'; cells: IQCell[] }
  | { type: 'matrix'; cols: number; cells: IQCell[] }
  | { type: 'analogy'; a: IQCell; b: IQCell; c: IQCell }
  | { type: 'group'; cells: IQCell[] };

export interface IQOption { id: string; cell?: IQCell; text?: string }

export interface IQSafeQuestion {
  id: string;
  domain: IQDomain;
  difficulty: number;
  prompt?: string;
  visual?: IQVisual;
  options: IQOption[];
}

export interface IQStartResponse {
  available: boolean;
  retakeInMs?: number;
  cooldownMs?: number;
  test?: IQSafeQuestion[];
  total?: number;
  disclaimer: string;
}

export interface IQScoreResult {
  attemptId: string;
  isHighest: boolean;
  rank: number | null;
  disclaimer: string;
  iq: number;
  percentile: number;
  band: string;
  bandKa: string;
  correct: number;
  answered: number;
  total: number;
  rawScore: number;
  maxScore: number;
  domainScores: Record<IQDomain, number>;
  durationMs: number;
  verified: boolean;
  flags: string[];
  interpretation: string;
}

export interface IQLeaderRow {
  rank: number;
  userId: string;
  username: string;
  avatar: string;
  avatarUrl: string | null;
  iq: number;
  percentile: number;
  createdAt: number;
  verified: boolean;
}

export interface IQHistoryEntry {
  id: string; iq: number; percentile: number; band: string;
  correct: number; answered: number | null; total: number; durationMs: number;
  verified: boolean; isHighest: boolean; completed: boolean; createdAt: number;
  domainScores: Record<string, number>;
}

export interface IQMyStatus {
  hasResult: boolean;
  bestIq: number | null;
  bestPercentile: number | null;
  latestIq: number | null;
  latestVerified: boolean;
  latestDate: number | null;
  rank: number | null;
  attempts: number;
  cooldownUntil: number | null;
  history: IQHistoryEntry[];
  totalQuestions: number;
}

export interface IQPublicProfile {
  hasResult: boolean;
  bestIq: number | null;
  bestPercentile: number | null;
  band: string | null;
  latestDate: number | null;
  rank: number | null;
  attempts: number;
  history: { iq: number; verified: boolean; createdAt: number }[];
}

export type IQScope = 'all' | 'global' | 'weekly' | 'monthly' | 'friends' | 'clan';

export const IQ_DOMAIN_KA: Record<IQDomain, string> = {
  pattern: 'პატერნების ამოცნობა',
  matrix: 'მატრიცული მსჯელობა',
  numeric: 'რიცხვითი მსჯელობა',
  logic: 'ლოგიკური მსჯელობა',
  spatial: 'სივრცითი მსჯელობა',
  verbal: 'ვერბალური მსჯელობა',
};
