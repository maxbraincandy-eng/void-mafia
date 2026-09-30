/**
 * Who may enter the mafia's night voice room.
 *
 * The mafia heard nobody at night: their client switched to `id::mafia`, and
 * the open token route refuses every private room. The token now comes from
 * the game socket, gated by `factionVoiceRoom`. These tests pin that gate —
 * a mafioso gets in during the night phases, and nobody else ever does.
 *
 *   npx tsx --test src/services/voiceFaction.test.ts
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';

import { factionVoiceRoom } from './voiceService.js';
import { isPrivateRoom } from '../routes/livekitRoutes.js';

type P = { team: string | null; isAlive?: boolean; isSpectator?: boolean; isConnected?: boolean };

function roomWith(phase: string, players: Record<string, P>): any {
  const map = new Map<string, any>();
  for (const [id, p] of Object.entries(players)) {
    map.set(id, { id, isAlive: true, isSpectator: false, isConnected: true, ...p });
  }
  return { id: 'R1', phase, players: map };
}

const TABLE = {
  don: { team: 'mafia' }, mafioso: { team: 'mafia' },
  citizen: { team: 'town' }, sheriff: { team: 'town' }, doctor: { team: 'town' },
  maniac: { team: 'neutral' }, yak: { team: 'yakuza' },
};

const MAFIA_PHASES = ['planning_night', 'night', 'mafia_kill'];
const OTHER_PHASES = ['lobby', 'role_reveal', 'day', 'speech', 'voting', 'trial_defense',
  'final_words', 'don_check', 'sheriff_check', 'tie_defense', 'game_over'];

for (const phase of MAFIA_PHASES) {
  test(`${phase}: both mafia get the mafia room`, () => {
    const r = roomWith(phase, TABLE);
    assert.equal(factionVoiceRoom(r, 'don'), 'R1::mafia');
    assert.equal(factionVoiceRoom(r, 'mafioso'), 'R1::mafia');
  });

  test(`${phase}: town, neutral and yakuza never get the mafia room`, () => {
    const r = roomWith(phase, TABLE);
    for (const id of ['citizen', 'sheriff', 'doctor', 'maniac']) {
      assert.equal(factionVoiceRoom(r, id), null, `${id} was let into a faction room`);
    }
    assert.notEqual(factionVoiceRoom(r, 'yak'), 'R1::mafia');
  });
}

for (const phase of OTHER_PHASES) {
  test(`${phase}: nobody gets a faction room outside the night`, () => {
    const r = roomWith(phase, TABLE);
    for (const id of Object.keys(TABLE)) assert.equal(factionVoiceRoom(r, id), null, `${id} in ${phase}`);
  });
}

test('night: yakuza get their own room, and only at night', () => {
  assert.equal(factionVoiceRoom(roomWith('night', TABLE), 'yak'), 'R1::yakuza');
  assert.equal(factionVoiceRoom(roomWith('planning_night', TABLE), 'yak'), null);
});

test('a dead mafioso is not let back in', () => {
  const r = roomWith('night', { ...TABLE, mafioso: { team: 'mafia', isAlive: false } });
  assert.equal(factionVoiceRoom(r, 'mafioso'), null);
  assert.equal(factionVoiceRoom(r, 'don'), 'R1::mafia');
});

test('a spectator on the mafia team is not let in', () => {
  const r = roomWith('night', { ...TABLE, mafioso: { team: 'mafia', isSpectator: true } });
  assert.equal(factionVoiceRoom(r, 'mafioso'), null);
});

test('somebody not in the room gets nothing', () => {
  assert.equal(factionVoiceRoom(roomWith('night', TABLE), 'stranger'), null);
});

test('the faction room is one the open token route refuses', () => {
  // If this ever stops holding, the gate above is decoration.
  assert.equal(isPrivateRoom('R1::mafia'), true);
  assert.equal(isPrivateRoom('R1::yakuza'), true);
  assert.equal(isPrivateRoom('R1'), false);
});

test('the issued token admits to exactly that room', async () => {
  process.env.LIVEKIT_URL = 'wss://example.invalid';
  process.env.LIVEKIT_API_KEY = 'testkey';
  process.env.LIVEKIT_API_SECRET = 'testsecret-testsecret-testsecret-1234';
  const { createAccessToken } = await import('./livekitService.js');
  const { token } = await createAccessToken('don', 'R1::mafia', { canPublish: true, ttlSeconds: 30 * 60 });
  const claims = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString());
  assert.equal(claims.video.room, 'R1::mafia');
  assert.equal(claims.video.roomJoin, true);
  assert.equal(claims.sub, 'don');
  assert.ok(claims.exp - claims.nbf <= 30 * 60 + 5, 'the night token lives longer than half an hour');
});
