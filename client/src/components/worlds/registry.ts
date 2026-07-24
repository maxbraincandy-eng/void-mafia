// ── Premium Worlds — registry ─────────────────────────────────────────
// The single source of truth for available premium worlds. Adding a future
// world (Cyber City, Luxury Penthouse, …) is just a new WorldDef + one entry
// here — the engine, lobby, controls and networking are all shared.
import type { WorldDef } from './types';
import { beachCamp } from './beachCamp';
import { cyberLounge } from './cyberLounge';
import { mountainCabin } from './mountainCabin';
import { skylineTerrace } from './skylineTerrace';

export const PREMIUM_WORLDS: WorldDef[] = [
  beachCamp,
  cyberLounge,
  mountainCabin,
  skylineTerrace,
  // Coming soon — placeholders so the lobby shows the roadmap. `build` is never
  // called for 'soon' worlds; they can't be entered yet.
  { id: 'yacht_club', name: 'Private Yacht', subtitle: 'ლუქს იახტა · მალე', icon: '🛥️', status: 'soon', spawn: { x: 0, z: 0, yaw: 0 }, fog: { color: 0x0a1424, density: 0.02 }, clear: 0x0a1424, build() {} },
];

export function getWorld(id: string): WorldDef | undefined {
  return PREMIUM_WORLDS.find(w => w.id === id);
}
