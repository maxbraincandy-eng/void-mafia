import { sql } from '../db.js';
// Category 1 — Win quest, rotates by weekday
const WIN_QUESTS = [
    { id: 'win_any', description: 'Win any game today', xpReward: 100, targetCount: 1, check: (won) => won },
    { id: 'win_mafia', description: 'Win as Mafia or Don', xpReward: 150, targetCount: 1, check: (won, role) => won && (role === 'mafia' || role === 'don') },
    { id: 'win_town', description: 'Win as any Town role', xpReward: 100, targetCount: 1, check: (won, _r, _d, team) => won && team === 'town' },
    { id: 'win_neutral', description: 'Win as a Neutral role', xpReward: 150, targetCount: 1, check: (won, _r, _d, team) => won && team === 'neutral' },
    { id: 'win_cult', description: 'Win as Cult Leader', xpReward: 200, targetCount: 1, check: (won, role) => won && role === 'cult_leader' },
    { id: 'win_long', description: 'Win a game that reaches Day 5+', xpReward: 130, targetCount: 1, check: (won, _r, day) => won && day >= 5 },
    { id: 'win_yakuza', description: 'Win as Yakuza or Shogun', xpReward: 180, targetCount: 1, check: (won, role) => won && (role === 'yakuza' || role === 'shogun') },
];
// Category 2 — Survival quest (fixed daily)
const SURVIVAL_QUEST = {
    id: 'survive_5', description: 'Survive to Day 5 or later', xpReward: 120, targetCount: 1,
    check: (_w, _r, day) => day >= 5,
};
// Category 3 — Volume quest (fixed daily)
const VOLUME_QUEST = {
    id: 'play_3', description: 'Play 3 games today', xpReward: 100, targetCount: 3,
    check: () => true,
};
function todayKey() { return new Date().toISOString().slice(0, 10); }
function getTodayWinQuest() {
    return WIN_QUESTS[new Date().getDay() % WIN_QUESTS.length];
}
// Backward-compat: single challenge used by legacy callers
export function getTodayChallenge() {
    const ch = getTodayWinQuest();
    return { id: ch.id, description: ch.description, xpReward: ch.xpReward, targetCount: ch.targetCount };
}
async function questProgress(profileId, id, targetCount) {
    const [row] = await sql `
    SELECT COUNT(*) as c FROM daily_completions
    WHERE player_id = ${profileId} AND challenge_id = ${id} AND date_key = ${todayKey()}
  `;
    const progress = Number(row?.c ?? 0);
    return { progress, completed: progress >= targetCount };
}
export async function getDailyQuestsForPlayer(profileId) {
    const quests = [getTodayWinQuest(), SURVIVAL_QUEST, VOLUME_QUEST];
    return Promise.all(quests.map(async (q) => {
        const { progress, completed } = await questProgress(profileId, q.id, q.targetCount);
        return { id: q.id, description: q.description, xpReward: q.xpReward, completedToday: completed, progressCount: progress, targetCount: q.targetCount };
    }));
}
export async function checkAndAwardChallenges(profileId, won, role, dayReached, team) {
    const dateKey = todayKey();
    const quests = [getTodayWinQuest(), SURVIVAL_QUEST, VOLUME_QUEST];
    let totalBonus = 0;
    let anyCompleted = false;
    for (const q of quests) {
        const [countRow] = await sql `
      SELECT COUNT(*) as c FROM daily_completions
      WHERE player_id = ${profileId} AND challenge_id = ${q.id} AND date_key = ${dateKey}
    `;
        if (Number(countRow?.c ?? 0) >= q.targetCount)
            continue;
        if (!q.check(won, role, dayReached, team))
            continue;
        await sql `
      INSERT INTO daily_completions (player_id, challenge_id, date_key, completed_at)
      VALUES (${profileId}, ${q.id}, ${dateKey}, ${Date.now()})
      ON CONFLICT DO NOTHING
    `;
        const [newRow] = await sql `
      SELECT COUNT(*) as c FROM daily_completions
      WHERE player_id = ${profileId} AND challenge_id = ${q.id} AND date_key = ${dateKey}
    `;
        if (Number(newRow?.c ?? 0) >= q.targetCount) {
            totalBonus += q.xpReward;
            anyCompleted = true;
        }
    }
    return { totalBonus, anyCompleted };
}
// Backward-compat wrapper
export async function checkAndAwardChallenge(profileId, won, role, dayReached, team) {
    return (await checkAndAwardChallenges(profileId, won, role, dayReached, team)).anyCompleted;
}
export async function getDailyChallengeForPlayer(profileId) {
    const ch = getTodayChallenge();
    const { progress, completed } = await questProgress(profileId, ch.id, ch.targetCount);
    return { id: ch.id, description: ch.description, xpReward: ch.xpReward, completedToday: completed, progressCount: progress, targetCount: ch.targetCount };
}
//# sourceMappingURL=challengeService.js.map