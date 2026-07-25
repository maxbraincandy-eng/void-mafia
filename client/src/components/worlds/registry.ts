// ── Premium Worlds — registry ─────────────────────────────────────────
// The single source of truth for available premium worlds. Adding a future
// world (Cyber City, Luxury Penthouse, …) is just a new WorldDef + one entry
// here — the engine, lobby, controls and networking are all shared.
import type { WorldDef } from './types';
import { beachCamp } from './beachCamp';
import { cyberLounge } from './cyberLounge';
import { mountainCabin } from './mountainCabin';
import { skylineTerrace } from './skylineTerrace';
import { privateYacht } from './privateYacht';
import { rotmundi } from './rotmundi';
import { speedway } from './speedway';

export const PREMIUM_WORLDS: WorldDef[] = [
  beachCamp,
  cyberLounge,
  mountainCabin,
  skylineTerrace,
  privateYacht,
  rotmundi,
  speedway,
];

export function getWorld(id: string): WorldDef | undefined {
  return PREMIUM_WORLDS.find(w => w.id === id);
}
