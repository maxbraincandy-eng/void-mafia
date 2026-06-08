import postgres from 'postgres';

// ── Connection ──────────────────────────────────────────────────────────
// Railway PostgreSQL plugin can inject the URL under several variable names.
// DATABASE_PRIVATE_URL is the internal-network URL (preferred for Railway).
// Some Railway plugin versions inject individual PG* vars instead of a URL.
function buildDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_PRIVATE_URL)    { console.log('[Database] source = DATABASE_PRIVATE_URL');    return process.env.DATABASE_PRIVATE_URL; }
  if (process.env.DATABASE_URL)            { console.log('[Database] source = DATABASE_URL');            return process.env.DATABASE_URL; }
  if (process.env.POSTGRES_URL)            { console.log('[Database] source = POSTGRES_URL');            return process.env.POSTGRES_URL; }
  if (process.env.POSTGRES_PRIVATE_URL)    { console.log('[Database] source = POSTGRES_PRIVATE_URL');   return process.env.POSTGRES_PRIVATE_URL; }
  if (process.env.RAILWAY_DATABASE_URL)    { console.log('[Database] source = RAILWAY_DATABASE_URL');   return process.env.RAILWAY_DATABASE_URL; }

  // Build URL from individual PG* vars (Railway newer plugin format)
  const { PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD } = process.env;
  if (PGHOST && PGDATABASE && PGUSER) {
    const pass = PGPASSWORD ? `:${encodeURIComponent(PGPASSWORD)}` : '';
    const port = PGPORT ?? '5432';
    const url = `postgresql://${PGUSER}${pass}@${PGHOST}:${port}/${PGDATABASE}`;
    console.log(`[Database] source = PG* vars (PGHOST=${PGHOST} PGDATABASE=${PGDATABASE})`);
    return url;
  }

  console.error('[Database] FATAL: no database URL env var found — DB calls will fail');
  return undefined;
}

const DATABASE_URL = buildDatabaseUrl();

console.log('[Database] provider = postgresql');
console.log(`[Database] DATABASE_URL exists = ${!!DATABASE_URL}`);

const bigintParser = {
  to: 20,
  from: [20],
  serialize: (x: number) => String(x),
  parse: (x: string) => Number(x),
};

// When DATABASE_URL is missing we create a client pointing at an invalid
// host so the module loads without throwing.  initializeDatabase() will
// fail immediately and index.ts will restart the process after 8 s.
// The key thing is the healthcheck at /health stays reachable.
export const sql = postgres(DATABASE_URL ?? 'postgresql://no-db-url-set:5432/void', {
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  max: 20,
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {},
  types: { bigint: bigintParser },
});

// ── Schema ─────────────────────────────────────────────────────────────

const ACHIEVEMENTS = [
  { key: 'first_blood',   name: 'First Blood',   icon: '🩸', rarity: 'common',    description: 'Win your first game' },
  { key: 'godfather',     name: 'Godfather',      icon: '♛',  rarity: 'rare',      description: 'Win 5 games as Don' },
  { key: 'town_hero',     name: 'Town Hero',      icon: '🛡',  rarity: 'rare',      description: 'Save 3 players in one game as Doctor' },
  { key: 'detective',     name: 'Detective',      icon: '🔍', rarity: 'common',    description: 'Catch a Mafia member as Sheriff' },
  { key: 'survivor',      name: 'Survivor',       icon: '💪', rarity: 'common',    description: 'Survive 10 games' },
  { key: 'executioner',   name: 'Executioner',    icon: '⚖️', rarity: 'uncommon',  description: 'Eliminate 3 players by vote in one game' },
  { key: 'ghost',         name: 'Ghost',          icon: '👻', rarity: 'uncommon',  description: 'Win as Jester (get eliminated by vote)' },
  { key: 'serial_killer', name: 'Serial Killer',  icon: '🌀', rarity: 'rare',      description: 'Win as Maniac' },
  { key: 'veteran_wars',  name: 'War Hero',       icon: '🎖️', rarity: 'uncommon',  description: 'Kill an attacker as Veteran' },
  { key: 'cult_master',   name: 'Cult Master',    icon: '🕯️', rarity: 'epic',      description: 'Convert 3 players as Cult Leader' },
  { key: 'night_owl',     name: 'Night Owl',      icon: '🦉', rarity: 'common',    description: 'Play 10 games' },
  { key: 'legend',        name: 'Legend',         icon: '🏆', rarity: 'legendary', description: 'Win 50 games' },
  { key: 'arsonist_win',  name: 'Ignition',       icon: '🔥', rarity: 'rare',      description: 'Win as Arsonist' },
  { key: 'loyal_guard',   name: 'Loyal Guard',    icon: '🛡',  rarity: 'uncommon',  description: 'Die protecting a player as Bodyguard' },
  { key: 'comeback',      name: 'Comeback',       icon: '⚡', rarity: 'uncommon',  description: 'Win when only 2 town players remained' },
];

