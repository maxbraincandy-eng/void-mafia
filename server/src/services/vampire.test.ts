/**
 * Halloween's vampire, through the real night resolution and win check.
 *
 *   npx tsx --test src/services/vampire.test.ts
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';

import { createRoom, addPlayer } from './roomService.js';
import { resolveNight, submitNightAction, checkWin, getInvestigationResult } from './gameService.js';
import { buildAutoRoleDeck, buildRoleDeck, getTeam, isSuspiciousToSheriff } from './roleService.js';
import { isMafiaHalloween } from './halloween.js';
import type { Room, Player, RoleKey } from '../types/index.js';

const OCT = Date.UTC(2026, 9, 15, 8);
const DEC = Date.UTC(2026, 11, 15, 8);

let n = 0;
/** A room mid-night with these roles, in seat order; returns players by role-ish name. */
function table(roles: RoleKey[]): { room: Room; p: Player[] } {
  const room = createRoom(`s${++n}`, 'P0', null);
  const p: Player[] = [room.players.get(room.hostId)!];
  for (let i = 1; i < roles.length; i++) p.push(addPlayer(room, `s${n}-${i}`, `P${i}`, null));
  p.forEach((pl, i) => { pl.role = roles[i]!; pl.team = getTeam(roles[i]!); pl.isAlive = true; pl.isSpectator = false; });
  room.phase = 'night';
  room.nightActions = new Map();
  return { room, p };
}

test('the season is 1 October to 1 November, Tbilisi time', () => {
  const tbilisi = (m: number, d: number, h = 12) => Date.UTC(2026, m - 1, d, h - 4);
  assert.equal(isMafiaHalloween(tbilisi(9, 30, 23)), false);
  assert.equal(isMafiaHalloween(tbilisi(10, 1, 0) + 1000), true);
  assert.equal(isMafiaHalloween(tbilisi(11, 1, 23)), true);
  assert.equal(isMafiaHalloween(tbilisi(11, 2, 0) + 1000), false);
});

test('a vampire bite kills', () => {
  const { room, p } = table(['vampire', 'citizen', 'citizen', 'mafia']);
  submitNightAction(room, p[0]!, p[1]!.id);
  resolveNight(room);
  assert.equal(p[1]!.isAlive, false);
  assert.ok(room.killedLastNight.some(k => k.id === p[1]!.id));
});

test('the doctor saves a bitten player', () => {
  const { room, p } = table(['vampire', 'citizen', 'doctor', 'mafia']);
  submitNightAction(room, p[0]!, p[1]!.id);
  submitNightAction(room, p[2]!, p[1]!.id);
  resolveNight(room);
  assert.equal(p[1]!.isAlive, true, 'the doctor did not stop the bite');
});

test('nothing kills a vampire at night: mafia, maniac, vigilante', () => {
  for (const killer of ['mafia', 'maniac', 'vigilante'] as RoleKey[]) {
    const { room, p } = table(['vampire', killer, 'citizen', 'citizen']);
    submitNightAction(room, p[1]!, p[0]!.id);
    resolveNight(room);
    assert.equal(p[0]!.isAlive, true, `the ${killer} killed the vampire at night`);
  }
});

test('a veteran on alert does not kill a vampire that visits', () => {
  const { room, p } = table(['vampire', 'veteran', 'citizen', 'mafia']);
  submitNightAction(room, p[1]!, p[1]!.id);     // alert
  submitNightAction(room, p[0]!, p[1]!.id);     // bite the veteran
  resolveNight(room);
  assert.equal(p[0]!.isAlive, true);
});

test('the arsonist cannot burn a vampire', () => {
  const { room, p } = table(['vampire', 'arsonist', 'citizen', 'mafia']);
  room.dousedPlayers = new Set([p[0]!.id]);
  submitNightAction(room, p[1]!, p[1]!.id);     // ignite
  resolveNight(room);
  assert.equal(p[0]!.isAlive, true);
});

test('a vampire cannot bite itself', () => {
  const { room, p } = table(['vampire', 'citizen', 'citizen', 'mafia']);
  assert.throws(() => submitNightAction(room, p[0]!, p[0]!.id), /bite yourself/);
});

test('the sheriff sees a vampire as suspicious', () => {
  assert.equal(isSuspiciousToSheriff('vampire'), true);
  const { room, p } = table(['vampire', 'sheriff', 'citizen', 'mafia']);
  submitNightAction(room, p[1]!, p[0]!.id);
  assert.equal(getInvestigationResult(room, p[1]!)?.result, 'suspicious');
});

test('the town has not won while a vampire lives', () => {
  const { room, p } = table(['vampire', 'citizen', 'citizen', 'mafia']);
  p[3]!.isAlive = false;                         // the mafia is gone
  assert.equal(checkWin(room), false, 'the town won with a vampire still killing');
  p[0]!.isAlive = false;                         // and now the vampire, voted out
  assert.equal(checkWin(room), true);
  assert.equal(room.winner, 'town');
});

test('a vampire left alone wins', () => {
  const { room, p } = table(['vampire', 'citizen', 'citizen', 'mafia']);
  p[1]!.isAlive = false; p[2]!.isAlive = false; p[3]!.isAlive = false;
  assert.equal(checkWin(room), true);
  assert.equal(room.winner, 'neutral');
});

test('an auto-dealt table of seven or more gets one vampire in October, none otherwise', () => {
  for (let count = 4; count <= 12; count++) {
    const oct = buildAutoRoleDeck(count, OCT).filter(r => r === 'vampire').length;
    assert.equal(oct, count >= 7 ? 1 : 0, `${count} players in October: ${oct} vampires`);
    assert.equal(buildAutoRoleDeck(count, DEC).filter(r => r === 'vampire').length, 0, 'a vampire outside the season');
    assert.equal(buildAutoRoleDeck(count, OCT).length, count);
  }
});

test('a vampire asked for by the host is dealt in season, at most one, and never after it', () => {
  const settings: any = { roles: { mafia: 2, sheriff: 1, vampire: 3 } };
  assert.equal(buildRoleDeck(settings, 9, OCT).filter(r => r === 'vampire').length, 1);
  assert.equal(buildRoleDeck(settings, 9, DEC).filter(r => r === 'vampire').length, 0);
});
