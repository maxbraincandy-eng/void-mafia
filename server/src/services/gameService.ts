import {
  Room, Player, Phase, RoleKey, Team, NightAction, GameOverResult,
} from '../types/index.js';
import { buildRoleDeck, buildAutoRoleDeck, validateRoleDistribution, getTeam, isSuspiciousToSheriff, getRole } from './roleService.js';
import { getAlivePlayers } from './roomService.js';

// ── Start Game ────────────────────────────────────────────────────────
export function startGame(room: Room): void {
  const allPlayers = [...room.players.values()];
  const activePlayers = allPlayers.filter(p => !p.isSpectator);
  const count = activePlayers.length;

  if (count < room.settings.minPlayers) {
    throw new Error(`Need at least ${room.settings.minPlayers} players to start.`);
  }

  for (const p of allPlayers) {
    if (p.isSpectator) {
      p.isAlive = false;
      p.role = null;
      p.team = null;
    }
  }

  const r = room.settings.roles;
  const mafiaTotal  = (r.mafia ?? 0) + (r.don ?? 0);
  const yakuzaTotal = (r.yakuza ?? 0) + (r.shogun ?? 0);
  let deck: RoleKey[];
  if (mafiaTotal === 0 && yakuzaTotal === 0) {
    deck = buildAutoRoleDeck(count);
  } else {
    validateRoleDistribution(count, room.settings);
    deck = buildRoleDeck(room.settings, count);
  }

  activePlayers.sort((a, b) => a.seat - b.seat);
  activePlayers.forEach((player, i) => {
    const role = deck[i]!;
    player.role = role;
    player.team = getTeam(role);
    player.isAlive = true;
    player.hasActedThisPhase = false;
    player.voteTarget = null;
  });

  room.day = 1;
  room.winner = null;
  room.killedLastNight = [];
  room.savedLastNight = false;
  room.chat = [];
  room.mafiaChat = [];
  room.dousedPlayers = new Set();
  room.newlyConvertedCultists = [];
}

// ── Set Phase ─────────────────────────────────────────────────────────
export function setPhase(room: Room, phase: Phase): void {
  room.phase = phase;

  for (const p of room.players.values()) {
    p.hasActedThisPhase = false;
    if (phase === 'voting') p.voteTarget = null;
  }

  switch (phase) {
    case 'night':
      room.nightActions = new Map();
      room.killedLastNight = [];
      room.savedLastNight = false;
      room.newlyConvertedCultists = [];
      room.timer = room.settings.nightDuration;
      room.maxTimer = room.settings.nightDuration;
      break;
    case 'day':
      room.timer = room.settings.dayDuration;
      room.maxTimer = room.settings.dayDuration;
      room.daySkipVotes = [];
      break;
    case 'speech': {
      const alivePlayers = [...room.players.values()]
        .filter(p => p.isAlive && !p.isSpectator)
        .sort((a, b) => a.seat - b.seat);
      room.speechOrder = alivePlayers.map(p => p.id);
      room.currentSpeakerIdx = 0;
      room.timer = room.settings.speechDuration;
      room.maxTimer = room.settings.speechDuration;
      break;
    }
    case 'voting':
      room.votes = new Map();
      room.timer = room.settings.voteDuration;
      room.maxTimer = room.settings.voteDuration;
      break;
    case 'role_reveal':
      room.timer = room.settings.roleRevealDuration;
      room.maxTimer = room.settings.roleRevealDuration;
      break;
    case 'game_over':
      room.timer = 0;
      room.maxTimer = 0;
      (room as any)._gameOverAt = Date.now();
      break;
  }
}

// ── Advance Phase ─────────────────────────────────────────────────────
export function advancePhase(room: Room): Phase {
  if (room.winner) {
    setPhase(room, 'game_over');
    return 'game_over';
  }

  switch (room.phase) {
    case 'role_reveal':
      if (checkWin(room)) {
        setPhase(room, 'game_over');
        return 'game_over';
      }
      // Day-first: go to day(1) discussion before first night
      if (!room.settings.startWithNight) {
        setPhase(room, 'day');
        return 'day';
      }
      setPhase(room, 'night');
      return 'night';

    case 'night':
      resolveNight(room);
      if (checkWin(room)) {
        setPhase(room, 'game_over');
        return 'game_over';
      }
      // Morning of a new day
      room.day++;
      setPhase(room, 'day');
      return 'day';

    case 'day':
      // Opening shared discussion (day-first start) has no tribunal/vote —
      // everyone talks publicly first, then it becomes night.
      if (room.day === 1 && !room.settings.startWithNight) {
        setPhase(room, 'night');
        return 'night';
      }
      setPhase(room, 'speech');
      return 'speech';

    case 'speech': {
      const nextIdx = room.currentSpeakerIdx + 1;
      if (nextIdx < room.speechOrder.length) {
        room.currentSpeakerIdx = nextIdx;
        room.timer = room.settings.speechDuration;
        room.maxTimer = room.settings.speechDuration;
        return 'speech';
      }
      setPhase(room, 'voting');
      return 'voting';
    }

    case 'voting':
      resolveVotes(room);
      if (checkWin(room)) {
        setPhase(room, 'game_over');
        return 'game_over';
      }
      room.day++;
      setPhase(room, 'night');
      return 'night';

    default:
      return room.phase;
  }
}

