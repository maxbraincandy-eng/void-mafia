import { generateId } from '../utils/helpers.js';
import { getPlayer, getAllPlayers, setBan, clearBan, setMute, clearMute, addWarning, toPublicProfile, } from './playerService.js';
// ── In-memory stores ──────────────────────────────────────────────────
const reports = new Map();
const modLogs = [];
// ── Permission helpers ────────────────────────────────────────────────
const LEVEL_ORDER = ['moderator', 'senior_moderator', 'admin', 'owner'];
function levelRank(level) {
    return LEVEL_ORDER.indexOf(level);
}
export function canDo(player, action) {
    if (!player.isModerator || !player.moderatorLevel)
        return false;
    const rank = levelRank(player.moderatorLevel);
    switch (action) {
        case 'kick':
        case 'warn':
        case 'mute':
        case 'view_reports': return rank >= 0; // moderator+
        case 'ban_short':
        case 'resolve_reports': return rank >= 1; // senior_moderator+
        case 'ban_long':
        case 'view_logs': return rank >= 2; // admin+
        case 'all': return rank >= 3; // owner
        default: return rank >= 0;
    }
}
// ── Ban ───────────────────────────────────────────────────────────────
export function banPlayer(moderatorId, moderatorName, targetId, reason, durationSeconds) {
    const target = getPlayer(targetId);
    if (!target)
        throw new Error('Player not found.');
    const ban = {
        id: generateId(),
        reason,
        issuedBy: moderatorId,
        issuedByName: moderatorName,
        issuedAt: Date.now(),
        expiresAt: Date.now() + durationSeconds * 1000,
    };
    setBan(targetId, ban);
    addLog({ actionType: 'ban', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason, duration: durationSeconds });
    return ban;
}
export function unbanPlayer(moderatorId, moderatorName, targetId) {
    const target = getPlayer(targetId);
    if (!target)
        throw new Error('Player not found.');
    clearBan(targetId);
    addLog({ actionType: 'unban', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason: 'Manual unban', duration: null });
}
// ── Mute ──────────────────────────────────────────────────────────────
export function mutePlayer(moderatorId, moderatorName, targetId, reason, durationSeconds) {
    const target = getPlayer(targetId);
    if (!target)
        throw new Error('Player not found.');
    const mute = {
        id: generateId(),
        reason,
        issuedBy: moderatorId,
        issuedByName: moderatorName,
        issuedAt: Date.now(),
        expiresAt: Date.now() + durationSeconds * 1000,
    };
    setMute(targetId, mute);
    addLog({ actionType: 'mute', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason, duration: durationSeconds });
    return mute;
}
export function unmutePlayer(moderatorId, moderatorName, targetId) {
    const target = getPlayer(targetId);
    if (!target)
        throw new Error('Player not found.');
    clearMute(targetId);
    addLog({ actionType: 'unmute', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason: 'Manual unmute', duration: null });
}
// ── Warn ──────────────────────────────────────────────────────────────
export function warnPlayer(moderatorId, moderatorName, targetId, reason) {
    const target = getPlayer(targetId);
    if (!target)
        throw new Error('Player not found.');
    const warning = {
        id: generateId(),
        playerId: targetId,
        reason,
        issuedBy: moderatorId,
        issuedByName: moderatorName,
        issuedAt: Date.now(),
    };
    addWarning(targetId, warning);
    addLog({ actionType: 'warn', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason, duration: null });
    return warning;
}
// ── Reports ───────────────────────────────────────────────────────────
export function createReport(reporterProfileId, reporterName, reportedProfileId, reportedName, roomId, reason, details) {
    const report = {
        id: generateId(),
        reporterPlayerId: reporterProfileId,
        reporterName,
        reportedPlayerId: reportedProfileId,
        reportedName,
        roomId,
        reason,
        details: details.slice(0, 500),
        createdAt: Date.now(),
        status: 'open',
        assignedModeratorId: null,
        moderatorNotes: '',
    };
    reports.set(report.id, report);
    return report;
}
export function getReports() {
    return [...reports.values()].sort((a, b) => b.createdAt - a.createdAt);
}
export function resolveReport(moderatorId, reportId, status, notes) {
    const report = reports.get(reportId);
    if (!report)
        throw new Error('Report not found.');
    report.status = status;
    report.moderatorNotes = notes;
    report.assignedModeratorId = moderatorId;
    const mod = getPlayer(moderatorId);
    const actionType = status === 'resolved' ? 'report_resolve' : 'report_reject';
    addLog({
        actionType, moderatorId,
        moderatorName: mod?.username ?? 'Unknown',
        targetPlayerId: report.reportedPlayerId,
        targetName: report.reportedName,
        roomId: report.roomId,
        reason: notes,
        duration: null,
    });
}
// ── Logs ──────────────────────────────────────────────────────────────
function addLog(entry) {
    const log = { id: generateId(), createdAt: Date.now(), ...entry };
    modLogs.push(log);
    if (modLogs.length > 1000)
        modLogs.shift(); // cap
    return log;
}
export function getLogs() {
    return [...modLogs].reverse();
}
export function getModPlayers() {
    return getAllPlayers().map(toPublicProfile);
}
// ── Kick Log ──────────────────────────────────────────────────────────
export function logKick(modProfileId, modName, targetId, targetName, roomId, reason) {
    addLog({ actionType: 'kick', moderatorId: modProfileId, moderatorName: modName, targetPlayerId: targetId, targetName, roomId, reason, duration: null });
}
//# sourceMappingURL=moderationService.js.map