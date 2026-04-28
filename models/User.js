{
  _id,
  username,
  passwordHash,
  role: "user" | "admin" | "moderator",
  stats: {
    gamesPlayed,
    wins,
    losses
  }
}
