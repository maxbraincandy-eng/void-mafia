class Metrics {
  constructor() {
    this.counters = {
      roomsCreated: 0,
      gamesStarted: 0,
      gamesFinished: 0,
      votesCast: 0,
      nominations: 0,
      nightActions: 0,
      chatMessages: 0,
      socketConnections: 0
    };
    this.events = [];
  }

  inc(key, amount = 1) {
    this.counters[key] = (this.counters[key] || 0) + amount;
  }

  log(event, data = {}) {
    this.events.push({ at: Date.now(), event, data });
    if (this.events.length > 250) this.events.shift();
  }

  snapshot() {
    return {
      counters: this.counters,
      recentEvents: this.events.slice(-30)
    };
  }
}

module.exports = { Metrics };
