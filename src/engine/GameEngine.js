const { PHASE, AUDIO_CUE } = require("./constants");
const { assignRoles } = require("./Deck");
const { resolveNight, top, countBy } = require("./Resolver");
const { checkWin, nightAction, canSelfTarget, shouldActorActAtNight, alivePlayers } = require("./Rules");
const { serializeRoom, publicRoom, phaseLabel } = require("./Serializer");
const { normalizeRoomSettings } = require("./settings");

class GameEngine {
  constructor(ctx) {
    this.ctx = ctx;
  }

  publishRooms() {
    this.ctx.io.emit("rooms:list", this.ctx.store.roomsList().map(publicRoom));
  }

  roomState(room) {
    this.ctx.io.to(room.id).emit("room:state", serializeRoom(room));
    this.publishRooms();
  }

  roomStateTo(socket, room) {
    socket.emit("room:state", serializeRoom(room, socket.id));
  }

  event(room, text, kind = "system", opts = {}) {
    const ev = {
      at: Date.now(),
      text,
      kind,
      privateTo: opts.privateTo || null
    };
    room.events.push(ev);
    if (room.events.length > 160) room.events.shift();

    if (opts.privateTo) {
      const p = room.players.find(x => x.id === opts.privateTo);
      if (p) this.ctx.io.to(p.socketId).emit("game:event", ev);
    } else {
      this.ctx.io.to(room.id).emit("game:event", ev);
    }
  }

  feed(room, text, kind = "info") {
    const item = { at: Date.now(), text, kind };
    room.feed.push(item);
    if (room.feed.length > 100) room.feed.shift();
    this.ctx.io.to(room.id).emit("feed:item", item);
  }

  cue(room, cue, detail = {}) {
    this.ctx.io.to(room.id).emit("audio:cue", { cue, detail, at: Date.now() });
  }

  clearTimers(room) {
    if (room.engine.timerHandle) clearTimeout(room.engine.timerHandle);
    if (room.engine.tickHandle) clearInterval(room.engine.tickHandle);
    room.engine.timerHandle = null;
    room.engine.tickHandle = null;
  }

  setPhase(room, phase, seconds, onEnd, cue = null) {
    this.clearTimers(room);
    room.previousPhase = room.phase;
    room.phase = phase;
    room.phaseStartedAt = Date.now();
    room.phaseDeadlineAt = Date.now() + seconds * 1000;
    room.timer = seconds;
    room.stats.phases += 1;

    this.applyVoiceRules(room);

    this.ctx.io.to(room.id).emit("phase:changed", {
      phase,
      label: phaseLabel(phase),
      timer: seconds,
      day: room.day,
      round: room.round,
      speakerId: room.individualSpeakerId
    });

    if (cue) this.cue(room, cue, { phase });
    this.roomState(room);

    room.engine.tickHandle = setInterval(() => {
      room.timer = Math.max(0, Math.ceil((room.phaseDeadlineAt - Date.now()) / 1000));
      this.ctx.io.to(room.id).emit("phase:tick", { phase: room.phase, timer: room.timer });
    }, 1000);

    room.engine.timerHandle = setTimeout(() => {
      this.clearTimers(room);
      onEnd && onEnd();
    }, seconds * 1000);
  }

  start(room) {
    if (room.players.length < 4) {
      this.event(room, "თამაშის დასაწყებად მინიმუმ 4 მოთამაშეა საჭირო.", "warn");
      return { ok: false, error: "მინიმუმ 4 მოთამაშეა საჭირო." };
    }

    room.startedAt = Date.now();
    room.day = 0;
    room.round = 0;
    room.events = [];
    room.feed = [];
    room.chat = [];
    room.nominations = {};
    room.nominatedIds = [];
    room.votes = {};
    room.nightActions = {};
    room.gameOver = null;
    room.lastEliminatedId = null;
    room.stats = { nominations: 0, votes: 0, nightActions: 0, eliminations: 0, phases: 0, chatMessages: 0 };

    room.players.forEach(p => {
      p.alive = true;
      p.revealed = false;
      p.engineMuted = false;
      p.flags.protectedFromVote = false;
      p.flags.mayorRevealed = false;
      p.limits.vigilanteShots = 1;
    });

    assignRoles(room);
    this.ctx.metrics.inc("gamesStarted");
    this.event(room, "თამაში დაიწყო. როლები დარიგდა.", "phase");
    this.feed(room, "თამაში დაიწყო", "phase");

    this.setPhase(room, PHASE.ROLE_REVEAL, room.settings.timers.roleReveal, () => this.beginNight(room, true), AUDIO_CUE.ROLE);
    return { ok: true };
  }

