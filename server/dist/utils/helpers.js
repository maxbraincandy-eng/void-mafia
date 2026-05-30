import { v4 as uuidv4 } from 'uuid';
export function generateId() {
    return uuidv4();
}
/** 6-character uppercase room code */
export function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}
export function generateMsgId() {
    return `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
/** Produce initials avatar from a name */
export function nameToAvatar(name) {
    return name
        .trim()
        .split(/\s+/)
        .map(w => w[0]?.toUpperCase() ?? '')
        .slice(0, 2)
        .join('');
}
export function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
export function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}
//# sourceMappingURL=helpers.js.map