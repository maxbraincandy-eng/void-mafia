/**
 * Reporting and take-down for M.A.R.S. records.
 *
 * WHY RECORDS GO LIVE IMMEDIATELY
 * ───────────────────────────────
 * A memorial is usually created in the days after a death. Putting that behind
 * a moderation queue means telling a grieving family to wait for approval, and
 * that is the wrong trade. So records publish at once and the safety net sits
 * downstream: anyone can report one, and moderators see the queue.
 *
 * WITH ONE EXCEPTION
 * ──────────────────
 * The harm that actually matters here is a memorial for someone who is ALIVE.
 * That is not an inaccuracy, it is a thing done to a person. So repeated
 * independent reports of exactly that reason hide the record automatically,
 * before a human gets to it — the record is not deleted, only withdrawn from
 * view until a moderator decides. Slow moderation should not be what stands
 * between someone and a page announcing their death.
 */
import { sql } from '../db.js';
import { generateId } from '../utils/helpers.js';

export const REPORT_REASONS = ['alive', 'not_authorised', 'false_info', 'offensive', 'duplicate', 'other'] as const;
export type MarsReportReason = typeof REPORT_REASONS[number];

/** Distinct 'alive' reports that auto-withdraw a record pending review. */
export const ALIVE_AUTOHIDE_THRESHOLD = 2;
export const REPORT_NOTE_MAX = 400;

export interface MarsReport {
  id: string;
  subjectId: string;
  reporterId: string;
  reporterName: string;
  reason: MarsReportReason;
  note: string;
  status: 'open' | 'dismissed' | 'upheld';
  createdAt: number;
  // Joined for the moderation queue.
  code?: string;
  designation?: string;
  kind?: string;
  stewardName?: string;
  hidden?: boolean;
}

function rowToReport(r: any): MarsReport {
  return {
    id: r.id,
    subjectId: r.subject_id,
    reporterId: r.reporter_id,
    reporterName: r.reporter_name ?? '',
    reason: r.reason,
    note: r.note ?? '',
    status: r.status,
    createdAt: Number(r.created_at),
    code: r.code,
    designation: r.designation,
    kind: r.kind,
    stewardName: r.steward_name,
    hidden: r.hidden ?? undefined,
  };
}

/**
 * File a report. One per person per record — a second submission updates the
 * first rather than stacking, so the auto-hide threshold counts PEOPLE and
 * cannot be reached by one person pressing the button repeatedly.
 */
export async function report(args: {
  subjectId: string; reporterId: string; reporterName: string;
  reason: string; note: string;
}): Promise<{ report: MarsReport; autoHidden: boolean }> {
  const reason = (REPORT_REASONS as readonly string[]).includes(args.reason)
    ? args.reason as MarsReportReason : 'other';
  const note = String(args.note ?? '').slice(0, REPORT_NOTE_MAX);

  const [subject] = await sql<any[]>`SELECT id, steward_id, player_id FROM mars_subjects WHERE id = ${args.subjectId}`;
  if (!subject) throw new Error('ჩანაწერი ვერ მოიძებნა.');
  if (subject.steward_id === args.reporterId || subject.player_id === args.reporterId) {
    throw new Error('საკუთარ ჩანაწერს ვერ დაარეპორტებ — შეგიძლია შეცვალო ან წაშალო.');
  }

  const id = generateId();
  const now = Date.now();
  await sql`
    INSERT INTO mars_reports (id, subject_id, reporter_id, reporter_name, reason, note, status, created_at)
    VALUES (${id}, ${args.subjectId}, ${args.reporterId}, ${String(args.reporterName ?? '').slice(0, 40)},
            ${reason}, ${note}, 'open', ${now})
    ON CONFLICT (subject_id, reporter_id) DO UPDATE
      SET reason = ${reason}, note = ${note}, status = 'open', created_at = ${now}
  `;

  // Count DISTINCT reporters claiming the person is alive.
  const [{ n }] = await sql<any[]>`
    SELECT COUNT(DISTINCT reporter_id)::int AS n FROM mars_reports
    WHERE subject_id = ${args.subjectId} AND reason = 'alive' AND status = 'open'
  `;
  let autoHidden = false;
  if (Number(n) >= ALIVE_AUTOHIDE_THRESHOLD) {
    const rows = await sql<any[]>`
      UPDATE mars_subjects SET hidden = true, hidden_reason = 'reported_alive'
      WHERE id = ${args.subjectId} AND hidden = false
      RETURNING id
    `;
    autoHidden = rows.length > 0;
  }

  const [row] = await sql<any[]>`SELECT * FROM mars_reports WHERE subject_id = ${args.subjectId} AND reporter_id = ${args.reporterId}`;
  return { report: rowToReport(row), autoHidden };
}

/** Open reports, newest first, with enough of the record to judge them. */
export async function listReports(status: 'open' | 'dismissed' | 'upheld' = 'open', limit = 100): Promise<MarsReport[]> {
  const rows = await sql<any[]>`
    SELECT r.*, s.code, s.designation, s.kind, s.steward_name, s.hidden
    FROM mars_reports r JOIN mars_subjects s ON s.id = r.subject_id
    WHERE r.status = ${status}
    ORDER BY r.created_at DESC LIMIT ${Math.min(300, Math.max(1, limit))}
  `;
  return rows.map(rowToReport);
}

export async function reportCount(subjectId: string): Promise<number> {
  const [{ n }] = await sql<any[]>`SELECT COUNT(*)::int AS n FROM mars_reports WHERE subject_id = ${subjectId} AND status = 'open'`;
  return Number(n);
}

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
export async function resolveReport(
  reportId: string, action: 'dismiss' | 'remove', moderatorId: string,
): Promise<{ subjectId: string; hidden: boolean }> {
  const [r] = await sql<any[]>`SELECT subject_id FROM mars_reports WHERE id = ${reportId}`;
  if (!r) throw new Error('რეპორტი ვერ მოიძებნა.');
  const now = Date.now();

  if (action === 'remove') {
    await sql`UPDATE mars_subjects SET hidden = true, hidden_reason = 'removed_by_mod' WHERE id = ${r.subject_id}`;
    await sql`
      UPDATE mars_reports SET status = 'upheld', resolved_by = ${moderatorId}, resolved_at = ${now}
      WHERE subject_id = ${r.subject_id} AND status = 'open'
    `;
    return { subjectId: r.subject_id, hidden: true };
  }

  await sql`
    UPDATE mars_reports SET status = 'dismissed', resolved_by = ${moderatorId}, resolved_at = ${now}
    WHERE subject_id = ${r.subject_id} AND status = 'open'
  `;
  // Only lift an automatic hide. A moderator's own removal stays until they
  // explicitly restore it.
  await sql`
    UPDATE mars_subjects SET hidden = false, hidden_reason = ''
    WHERE id = ${r.subject_id} AND hidden_reason = 'reported_alive'
  `;
  return { subjectId: r.subject_id, hidden: false };
}

/** Put a removed record back. */
export async function restoreRecord(subjectId: string): Promise<void> {
  await sql`UPDATE mars_subjects SET hidden = false, hidden_reason = '' WHERE id = ${subjectId}`;
}
