import { generateId } from '../utils/helpers.js';
import { sql } from '../db.js';
import { getPlayer, setBan, clearBan, setMute, clearMute, addWarning, getPlayersFast, toPublicProfile } from './playerService.js';
const LEVEL_ORDER = ['moderator', 'senior_moderator', 'admin', 'owner'];
function levelRank(level) { return LEVEL_ORDER.indexOf(level); }
export function canDo(player, action) {
    if (!player.isModerator || !player.moderatorLevel)
        return false;
    const rank = levelRank(player.moderatorLevel);
    switch (action) {
        case 'kick':
        case 'warn':
        case 'mute':
        case 'view_reports': return rank >= 0;
        case 'ban_short':
        case 'resolve_reports': return rank >= 1;
        case 'ban_long':
        case 'view_logs': return rank >= 2;
        case 'all': return rank >= 3;
        default: return rank >= 0;
    }
}
async function addLog(entry) {
    const log = { id: generateId(), createdAt: Date.now(), ...entry };
    await sql `
    INSERT INTO mod_logs (id, action_type, moderator_id, moderator_name, target_player_id,
      target_name, room_id, reason, duration, created_at)
    VALUES (${log.id}, ${log.actionType}, ${log.moderatorId}, ${log.moderatorName},
            ${log.targetPlayerId}, ${log.targetName}, ${log.roomId ?? null},
            ${log.reason}, ${log.duration ?? null}, ${log.createdAt})
  `;
    return log;
}
export async function banPlayer(moderatorId, moderatorName, targetId, reason, durationSeconds) {
    const target = await getPlayer(targetId);
    if (!target)
        throw new Error('Player not found.');
    const ban = {
        id: generateId(), reason,
        issuedBy: moderatorId, issuedByName: moderatorName,
        issuedAt: Date.now(), expiresAt: Date.now() + durationSeconds * 1000,
    };
    await setBan(targetId, ban);
    await addLog({ actionType: 'ban', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason, duration: durationSeconds });
    return ban;
}
export async function unbanPlayer(moderatorId, moderatorName, targetId) {
    const target = await getPlayer(targetId);
    if (!target)
        throw new Error('Player not found.');
    await clearBan(targetId);
    await addLog({ actionType: 'unban', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason: 'Manual unban', duration: null });
}
export async function mutePlayer(moderatorId, moderatorName, targetId, reason, durationSeconds) {
    const target = await getPlayer(targetId);
    if (!target)
        throw new Error('Player not found.');
    const mute = {
        id: generateId(), reason,
        issuedBy: moderatorId, issuedByName: moderatorName,
        issuedAt: Date.now(), expiresAt: Date.now() + durationSeconds * 1000,
    };
    await setMute(targetId, mute);
    await addLog({ actionType: 'mute', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason, duration: durationSeconds });
    return mute;
}
export async function unmutePlayer(moderatorId, moderatorName, targetId) {
    const target = await getPlayer(targetId);
    if (!target)
        throw new Error('Player not found.');
    await clearMute(targetId);
    await addLog({ actionType: 'unmute', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason: 'Manual unmute', duration: null });
}
export async function warnPlayer(moderatorId, moderatorName, targetId, reason, category = 'other') {
    const target = await getPlayer(targetId);
    if (!target)
        throw new Error('Player not found.');
    const warning = {
        id: generateId(), playerId: targetId, reason, category,
        issuedBy: moderatorId, issuedByName: moderatorName, issuedAt: Date.now(),
    };
    await addWarning(targetId, warning);
    await addLog({ actionType: 'warn', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason: `[${category}] ${reason}`, duration: null });
    return warning;
}
export async function createReport(reporterProfileId, reporterName, reportedProfileId, reportedName, roomId, reason, details, evidence = [], autoFlag = null) {
    const report = {
        id: generateId(), reporterPlayerId: reporterProfileId, reporterName,
        reportedPlayerId: reportedProfileId, reportedName, roomId, reason,
        details: details.slice(0, 500), createdAt: Date.now(), status: 'open',
        assignedModeratorId: null, moderatorNotes: '',
        // Capped: a transcript is context, not an archive, and this row is read on
        // every dashboard load.
        evidence: evidence.slice(-30),
        autoFlag,
    };
    await sql `
    INSERT INTO reports (id, reporter_id, reporter_name, reported_id, reported_name,
      room_id, reason, details, created_at, status, assigned_mod_id, mod_notes, evidence, auto_flag)
    VALUES (${report.id}, ${reporterProfileId}, ${reporterName}, ${reportedProfileId}, ${reportedName},
            ${roomId}, ${reason}, ${report.details}, ${report.createdAt}, 'open', NULL, '',
            ${JSON.stringify(report.evidence)}, ${autoFlag})
  `;
    return report;
}
const rowToAppeal = (r) => ({
    id: r.id, playerId: r.player_id, playerName: r.player_name,
    kind: r.kind, body: r.body, createdAt: Number(r.created_at),
    status: r.status, decidedBy: r.decided_by, decidedName: r.decided_name,
    decidedAt: r.decided_at ? Number(r.decided_at) : null, decision: r.decision ?? '',
});
/** File an appeal. The unique partial index keeps it to one open per player. */
export async function createAppeal(playerId, playerName, kind, body) {
    const [existing] = await sql `
    SELECT * FROM appeals WHERE player_id = ${playerId} AND status = 'open'
  `;
    if (existing)
        throw new Error('შენი გასაჩივრება უკვე განიხილება.');
    const id = generateId();
    const now = Date.now();
    await sql `
    INSERT INTO appeals (id, player_id, player_name, kind, body, created_at, status)
    VALUES (${id}, ${playerId}, ${playerName}, ${kind}, ${body.slice(0, 800)}, ${now}, 'open')
  `;
    return {
        id, playerId, playerName, kind, body: body.slice(0, 800), createdAt: now,
        status: 'open', decidedBy: null, decidedName: null, decidedAt: null, decision: '',
    };
}
export async function getAppeals(status = 'open') {
    const rows = status === 'open'
        ? await sql `SELECT * FROM appeals WHERE status = 'open' ORDER BY created_at ASC`
        : await sql `SELECT * FROM appeals ORDER BY created_at DESC LIMIT 200`;
    return rows.map(rowToAppeal);
}
/** A granted ban appeal lifts the ban; a granted mute appeal lifts the mute. */
export async function decideAppeal(modId, modName, appealId, grant, decision) {
    const [row] = await sql `SELECT * FROM appeals WHERE id = ${appealId}`;
    if (!row)
        throw new Error('Appeal not found.');
    const a = rowToAppeal(row);
    if (a.status !== 'open')
        throw new Error('ეს გასაჩივრება უკვე განხილულია.');
    if (grant) {
        if (a.kind === 'ban')
            await unbanPlayer(modId, modName, a.playerId);
        else
            await unmutePlayer(modId, modName, a.playerId);
    }
    await sql `
    UPDATE appeals SET status = ${grant ? 'granted' : 'denied'},
      decided_by = ${modId}, decided_name = ${modName},
      decided_at = ${Date.now()}, decision = ${decision.slice(0, 500)}
    WHERE id = ${appealId}
  `;
    await addLog({
        actionType: grant ? 'appeal_granted' : 'appeal_denied',
        moderatorId: modId, moderatorName: modName,
        targetPlayerId: a.playerId, targetName: a.playerName,
        roomId: null, reason: decision.slice(0, 200), duration: null,
    });
    return { ...a, status: grant ? 'granted' : 'denied', decidedBy: modId, decidedName: modName, decidedAt: Date.now(), decision };
}
/**
 * Per-moderator accountability. `overturned` is the count of that moderator's
 * bans later lifted on appeal — the only honest signal for whether a moderator
 * is being too quick, and the reason appeals are worth having at all.
 */