  beginNight(room) {
    room.round += 1;
    room.nightActions = {};
    room.nightResults = null;
    room.protectedFromVoteIds = [];
    room.individualSpeakerId = null;

    this.event(room, `ღამე ${room.round} დაიწყო.`, "phase");
    this.feed(room, "ღამის ფაზა", "phase");
    this.setPhase(room, PHASE.NIGHT, room.settings.timers.night, () => this.endNight(room), AUDIO_CUE.NIGHT);
  }

  endNight(room) {
    const result = resolveNight(room);
    room.nightResults = result;
    room.players.forEach(p => p.flags.protectedFromVote = result.voteProtectedIds.includes(p.id));

    for (const deadId of result.deadIds) {
      const p = room.players.find(x => x.id === deadId);
      if (p && p.alive) {
        p.alive = false;
        room.lastEliminatedId = p.id;
        room.stats.eliminations += 1;
      }
    }

    for (const privateResult of result.privateResults) {
      this.event(room, privateResult.text, "private", { privateTo: privateResult.actorId });
    }

    for (const hint of result.publicHints) {
      this.event(room, hint.text, "hint");
      this.feed(room, "ღამის ჩანაწერი გამოქვეყნდა", "hint");
    }

    if (result.deadIds.length) {
      const list = result.deadIds.map(id => {
        const p = room.players.find(x => x.id === id);
        return p ? `#${p.seat} ${p.nickname}` : id;
      }).join(", ");
      this.event(room, `ღამის შემდეგ თამაშს გამოეთიშა: ${list}`, "result");
      this.feed(room, "ღამის შედეგი დაფიქსირდა", "result");
    } else {
      this.event(room, "ღამის შემდეგ არავინ გამოეთიშა.", "result");
      this.feed(room, "ღამე მშვიდად დასრულდა", "result");
    }

    const win = checkWin(room);
    if (win) return this.finish(room, win);

    this.setPhase(room, PHASE.NIGHT_RESULT, room.settings.timers.nightResult, () => this.beginDayCommon(room), AUDIO_CUE.RESULT);
  }

  beginDayCommon(room) {
    room.day += 1;
    room.nominations = {};
    room.nominatedIds = [];
    room.votes = {};
    room.individualSpeakerId = null;

    this.event(room, `დღე ${room.day}: საერთო განხილვა დაიწყო.`, "phase");
    this.feed(room, `დღე ${room.day}`, "phase");
    this.setPhase(room, PHASE.DAY_COMMON, room.settings.timers.dayCommon, () => this.beginIndividual(room), AUDIO_CUE.DAY);
  }

  beginIndividual(room) {
    room.individualOrder = alivePlayers(room).map(p => p.id);
    room.individualIndex = 0;
    this.event(room, "ინდივიდუალური გამოსვლები დაიწყო.", "phase");
    this.nextIndividual(room);
  }

  nextIndividual(room) {
    if (room.individualIndex >= room.individualOrder.length) {
      room.individualSpeakerId = null;
      this.beginNomination(room);
      return;
    }

    const id = room.individualOrder[room.individualIndex];
    const player = room.players.find(p => p.id === id);
    if (!player || !player.alive) {
      room.individualIndex += 1;
      return this.nextIndividual(room);
    }

    room.individualSpeakerId = id;
    this.event(room, `სიტყვა აქვს #${player.seat} ${player.nickname}.`, "phase");
    this.setPhase(room, PHASE.DAY_INDIVIDUAL, room.settings.timers.individual, () => {
      room.individualIndex += 1;
      this.nextIndividual(room);
    }, AUDIO_CUE.INDIVIDUAL);
  }

  beginNomination(room) {
    room.individualSpeakerId = null;
    room.nominations = {};
    room.nominatedIds = [];
    this.event(room, "კანდიდატების დასახელება დაიწყო.", "phase");
    this.setPhase(room, PHASE.NOMINATION, room.settings.timers.nomination, () => this.endNomination(room), AUDIO_CUE.NOMINATION);
  }

