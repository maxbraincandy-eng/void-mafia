// Blackout — client mirrors of server/src/services/blackoutService.ts types.

export type BlackoutStatus = 'waiting' | 'play' | 'meeting' | 'finished';
export type BlackoutRole = 'killer' | 'crew';
export type BlackoutSpecialty = 'security' | 'hacker' | null;
export type BlackoutWinner = 'killers' | 'crew' | null;

// World constants — must match the server
export const BLACKOUT_WORLD_W = 1600;
export const BLACKOUT_WORLD_H = 1200;
export const BLACKOUT_KILL_DIST = 84;
export const BLACKOUT_REPORT_DIST = 130;
export const BLACKOUT_DOOR_HACK_DIST = 170;
export const BLACKOUT_EMERGENCY_DIST = 130;
export const BLACKOUT_EMERGENCY_POS = { x: 800, y: 600 };

// Doorway centers — must match server DOORS
export const BLACKOUT_DOORS: { id: string; x: number; y: number }[] = [
  { id: 'd0', x: 280, y: 490 }, { id: 'd1', x: 780, y: 490 }, { id: 'd2', x: 1300, y: 490 },
  { id: 'd3', x: 280, y: 710 }, { id: 'd4', x: 780, y: 710 }, { id: 'd5', x: 1300, y: 710 },
];

export interface BlackoutPublicPlayer {
  userId: string;
  nickname: string;
  seat: number;
  connected: boolean;
  alive: boolean;
  x: number;
  y: number;
}

export interface BlackoutCorpse {
  userId: string;
  nickname: string;
  seat: number;
  x: number;
  y: number;
}

export interface BlackoutChatMsg {
  id: string;
  userId: string;
  nickname: string;
  text: string;
  ts: number;
}

export interface BlackoutEject {
  userId: string | null;
  nickname: string | null;
  role: BlackoutRole | null;
  tie: boolean;
}

export interface BlackoutPublicState {
  id: string;
  code: string;
  status: BlackoutStatus;
  hostId: string;
  maxPlayers: number;
  players: BlackoutPublicPlayer[];
  lightsOn: boolean;
  lightsChangeAt: number;
  corpses: BlackoutCorpse[];
  meeting: { reporterName: string; bodyName: string | null; endsAt: number; votedIds: string[] } | null;
  lastEject: BlackoutEject | null;
  winner: BlackoutWinner;
  killers: string[] | null;
  myRole: BlackoutRole | null;
  mySpecialty: BlackoutSpecialty;
  myUserId: string;
  myKillCooldownUntil: number;
  sabotageCooldownUntil: number;
  doors: Record<string, number>;
  myHackCooldownUntil: number;
  myEmergencyUsed: boolean;
  chat: BlackoutChatMsg[];
  round: number;
}

export interface BlackoutListItem {
  id: string;
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  status: BlackoutStatus;
}
