export declare const REPORT_REASONS: readonly ["alive", "not_authorised", "false_info", "offensive", "duplicate", "other"];
export type MarsReportReason = typeof REPORT_REASONS[number];
/** Distinct 'alive' reports that auto-withdraw a record pending review. */
export declare const ALIVE_AUTOHIDE_THRESHOLD = 2;
export declare const REPORT_NOTE_MAX = 400;
export interface MarsReport {
    id: string;
    subjectId: string;
    reporterId: string;
    reporterName: string;
    reason: MarsReportReason;
    note: string;
    status: 'open' | 'dismissed' | 'upheld';
    createdAt: number;
    code?: string;
    designation?: string;
    kind?: string;
    stewardName?: string;
    hidden?: boolean;
}
/**
 * File a report. One per person per record — a second submission updates the
 * first rather than stacking, so the auto-hide threshold counts PEOPLE and
 * cannot be reached by one person pressing the button repeatedly.
 */
export declare function report(args: {
    subjectId: string;
    reporterId: string;
    reporterName: string;
    reason: string;
    note: string;
}): Promise<{
    report: MarsReport;
    autoHidden: boolean;
}>;
/** Open reports, newest first, with enough of the record to judge them. */
export declare function listReports(status?: 'open' | 'dismissed' | 'upheld', limit?: number): Promise<MarsReport[]>;
export declare function reportCount(subjectId: string): Promise<number>;
/**
 * Resolve a report.
 *
 * 'dismiss' clears the flag and, if the record was auto-hidden by this class of
 * report, restores it — an automatic hide must be reversible by a human, or the
 * automation becomes the final word.
 * 'remove' withdraws the record from view. It is not deleted: a wrongly removed
 * memorial must be recoverable, and deleting a family's only copy of what they
 * wrote about someone is not an action worth making irreversible.
 */
export declare function resolveReport(reportId: string, action: 'dismiss' | 'remove', moderatorId: string): Promise<{
    subjectId: string;
    hidden: boolean;
}>;
/** Put a removed record back. */
export declare function restoreRecord(subjectId: string): Promise<void>;
//# sourceMappingURL=marsReports.d.ts.map