// ── Night Resolution ──────────────────────────────────────────────────
export function resolveNight(room: Room): void {
  const allActions = [...room.nightActions.values()];

  // Escort roleblocks
  const escortBlocked = new Set(
    allActions.filter(a => a.role === 'escort').map(a => a.targetId)
  );
  // Effective actions (escort's own action counts; blocked players' actions do not)
  const actions = allActions.filter(a => a.role === 'escort' || !escortBlocked.has(a.actorId));

  // Doctor saves
  const savedByDoctor = new Set(
    actions.filter(a => a.role === 'doctor').map(a => a.targetId)
  );

  // Bodyguard protections: targetId → bodyguardId
  const bodyguardProtects = new Map<string, string>(
    actions.filter(a => a.role === 'bodyguard').map(a => [a.targetId, a.actorId])
  );

  room.killedLastNight = [];
  room.savedLastNight = false;
  room.newlyConvertedCultists = [];

  // ── Veteran alerts ───────────────────────────────────────────────────
  const alertedVeterans = new Set(
    actions.filter(a => a.role === 'veteran' && a.actorId === a.targetId).map(a => a.actorId)
  );
  // Anyone (in effective actions) who visited an alerted veteran dies
  const veteranKillTargets = new Set<string>();
  for (const action of actions) {
    if (alertedVeterans.has(action.targetId) && action.actorId !== action.targetId) {
      veteranKillTargets.add(action.actorId);
    }
  }
  for (const killId of veteranKillTargets) {
    const victim = room.players.get(killId);
    if (victim && victim.isAlive) {
      victim.isAlive = false;
      victim.deathType = 'night';
      room.killedLastNight.push({ id: killId, name: victim.name, lastWill: victim.lastWill ?? null });
    }
  }

  // ── Cult leader recruits ─────────────────────────────────────────────
  for (const action of actions) {
    if (action.role !== 'cult_leader') continue;
    const target = room.players.get(action.targetId);
    if (!target || !target.isAlive || target.team === 'cult') continue;
    // Convert target to cultist
    target.role = 'cultist';
    target.team = 'cult';
    room.newlyConvertedCultists.push(target.id);
  }

  // ── Arsonist actions ─────────────────────────────────────────────────
  for (const action of actions) {
    if (action.role !== 'arsonist') continue;
    if (action.actorId === action.targetId) {
      // Ignite: kill all currently doused players
      for (const dousedId of room.dousedPlayers) {
        const doused = room.players.get(dousedId);
        if (!doused || !doused.isAlive) continue;
        if (savedByDoctor.has(dousedId)) { room.savedLastNight = true; continue; }
        doused.isAlive = false;
        doused.deathType = 'night';
        room.killedLastNight.push({ id: dousedId, name: doused.name, lastWill: doused.lastWill ?? null });
      }
      room.dousedPlayers.clear();
    } else {
      // Douse the target
      room.dousedPlayers.add(action.targetId);
    }
  }

  // ── Standard kill intents ────────────────────────────────────────────
  const mafiaKills     = actions.filter(a => a.role === 'mafia' || a.role === 'don').map(a => a.targetId);
  const maniacKills    = actions.filter(a => a.role === 'maniac').map(a => a.targetId);
  const vigilanteKills = actions.filter(a => a.role === 'vigilante').map(a => a.targetId);
  const yakuzaKills    = actions.filter(a => a.role === 'yakuza').map(a => a.targetId);
  // Skip veteran-alerted targets (veteran kills them already; or veteran is immune while on alert)
  const killIntents = [...mafiaKills, ...maniacKills, ...vigilanteKills, ...yakuzaKills].filter(id => !alertedVeterans.has(id));

  for (const targetId of killIntents) {
    const target = room.players.get(targetId);
    if (!target || !target.isAlive) continue;

    if (savedByDoctor.has(targetId)) {
      room.savedLastNight = true;
      continue;
    }

    const bodyguardId = bodyguardProtects.get(targetId);
    if (bodyguardId) {
      const bodyguard = room.players.get(bodyguardId);
      if (bodyguard && bodyguard.isAlive) {
        bodyguard.isAlive = false;
        bodyguard.deathType = 'night';
        room.killedLastNight.push({ id: bodyguardId, name: bodyguard.name, lastWill: bodyguard.lastWill ?? null });
        room.savedLastNight = true;
        continue;
      }
    }

    target.isAlive = false;
    target.deathType = 'night';
    room.killedLastNight.push({ id: targetId, name: target.name, lastWill: target.lastWill ?? null });
  }
}

