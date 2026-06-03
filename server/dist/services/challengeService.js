import { sql } from '../db.js';
const CHALLENGES = [
    { id: 'win_any', description: 'Win any game today', xpReward: 100, targetCount: 1, check: (won) => won },
    { id: 'win_mafia', description: 'Win as Mafia or Don', xpReward: 150, targetCount: 1, check: (won, role) => won && (role === 'mafia' || role === 'don') },
    { id: 'survive_5', description: 'Survive to Day 5 or later', xpReward: 120, targetCount: 1, check: (_w, _r, day) => day >= 5 },
    { id: 'win_town', description: 'Win as any Town role', xpReward: 100, targetCount: 1, check: (won, _r, _d, team) => won && team === 'town' },
    { id: 'win_neutral', description: 'Win as a Neutral role', xpReward: 150, targetCount: 1, check: (won, _r, _d, team) => won && team === 'neutral' },
    { id: 'play_3', description: 'Play 3 games today', xpReward: 100, targetCount: 3, check: () => true },
    { id: 'win_cult', description: 'Win as Cult Leader', xpReward: 200, targetCount: 1, check: (won, role) => won && role === 'cult_leader' },
];
function todayKey() { return new Date().toISOString().slice(0, 10); }
export function getTodayChallenge() {
    const day = new Date().getDay();
    const ch = CHALLENGES[day % CHALLENGES.length];
    return { id: ch.id, description: ch.description, xpReward: ch.xpReward, targetCount: ch.targetCount };
}
export async function checkAndAwardChallenge(profileId, won, role, dayReached, team) {
    const ch = getTodayChallenge();
    const dateKey = todayKey();
    const [countRow] = await sql `
    SELECT COUNT(*) as c FROM daily_completions
    WHERE player_id = ${profileId} AND challenge_id = ${ch.id} AND date_key = ${dateKey}
  `;
    const existing = Number(countRow?.c ?? 0);
    if (existing >= ch.targetCount)
        return false;
    const full = CHALLENGES.find(c => c.id === ch.id);
    if (!full.check(won, role, dayReached, team))
        return false;
    await sql `
    INSERT INTO daily_completions (player_id, challenge_id, date_key, completed_at)
    VALUES (${profileId}, ${ch.id}, ${dateKey}, ${Date.now()})
    ON CONFLICT DO NOTHING
  `;
    const [newCountRow] = await sql `
    SELECT COUNT(*) as c FROM daily_completions
    WHERE player_id = ${profileId} AND challenge_id = ${ch.id} AND date_key = ${dateKey}
  `;
    return Number(newCountRow?.c ?? 0) >= ch.targetCount;
}
export async function getDailyChallengeForPlayer(profileId) {
    const ch = getTodayChallenge();
    const dateKey = todayKey();
    const [progressRow] = await sql `
    SELECT COUNT(*) as c FROM daily_completions
    WHERE player_id = ${profileId} AND challenge_id = ${ch.id} AND date_key = ${dateKey}
  `;
    const progress = Number(progressRow?.c ?? 0);
    return {
        id: ch.id, description: ch.description, xpReward: ch.xpReward,
        completedToday: progress >= ch.targetCount, progressCount: progress, targetCount: ch.targetCount,
    };
}
//# sourceMappingURL=challengeService.js.map