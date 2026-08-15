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

  // A report is only as good as what a moderator can still see when they open
  // it. Room chat lives in memory and dies with the room, so by review time the
  // words being reported are usually gone — evidence is the transcript captured
  // AT report time, frozen with the report.
  await sql`ALTER TABLE reports ADD COLUMN IF NOT EXISTS evidence TEXT NOT NULL DEFAULT '[]'`;
  // Set when the report was raised by the automatic filter rather than a person.
  await sql`ALTER TABLE reports ADD COLUMN IF NOT EXISTS auto_flag TEXT`;

  // Verification has two tiers with different meanings, so it cannot be one
  // boolean: 'owner' is derived from moderator_level and is not grantable,
  // while 'vip' is granted by an owner (and later, bought). Only the grantable
  // one is stored here.
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS verified_tier TEXT`;

  // ── appeals ────────────────────────────────────────────────────────
  // Without a route back, a wrongly banned player simply disappears and the
  // mistake is never discovered. An appeal is also the only signal that tells
  // you which moderators are getting it wrong.
  await sql`
    CREATE TABLE IF NOT EXISTS appeals (
      id           TEXT PRIMARY KEY,
      player_id    TEXT NOT NULL,
      player_name  TEXT NOT NULL,
      kind         TEXT NOT NULL,          -- 'ban' | 'mute'
      body         TEXT NOT NULL DEFAULT '',
      created_at   BIGINT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'open',   -- open | granted | denied
      decided_by   TEXT,
      decided_name TEXT,
      decided_at   BIGINT,
      decision     TEXT NOT NULL DEFAULT ''
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_appeals_status ON appeals(status, created_at DESC)`;
  // One open appeal per player: re-appealing in a loop is not new information.
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_appeals_one_open ON appeals(player_id) WHERE status = 'open'`;

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

  await sql`
    CREATE TABLE IF NOT EXISTS spectator_predictions (
      id           TEXT PRIMARY KEY,
      room_id      TEXT NOT NULL,
      player_id    TEXT NOT NULL,
      predicted    TEXT NOT NULL,
      created_at   BIGINT NOT NULL,
      correct      INTEGER,
      xp_earned    INTEGER NOT NULL DEFAULT 0,
      UNIQUE(room_id, player_id)
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
  await sql`ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'text'`;
  await sql`ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS audio_duration REAL`;
  await sql`ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS reply_to_id TEXT`;
  await sql`ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS view_once BOOLEAN DEFAULT FALSE`;
  await sql`ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS viewed_at BIGINT`;
  await sql`
    CREATE TABLE IF NOT EXISTS space_furniture (
      space_id   TEXT PRIMARY KEY,
      items      TEXT NOT NULL DEFAULT '[]',
      updated_at BIGINT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS dm_reactions (
      message_id TEXT NOT NULL,
      reactor_id TEXT NOT NULL,
      emoji      TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (message_id, reactor_id)
    )
  `;

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

  // Ganab Simulator — global "coronation" hall of fame (who reached kanonieri).
  await sql`
    CREATE TABLE IF NOT EXISTS ganab_crowned (
      id         TEXT PRIMARY KEY,
      player_id  TEXT NOT NULL,
      nickname   TEXT NOT NULL,
      created_at BIGINT NOT NULL
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_ganab_crowned_created ON ganab_crowned(created_at DESC)
  `;
  // Founding crowned — the first kanonieri, seeded so they always appear.
  // Low created_at keeps them at the end of the (newest-first) roster.
  await sql`
    INSERT INTO ganab_crowned (id, player_id, nickname, created_at)
    VALUES ('crown_seed_kaqtusa', 'seed', 'კაქტუსა', 2000)
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    INSERT INTO ganab_crowned (id, player_id, nickname, created_at)
    VALUES ('crown_seed_salius', 'seed', 'სალიუს მალადოი', 1000)
    ON CONFLICT (id) DO NOTHING
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

  // Virtual Space combat: lifetime knockouts dealt (KO leaderboard).
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS space_knockouts INTEGER NOT NULL DEFAULT 0`;

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

  // In-app purchases (Google Play / Apple / RevenueCat). The UNIQUE constraint
  // on (platform, transaction_id) makes crediting idempotent: a replayed
  // purchase token or a re-delivered store/RevenueCat webhook credits coins
  // exactly once.
  await sql`
    CREATE TABLE IF NOT EXISTS store_purchases (
      id             TEXT PRIMARY KEY,
      player_id      TEXT NOT NULL,
      platform       TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      product_id     TEXT NOT NULL,
      coins          INTEGER NOT NULL,
      raw            TEXT,
      created_at     BIGINT NOT NULL,
      UNIQUE (platform, transaction_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id    TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      endpoint   TEXT NOT NULL UNIQUE,
      p256dh     TEXT NOT NULL,
      auth       TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
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
  await sql`ALTER TABLE gift_catalog ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT ''`;
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
  await sql`
    CREATE TABLE IF NOT EXISTS hidden_gifts (
      recipient_id TEXT NOT NULL,
      gift_id      TEXT NOT NULL,
      hidden_at    BIGINT NOT NULL,
      PRIMARY KEY (recipient_id, gift_id)
    )
  `;
  await sql`ALTER TABLE player_gifts ADD COLUMN IF NOT EXISTS gift_rarity TEXT NOT NULL DEFAULT 'common'`;
  await sql`ALTER TABLE player_gifts ADD COLUMN IF NOT EXISTS gift_stars INTEGER NOT NULL DEFAULT 1`;
  await sql`ALTER TABLE player_gifts ADD COLUMN IF NOT EXISTS gift_category TEXT NOT NULL DEFAULT 'symbols'`;
  await sql`CREATE INDEX IF NOT EXISTS idx_player_gifts_sender ON player_gifts(sender_id, created_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_player_gifts_recipient ON player_gifts(recipient_id, created_at)`;

  await sql`ALTER TABLE clans ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT ''`;

  // ── Clan Roles V2 (additive) ──────────────────────────────────────────
  await sql`ALTER TABLE clan_members ADD COLUMN IF NOT EXISTS role_assigned_at BIGINT`;
  await sql`ALTER TABLE clan_members ADD COLUMN IF NOT EXISTS role_assigned_by TEXT`;
  // Migrate existing 'officer' roles to 'admin'
  await sql`UPDATE clan_members SET role = 'admin' WHERE role = 'officer'`;
  await sql`
    CREATE TABLE IF NOT EXISTS clan_mod_logs (
      id           TEXT PRIMARY KEY,
      clan_id      TEXT NOT NULL,
      mod_id       TEXT NOT NULL,
      mod_name     TEXT NOT NULL,
      target_id    TEXT NOT NULL,
      target_name  TEXT NOT NULL,
      action       TEXT NOT NULL,
      reason       TEXT NOT NULL DEFAULT '',
      room_id      TEXT,
      created_at   BIGINT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_clan_mod_logs_clan ON clan_mod_logs(clan_id, created_at)`;

  // ── Referral system ───────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS referrals (
      id TEXT PRIMARY KEY,
      referrer_id TEXT NOT NULL REFERENCES players(id),
      referred_id TEXT NOT NULL,
      coins_granted BOOLEAN NOT NULL DEFAULT TRUE,
      created_at BIGINT NOT NULL,
      UNIQUE(referred_id)
    )
  `;

  // ── Ranked ELO system ─────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS player_ratings (
      player_id        TEXT PRIMARY KEY REFERENCES players(id),
      elo              INTEGER NOT NULL DEFAULT 1000,
      peak_elo         INTEGER NOT NULL DEFAULT 1000,
      ranked_wins      INTEGER NOT NULL DEFAULT 0,
      ranked_losses    INTEGER NOT NULL DEFAULT 0,
      placement_games  INTEGER NOT NULL DEFAULT 0,
      is_placed        BOOLEAN NOT NULL DEFAULT FALSE,
      season           INTEGER NOT NULL DEFAULT 1,
      updated_at       BIGINT NOT NULL DEFAULT 0
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ranked_game_results (
      id          TEXT PRIMARY KEY,
      player_id   TEXT NOT NULL REFERENCES players(id),
      room_id     TEXT NOT NULL,
      elo_before  INTEGER NOT NULL,
      elo_after   INTEGER NOT NULL,
      elo_change  INTEGER NOT NULL,
      won         BOOLEAN NOT NULL,
      team        TEXT NOT NULL,
      role        TEXT NOT NULL,
      season      INTEGER NOT NULL DEFAULT 1,
      created_at  BIGINT NOT NULL
    )
  `;

  // ── Clan Wars ─────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS clan_wars (
      id                 TEXT PRIMARY KEY,
      challenger_clan_id TEXT NOT NULL REFERENCES clans(id),
      defender_clan_id   TEXT NOT NULL REFERENCES clans(id),
      status             TEXT NOT NULL DEFAULT 'pending',
      challenger_wins    INT  NOT NULL DEFAULT 0,
      defender_wins      INT  NOT NULL DEFAULT 0,
      started_at         BIGINT,
      ends_at            BIGINT,
      created_at         BIGINT NOT NULL,
      winner_clan_id     TEXT REFERENCES clans(id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS clan_war_games (
      id              TEXT PRIMARY KEY,
      war_id          TEXT NOT NULL REFERENCES clan_wars(id),
      game_id         TEXT NOT NULL,
      winning_clan_id TEXT REFERENCES clans(id),
      played_at       BIGINT NOT NULL
    )
  `;

  // ── M.A.R.S. (Mankind's Automated Reality System) ─────────────────────
  // One subject per player. `code` is assigned on first upload and never
  // changes — it is the player's identity inside the fiction.
  await sql`
    CREATE TABLE IF NOT EXISTS mars_subjects (
      id          TEXT PRIMARY KEY,
      player_id   TEXT NOT NULL UNIQUE,
      code        TEXT NOT NULL UNIQUE,
      designation TEXT NOT NULL,
      manifest    TEXT NOT NULL,
      traits      TEXT NOT NULL DEFAULT '{}',
      integrity   INT  NOT NULL DEFAULT 50,
      sector      TEXT NOT NULL DEFAULT 'AXIOM',
      uploads     INT  NOT NULL DEFAULT 1,
      created_at  BIGINT NOT NULL,
      updated_at  BIGINT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_mars_created ON mars_subjects(created_at DESC)`;
  // Portrait is public (it appears in the archive grid); documents are private
  // to the subject. Both are base64 data URLs, size-capped in marsService.
  await sql`ALTER TABLE mars_subjects ADD COLUMN IF NOT EXISTS portrait TEXT`;
  await sql`ALTER TABLE mars_subjects ADD COLUMN IF NOT EXISTS docs TEXT NOT NULL DEFAULT '[]'`;

  // ── Clan League (weekly, all-clans competition) ───────────────────────
  // Contributions are stored per player per week; the clan table is always
  // derived from them by SUM, so a player changing clan mid-week needs no
  // backfill — their row simply points at the new clan.
  await sql`
    CREATE TABLE IF NOT EXISTS clan_league_contrib (
      week_start BIGINT NOT NULL,
      player_id  TEXT   NOT NULL,
      clan_id    TEXT   NOT NULL REFERENCES clans(id),
      points     INT    NOT NULL DEFAULT 0,
      games      INT    NOT NULL DEFAULT 0,
      wins       INT    NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (week_start, player_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_clan_league_week_clan ON clan_league_contrib(week_start, clan_id)`;

  // One row per settled week. The PK is what makes settlement idempotent:
  // whoever inserts it first owns the payout.
  await sql`
    CREATE TABLE IF NOT EXISTS clan_league_seasons (
      week_start BIGINT PRIMARY KEY,
      settled_at BIGINT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS clan_league_awards (
      id               TEXT PRIMARY KEY,
      week_start       BIGINT NOT NULL,
      clan_id          TEXT NOT NULL REFERENCES clans(id),
      rank             INT NOT NULL,
      points           INT NOT NULL,
      coins_per_member INT NOT NULL,
      created_at       BIGINT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_clan_league_awards_clan ON clan_league_awards(clan_id)`;

  await sql`CREATE INDEX IF NOT EXISTS idx_clan_wars_challenger ON clan_wars(challenger_clan_id, status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_clan_wars_defender ON clan_wars(defender_clan_id, status)`;

  // ── Game Replays ──────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS game_replays (
      id           TEXT PRIMARY KEY,
      room_name    TEXT NOT NULL,
      player_count INT NOT NULL DEFAULT 0,
      duration_ms  BIGINT NOT NULL DEFAULT 0,
      started_at   BIGINT NOT NULL,
      ended_at     BIGINT NOT NULL,
      winner       TEXT NOT NULL,
      events       JSONB NOT NULL DEFAULT '[]',
      player_roles JSONB NOT NULL DEFAULT '{}',
      created_at   BIGINT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_game_replays_created ON game_replays(created_at DESC)`;

  // ── Spectator Theater ─────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS spectator_suspicion_votes (
      id                  TEXT PRIMARY KEY,
      game_id             TEXT NOT NULL,
      voter_id            TEXT NOT NULL,
      suspected_player_id TEXT NOT NULL,
      created_at          BIGINT NOT NULL,
      UNIQUE(game_id, voter_id)
    )
  `;

  // ── Season System ─────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS seasons (
      id         TEXT PRIMARY KEY,
      number     INT NOT NULL UNIQUE,
      name       TEXT NOT NULL,
      start_at   BIGINT NOT NULL,
      end_at     BIGINT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'active',
      created_at BIGINT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS season_results (
      id           TEXT PRIMARY KEY,
      season_id    TEXT NOT NULL REFERENCES seasons(id),
      player_id    TEXT NOT NULL REFERENCES players(id),
      final_rank   INT NOT NULL,
      final_elo    INT NOT NULL,
      final_tier   TEXT NOT NULL,
      reward_title TEXT,
      reward_coins INT NOT NULL DEFAULT 0,
      created_at   BIGINT NOT NULL,
      UNIQUE(season_id, player_id)
    )
  `;

  // Seed Season 1 if no seasons exist
  const _now = Date.now();
  await sql`
    INSERT INTO seasons (id, number, name, start_at, end_at, status, created_at)
    VALUES (
      'season_1',
      1,
      'Season 1: Shadow Protocol',
      ${_now},
      ${_now + 90 * 24 * 60 * 60 * 1000},
      'active',
      ${_now}
    )
    ON CONFLICT (number) DO NOTHING
  `;

  // ── Community Hub (additive, fully separate from Mafia game tables) ────
  await sql`
    CREATE TABLE IF NOT EXISTS community_lounges (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      owner_id    TEXT,
      kind        TEXT NOT NULL DEFAULT 'lounge',
      is_live     BOOLEAN NOT NULL DEFAULT false,
      last_topic  TEXT NOT NULL DEFAULT '',
      created_at  BIGINT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS community_lounge_members (
      lounge_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      role      TEXT NOT NULL DEFAULT 'listener',
      joined_at BIGINT NOT NULL,
      PRIMARY KEY (lounge_id, player_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS void_news (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL,
      content    TEXT NOT NULL,
      pinned     BOOLEAN NOT NULL DEFAULT false,
      author_id  TEXT,
      created_at BIGINT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS max_recommends (
      id         TEXT PRIMARY KEY,
      category   TEXT NOT NULL,
      title      TEXT NOT NULL,
      review     TEXT NOT NULL DEFAULT '',
      image_url  TEXT,
      created_at BIGINT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS daily_thoughts (
      id         TEXT PRIMARY KEY,
      content    TEXT NOT NULL,
      pinned     BOOLEAN NOT NULL DEFAULT false,
      created_at BIGINT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS community_posts (
      id             TEXT PRIMARY KEY,
      author_id      TEXT NOT NULL,
      content        TEXT NOT NULL,
      image_url      TEXT,
      likes_count    INT NOT NULL DEFAULT 0,
      comments_count INT NOT NULL DEFAULT 0,
      created_at     BIGINT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_community_posts_created ON community_posts(created_at DESC)`;

  // Ephemeral 24h stories
  await sql`
    CREATE TABLE IF NOT EXISTS community_stories (
      id          TEXT PRIMARY KEY,
      author_id   TEXT NOT NULL,
      image_url   TEXT NOT NULL,
      caption     TEXT NOT NULL DEFAULT '',
      created_at  BIGINT NOT NULL,
      expires_at  BIGINT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_community_stories_expires ON community_stories(expires_at)`;
  await sql`ALTER TABLE community_stories ADD COLUMN IF NOT EXISTS tags TEXT NOT NULL DEFAULT '[]'`;
  await sql`ALTER TABLE community_stories ADD COLUMN IF NOT EXISTS music_video_id TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE community_stories ADD COLUMN IF NOT EXISTS music_title TEXT NOT NULL DEFAULT ''`;

  // Story views (who saw a story) — author can see the viewer list.
  await sql`
    CREATE TABLE IF NOT EXISTS community_story_views (
      story_id  TEXT NOT NULL,
      viewer_id TEXT NOT NULL,
      viewed_at BIGINT NOT NULL,
      PRIMARY KEY (story_id, viewer_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_story_views_story ON community_story_views(story_id)`;

  // Story reactions — one reaction per user per story (composite PK prevents spam).
  await sql`
    CREATE TABLE IF NOT EXISTS community_story_reactions (
      story_id    TEXT NOT NULL,
      reactor_id  TEXT NOT NULL,
      reaction    TEXT NOT NULL,
      created_at  BIGINT NOT NULL,
      PRIMARY KEY (story_id, reactor_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_story_reactions_story ON community_story_reactions(story_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS community_post_likes (
      post_id    TEXT NOT NULL,
      player_id  TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (post_id, player_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS community_post_comments (
      id         TEXT PRIMARY KEY,
      post_id    TEXT NOT NULL,
      author_id  TEXT NOT NULL,
      content    TEXT NOT NULL,
      created_at BIGINT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS community_reports (
      id           TEXT PRIMARY KEY,
      post_id      TEXT,
      reporter_id  TEXT NOT NULL,
      reason       TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'pending',
      created_at   BIGINT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS community_bans (
      id          TEXT PRIMARY KEY,
      player_id   TEXT NOT NULL,
      banned_by   TEXT NOT NULL,
      reason      TEXT NOT NULL DEFAULT '',
      issued_at   BIGINT NOT NULL,
      expires_at  BIGINT NOT NULL,
      active      INTEGER NOT NULL DEFAULT 1
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS follows (
      follower_id  TEXT NOT NULL,
      following_id TEXT NOT NULL,
      created_at   BIGINT NOT NULL,
      PRIMARY KEY (follower_id, following_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS community_events (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category    TEXT NOT NULL DEFAULT 'discussion',
      event_at    BIGINT NOT NULL,
      created_by  TEXT NOT NULL,
      created_at  BIGINT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS community_event_participants (
      event_id  TEXT NOT NULL,
      player_id TEXT NOT NULL,
      joined_at BIGINT NOT NULL,
      PRIMARY KEY (event_id, player_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS community_notifications (
      id         TEXT PRIMARY KEY,
      player_id  TEXT NOT NULL,
      type       TEXT NOT NULL,
      title      TEXT NOT NULL,
      body       TEXT NOT NULL DEFAULT '',
      link       TEXT,
      read       BOOLEAN NOT NULL DEFAULT false,
      created_at BIGINT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_community_notifications_player ON community_notifications(player_id, read, created_at DESC)`;

  await sql`ALTER TABLE community_notifications ADD COLUMN IF NOT EXISTS actor_id TEXT`;
  await sql`ALTER TABLE community_notifications ADD COLUMN IF NOT EXISTS actor_avatar_url TEXT`;
  await sql`ALTER TABLE community_notifications ADD COLUMN IF NOT EXISTS post_id TEXT`;

  // ── Community Social V2 schema (additive) ────────────────────────────
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS community_bio TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS community_cover_url TEXT`;
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS community_favorite_role TEXT`;
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS community_reputation INTEGER NOT NULL DEFAULT 0`;

  await sql`
    CREATE TABLE IF NOT EXISTS community_badges (
      player_id  TEXT NOT NULL,
      badge      TEXT NOT NULL,
      granted_by TEXT NOT NULL,
      granted_at BIGINT NOT NULL,
      PRIMARY KEY (player_id, badge)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS community_achievement_showcase (
      player_id       TEXT NOT NULL,
      achievement_key TEXT NOT NULL,
      slot            INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 3),
      updated_at      BIGINT NOT NULL,
      PRIMARY KEY (player_id, slot)
    )
  `;

  await sql`ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS post_type TEXT NOT NULL DEFAULT 'text'`;
  await sql`ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS edited_at BIGINT`;
  await sql`ALTER TABLE community_post_comments ADD COLUMN IF NOT EXISTS parent_id TEXT`;
  await sql`ALTER TABLE community_post_comments ADD COLUMN IF NOT EXISTS gif_url TEXT`;
  await sql`ALTER TABLE community_post_comments ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0`;
  await sql`
    CREATE TABLE IF NOT EXISTS community_comment_likes (
      comment_id TEXT NOT NULL,
      player_id  TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (comment_id, player_id)
    )
  `;
  await sql`ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS gif_url TEXT`;
  await sql`ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS video_url TEXT`;
  await sql`ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false`;
  await sql`ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false`;
  // Post Boost perk: epoch ms until which this post floats to the top of the feed.
  await sql`ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS boosted_until BIGINT`;
  await sql`ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS rec_title TEXT`;
  await sql`ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS rec_category TEXT`;
  await sql`ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS hashtags TEXT NOT NULL DEFAULT '[]'`;
  await sql`ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'`;
  await sql`ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS saves_count INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false`;

  await sql`
    CREATE TABLE IF NOT EXISTS community_polls (
      post_id   TEXT PRIMARY KEY,
      question  TEXT NOT NULL,
      options   TEXT NOT NULL,
      ends_at   BIGINT
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS community_poll_votes (
      post_id   TEXT NOT NULL,
      player_id TEXT NOT NULL,
      option_id TEXT NOT NULL,
      voted_at  BIGINT NOT NULL,
      PRIMARY KEY (post_id, player_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS community_post_saves (
      post_id   TEXT NOT NULL,
      player_id TEXT NOT NULL,
      saved_at  BIGINT NOT NULL,
      PRIMARY KEY (post_id, player_id)
    )
  `;

  await sql`CREATE TABLE IF NOT EXISTS community_post_reactions (
    post_id    TEXT NOT NULL,
    player_id  TEXT NOT NULL,
    emoji      TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (post_id, player_id)
  )`;

  await sql`CREATE TABLE IF NOT EXISTS community_comment_reactions (
    comment_id TEXT NOT NULL,
    player_id  TEXT NOT NULL,
    emoji      TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (comment_id, player_id)
  )`;

  await sql`ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS audio_url TEXT`;

  await sql`CREATE TABLE IF NOT EXISTS community_leaderboard_rewards (
    id         TEXT PRIMARY KEY,
    player_id  TEXT NOT NULL,
    week_start BIGINT NOT NULL,
    rank       INT NOT NULL,
    coins      INT NOT NULL,
    created_at BIGINT NOT NULL
  )`;

  await sql`
    CREATE TABLE IF NOT EXISTS community_post_hashtags (
      post_id TEXT NOT NULL,
      hashtag TEXT NOT NULL,
      PRIMARY KEY (post_id, hashtag)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_community_post_hashtags_tag ON community_post_hashtags(hashtag, post_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS community_trending_posts (
      post_id    TEXT PRIMARY KEY,
      score      REAL NOT NULL,
      updated_at BIGINT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS community_trending_hashtags (
      hashtag    TEXT PRIMARY KEY,
      count      INTEGER NOT NULL,
      updated_at BIGINT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS community_privacy_settings (
      player_id             TEXT PRIMARY KEY,
      hide_followers_list   BOOLEAN NOT NULL DEFAULT false,
      allow_friend_requests BOOLEAN NOT NULL DEFAULT true,
      default_post_visibility TEXT NOT NULL DEFAULT 'public'
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS community_mod_logs (
      id         TEXT PRIMARY KEY,
      action     TEXT NOT NULL,
      mod_id     TEXT NOT NULL,
      target_id  TEXT,
      post_id    TEXT,
      note       TEXT NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_community_mod_logs_created ON community_mod_logs(created_at DESC)`;

  await sql`CREATE INDEX IF NOT EXISTS idx_friendships_from_status ON friendships(from_id, status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_friendships_to_status ON friendships(to_id, status)`;

  await sql`
    CREATE TABLE IF NOT EXISTS community_online_log (
      player_id TEXT PRIMARY KEY,
      last_seen BIGINT NOT NULL
    )
  `;

  // Seed permanent community spaces — "Conversations with Mr. Max" and "Void Radio".
  // These rows are never deleted; kind discriminates them from player-created lounges.
  await sql`
    INSERT INTO community_lounges (id, name, description, owner_id, kind, is_live, last_topic, created_at)
    VALUES ('mr-max-lounge', 'Conversations with Mr. Max', 'Live community voice space hosted by Mr. Max.', NULL, 'max_lounge', false, '', ${Date.now()})
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    INSERT INTO community_lounges (id, name, description, owner_id, kind, is_live, last_topic, created_at)
    VALUES ('void-radio', 'Void Radio', 'A permanent, always-online room for community discussion.', NULL, 'void_radio', true, '', ${Date.now()})
    ON CONFLICT (id) DO NOTHING
  `;

  // ── Hermes AI (additive) ──────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS hermes_conversations (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      title      TEXT NOT NULL DEFAULT '',
      mode       TEXT NOT NULL DEFAULT 'general',
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS hermes_messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES hermes_conversations(id) ON DELETE CASCADE,
      role            TEXT NOT NULL,
      content         TEXT NOT NULL,
      created_at      BIGINT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_hermes_conv_user ON hermes_conversations(user_id, updated_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_hermes_msg_conv ON hermes_messages(conversation_id, created_at)`;

  // ── Community Debates (additive) ──────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS community_debates (
      id          TEXT PRIMARY KEY,
      topic       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_by  TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      status      TEXT NOT NULL DEFAULT 'open',
      winner_side TEXT,
      created_at  BIGINT NOT NULL,
      ends_at     BIGINT
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS community_debate_participants (
      id         TEXT PRIMARY KEY,
      debate_id  TEXT NOT NULL REFERENCES community_debates(id) ON DELETE CASCADE,
      player_id  TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      side       TEXT NOT NULL,
      joined_at  BIGINT NOT NULL,
      UNIQUE(debate_id, player_id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS community_debate_arguments (
      id         TEXT PRIMARY KEY,
      debate_id  TEXT NOT NULL REFERENCES community_debates(id) ON DELETE CASCADE,
      player_id  TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      side       TEXT NOT NULL,
      content    TEXT NOT NULL,
      created_at BIGINT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS community_debate_votes (
      id         TEXT PRIMARY KEY,
      debate_id  TEXT NOT NULL REFERENCES community_debates(id) ON DELETE CASCADE,
      player_id  TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      side       TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      UNIQUE(debate_id, player_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_debates_status ON community_debates(status, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_debate_args ON community_debate_arguments(debate_id, created_at ASC)`;

  // ── Debate Rooms 2.0 (additive) ─────────────────────────────────────
  await sql`ALTER TABLE community_debates ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'waiting'`;
  await sql`ALTER TABLE community_debates ADD COLUMN IF NOT EXISTS phase_started_at BIGINT`;
  await sql`ALTER TABLE community_debates ADD COLUMN IF NOT EXISTS phase_duration INT DEFAULT 0`;

  await sql`
    CREATE TABLE IF NOT EXISTS community_debate_raised_hands (
      id TEXT PRIMARY KEY,
      debate_id TEXT NOT NULL REFERENCES community_debates(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      side TEXT NOT NULL,
      raised_at BIGINT NOT NULL,
      UNIQUE(debate_id, player_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_debate_raised_hands ON community_debate_raised_hands(debate_id, raised_at)`;

  // ── Activity Feed (additive) ──────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS activity_events (
      id          TEXT PRIMARY KEY,
      actor_id    TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      event_type  TEXT NOT NULL,
      target_id   TEXT,
      payload     TEXT NOT NULL DEFAULT '{}',
      created_at  BIGINT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity_events(actor_id, created_at DESC)`;

  // ── Secret Profiles / Privacy additive columns ────────────────────────
  await sql`ALTER TABLE community_privacy_settings ADD COLUMN IF NOT EXISTS profile_mode TEXT NOT NULL DEFAULT 'public'`;

  // ── Community Admin & Owner Panel (additive) ──────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS community_warnings (
      id         TEXT PRIMARY KEY,
      player_id  TEXT NOT NULL,
      issued_by  TEXT NOT NULL,
      reason     TEXT NOT NULL DEFAULT '',
      issued_at  BIGINT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS community_suspensions (
      id           TEXT PRIMARY KEY,
      player_id    TEXT NOT NULL,
      suspended_by TEXT NOT NULL,
      reason       TEXT NOT NULL DEFAULT '',
      issued_at    BIGINT NOT NULL,
      expires_at   BIGINT NOT NULL,
      active       INTEGER NOT NULL DEFAULT 1
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS community_mutes (
      id         TEXT PRIMARY KEY,
      player_id  TEXT NOT NULL,
      muted_by   TEXT NOT NULL,
      reason     TEXT NOT NULL DEFAULT '',
      issued_at  BIGINT NOT NULL,
      expires_at BIGINT NOT NULL,
      active     INTEGER NOT NULL DEFAULT 1
    )
  `;

  // Soft-delete columns for posts / comments / debates
  await sql`ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS deleted_at BIGINT`;
  await sql`ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS deleted_by TEXT`;
  await sql`ALTER TABLE community_post_comments ADD COLUMN IF NOT EXISTS deleted_at BIGINT`;
  await sql`ALTER TABLE community_post_comments ADD COLUMN IF NOT EXISTS deleted_by TEXT`;
  await sql`ALTER TABLE community_debates ADD COLUMN IF NOT EXISTS deleted_at BIGINT`;
  await sql`ALTER TABLE community_debates ADD COLUMN IF NOT EXISTS deleted_by TEXT`;
  await sql`ALTER TABLE community_debates ADD COLUMN IF NOT EXISTS locked INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE community_debates ADD COLUMN IF NOT EXISTS pinned INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE community_debates ADD COLUMN IF NOT EXISTS featured INTEGER NOT NULL DEFAULT 0`;

  // Extended report columns
  await sql`ALTER TABLE community_reports ADD COLUMN IF NOT EXISTS target_type TEXT NOT NULL DEFAULT 'post'`;
  await sql`ALTER TABLE community_reports ADD COLUMN IF NOT EXISTS comment_id TEXT`;
  await sql`ALTER TABLE community_reports ADD COLUMN IF NOT EXISTS debate_id TEXT`;
  await sql`ALTER TABLE community_reports ADD COLUMN IF NOT EXISTS target_player_id TEXT`;

  // Email auth columns (added after initial schema — needed for email/password registration)
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS email TEXT`;
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS password_hash TEXT`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_players_email ON players(email) WHERE email IS NOT NULL`;

  // Profile control columns
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS profile_locked INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS secret_mode_disabled INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS force_public INTEGER NOT NULL DEFAULT 0`;

  // Anonymous post flag
  await sql`ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT false`;

  // Pet level-up system
  await sql`
    CREATE TABLE IF NOT EXISTS player_pets (
      player_id TEXT PRIMARY KEY,
      pet_xp    INTEGER NOT NULL DEFAULT 0,
      pet_level INTEGER NOT NULL DEFAULT 1,
      updated_at BIGINT NOT NULL DEFAULT 0
    )
  `;

  // PvP Tournaments
  await sql`
    CREATE TABLE IF NOT EXISTS tournaments (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'open',
      max_players INTEGER NOT NULL DEFAULT 8,
      prize_coins INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      started_at BIGINT,
      ended_at   BIGINT,
      winner_id  TEXT
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS tournament_participants (
      tournament_id TEXT NOT NULL,
      player_id     TEXT NOT NULL,
      seed          INTEGER NOT NULL DEFAULT 0,
      eliminated    BOOLEAN NOT NULL DEFAULT false,
      joined_at     BIGINT NOT NULL,
      PRIMARY KEY (tournament_id, player_id)
    )
  `;

  // VOID IQ — cognitive test attempts + public leaderboard
  await sql`
    CREATE TABLE IF NOT EXISTS iq_attempts (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL,
      iq            INTEGER NOT NULL,
      percentile    INTEGER NOT NULL,
      band          TEXT NOT NULL DEFAULT '',
      raw_score     REAL NOT NULL DEFAULT 0,
      max_score     REAL NOT NULL DEFAULT 0,
      correct       INTEGER NOT NULL DEFAULT 0,
      total         INTEGER NOT NULL DEFAULT 0,
      domain_scores TEXT NOT NULL DEFAULT '{}',
      duration_ms   BIGINT NOT NULL DEFAULT 0,
      verified      BOOLEAN NOT NULL DEFAULT true,
      flags         TEXT NOT NULL DEFAULT '[]',
      is_highest    BOOLEAN NOT NULL DEFAULT false,
      created_at    BIGINT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_iq_user ON iq_attempts(user_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_iq_board ON iq_attempts(verified, is_highest, iq DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_iq_window ON iq_attempts(verified, created_at, iq DESC)`;
  // Completion gating: only tests where most questions were answered count on the
  // leaderboard. `answered` is null for legacy rows (grandfathered as complete);
  // new attempts store the real count so quits are excluded going forward.
  await sql`ALTER TABLE iq_attempts ADD COLUMN IF NOT EXISTS answered INTEGER`;
  // One-time repair: an earlier build set answered=0 for every legacy iq<=60 row,
  // which wrongly hid legitimate low-scoring finishers (not just quitters).
  // Restore them (answered=0 → NULL = grandfathered complete). Runs once.
  {
    const [done] = await sql`SELECT value FROM app_settings WHERE key = 'iq_answered_revert'` as any[];
    if (!done) {
      await sql`UPDATE iq_attempts SET answered = NULL WHERE answered = 0`;
      await sql`INSERT INTO app_settings (key, value) VALUES ('iq_answered_revert', 'done') ON CONFLICT (key) DO NOTHING`;
    }
  }

  // ბატონი მაქსის თავსატეხი — psychological profile results + trait leaderboard
  await sql`
    CREATE TABLE IF NOT EXISTS max_puzzle_results (
      user_id       TEXT PRIMARY KEY,
      archetype     TEXT NOT NULL,
      archetype_ka  TEXT NOT NULL DEFAULT '',
      independence  INTEGER NOT NULL DEFAULT 0,
      rationality   INTEGER NOT NULL DEFAULT 0,
      conformity    INTEGER NOT NULL DEFAULT 0,
      ambition      INTEGER NOT NULL DEFAULT 0,
      risk          INTEGER NOT NULL DEFAULT 0,
      status_desire INTEGER NOT NULL DEFAULT 0,
      skepticism    INTEGER NOT NULL DEFAULT 0,
      moral_flex    INTEGER NOT NULL DEFAULT 0,
      completions   INTEGER NOT NULL DEFAULT 1,
      created_at    BIGINT NOT NULL,
      updated_at    BIGINT NOT NULL
    )
  `;

  // ── ფორმალური ლოგიკის აკადემია ────────────────────────────────────
  // One row per player: the Logic Rating plus every lifetime counter the
  // profile screen shows, so a stats read is a single primary-key lookup.
  await sql`
    CREATE TABLE IF NOT EXISTS logic_profiles (
      user_id           TEXT PRIMARY KEY,
      rating            INTEGER NOT NULL DEFAULT 1200,
      peak_rating       INTEGER NOT NULL DEFAULT 1200,
      answered          INTEGER NOT NULL DEFAULT 0,
      correct           INTEGER NOT NULL DEFAULT 0,
      total_ms          BIGINT  NOT NULL DEFAULT 0,
      tests             INTEGER NOT NULL DEFAULT 0,
      streak            INTEGER NOT NULL DEFAULT 0,
      best_streak       INTEGER NOT NULL DEFAULT 0,
      daily_streak      INTEGER NOT NULL DEFAULT 0,
      best_daily_streak INTEGER NOT NULL DEFAULT 0,
      last_daily        TEXT,
      hardest           TEXT NOT NULL DEFAULT '',
      xp                INTEGER NOT NULL DEFAULT 0,
      created_at        BIGINT  NOT NULL,
      updated_at        BIGINT  NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_logic_rating ON logic_profiles(rating DESC)`;

  // Which questions a player has already seen, so the picker can avoid
  // repeating them until the bank is exhausted.
  await sql`
    CREATE TABLE IF NOT EXISTS logic_seen (
      user_id     TEXT NOT NULL,
      question_id TEXT NOT NULL,
      seen_at     BIGINT NOT NULL,
      PRIMARY KEY (user_id, question_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_logic_seen_user ON logic_seen(user_id, seen_at DESC)`;

  // One row per finished session — the weekly/monthly boards sum over this.
  await sql`
    CREATE TABLE IF NOT EXISTS logic_results (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL,
      mode         TEXT NOT NULL,
      level        TEXT NOT NULL DEFAULT '',
      score        INTEGER NOT NULL DEFAULT 0,
      correct      INTEGER NOT NULL DEFAULT 0,
      total        INTEGER NOT NULL DEFAULT 0,
      rating_delta INTEGER NOT NULL DEFAULT 0,
      duration_ms  BIGINT  NOT NULL DEFAULT 0,
      created_at   BIGINT  NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_logic_results_user ON logic_results(user_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_logic_results_window ON logic_results(created_at DESC)`;

  await sql`
    CREATE TABLE IF NOT EXISTS logic_achievements (
      user_id   TEXT NOT NULL,
      code      TEXT NOT NULL,
      earned_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, code)
    )
  `;

  // The exam is a separate, gated event: one sitting a week, scored out of 100,
  // on its own leaderboard. `is_best` marks the row the board ranks, so a worse
  // retake never costs a player their standing.
  await sql`
    CREATE TABLE IF NOT EXISTS logic_exam_attempts (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL,
      score        INTEGER NOT NULL DEFAULT 0,
      correct      INTEGER NOT NULL DEFAULT 0,
      total        INTEGER NOT NULL DEFAULT 0,
      by_level     TEXT NOT NULL DEFAULT '{}',
      duration_ms  BIGINT  NOT NULL DEFAULT 0,
      timed_out    BOOLEAN NOT NULL DEFAULT false,
      is_best      BOOLEAN NOT NULL DEFAULT false,
      created_at   BIGINT  NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_logic_exam_user ON logic_exam_attempts(user_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_logic_exam_board ON logic_exam_attempts(is_best, score DESC)`;

  // ── Merge Evolution ───────────────────────────────────────────────
  // One row per player holds the whole organism. Resources and upgrades are
  // JSON because their shape is game-design, not schema — adding a resource
  // tier should not need a migration.
  await sql`
    CREATE TABLE IF NOT EXISTS merge_profiles (
      user_id        TEXT PRIMARY KEY,
      stage          INTEGER NOT NULL DEFAULT 0,
      xp             INTEGER NOT NULL DEFAULT 0,
      energy         INTEGER NOT NULL DEFAULT 40,
      energy_at      BIGINT  NOT NULL DEFAULT 0,
      chest_meter    INTEGER NOT NULL DEFAULT 0,
      resources      TEXT    NOT NULL DEFAULT '{}',
      chests         TEXT    NOT NULL DEFAULT '{}',
      upgrades       TEXT    NOT NULL DEFAULT '{}',
      taps           INTEGER NOT NULL DEFAULT 0,
      merges         INTEGER NOT NULL DEFAULT 0,
      opened         INTEGER NOT NULL DEFAULT 0,
      last_social    TEXT,
      created_at     BIGINT  NOT NULL,
      updated_at     BIGINT  NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_merge_stage ON merge_profiles(stage DESC, xp DESC)`;

  // ── ნუარი — finished adventure runs ────────────────────────────────
  // Every finished run is kept so a profile can show a history, but the
  // leaderboard reads each player's best only (see noirService.leaderboard).
  await sql`
    CREATE TABLE IF NOT EXISTS noir_runs (
      id          BIGSERIAL PRIMARY KEY,
      user_id     TEXT    NOT NULL,
      name        TEXT    NOT NULL DEFAULT '',
      ending_id   TEXT    NOT NULL,
      tone        TEXT    NOT NULL,
      chapter     INTEGER NOT NULL DEFAULT 0,
      scenes_seen INTEGER NOT NULL DEFAULT 0,
      score       INTEGER NOT NULL DEFAULT 0,
      created_at  BIGINT  NOT NULL
    )
  `;
  // The board groups by user and takes a max, so lead with user_id.
  await sql`CREATE INDEX IF NOT EXISTS idx_noir_user_score ON noir_runs(user_id, score DESC)`;

  // A completed test may be converted into a chest upgrade exactly ONCE. Without
  // this ledger a single old IQ attempt would boost every chest forever, which
  // rewards having taken a test rather than keeping at it.
  await sql`
    CREATE TABLE IF NOT EXISTS merge_boosts (
      user_id    TEXT NOT NULL,
      source     TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      used_at    BIGINT NOT NULL,
      PRIMARY KEY (user_id, source, source_ref)
    )
  `;

  // Country is needed for the national board; nullable, set by the player.
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS country TEXT`;

  // Verify connection
  const [{ cnt }] = await sql`SELECT COUNT(*) as cnt FROM players` as any[];
  console.log(`[Database] connected successfully`);
  console.log(`[Database] schema/migration check passed — ${cnt} players`);
}
