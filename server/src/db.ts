import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_PATH ?? resolve(__dirname, '../../data/void.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db: DatabaseType = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
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
    joined_at               INTEGER NOT NULL,
    last_seen_at            INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bans (
    id            TEXT PRIMARY KEY,
    player_id     TEXT NOT NULL,
    banned_by     TEXT NOT NULL,
    banned_by_name TEXT NOT NULL,
    reason        TEXT NOT NULL DEFAULT '',
    issued_at     INTEGER NOT NULL,
    expires_at    INTEGER NOT NULL,
    active        INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS mutes (
    id            TEXT PRIMARY KEY,
    player_id     TEXT NOT NULL,
    muted_by      TEXT NOT NULL,
    muted_by_name TEXT NOT NULL,
    reason        TEXT NOT NULL DEFAULT '',
    issued_at     INTEGER NOT NULL,
    expires_at    INTEGER NOT NULL,
    active        INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS warnings (
    id            TEXT PRIMARY KEY,
    player_id     TEXT NOT NULL,
    warned_by     TEXT NOT NULL,
    warned_by_name TEXT NOT NULL,
    reason        TEXT NOT NULL DEFAULT '',
    issued_at     INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reports (
    id              TEXT PRIMARY KEY,
    reporter_id     TEXT NOT NULL,
    reporter_name   TEXT NOT NULL,
    reported_id     TEXT NOT NULL,
    reported_name   TEXT NOT NULL,
    room_id         TEXT,
    reason          TEXT NOT NULL,
    details         TEXT NOT NULL DEFAULT '',
    created_at      INTEGER NOT NULL,
    status          TEXT NOT NULL DEFAULT 'open',
    assigned_mod_id TEXT,
    mod_notes       TEXT NOT NULL DEFAULT ''
  );

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
    created_at       INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS achievements (
    key         TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL,
    icon        TEXT NOT NULL,
    rarity      TEXT NOT NULL DEFAULT 'common'
  );

  CREATE TABLE IF NOT EXISTS player_achievements (
    player_id       TEXT NOT NULL,
    achievement_key TEXT NOT NULL,
    earned_at       INTEGER NOT NULL,
    PRIMARY KEY (player_id, achievement_key)
  );

  CREATE TABLE IF NOT EXISTS game_history (
    id           TEXT PRIMARY KEY,
    room_code    TEXT NOT NULL,
    started_at   INTEGER NOT NULL,
    ended_at     INTEGER NOT NULL,
    winner       TEXT,
    day_reached  INTEGER NOT NULL DEFAULT 0,
    player_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS game_players (
    game_id   TEXT NOT NULL,
    player_id TEXT NOT NULL,
    role      TEXT,
    team      TEXT,
    survived  INTEGER NOT NULL DEFAULT 0,
    won       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (game_id, player_id)
  );

  CREATE TABLE IF NOT EXISTS clans (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    tag         TEXT NOT NULL UNIQUE,
    owner_id    TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    wins        INTEGER NOT NULL DEFAULT 0,
    losses      INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS clan_members (
    clan_id   TEXT NOT NULL,
    player_id TEXT NOT NULL,
    role      TEXT NOT NULL DEFAULT 'member',
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (clan_id, player_id)
  );

  CREATE TABLE IF NOT EXISTS friendships (
    id         TEXT PRIMARY KEY,
    from_id    TEXT NOT NULL,
    to_id      TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    UNIQUE(from_id, to_id)
  );

  CREATE TABLE IF NOT EXISTS daily_completions (
    player_id    TEXT NOT NULL,
    challenge_id TEXT NOT NULL,
    date_key     TEXT NOT NULL,
    completed_at INTEGER NOT NULL,
    PRIMARY KEY (player_id, challenge_id, date_key)
  );
`);

// Migration-safe column additions
const addCol = (sql: string) => { try { db.exec(sql); } catch { /* column already exists */ } };
addCol("ALTER TABLE players ADD COLUMN xp INTEGER NOT NULL DEFAULT 0");
addCol("ALTER TABLE players ADD COLUMN level INTEGER NOT NULL DEFAULT 1");
addCol("ALTER TABLE players ADD COLUMN cosmetics TEXT NOT NULL DEFAULT '{}'");

// Seed achievement definitions
const ACHIEVEMENTS = [
  { key: 'first_blood',   name: 'First Blood',     icon: '🩸', rarity: 'common',    description: 'Win your first game' },
  { key: 'godfather',     name: 'Godfather',        icon: '♛',  rarity: 'rare',      description: 'Win 5 games as Don' },
  { key: 'town_hero',     name: 'Town Hero',        icon: '🛡',  rarity: 'rare',      description: 'Save 3 players in one game as Doctor' },
  { key: 'detective',     name: 'Detective',        icon: '🔍', rarity: 'common',    description: 'Catch a Mafia member as Sheriff' },
  { key: 'survivor',      name: 'Survivor',         icon: '💪', rarity: 'common',    description: 'Survive 10 games' },
  { key: 'executioner',   name: 'Executioner',      icon: '⚖️', rarity: 'uncommon',  description: 'Eliminate 3 players by vote in one game' },
  { key: 'ghost',         name: 'Ghost',            icon: '👻', rarity: 'uncommon',  description: 'Win as Jester (get eliminated by vote)' },
  { key: 'serial_killer', name: 'Serial Killer',    icon: '🌀', rarity: 'rare',      description: 'Win as Maniac' },
  { key: 'veteran_wars',  name: 'War Hero',         icon: '🎖️', rarity: 'uncommon',  description: 'Kill an attacker as Veteran' },
  { key: 'cult_master',   name: 'Cult Master',      icon: '🕯️', rarity: 'epic',      description: 'Convert 3 players as Cult Leader' },
  { key: 'night_owl',     name: 'Night Owl',        icon: '🦉', rarity: 'common',    description: 'Play 10 games' },
  { key: 'legend',        name: 'Legend',           icon: '🏆', rarity: 'legendary', description: 'Win 50 games' },
  { key: 'arsonist_win',  name: 'Ignition',         icon: '🔥', rarity: 'rare',      description: 'Win as Arsonist' },
  { key: 'loyal_guard',   name: 'Loyal Guard',      icon: '🛡',  rarity: 'uncommon',  description: 'Die protecting a player as Bodyguard' },
  { key: 'comeback',      name: 'Comeback',         icon: '⚡', rarity: 'uncommon',  description: 'Win when only 2 town players remained' },
];

const insertAch = db.prepare(`
  INSERT OR IGNORE INTO achievements (key, name, description, icon, rarity) VALUES (?, ?, ?, ?, ?)
`);
for (const a of ACHIEVEMENTS) {
  insertAch.run(a.key, a.name, a.description, a.icon, a.rarity);
}