  nominate(room, actor, targetId) {
    if (room.phase !== PHASE.NOMINATION) return { ok: false, error: "ახლა დასახელების დრო არ არის." };
    if (!actor || !actor.alive) return { ok: false, error: "მხოლოდ ცოცხალ მოთამაშეს შეუძლია." };

    const target = room.players.find(p => p.id === targetId);
    if (!target || !target.alive || target.id === actor.id) return { ok: false, error: "კანდიდატი არასწორია." };

    room.nominations[actor.id] = target.id;
    room.stats.nominations += 1;
    this.ctx.metrics.inc("nominations");
    this.event(room, `#${actor.seat}-მა დაასახელა #${target.seat}.`, "nomination");
    this.roomState(room);

    return { ok: true };
  }

  endNomination(room) {
    const values = Object.values(room.nominations);
    if (!values.length) {
      this.event(room, "კანდიდატი არ დასახელდა. ღამე იწყება.", "result");
      return this.setPhase(room, PHASE.VOTE_RESULT, room.settings.timers.voteResult, () => this.beginNight(room), AUDIO_CUE.RESULT);
    }

    room.nominatedIds = top(values);
    this.event(room, `ხმის მიცემაზე გადავიდა ${room.nominatedIds.length} კანდიდატი.`, "result");
    this.beginVote(room);
  }

  beginVote(room) {
    room.votes = {};
    this.event(room, "ხმის მიცემის ფაზა დაიწყო.", "phase");
    this.setPhase(room, PHASE.VOTE, room.settings.timers.vote, () => this.endVote(room), AUDIO_CUE.VOTE);
  }

  vote(room, actor, targetId) {
    if (room.phase !== PHASE.VOTE) return { ok: false, error: "ახლა ხმის მიცემის დრო არ არის." };
    if (!actor || !actor.alive) return { ok: false, error: "მხოლოდ ცოცხალი მოთამაშე აძლევს ხმას." };

    const vote = targetId === "abstain" ? "abstain" : String(targetId);
    if (vote !== "abstain" && !room.nominatedIds.includes(vote)) {
      return { ok: false, error: "ამ კანდიდატზე ხმა ვერ მიეცემა." };
    }

    room.votes[actor.id] = vote;
    room.stats.votes += 1;
    this.ctx.metrics.inc("votesCast");
    this.event(room, `#${actor.seat}-მა ხმა დააფიქსირა.`, "vote");
    this.roomState(room);

    if (Object.keys(room.votes).length >= alivePlayers(room).length) {
      this.clearTimers(room);
      this.endVote(room);
    }

    return { ok: true };
  }

  endVote(room) {
    const values = Object.values(room.votes).filter(v => v !== "abstain");
    if (!values.length) {
      this.event(room, "ხმები არ დაფიქსირდა. არავინ ტოვებს მაგიდას.", "result");
      return this.setPhase(room, PHASE.VOTE_RESULT, room.settings.timers.voteResult, () => this.beginNight(room), AUDIO_CUE.RESULT);
    }

    const winners = top(values);
    if (winners.length !== 1) {
      this.event(room, "ხმები გაიყო. არავინ ტოვებს მაგიდას.", "result");
      return this.setPhase(room, PHASE.VOTE_RESULT, room.settings.timers.voteResult, () => this.beginNight(room), AUDIO_CUE.RESULT);
    }

    const target = room.players.find(p => p.id === winners[0]);
    if (!target || !target.alive) {
      this.event(room, "კანდიდატი აღარ არის თამაშში.", "warn");
      return this.setPhase(room, PHASE.VOTE_RESULT, room.settings.timers.voteResult, () => this.beginNight(room), AUDIO_CUE.RESULT);
    }

    if (target.flags.protectedFromVote) {
      target.flags.protectedFromVote = false;
      this.event(room, `#${target.seat} დღის ხმისგან დაცულია. არავინ ტოვებს მაგიდას.`, "result");
      return this.setPhase(room, PHASE.VOTE_RESULT, room.settings.timers.voteResult, () => this.beginNight(room), AUDIO_CUE.RESULT);
    }

    target.alive = false;
    room.lastEliminatedId = target.id;
    room.stats.eliminations += 1;
    this.event(room, `#${target.seat} ${target.nickname} ტოვებს თამაშს.`, "result");

    const win = checkWin(room);
    if (win) return this.finish(room, win);

    this.setPhase(room, PHASE.VOTE_RESULT, room.settings.timers.voteResult, () => {
      if (room.settings.lastWords) this.beginLastWords(room, target);
      else this.beginNight(room);
    }, AUDIO_CUE.RESULT);
  }

