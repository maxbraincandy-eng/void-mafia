/**
 * VOID IQ — deterministic scoring, percentile, banding, verification.
 *
 * The score is a pure function of (which questions were answered correctly).
 * Same answers → same IQ, every time. IQ follows the familiar mean-100 /
 * SD-15 scale; the raw→IQ transfer is a fixed calibration curve (there is no
 * real standardization sample, so we do NOT overclaim — see the disclaimer).
 */
import { type IQDomain } from './iqBank.js';
export interface IQAnswer {
    questionId: string;
    optionId: string | null;
    timeMs: number;
}
export interface IQMeta {
    totalMs: number;
    tabBlurs: number;
    startedAt: number;
}
export interface IQScoreResult {
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
export declare function scoreTest(answers: IQAnswer[], meta: IQMeta): IQScoreResult;
//# sourceMappingURL=iqScoring.d.ts.map