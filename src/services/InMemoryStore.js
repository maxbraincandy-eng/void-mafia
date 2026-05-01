const { createRoom } = require("../engine/Room");

class InMemoryStore {
  constructor() {
    this.rooms = new Map();
    this.users = new Map();
    this.clans = new Map();
    this.nextUserId = Number(process.env.USER_ID_START || 1);
  }

  async getOrCreateUser(input = {}) {
    const inputId = input.userId ? Number(input.userId) : null;
    if (inputId && this.users.has(inputId)) {
      const u = this.users.get(inputId);
      if (input.nickname) u.nickname = input.nickname;
      if (input.avatar) u.avatar = input.avatar;
      u.lastSeen = Date.now();
      return u;
    }

    const userId = inputId || this.nextUserId++;
    const user = {
      userId,
      nickname: input.nickname || `Player${userId}`,
      avatar: input.avatar || "◆",
      level: Number(input.level || 1),
      xp: Number(input.xp || 0),
      wins: Number(input.wins || 0),
      losses: Number(input.losses || 0),
      games: Number(input.games || 0),
      mvp: Number(input.mvp || 0),
      clanId: null,
      createdAt: Date.now(),
      lastSeen: Date.now()
    };
    this.users.set(user.userId, user);
    return user;
  }

  createRoom(payload) {
    let room;
    do {
      room = createRoom(payload);
    } while (this.rooms.has(room.id));
    this.rooms.set(room.id, room);
    return room;
  }

  getRoom(id) {
    return this.rooms.get(String(id));
  }

  deleteRoom(id) {
    this.rooms.delete(String(id));
  }

  roomsList() {
    return Array.from(this.rooms.values()).sort((a, b) => {
      const liveA = a.phase === "waiting" ? 0 : 1;
      const liveB = b.phase === "waiting" ? 0 : 1;
      return liveB - liveA || b.createdAt - a.createdAt;
    });
  }

  createClan({ name, owner }) {
    const id = `clan_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const clan = {
      id,
      name,
      emblem: owner.avatar || "◆",
      leaderUserId: owner.userId,
      leaderName: owner.nickname,
      members: [owner.userId],
      points: 0,
      wins: 0,
      createdAt: Date.now()
    };
    this.clans.set(id, clan);
    return clan;
  }

  clansList() {
    return Array.from(this.clans.values()).sort((a, b) => b.points - a.points);
  }

  leaderboard() {
    return Array.from(this.users.values()).sort((a, b) => (b.xp || 0) - (a.xp || 0)).slice(0, 100);
  }
}

module.exports = { InMemoryStore };