  beginLastWords(room, player) {
    room.individualSpeakerId = player.id;
    this.event(room, `ბოლო სიტყვა აქვს #${player.seat} ${player.nickname}.`, "phase");
    this.setPhase(room, PHASE.LAST_WORDS, room.settings.timers.lastWords, () => {
      room.individualSpeakerId = null;
      this.beginNight(room);
    }, AUDIO_CUE.LAST_WORDS);
  }

  nightAction(room, actor, targetId) {
    if (room.phase !== PHASE.NIGHT) return { ok: false, error: "ახლა ღამის დრო არ არის." };
    if (!actor || !actor.alive) return { ok: false, error: "მხოლოდ ცოცხალი მოთამაშე მოქმედებს." };

    const action = nightAction(actor.role);
    if (!action) return { ok: false, error: "შენ როლს ღამის მოქმედება არ აქვს." };

    const target = room.players.find(p => p.id === targetId);
    if (!target || !target.alive) return { ok: false, error: "სამიზნე არასწორია." };

    if (target.id === actor.id && !canSelfTarget(actor.role, action)) {
      return { ok: false, error: "ამ მოქმედებას საკუთარ თავზე ვერ გააკეთებ." };
    }

    if (actor.role === "vigilante") {
      if (actor.limits.vigilanteShots <= 0) return { ok: false, error: "მოქმედება აღარ გაქვს." };
      actor.limits.vigilanteShots -= 1;
    }

    room.nightActions[actor.id] = { actorId: actor.id, targetId: target.id, action };
    room.stats.nightActions += 1;
    this.ctx.metrics.inc("nightActions");
    this.event(room, `#${actor.seat}-მა ღამის მოქმედება აირჩია.`, "night");
    this.roomState(room);

    this.tryEndNightEarly(room);
    return { ok: true };
  }

  tryEndNightEarly(room) {
    const required = alivePlayers(room).filter(shouldActorActAtNight).map(p => p.id);
    if (!required.length) return;
    const acted = new Set(Object.keys(room.nightActions));
    if (required.every(id => acted.has(id))) {
      this.clearTimers(room);
      this.endNight(room);
    }
  }

  updateSettings(room, patch) {
    room.settings = normalizeRoomSettings({ ...room.settings, ...patch, timers: { ...room.settings.timers, ...(patch.timers || {}) }, roles: { ...room.settings.roles, ...(patch.roles || patch.roleSettings || {}) } });
    this.event(room, "მაგიდის პარამეტრები განახლდა.", "system");
    this.roomState(room);
    return { ok: true };
  }

  finish(room, win) {
    this.clearTimers(room);
    room.phase = PHASE.GAME_OVER;
    room.timer = 0;
    room.phaseDeadlineAt = null;
    room.gameOver = win;
    room.individualSpeakerId = null;
    this.applyVoiceRules(room);
    this.ctx.metrics.inc("gamesFinished");
    this.event(room, `თამაში დასრულდა: ${win.label}`, "result");
    this.feed(room, win.label, "result");
    this.cue(room, AUDIO_CUE.WIN, win);
    this.roomState(room);
  }

  applyVoiceRules(room) {
    for (const p of room.players) {
      if (!p.alive) {
        p.engineMuted = true;
      } else if (room.phase === PHASE.DAY_COMMON || room.phase === PHASE.NOMINATION) {
        p.engineMuted = false;
      } else if (room.phase === PHASE.DAY_INDIVIDUAL || room.phase === PHASE.LAST_WORDS) {
        p.engineMuted = p.id !== room.individualSpeakerId;
      } else if (room.phase === PHASE.VOTE || room.phase === PHASE.NIGHT) {
        p.engineMuted = true;
      } else {
        p.engineMuted = false;
      }
    }
  }
}

module.exports = { GameEngine };