export async function getModeratorStats() {
    const rows = await sql `
    SELECT moderator_id, moderator_name,
           COUNT(*) AS actions,
           COUNT(*) FILTER (WHERE action_type = 'ban') AS bans
    FROM mod_logs
    GROUP BY moderator_id, moderator_name
    ORDER BY actions DESC
    LIMIT 50
  `;
    const overturned = await sql `
    SELECT l.moderator_id, COUNT(*) AS n
    FROM appeals a
    JOIN mod_logs l ON l.target_player_id = a.player_id AND l.action_type = 'ban'
    WHERE a.status = 'granted'
    GROUP BY l.moderator_id
  `;
    const byMod = new Map(overturned.map((r) => [r.moderator_id, Number(r.n)]));
    return rows.map((r) => ({
        moderatorId: r.moderator_id,
        moderatorName: r.moderator_name,
        actions: Number(r.actions),
        bans: Number(r.bans),
        overturned: byMod.get(r.moderator_id) ?? 0,
    }));
}
export async function getReports() {
    const rows = await sql `SELECT * FROM reports ORDER BY created_at DESC LIMIT 500`;
    return rows.map((r) => ({
        id: r.id,
        reporterPlayerId: r.reporter_id, reporterName: r.reporter_name,
        reportedPlayerId: r.reported_id, reportedName: r.reported_name,
        roomId: r.room_id ?? null, reason: r.reason, details: r.details,
        createdAt: Number(r.created_at), status: r.status,
        assignedModeratorId: r.assigned_mod_id ?? null, moderatorNotes: r.mod_notes,
        // Stored as JSON text; a row written before the column existed parses to [].
        evidence: (() => { try {
            return JSON.parse(r.evidence ?? '[]');
        }
        catch {
            return [];
        } })(),
        autoFlag: r.auto_flag ?? null,
    }));
}
export async function resolveReport(moderatorId, reportId, status, notes) {
    await sql `
    UPDATE reports SET status = ${status}, assigned_mod_id = ${moderatorId}, mod_notes = ${notes}
    WHERE id = ${reportId}
  `;
    const [row] = await sql `SELECT * FROM reports WHERE id = ${reportId}`;
    if (!row)
        throw new Error('Report not found.');
    const mod = await getPlayer(moderatorId);
    const actionType = status === 'resolved' ? 'report_resolve' : 'report_reject';
    await addLog({ actionType, moderatorId, moderatorName: mod?.username ?? 'Unknown', targetPlayerId: row.reported_id, targetName: row.reported_name, roomId: row.room_id ?? null, reason: notes, duration: null });
}
export async function getLogs() {
    const rows = await sql `SELECT * FROM mod_logs ORDER BY created_at DESC LIMIT 500`;
    return rows.map((r) => ({
        id: r.id, actionType: r.action_type,
        moderatorId: r.moderator_id, moderatorName: r.moderator_name,
        targetPlayerId: r.target_player_id, targetName: r.target_name,
        roomId: r.room_id ?? null, reason: r.reason,
        duration: r.duration ?? null, createdAt: Number(r.created_at),
    }));
}
export async function getModPlayers() {
    return getPlayersFast();
}
export async function getBannedPlayers() {
    const now = Date.now();
    const rows = await sql `
    SELECT b.id as ban_id, b.player_id, b.reason, b.expires_at, b.banned_by_name,
           p.username, p.friend_code, p.public_id
    FROM bans b
    JOIN players p ON p.id = b.player_id
    WHERE b.active = 1 AND b.expires_at > ${now}
    ORDER BY b.issued_at DESC
  `;
    return rows.map(r => ({
        banId: String(r.ban_id),
        profileId: String(r.player_id),
        username: String(r.username),
        friendCode: r.friend_code ?? '',
        publicId: r.public_id ?? null,
        reason: String(r.reason),
        expiresAt: Number(r.expires_at),
        issuedByName: String(r.banned_by_name),
    }));
}
export async function logKick(modProfileId, modName, targetId, targetName, roomId, reason) {
    await addLog({ actionType: 'kick', moderatorId: modProfileId, moderatorName: modName, targetPlayerId: targetId, targetName, roomId, reason, duration: null });
}
export async function addModLog(actionType, moderatorId, moderatorName, targetPlayerId, targetName, roomId, reason, duration = null) {
    await addLog({ actionType, moderatorId, moderatorName, targetPlayerId, targetName, roomId, reason, duration });
}
// ── Mod Notes ─────────────────────────────────────────────────────────
export async function addModNote(modId, modName, targetId, note) {
    const target = await getPlayer(targetId);
    if (!target)
        throw new Error('Player not found.');
    const n = { id: generateId(), playerId: targetId, modId, modName, note: note.slice(0, 1000), createdAt: Date.now() };
    await sql `
    INSERT INTO mod_notes (id, player_id, mod_id, mod_name, note, created_at)
    VALUES (${n.id}, ${n.playerId}, ${n.modId}, ${n.modName}, ${n.note}, ${n.createdAt})
  `;
    await addLog({ actionType: 'note_add', moderatorId: modId, moderatorName: modName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason: n.note.slice(0, 100), duration: null });
    return n;
}
export async function getModNotes(targetId) {
    const rows = await sql `SELECT * FROM mod_notes WHERE player_id = ${targetId} ORDER BY created_at DESC LIMIT 50`;
    return rows.map((r) => ({
        id: r.id, playerId: r.player_id, modId: r.mod_id, modName: r.mod_name, note: r.note, createdAt: Number(r.created_at),
    }));
}
// ── Account Freeze ────────────────────────────────────────────────────
export async function freezeAccount(modId, modName, targetId, reason) {
    const target = await getPlayer(targetId);
    if (!target)
        throw new Error('Player not found.');
    await sql `UPDATE players SET account_frozen = 1 WHERE id = ${targetId}`;
    await addLog({ actionType: 'freeze', moderatorId: modId, moderatorName: modName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason, duration: null });
}
export async function unfreezeAccount(modId, modName, targetId) {
    const target = await getPlayer(targetId);
    if (!target)
        throw new Error('Player not found.');
    await sql `UPDATE players SET account_frozen = 0 WHERE id = ${targetId}`;
    await addLog({ actionType: 'unfreeze', moderatorId: modId, moderatorName: modName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason: 'Account unfrozen', duration: null });
}
// ── Rename Player ─────────────────────────────────────────────────────
export async function renamePlayer(modId, modName, targetId, newName, reason) {
    const target = await getPlayer(targetId);
    if (!target)
        throw new Error('Player not found.');
    const trimmed = newName.trim().slice(0, 24);
    if (!trimmed)
        throw new Error('Name cannot be empty.');
    const existing = await sql `SELECT id FROM players WHERE username = ${trimmed} AND id != ${targetId}`;
    if (existing.length > 0)
        throw new Error('Username already taken.');
    await sql `UPDATE players SET username = ${trimmed} WHERE id = ${targetId}`;
    await addLog({ actionType: 'rename', moderatorId: modId, moderatorName: modName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason: `Renamed to "${trimmed}": ${reason}`, duration: null });
}
// ── Player Detail ─────────────────────────────────────────────────────
export async function getPlayerDetail(targetId) {
    const player = await getPlayer(targetId);
    if (!player)
        throw new Error('Player not found.');
    const [notes, reportCountRows, frozenRows] = await Promise.all([
        getModNotes(targetId),
        sql `SELECT COUNT(*) as cnt FROM reports WHERE reported_id = ${targetId}`,
        sql `SELECT account_frozen FROM players WHERE id = ${targetId}`,
    ]);
    return {
        profile: toPublicProfile(player),
        ban: player.ban,
        mute: player.mute,
        warnings: player.warnings,
        reportCount: Number(reportCountRows[0]?.cnt ?? 0),
        notes,
        accountFrozen: Boolean(frozenRows[0]?.account_frozen),
    };
}
// ── Assign Report ─────────────────────────────────────────────────────
export async function assignReport(reportId, modId) {
    await sql `UPDATE reports SET assigned_mod_id = ${modId}, status = 'reviewing' WHERE id = ${reportId}`;
}
// ── Dashboard Stats ───────────────────────────────────────────────────
export async function getDashboardDbStats() {
    const now = Date.now();
    const since24h = now - 86400000;
    const startOfToday = now - (now % 86400000); // UTC midnight
    const since30d = now - 30 * 86400000;
    const [[openRow], [banRow], [newRow], [durRow]] = await Promise.all([
        sql `SELECT COUNT(*) as cnt FROM reports WHERE status = 'open'`,
        sql `SELECT COUNT(*) as cnt FROM mod_logs WHERE action_type = 'ban' AND created_at > ${since24h}`,
        sql `SELECT COUNT(*) as cnt FROM players WHERE joined_at >= ${startOfToday}`,
        sql `SELECT AVG(ended_at - started_at) as avg FROM game_history WHERE ended_at > started_at AND ended_at > ${since30d}`,
    ]);
    return {
        openReports: Number(openRow?.cnt ?? 0),
        recentBans: Number(banRow?.cnt ?? 0),
        newUsersToday: Number(newRow?.cnt ?? 0),
        avgMatchSeconds: durRow?.avg != null ? Math.round(Number(durRow.avg) / 1000) : 0,
    };
}
//# sourceMappingURL=moderationService.js.map