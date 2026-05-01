const { ROLE } = require("./constants");

function buildDeck(playerCount, settings) {
  const rs = settings.roles;
  const deck = [];

  if (rs.don) deck.push(ROLE.DON);
  for (let i = 0; i < rs.mafia; i++) deck.push(ROLE.MAFIA);

  if (rs.sheriff) deck.push(ROLE.SHERIFF);
  if (rs.doctor) deck.push(ROLE.DOCTOR);
  if (rs.detective) deck.push(ROLE.DETECTIVE);
  if (rs.bodyguard) deck.push(ROLE.BODYGUARD);
  if (rs.journalist) deck.push(ROLE.JOURNALIST);
  if (rs.lawyer) deck.push(ROLE.LAWYER);
  if (rs.mayor) deck.push(ROLE.MAYOR);

  if (rs.serial) deck.push(ROLE.SERIAL);
  if (rs.yakuza) deck.push(ROLE.YAKUZA);
  if (rs.chogun) deck.push(ROLE.CHOGUN);
  if (rs.vigilante) deck.push(ROLE.VIGILANTE);
  if (rs.maniac) deck.push(ROLE.MANIAC);

  while (deck.length < playerCount) deck.push(ROLE.CITIZEN);
  return shuffle(deck).slice(0, playerCount);
}

function assignRoles(room) {
  const deck = buildDeck(room.players.length, room.settings);
  const players = shuffle(room.players);
  players.forEach((player, index) => {
    player.role = deck[index] || ROLE.CITIZEN;
    player.revealed = false;
    player.alive = true;
    player.flags.protectedFromVote = false;
    player.flags.mayorRevealed = false;
    player.limits.vigilanteShots = 1;
  });
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = { buildDeck, assignRoles };
