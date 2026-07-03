import { sql } from '../db.js';

const PET_LEVEL_THRESHOLDS = [0, 50, 150, 350, 700, 1200, 2000, 3200, 5000, 8000];

export interface PetData {
  petXp: number;
  petLevel: number;
  xpToNext: number;
}

export async function getPetData(playerId: string): Promise<PetData> {
  const rows = await sql`SELECT pet_xp, pet_level FROM player_pets WHERE player_id = ${playerId}` as any[];
  if (!rows.length) {
    return { petXp: 0, petLevel: 1, xpToNext: PET_LEVEL_THRESHOLDS[1] ?? 999999 };
  }
  const { pet_xp, pet_level } = rows[0];
  const level = Number(pet_level);
  const xp = Number(pet_xp);
  const nextThreshold = PET_LEVEL_THRESHOLDS[level] ?? 999999;
  return { petXp: xp, petLevel: level, xpToNext: nextThreshold };
}

export async function addPetXp(playerId: string, amount: number): Promise<{ leveled: boolean; data: PetData }> {
  await sql`
    INSERT INTO player_pets (player_id, pet_xp, pet_level, updated_at)
    VALUES (${playerId}, ${amount}, 1, ${Date.now()})
    ON CONFLICT (player_id)
    DO UPDATE SET pet_xp = player_pets.pet_xp + ${amount}, updated_at = ${Date.now()}
  `;
  const rows = await sql`SELECT pet_xp, pet_level FROM player_pets WHERE player_id = ${playerId}` as any[];
  let xp = Number(rows[0].pet_xp);
  let level = Number(rows[0].pet_level);
  let leveled = false;

  while (level < 10 && xp >= (PET_LEVEL_THRESHOLDS[level] ?? 999999)) {
    level++;
    leveled = true;
  }

  if (leveled) {
    await sql`UPDATE player_pets SET pet_level = ${level} WHERE player_id = ${playerId}`;
  }

  const nextThreshold = PET_LEVEL_THRESHOLDS[level] ?? 999999;
  return { leveled, data: { petXp: xp, petLevel: level, xpToNext: nextThreshold } };
}