export async function initializeDatabase(): Promise<void> {
  console.log('[Database] initializing schema...');

  // Core tables
  await sql`
    CREATE TABLE IF NOT EXISTS players (
      id                      TEXT PRIMARY KEY,
      username                TEXT NOT NULL,
      avatar                  TEXT NOT NULL DEFAULT '',
      email                   TEXT UNIQUE,
      password_hash           TEXT,
      games_played            INTEGER NOT NULL DEFAULT 0,
      wins                    INTEGER NOT NULL DEFAULT 0,
      losses                  INTEGER NOT NULL DEFAULT 0,
      is_moderator            INTEGER NOT NULL DEFAULT 0,
      moderator_level         TEXT,
      moderator_badge_visible INTEGER NOT NULL DEFAULT 0,
      moderator_permissions   TEXT NOT NULL DEFAULT '[]',
      joined_at               BIGINT NOT NULL,
      last_seen_at            BIGINT NOT NULL,
      xp                      INTEGER NOT NULL DEFAULT 0,
      level                   INTEGER NOT NULL DEFAULT 1,
      cosmetics               TEXT NOT NULL DEFAULT '{}',
      friend_code             TEXT NOT NULL DEFAULT '',
      granted_mod_level       TEXT
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS bans (
      id            TEXT PRIMARY KEY,
      player_id     TEXT NOT NULL,
      banned_by     TEXT NOT NULL,
      banned_by_name TEXT NOT NULL,
      reason        TEXT NOT NULL DEFAULT '',
      issued_at     BIGINT NOT NULL,
      expires_at    BIGINT NOT NULL,
      active        INTEGER NOT NULL DEFAULT 1
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS mutes (
      id            TEXT PRIMARY KEY,
      player_id     TEXT NOT NULL,
      muted_by      TEXT NOT NULL,
      muted_by_name TEXT NOT NULL,
      reason        TEXT NOT NULL DEFAULT '',
      issued_at     BIGINT NOT NULL,
      expires_at    BIGINT NOT NULL,
      active        INTEGER NOT NULL DEFAULT 1
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS warnings (
      id            TEXT PRIMARY KEY,
      player_id     TEXT NOT NULL,
      warned_by     TEXT NOT NULL,
      warned_by_name TEXT NOT NULL,
      reason        TEXT NOT NULL DEFAULT '',
      issued_at     BIGINT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS reports (
      id              TEXT PRIMARY KEY,
      reporter_id     TEXT NOT NULL,
      reporter_name   TEXT NOT NULL,
      reported_id     TEXT NOT NULL,
      reported_name   TEXT NOT NULL,
      room_id         TEXT,
      reason          TEXT NOT NULL,
      details         TEXT NOT NULL DEFAULT '',
      created_at      BIGINT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'open',
      assigned_mod_id TEXT,
      mod_notes       TEXT NOT NULL DEFAULT ''
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS mod_logs (
      id               TEXT PRIMARY KEY,
      action_type      TEXT NOT NULL,
      moderator_id     TEXT NOT NULL,
      moderator_name   TEXT NOT NULL,
      target_player_id TEXT NOT NULL,
      target_name      TEXT NOT NULL,
      room_id          TEXT,
      reason           TEXT NOT NULL DEFAULT '',
      duration         INTEGER,
      created_at       BIGINT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS achievements (
      key         TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT NOT NULL,
      icon        TEXT NOT NULL,
      rarity      TEXT NOT NULL DEFAULT 'common'
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS player_achievements (
      player_id       TEXT NOT NULL,
      achievement_key TEXT NOT NULL,
      earned_at       BIGINT NOT NULL,
      PRIMARY KEY (player_id, achievement_key)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS game_history (
      id           TEXT PRIMARY KEY,
      room_code    TEXT NOT NULL,
      started_at   BIGINT NOT NULL,
      ended_at     BIGINT NOT NULL,
      winner       TEXT,
      day_reached  INTEGER NOT NULL DEFAULT 0,
      player_count INTEGER NOT NULL DEFAULT 0
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS game_players (
      game_id   TEXT NOT NULL,
      player_id TEXT NOT NULL,
      role      TEXT,
      team      TEXT,
      survived  INTEGER NOT NULL DEFAULT 0,
      won       INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (game_id, player_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS clans (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      tag         TEXT NOT NULL UNIQUE,
      owner_id    TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      wins        INTEGER NOT NULL DEFAULT 0,
      losses      INTEGER NOT NULL DEFAULT 0,
      created_at  BIGINT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS clan_members (
      clan_id   TEXT NOT NULL,
      player_id TEXT NOT NULL,
      role      TEXT NOT NULL DEFAULT 'member',
      joined_at BIGINT NOT NULL,
      PRIMARY KEY (clan_id, player_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS friendships (
      id         TEXT PRIMARY KEY,
      from_id    TEXT NOT NULL,
      to_id      TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'pending',
      created_at BIGINT NOT NULL,
      UNIQUE(from_id, to_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS daily_completions (
      player_id    TEXT NOT NULL,
      challenge_id TEXT NOT NULL,
      date_key     TEXT NOT NULL,
      completed_at BIGINT NOT NULL,
      PRIMARY KEY (player_id, challenge_id, date_key)
    )
  `;

  // Social features — conversations & direct messages
  await sql`
    CREATE TABLE IF NOT EXISTS conversations (
      id              TEXT PRIMARY KEY,
      participant1    TEXT NOT NULL,
      participant2    TEXT NOT NULL,
      last_message    TEXT,
      last_message_at BIGINT,
      unread_by1      INTEGER NOT NULL DEFAULT 0,
      unread_by2      INTEGER NOT NULL DEFAULT 0,
      created_at      BIGINT NOT NULL,
      UNIQUE(participant1, participant2)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS direct_messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender_id       TEXT NOT NULL,
      text            TEXT NOT NULL,
      created_at      BIGINT NOT NULL,
      read_at         BIGINT
    )
  `;

  // Migrations — add columns introduced after initial schema
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS avatar_url TEXT`;
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS avatar_updated_at BIGINT`;
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS public_id INTEGER`;

  // Backfill public_id for rows that don't have one yet (earliest player = #1).
  await sql`
    UPDATE players p
    SET public_id = sub.rn
    FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY joined_at ASC) AS rn
      FROM players WHERE public_id IS NULL
    ) sub
    WHERE p.id = sub.id
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_players_public_id ON players(public_id)
    WHERE public_id IS NOT NULL
  `;

  // OAuth accounts table (safe to add — will no-op if already exists)
  await sql`
    CREATE TABLE IF NOT EXISTS auth_accounts (
      id               TEXT PRIMARY KEY,
      user_id          TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      provider         TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      email            TEXT,
      display_name     TEXT,
      avatar_url       TEXT,
      created_at       BIGINT NOT NULL,
      updated_at       BIGINT NOT NULL,
      UNIQUE(provider, provider_user_id)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_auth_accounts_user_id ON auth_accounts(user_id)
  `;

  // Seed achievement definitions
  for (const a of ACHIEVEMENTS) {
    await sql`
      INSERT INTO achievements (key, name, description, icon, rarity)
      VALUES (${a.key}, ${a.name}, ${a.description}, ${a.icon}, ${a.rarity})
      ON CONFLICT (key) DO NOTHING
    `;
  }

  // Mod notes (internal mod-only notes per player)
  await sql`
    CREATE TABLE IF NOT EXISTS mod_notes (
      id          TEXT PRIMARY KEY,
      player_id   TEXT NOT NULL,
      mod_id      TEXT NOT NULL,
      mod_name    TEXT NOT NULL,
      note        TEXT NOT NULL,
      created_at  BIGINT NOT NULL
    )
  `;
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS account_frozen INTEGER NOT NULL DEFAULT 0`;

  // ── Economy system ─────────────────────────────────────────────────────
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 0`;

  await sql`
    CREATE TABLE IF NOT EXISTS coin_transactions (
      id            TEXT PRIMARY KEY,
      player_id     TEXT NOT NULL,
      type          TEXT NOT NULL,
      amount        INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      ref_id        TEXT,
      description   TEXT NOT NULL DEFAULT '',
      granted_by    TEXT,
      created_at    BIGINT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS gift_catalog (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon        TEXT NOT NULL DEFAULT '🎁',
      image_url   TEXT NOT NULL DEFAULT '',
      rarity      TEXT NOT NULL DEFAULT 'common',
      stars       INTEGER NOT NULL DEFAULT 1,
      price       INTEGER NOT NULL DEFAULT 100,
      active      INTEGER NOT NULL DEFAULT 1,
      created_by  TEXT NOT NULL DEFAULT 'system',
      created_at  BIGINT NOT NULL,
      updated_at  BIGINT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS player_gifts (
      id             TEXT PRIMARY KEY,
      recipient_id   TEXT NOT NULL,
      sender_id      TEXT NOT NULL,
      gift_id        TEXT NOT NULL,
      message        TEXT NOT NULL DEFAULT '',
      transaction_id TEXT NOT NULL,
      created_at     BIGINT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS daily_coin_claims (
      player_id     TEXT NOT NULL,
      date_key      TEXT NOT NULL,
      coins_awarded INTEGER NOT NULL,
      claimed_at    BIGINT NOT NULL,
      PRIMARY KEY (player_id, date_key)
    )
  `;

  // Seed default gift catalog items (ON CONFLICT DO NOTHING — safe to re-run)
  const _seedNow = Date.now();
  const _defaultGifts = [
    { id: 'gift_skull',      name: 'Skull',          icon: '💀', desc: 'A classic skull for your collection',     rarity: 'common',    stars: 1, price: 50   },
    { id: 'gift_rose',       name: 'Red Rose',        icon: '🌹', desc: 'A mysterious red rose',                   rarity: 'uncommon',  stars: 2, price: 100  },
    { id: 'gift_dagger',     name: 'Dagger',          icon: '🗡️', desc: 'A sharp dagger from the shadows',         rarity: 'rare',      stars: 3, price: 250  },
    { id: 'gift_crown',      name: 'Crown',           icon: '👑', desc: 'For royalty only',                        rarity: 'epic',      stars: 4, price: 500  },
    { id: 'gift_godfather',  name: 'Godfather Ring',  icon: '💍', desc: 'An offer they cannot refuse',             rarity: 'legendary', stars: 5, price: 1000 },
  ];
  for (const g of _defaultGifts) {
    await sql`
      INSERT INTO gift_catalog (id, name, description, icon, image_url, rarity, stars, price, active, created_by, created_at, updated_at)
      VALUES (${g.id}, ${g.name}, ${g.desc}, ${g.icon}, ${''},  ${g.rarity}, ${g.stars}, ${g.price}, 1, ${'system'}, ${_seedNow}, ${_seedNow})
      ON CONFLICT (id) DO NOTHING
    `;
  }

  // ── Economy schema evolution (additive) ──────────────────────────────────
  // coin_transactions — add balance_before, public_id, related_user/gift ids
  await sql`ALTER TABLE coin_transactions ADD COLUMN IF NOT EXISTS balance_before INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE coin_transactions ADD COLUMN IF NOT EXISTS public_id INTEGER`;
  await sql`ALTER TABLE coin_transactions ADD COLUMN IF NOT EXISTS related_user_id TEXT`;
  await sql`ALTER TABLE coin_transactions ADD COLUMN IF NOT EXISTS related_gift_id TEXT`;
  // player_gifts — add denormalized fields for richer records
  await sql`ALTER TABLE player_gifts ADD COLUMN IF NOT EXISTS sender_public_id INTEGER`;
  await sql`ALTER TABLE player_gifts ADD COLUMN IF NOT EXISTS sender_name TEXT`;
  await sql`ALTER TABLE player_gifts ADD COLUMN IF NOT EXISTS receiver_public_id INTEGER`;
  await sql`ALTER TABLE player_gifts ADD COLUMN IF NOT EXISTS receiver_name TEXT`;
  await sql`ALTER TABLE player_gifts ADD COLUMN IF NOT EXISTS gift_key TEXT`;
  await sql`ALTER TABLE player_gifts ADD COLUMN IF NOT EXISTS gift_image_url TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE player_gifts ADD COLUMN IF NOT EXISTS coin_cost INTEGER NOT NULL DEFAULT 0`;

  // ── Mod v2 schema evolution (additive) ─────────────────────────────────
  await sql`ALTER TABLE warnings ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'other'`;
  await sql`ALTER TABLE bans ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'global'`;
  await sql`ALTER TABLE bans ADD COLUMN IF NOT EXISTS target_public_id INTEGER`;
  await sql`ALTER TABLE bans ADD COLUMN IF NOT EXISTS issuer_public_id INTEGER`;
  await sql`ALTER TABLE mod_logs ADD COLUMN IF NOT EXISTS metadata TEXT`;

  // ── Gift System V2 (additive) ─────────────────────────────────────────
  await sql`ALTER TABLE gift_catalog ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'symbols'`;
  await sql`ALTER TABLE gift_catalog ADD COLUMN IF NOT EXISTS limited_edition INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE gift_catalog ADD COLUMN IF NOT EXISTS seasonal_tag TEXT`;
  await sql`ALTER TABLE gift_catalog ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0`;
  await sql`
    CREATE TABLE IF NOT EXISTS pinned_gifts (
      player_id TEXT NOT NULL,
      gift_id   TEXT NOT NULL,
      pinned_at BIGINT NOT NULL,
      PRIMARY KEY (player_id, gift_id)
    )
  `;
  await sql`ALTER TABLE player_gifts ADD COLUMN IF NOT EXISTS gift_rarity TEXT NOT NULL DEFAULT 'common'`;
  await sql`ALTER TABLE player_gifts ADD COLUMN IF NOT EXISTS gift_stars INTEGER NOT NULL DEFAULT 1`;
  await sql`ALTER TABLE player_gifts ADD COLUMN IF NOT EXISTS gift_category TEXT NOT NULL DEFAULT 'symbols'`;
  await sql`CREATE INDEX IF NOT EXISTS idx_player_gifts_sender ON player_gifts(sender_id, created_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_player_gifts_recipient ON player_gifts(recipient_id, created_at)`;

  // Verify connection
  const [{ cnt }] = await sql`SELECT COUNT(*) as cnt FROM players` as any[];
  console.log(`[Database] connected successfully`);
  console.log(`[Database] schema/migration check passed — ${cnt} players`);
}
