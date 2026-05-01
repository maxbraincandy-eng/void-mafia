const { ACTION, TEAM } = require("./constants");
const { team } = require("./Rules");

function countBy(list) {
  return list.reduce((acc, x) => {
    acc[x] = (acc[x] || 0) + 1;
    return acc;
  }, {});
}

function top(list) {
  const counts = countBy(list);
  const max = Math.max(0, ...Object.values(counts));
  return Object.keys(counts).filter(k => counts[k] === max);
}

function resolveTeamKill(room, actions, actionName, teamName, blockedIds) {
  const teamActions = actions.filter(a => {
    const actor = room.players.find(p => p.id === a.actorId);
    return actor && team(actor.role) === teamName && a.action === actionName && !blockedIds.has(a.actorId);
  });

  if (!teamActions.length) return null;

  const priority = teamActions.find(a => {
    const actor = room.players.find(p => p.id === a.actorId);
    return actor && (actor.role === "don" || actor.role === "chogun");
  });
  if (priority) return priority.targetId;

  return top(teamActions.map(a => a.targetId))[0] || null;
}

function resolveNight(room) {
  const actions = Object.values(room.nightActions);
  const blockedIds = new Set(actions.filter(a => a.action === ACTION.BLOCK).map(a => a.targetId));

  const saved = new Set();
  const guarded = new Map();
  const voteProtected = new Set();
  const publicHints = [];
  const privateResults = [];
  const kills = [];

  for (const a of actions) {
    if (blockedIds.has(a.actorId)) continue;
    if (a.action === ACTION.SAVE) saved.add(a.targetId);
    if (a.action === ACTION.GUARD) guarded.set(a.targetId, a.actorId);
    if (a.action === ACTION.PROTECT_VOTE) voteProtected.add(a.targetId);
    if (a.action === ACTION.PUBLIC_HINT) publicHints.push(a);
  }

  const mafiaTarget = resolveTeamKill(room, actions, ACTION.MAFIA_KILL, TEAM.MAFIA, blockedIds);
  if (mafiaTarget) kills.push({ targetId: mafiaTarget, reason: "mafia" });

  const yakuzaTarget = resolveTeamKill(room, actions, ACTION.YAKUZA_KILL, TEAM.YAKUZA, blockedIds);
  if (yakuzaTarget) kills.push({ targetId: yakuzaTarget, reason: "yakuza" });

  for (const a of actions) {
    if (blockedIds.has(a.actorId)) continue;
    if (a.action === ACTION.SERIAL_KILL || a.action === ACTION.VIGILANTE_KILL) {
      kills.push({ targetId: a.targetId, reason: a.action });
    }
  }

  for (const a of actions) {
    if (blockedIds.has(a.actorId)) continue;

    const actor = room.players.find(p => p.id === a.actorId);
    const target = room.players.find(p => p.id === a.targetId);
    if (!actor || !target) continue;

    if (a.action === ACTION.CHECK_ALIGNMENT) {
      privateResults.push({
        actorId: actor.id,
        text: `შემოწმება: #${target.seat} ${isSuspicious(target.role) ? "საეჭვოა" : "სუფთაა"}`
      });
    }

    if (a.action === ACTION.TRACK_ACTION) {
      const acted = actions.some(x => x.actorId === target.id);
      privateResults.push({
        actorId: actor.id,
        text: `გამოძიება: #${target.seat} ${acted ? "ღამით მოქმედებდა" : "მოქმედება არ დაფიქსირდა"}`
      });
    }

    if (a.action === ACTION.PUBLIC_HINT) {
      publicHints.push({
        actorId: actor.id,
        targetId: target.id,
        text: `ღამის ჩანაწერი: #${target.seat} ყურადღების ცენტრშია.`
      });
    }
  }

  const dead = new Set();
  const guardedDeaths = new Set();

  for (const kill of kills) {
    if (saved.has(kill.targetId)) continue;

    if (guarded.has(kill.targetId)) {
      guardedDeaths.add(guarded.get(kill.targetId));
      continue;
    }

    dead.add(kill.targetId);
  }

  for (const id of guardedDeaths) dead.add(id);

  return {
    deadIds: [...dead],
    blockedIds: [...blockedIds],
    savedIds: [...saved],
    guardedDeaths: [...guardedDeaths],
    voteProtectedIds: [...voteProtected],
    privateResults,
    publicHints
  };
}

function isSuspicious(role) {
  return ["mafia", "don", "yakuza", "chogun", "serial_killer"].includes(role);
}

module.exports = { resolveNight, top, countBy };
