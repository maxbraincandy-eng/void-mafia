const { ROLE_META, TEAM, ACTION, ROLE } = require("./constants");

function meta(role) {
  return ROLE_META[role] || ROLE_META.citizen;
}

function team(role) {
  return meta(role).team;
}

function nightAction(role) {
  return meta(role).action;
}

function canSelfTarget(role, action) {
  const m = meta(role);
  return !!m.canSelf || (role === ROLE.DOCTOR && action === ACTION.SAVE);
}

function isHost(room, player) {
  return player && player.seat === 1;
}

function alivePlayers(room) {
  return room.players.filter(p => p.alive);
}

function checkWin(room) {
  const alive = alivePlayers(room);
  if (!alive.length) {
    return { team: TEAM.NONE, label: "მაგიდაზე ცოცხალი არავინ დარჩა" };
  }

  const mafia = alive.filter(p => team(p.role) === TEAM.MAFIA).length;
  const yakuza = alive.filter(p => team(p.role) === TEAM.YAKUZA).length;
  const solo = alive.filter(p => team(p.role) === TEAM.SOLO).length;
  const city = alive.filter(p => team(p.role) === TEAM.CITY).length;

  if (solo === 1 && alive.length === 1) {
    return { team: TEAM.SOLO, label: "მარტოხელა მოთამაშემ მოიგო" };
  }

  if (mafia > 0 && mafia >= alive.length - mafia) {
    return { team: TEAM.MAFIA, label: "ჩრდილის გუნდმა მოიგო" };
  }

  if (yakuza > 0 && yakuza >= alive.length - yakuza) {
    return { team: TEAM.YAKUZA, label: "აღმოსავლურმა გუნდმა მოიგო" };
  }

  if (mafia === 0 && yakuza === 0 && solo === 0 && city > 0) {
    return { team: TEAM.CITY, label: "ქალაქმა მოიგო" };
  }

  return null;
}

function shouldActorActAtNight(actor) {
  return actor.alive && !!nightAction(actor.role);
}

function visibleRoleName(role) {
  return meta(role).publicName || role;
}

module.exports = { meta, team, nightAction, canSelfTarget, isHost, alivePlayers, checkWin, shouldActorActAtNight, visibleRoleName };