// ── Night Action ──────────────────────────────────────────────────────
export function submitNightAction(room: Room, actor: Player, targetId: string): void {
  if (room.phase !== 'night') throw new Error('Not night phase.');
  if (!actor.isAlive) throw new Error('You have been eliminated.');
  if (!actor.role || !getRole(actor.role).wakeAtNight) throw new Error('Your role has no night ability.');

  const target = room.players.get(targetId);
  if (!target) throw new Error('Target not found.');

  const isSelfTarget = actor.id === targetId;

  // Veteran goes on alert by self-targeting
  if (actor.role === 'veteran') {
    if (!isSelfTarget) throw new Error('To go on alert, target yourself.');
    room.nightActions.set(actor.id, { actorId: actor.id, targetId, role: actor.role, submittedAt: Date.now() });
    actor.hasActedThisPhase = true;
    return;
  }

  // Arsonist can douse a player OR ignite (self-target)
  if (actor.role === 'arsonist') {
    if (!isSelfTarget && !target.isAlive) throw new Error('Cannot douse an eliminated player.');
    room.nightActions.set(actor.id, { actorId: actor.id, targetId, role: actor.role, submittedAt: Date.now() });
    actor.hasActedThisPhase = true;
    return;
  }

  if (!target.isAlive) throw new Error('Cannot target an eliminated player.');

  // Doctor/bodyguard self-target validation
  if ((actor.role === 'doctor' || actor.role === 'bodyguard') && isSelfTarget && !room.settings.allowDoctorSelfHeal) {
    throw new Error('Self-protection is disabled in this room.');
  }

  // Mafia cannot kill fellow mafia
  if ((actor.role === 'mafia' || actor.role === 'don') && target.team === 'mafia') {
    throw new Error('You cannot target a fellow mafia member.');
  }

  // Vigilante cannot target themselves
  if (actor.role === 'vigilante' && isSelfTarget) throw new Error('You cannot target yourself.');

  // Escort cannot target themselves
  if (actor.role === 'escort' && isSelfTarget) throw new Error('You cannot target yourself.');

  // Cult leader cannot recruit cult members or self
  if (actor.role === 'cult_leader') {
    if (isSelfTarget) throw new Error('You cannot recruit yourself.');
    if (target.team === 'cult') throw new Error('Already a cult member.');
  }

  // Yakuza cannot target fellow yakuza (Shogun is an ally)
  if (actor.role === 'yakuza' && target.team === 'yakuza') {
    throw new Error('You cannot target a fellow Yakuza member.');
  }

  room.nightActions.set(actor.id, {
    actorId: actor.id,
    targetId,
    role: actor.role,
    submittedAt: Date.now(),
  });
  actor.hasActedThisPhase = true;
}

export function getInvestigationResult(room: Room, actor: Player): { targetId: string; targetName: string; result: 'suspicious' | 'not_suspicious' } | null {
  const action = room.nightActions.get(actor.id);
  if (!action) return null;
  const target = room.players.get(action.targetId);
  if (!target) return null;
  return {
    targetId: target.id,
    targetName: target.name,
    result: isSuspiciousToSheriff(target.role!) ? 'suspicious' : 'not_suspicious',
  };
}

export function getTrackResult(room: Room, actor: Player): { trackedName: string; visitedName: string | null } | null {
  const action = room.nightActions.get(actor.id);
  if (!action) return null;
  const tracked = room.players.get(action.targetId);
  if (!tracked) return null;

  const trackedAction = room.nightActions.get(tracked.id);
  const visited = trackedAction ? room.players.get(trackedAction.targetId) : null;

  return {
    trackedName: tracked.name,
    visitedName: visited?.name ?? null,
  };
}

// ── Voting ────────────────────────────────────────────────────────────
export function submitVote(room: Room, voter: Player, targetId: string | null): void {
  if (room.phase !== 'voting') throw new Error('Not voting phase.');
  if (!voter.isAlive) throw new Error('Eliminated players cannot vote.');

  if (targetId !== null) {
    const target = room.players.get(targetId);
    if (!target) throw new Error('Target not found.');
    if (!target.isAlive) throw new Error('Cannot vote for an eliminated player.');
    if (target.id === voter.id) throw new Error('You cannot vote for yourself.');
  }

  voter.voteTarget = targetId;
  room.votes.set(voter.id, targetId);
}

