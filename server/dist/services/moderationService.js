import { generateId } from '../utils/helpers.js';
import { sql } from '../db.js';
import { getPlayer, setBan, clearBan, setMute, clearMute, addWarning, getPlayersFast } from './playerService.js';
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
export async function warnPlayer(moderatorId, moderatorName, targetId, reason) {
    const target = await getPlayer(targetId);
    if (!target)
        throw new Error('Player not found.');
    const warning = {
        id: generateId(), playerId: targetId, reason,
        issuedBy: moderatorId, issuedByName: moderatorName, issuedAt: Date.now(),
    };
    await addWarning(targetId, warning);
    await addLog({ actionType: 'warn', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason, duration: null });
    return warning;
}
export async function createReport(reporterProfileId, reporterName, reportedProfileId, reportedName, roomId, reason, details) {
    const report = {
        id: generateId(), reporterPlayerId: reporterProfileId, reporterName,
        reportedPlayerId: reportedProfileId, reportedName, roomId, reason,
        details: details.slice(0, 500), createdAt: Date.now(), status: 'open',
        assignedModeratorId: null, moderatorNotes: '',
    };
    await sql `
    INSERT INTO reports (id, reporter_id, reporter_name, reported_id, reported_name,
      room_id, reason, details, created_at, status, assigned_mod_id, mod_notes)
    VALUES (${report.id}, ${reporterProfileId}, ${reporterName}, ${reportedProfileId}, ${reportedName},
            ${roomId}, ${reason}, ${report.details}, ${report.createdAt}, 'open', NULL, '')
  `;
    return report;
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
export async function logKick(modProfileId, modName, targetId, targetName, roomId, reason) {
    await addLog({ actionType: 'kick', moderatorId: modProfileId, moderatorName: modName, targetPlayerId: targetId, targetName, roomId, reason, duration: null });
}
//# sourceMappingURL=moderationService.js.map