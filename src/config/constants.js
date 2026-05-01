const PHASE = Object.freeze({
  WAITING: "waiting",
  ROLE_REVEAL: "role_reveal",
  NIGHT: "night",
  NIGHT_RESULT: "night_result",
  DAY_COMMON: "day_common",
  DAY_INDIVIDUAL: "day_individual",
  NOMINATION: "nomination",
  VOTE: "vote",
  VOTE_RESULT: "vote_result",
  LAST_WORDS: "last_words",
  GAME_OVER: "game_over",
  PAUSED: "paused"
});

const TEAM = Object.freeze({
  CITY: "city",
  MAFIA: "mafia",
  YAKUZA: "yakuza",
  SOLO: "solo",
  NONE: "none"
});

const ROLE = Object.freeze({
  CITIZEN: "citizen",
  MAFIA: "mafia",
  DON: "don",
  SHERIFF: "sheriff",
  DOCTOR: "doctor",
  DETECTIVE: "detective",
  SERIAL: "serial_killer",
  YAKUZA: "yakuza",
  CHOGUN: "chogun",
  VIGILANTE: "vigilante",
  MANIAC: "maniac",
  BODYGUARD: "bodyguard",
  JOURNALIST: "journalist",
  LAWYER: "lawyer",
  MAYOR: "mayor"
});

const ACTION = Object.freeze({
  MAFIA_KILL: "mafia_kill",
  YAKUZA_KILL: "yakuza_kill",
  SERIAL_KILL: "serial_kill",
  VIGILANTE_KILL: "vigilante_kill",
  SAVE: "save",
  GUARD: "guard",
  BLOCK: "block",
  CHECK_ALIGNMENT: "check_alignment",
  TRACK_ACTION: "track_action",
  PROTECT_VOTE: "protect_vote",
  PUBLIC_HINT: "public_hint",
  MAYOR_REVEAL: "mayor_reveal"
});

const ROLE_META = Object.freeze({
  citizen: { team: TEAM.CITY, action: null, publicName: "მოქალაქე" },
  mafia: { team: TEAM.MAFIA, action: ACTION.MAFIA_KILL, publicName: "მაფია" },
  don: { team: TEAM.MAFIA, action: ACTION.MAFIA_KILL, priority: true, publicName: "დონი" },
  sheriff: { team: TEAM.CITY, action: ACTION.CHECK_ALIGNMENT, publicName: "შერიფი" },
  doctor: { team: TEAM.CITY, action: ACTION.SAVE, canSelf: true, publicName: "ექიმი" },
  detective: { team: TEAM.CITY, action: ACTION.TRACK_ACTION, publicName: "დეტექტივი" },
  serial_killer: { team: TEAM.SOLO, action: ACTION.SERIAL_KILL, publicName: "მარტოხელა მკვლელი" },
  yakuza: { team: TEAM.YAKUZA, action: ACTION.YAKUZA_KILL, publicName: "იაკუძა" },
  chogun: { team: TEAM.YAKUZA, action: ACTION.YAKUZA_KILL, priority: true, publicName: "ჩოგუნი" },
  vigilante: { team: TEAM.CITY, action: ACTION.VIGILANTE_KILL, limited: "vigilanteShots", publicName: "ვიჯილანტი" },
  maniac: { team: TEAM.CITY, action: ACTION.BLOCK, publicName: "მანიაკი" },
  bodyguard: { team: TEAM.CITY, action: ACTION.GUARD, canSelf: true, publicName: "მცველი" },
  journalist: { team: TEAM.CITY, action: ACTION.PUBLIC_HINT, publicName: "მემატიანე" },
  lawyer: { team: TEAM.CITY, action: ACTION.PROTECT_VOTE, publicName: "დამცველი" },
  mayor: { team: TEAM.CITY, action: null, publicName: "ქალაქის ხმა" }
});

const PHASE_LABEL = Object.freeze({
  waiting: "მოლოდინი",
  role_reveal: "როლების დარიგება",
  night: "ღამე",
  night_result: "ღამის შედეგი",
  day_common: "საერთო განხილვა",
  day_individual: "ინდივიდუალური გამოსვლები",
  nomination: "კანდიდატების დასახელება",
  vote: "ხმის მიცემა",
  vote_result: "ხმის შედეგი",
  last_words: "ბოლო სიტყვა",
  game_over: "დასასრული",
  paused: "პაუზა"
});

const AUDIO_CUE = Object.freeze({
  START: "game-start",
  ROLE: "role-reveal",
  NIGHT: "night-start",
  DAY: "day-start",
  INDIVIDUAL: "speaker-turn",
  NOMINATION: "nomination",
  VOTE: "vote",
  RESULT: "result",
  LAST_WORDS: "last-words",
  WIN: "win",
  ERROR: "error"
});

module.exports = { PHASE, TEAM, ROLE, ACTION, ROLE_META, PHASE_LABEL, AUDIO_CUE };