export function resolveVotes(room: Room): string | null {
  const counts = new Map<string, number>();

  for (const [voterId, targetId] of room.votes.entries()) {
    if (!targetId) continue;
    const voter = room.players.get(voterId);
    const weight = voter?.role === 'mayor' ? 2 : 1;
    counts.set(targetId, (counts.get(targetId) ?? 0) + weight);
  }

  if (counts.size === 0) return null;

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [topId, topCount] = sorted[0]!;

  if (sorted.length > 1 && sorted[1]![1] === topCount) {
    if (room.settings.tieVoteRule === 'no_elimination') return null;
    const tied = sorted.filter(([, c]) => c === topCount).map(([id]) => id);
    const winnerId = tied[Math.floor(Math.random() * tied.length)]!;
    eliminatePlayer(room, winnerId, true);
    return winnerId;
  }

  const target = room.players.get(topId);
  if (!target || !target.isAlive) return null;

  if (target.role === 'jester') {
    target.isAlive = false;
    target.deathType = 'vote';
    room.winner = 'neutral';
    return topId;
  }

  eliminatePlayer(room, topId, true);
  return topId;
}

function eliminatePlayer(room: Room, playerId: string, byVote: boolean): void {
  const player = room.players.get(playerId);
  if (!player) return;
  player.isAlive = false;
  player.deathType = byVote ? 'vote' : 'night';
}

// ── Win Condition ─────────────────────────────────────────────────────
export function checkWin(room: Room): boolean {
  if (room.winner) return true;

  const alive = getAlivePlayers(room);
  const mafiaAlive      = alive.filter(p => p.team === 'mafia').length;
  const townAlive       = alive.filter(p => p.team === 'town').length;
  const cultAlive       = alive.filter(p => p.team === 'cult').length;
  const cultLeaderAlive = alive.some(p => p.role === 'cult_leader');
  const neutralAlive    = alive.filter(p => p.team === 'neutral').length;
  const yakuzaAlive     = alive.filter(p => p.team === 'yakuza').length;
  const yakuzaKillerAlive = alive.some(p => p.role === 'yakuza');

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[WinCheck] phase=${room.phase} mafia=${mafiaAlive} town=${townAlive} cult=${cultAlive} neutral=${neutralAlive} yakuza=${yakuzaAlive}`);
  }

  // Cult win: leader alive and cult outnumbers everyone else
  if (cultLeaderAlive && cultAlive >= mafiaAlive + townAlive + neutralAlive + yakuzaAlive && cultAlive > 0) {
    room.winner = 'cult';
    return true;
  }

  // Maniac/Arsonist solo win: only neutral left (no other threatening factions)
  if (neutralAlive >= 1 && mafiaAlive === 0 && townAlive === 0 && cultAlive === 0 && yakuzaAlive === 0) {
    room.winner = 'neutral';
    return true;
  }

  // Yakuza win: Yakuza team count >= all opposing alive players
  // Shogun alone can also win by final parity (no active killer needed for the last step)
  if (yakuzaAlive > 0 && yakuzaAlive >= mafiaAlive + townAlive + neutralAlive + cultAlive) {
    room.winner = 'yakuza';
    return true;
  }

  // Yakuza faction is completely dead — check remaining factions without yakuza
  // Town wins: all mafia, cult, and yakuza eliminated
  if (mafiaAlive === 0 && cultAlive === 0 && yakuzaAlive === 0) {
    room.winner = 'town';
    return true;
  }

  // Mafia wins: mafia count equals or exceeds all others (including yakuza)
  if (mafiaAlive >= townAlive + neutralAlive + cultAlive + yakuzaAlive) {
    room.winner = 'mafia';
    return true;
  }

  // Suppress unused variable warning — yakuzaKillerAlive is informational only
  void yakuzaKillerAlive;

  return false;
}

export function buildGameOverResult(room: Room): GameOverResult {
  const allRoles: GameOverResult['allRoles'] = {};
  for (const p of room.players.values()) {
    if (p.isSpectator) continue;
    allRoles[p.id] = {
      name: p.name,
      role: p.role ?? 'citizen',
      team: p.team ?? 'town',
    };
  }
  return {
    winner: room.winner ?? 'town',
    allRoles,
  };
}

export function allNightActionsSubmitted(room: Room): boolean {
  const alivePlayers = getAlivePlayers(room);
  const actorsNeeded = alivePlayers.filter(p => {
    if (!p.role) return false;
    return getRole(p.role).wakeAtNight;
  });
  return actorsNeeded.every(p => room.nightActions.has(p.id));
}
