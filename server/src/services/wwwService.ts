/**
 * "What? Where? When?" (რა? სად? როდის?) community game service.
 * In-memory match management with Georgian question bank.
 */

import { randomBytes } from 'crypto';

// ── Types ──────────────────────────────────────────────────────────────

export type WWWDifficulty = 'easy' | 'medium' | 'hard' | 'mixed';
export type WWWCategory = 'philosophy' | 'history' | 'science' | 'movies' | 'literature' | 'geography' | 'psychology' | 'logic' | 'general' | 'mixed';
export type WWWMode = 'team' | 'single_team' | 'buzz';
export type WWWStatus = 'waiting' | 'question' | 'discussion' | 'answering' | 'judging' | 'round_result' | 'finished';
export type WWWRole = 'player' | 'captain' | 'judge' | 'spectator';

export interface WWWQuestion {
  id: string;
  category: WWWCategory;
  difficulty: 'easy' | 'medium' | 'hard';
  questionText: string;
  correctAnswer: string;
  explanation: string;
}

export interface WWWSettings {
  mode: WWWMode;
  maxTeams: number;
  maxPlayersPerTeam: number;
  questionsCount: number;
  discussionSeconds: number;
  answerSeconds: number;
  spectatorsAllowed: boolean;
  spectatorVoiceAllowed: boolean;
  hostIsJudge: boolean;
  autoRevealAnswer: boolean;
  questionCategory: WWWCategory;
  difficulty: WWWDifficulty;
}

export interface WWWPlayer {
  userId: string;
  nickname: string;
  teamId: string | null;
  role: WWWRole;
  connected: boolean;
}

export interface WWWTeam {
  id: string;
  name: string;
  color: string;
  captainId: string | null;
  playerIds: string[];
}

export interface WWWSubmittedAnswer {
  teamId: string;
  captainId: string;
  answerText: string;
  submittedAt: number;
  isCorrect?: boolean;
  judgeNote?: string;
}

export interface WWWMatch {
  id: string;
  code: string;
  status: WWWStatus;
  hostId: string;
  players: Record<string, WWWPlayer>;
  spectators: string[];
  settings: WWWSettings;
  teams: WWWTeam[];
  questionIds: string[];
  currentQuestionIndex: number;
  submittedAnswers: Record<string, WWWSubmittedAnswer>;
  scores: Record<string, number>;
  timerEndsAt: number | null;
  voiceSessionId: string;
  createdAt: number;
  chat: { userId: string; nickname: string; text: string; ts: number }[];
}

export interface WWWMatchPublic {
  id: string;
  code: string;
  status: WWWStatus;
  hostId: string;
  players: Record<string, WWWPlayer>;
  spectators: string[];
  settings: WWWSettings;
  teams: WWWTeam[];
  currentQuestion: WWWQuestion | null;
  currentQuestionIndex: number;
  totalQuestions: number;
  submittedAnswers: Record<string, WWWSubmittedAnswer>;
  scores: Record<string, number>;
  timerEndsAt: number | null;
  voiceSessionId: string;
  chat: { userId: string; nickname: string; text: string; ts: number }[];
}

export interface WWWMatchListItem {
  id: string;
  code: string;
  status: WWWStatus;
  playerCount: number;
  maxPlayers: number;
  mode: WWWMode;
  category: WWWCategory;
}

// ── Question Bank ──────────────────────────────────────────────────────

const QUESTIONS: WWWQuestion[] = [
  // Philosophy
  { id: 'q1', category: 'philosophy', difficulty: 'easy', questionText: 'რომელ ფილოსოფოსს ეკუთვნის გამოთქმა "ვფიქრობ, მაშასადამე ვარსებობ"?', correctAnswer: 'რენე დეკარტი', explanation: 'ლათინურად: "Cogito, ergo sum" — დეკარტის ძირითადი ფილოსოფიური პოსტულატი.' },
  { id: 'q2', category: 'philosophy', difficulty: 'medium', questionText: 'რომელ ფილოსოფოსს ეკუთვნის "ნება ძალაა" კონცეფცია?', correctAnswer: 'ფრიდრიხ ნიცშე', explanation: 'ნიცშეს "ნება ძალის მიმართ" (Wille zur Macht) ცენტრალური ცნებაა მის ფილოსოფიაში.' },
  { id: 'q3', category: 'philosophy', difficulty: 'hard', questionText: 'სოკრატეს სწავლების რომელ მეთოდს ეწოდება "მეანობა"?', correctAnswer: 'მაიევტიკა', explanation: 'სოკრატემ შეიმუშავა სასწავლო მეთოდი, სადაც კითხვებით ეხმარებოდა სტუდენტს ჭეშმარიტების „გამოჩეკაში".' },
  { id: 'q4', category: 'philosophy', difficulty: 'medium', questionText: 'ვინ დაწერა "კრიტიკა სუფთა გონებისა"?', correctAnswer: 'იმანუელ კანტი', explanation: 'კანტის 1781 წელს გამოქვეყნებული გამოჩენილი ნაშრომი.' },
  { id: 'q5', category: 'philosophy', difficulty: 'easy', questionText: 'რომელ ბერძენ ფილოსოფოსს ეძახდნენ "ბრძენთა ბრძენს"?', correctAnswer: 'სოკრატე', explanation: 'სოკრატეს დელფოს ორაკულმა უწოდა ყველაზე ბრძენი ადამიანი.' },
  // History
  { id: 'q6', category: 'history', difficulty: 'easy', questionText: 'ვინ გახდა კოსმოსში პირველი ადამიანი?', correctAnswer: 'იური გაგარინი', explanation: 'საბჭოთა კოსმონავტმა იური გაგარინმა 1961 წლის 12 აპრილს გაფრინდა კოსმოსში.' },
  { id: 'q7', category: 'history', difficulty: 'medium', questionText: 'ვატერლოოს ბრძოლა (1815) ვის სამხედრო კარიერის ბოლოს აღნიშნავდა?', correctAnswer: 'ნაპოლეონ ბონაპარტი', explanation: 'ნაპოლეონი ბრიტანელ-პრუსიული ძალებმა დაამარცხეს ბელგიაში.' },
  { id: 'q8', category: 'history', difficulty: 'easy', questionText: 'პირველი ოლიმპიური თამაშები ძველ საბერძნეთში სად ჩატარდა?', correctAnswer: 'ოლიმპია', explanation: '776 ძვ.წ. — ოლიმპიაში, პელოპონესის ნახევარკუნძულზე.' },
  { id: 'q9', category: 'history', difficulty: 'hard', questionText: 'ბაბილონი კიმ დაიპყრო ძვ.წ. 539 წელს?', correctAnswer: 'კვიროს II (სპარსეთი)', explanation: 'სპარსეთის მეფე კვიროს II-მ ბაბილონი მიჰყო სისხლისღვრის გარეშე.' },
  { id: 'q10', category: 'history', difficulty: 'medium', questionText: 'რომელი ქვეყანა გამოუცხადა ომი ყველაზე მეტ ქვეყანას II მსოფლიო ომში?', correctAnswer: 'გერმანია', explanation: 'ნაცისტური გერმანია ომის ყველაზე აქტიური მონაწილე იყო.' },
  // Science
  { id: 'q11', category: 'science', difficulty: 'easy', questionText: 'ოქროს ქიმიური სიმბოლო?', correctAnswer: 'Au', explanation: 'ლათ. Aurum — ოქრო. ატომური ნომერი 79.' },
  { id: 'q12', category: 'science', difficulty: 'easy', questionText: 'წყლის ქიმიური ფორმულა?', correctAnswer: 'H₂O', explanation: 'ორი წყალბადი და ერთი ჟანგბადი.' },
  { id: 'q13', category: 'science', difficulty: 'medium', questionText: 'DNA-ს სტრუქტურა ვინ აღმოაჩინა?', correctAnswer: 'უოტსონი და კრიკი', explanation: 'ჯეიმს უოტსონმა და ფრენსის კრიკმა 1953 წელს აღმოაჩინეს DNA-ს ორმაგი სპირალი.' },
  { id: 'q14', category: 'science', difficulty: 'medium', questionText: 'სინათლის სიჩქარე ვაკუუმში (დაახლოებით)?', correctAnswer: '300 000 კმ/წმ', explanation: 'ზუსტი მნიშვნელობა: 299 792 458 მ/წმ.' },
  { id: 'q15', category: 'science', difficulty: 'hard', questionText: 'პარიოდული სისტემის რომელ ელემენტს აქვს ატომური ნომერი 79?', correctAnswer: 'ოქრო (Au)', explanation: 'ოქრო — პერიოდული სისტემის 79-ე ელემენტი.' },
  // Movies
  { id: 'q16', category: 'movies', difficulty: 'easy', questionText: '"ტიტანიკი" (1997) ვინ გადაიღო?', correctAnswer: 'ჯეიმს კემერონი', explanation: 'კემერონის ფილმმა მოიგო 11 ოსკარი.' },
  { id: 'q17', category: 'movies', difficulty: 'medium', questionText: 'რომელ ფილმს მოეპოვება ყველაზე მეტი ოსკარის ჯილდო ისტორიაში? (11 ოსკარი)', correctAnswer: 'ბენ-ჰური / ტიტანიკი / ბეჭდების მბრძანებელი: მეფის დაბრუნება', explanation: 'სამივე ფილმმა მოიგო 11 ოსკარი.' },
  { id: 'q18', category: 'movies', difficulty: 'easy', questionText: '"ვარსკვლავური ომები" (1977) ვინ გადაიღო?', correctAnswer: 'ჯორჯ ლუკასი', explanation: 'ლუკასმა შექმნა ლეგენდარული კოსმოსური ეპოპეა.' },
  { id: 'q19', category: 'movies', difficulty: 'hard', questionText: 'რომელ ქვეყანაში გამოუშვეს ფილმი "კინო პარადიზო"?', correctAnswer: 'იტალია', explanation: '1988 წელს გამოუშვეს იუსეპე ტორნატორეს კინოფილმი.' },
  { id: 'q20', category: 'movies', difficulty: 'medium', questionText: '"მარტრიქსი" ვინ გადაიღო?', correctAnswer: 'ვაჩოვსკის დები', explanation: 'ლანა და ლილი ვაჩოვსკი — 1999 წლის კულტური ფილმი.' },
  // Literature
  { id: 'q21', category: 'literature', difficulty: 'easy', questionText: '"პატარა უფლისწული" ვინ დაწერა?', correctAnswer: 'ანტუან დე სენტ-ეგზიუპერი', explanation: '1943 წელს გამოქვეყნებული ფრანგი ავტორის შედევრი.' },
  { id: 'q22', category: 'literature', difficulty: 'easy', questionText: '"ომი და მშვიდობა" ვინ დაწერა?', correctAnswer: 'ლევ ტოლსტოი', explanation: '1869 წელს გამოქვეყნებული რუსი მწერლის ეპოსური რომანი.' },
  { id: 'q23', category: 'literature', difficulty: 'easy', questionText: '"ჰამლეტი" ვინ დაწერა?', correctAnswer: 'უილიამ შექსპირი', explanation: 'ინგლისელი დრამატურგის ყველაზე ცნობილი ტრაგედია.' },
  { id: 'q24', category: 'literature', difficulty: 'medium', questionText: '"კარამაზოვის ძმები" ვინ დაწერა?', correctAnswer: 'ფიოდოო დოსტოევსკი', explanation: '1880 წელს გამოქვეყნებული ფსიქოლოგიური რომანი.' },
  { id: 'q25', category: 'literature', difficulty: 'hard', questionText: 'რომელი ქართველი პოეტი ეწოდება "ქართული პოეზიის მამა"?', correctAnswer: 'შოთა რუსთველი', explanation: 'XII საუკუნის გენიალური ქართველი პოეტი, "ვეფხისტყაოსნის" ავტორი.' },
  // Geography
  { id: 'q26', category: 'geography', difficulty: 'easy', questionText: 'მსოფლიოში ყველაზე დიდი ქვეყანა ფართობით?', correctAnswer: 'რუსეთი', explanation: '17 მილიონ კვ.კმ-ზე მეტი ფართობით.' },
  { id: 'q27', category: 'geography', difficulty: 'easy', questionText: 'ყველაზე მაღალი მთა მსოფლიოში?', correctAnswer: 'ევერესტი', explanation: '8 849 მ სიმაღლე ზღვის დონიდან, ჰიმალაის ქედი.' },
  { id: 'q28', category: 'geography', difficulty: 'medium', questionText: 'ყველაზე პატარა ქვეყანა მსოფლიოში?', correctAnswer: 'ვატიკანი', explanation: '0.44 კვ.კმ ფართობი, რომის შიგნით.' },
  // Logic
  { id: 'q29', category: 'logic', difficulty: 'medium', questionText: 'თუ ყველა კაცი სიკვდილია, სოკრატე კაცია, მაშ სოკრატე...?', correctAnswer: 'სიკვდილია', explanation: 'კლასიკური სილოგიზმი — არისტოტელეს ლოგიკის ძირითადი მაგალითი.' },
  { id: 'q30', category: 'logic', difficulty: 'easy', questionText: 'მე მყავს სამი ვაშლი. ორი ვჭამე. რამდენი მაქვს დარჩენილი?', correctAnswer: 'ერთი', explanation: '3 - 2 = 1.' },
  { id: 'q31', category: 'logic', difficulty: 'hard', questionText: 'ნაგვის ურნა ყოველ კვირას ივსება. 10 კვირაში ივსება. რომელ კვირას არის ნახევრამდე სავსე?', correctAnswer: 'მე-9 კვირას', explanation: 'თუ 10-ე კვირაზე სავსეა, მაშინ 9-ე კვირაზე ნახევარი ქონდა.' },
  // General
  { id: 'q32', category: 'general', difficulty: 'easy', questionText: 'მსოფლიოს ყველაზე გრძელი კედელი?', correctAnswer: 'ჩინეთის დიდი კედელი', explanation: 'სიგრძე 21 000 კმ-ზე მეტი, III-VII სს. ნ.წ.' },
  { id: 'q33', category: 'general', difficulty: 'medium', questionText: 'ჰოლოკოსტში დაიღუპა დაახლოებით რამდენი ებრაელი?', correctAnswer: '6 მილიონი', explanation: 'II მსოფლიო ომის დროს ნაცისტებმა 6 მილიონ ებრაელს მოუღეს ბოლო.' },
  { id: 'q34', category: 'general', difficulty: 'easy', questionText: 'ფეხბურთის მსოფლიო ჩემპიონატი (FIFA World Cup) რამდენ წელიწადში ერთხელ ჩატარდება?', correctAnswer: '4 წელიწადში', explanation: 'პირველი მსოფლიო ჩემპიონატი 1930 წელს ჩატარდა.' },
  { id: 'q35', category: 'general', difficulty: 'medium', questionText: 'GPS სტანდარტულ სიზუსტეს რამდენ მეტრამდე გარანტიას იძლევა?', correctAnswer: '5-10 მეტრი', explanation: 'სამოქალაქო GPS სიგნალი ± 5-10 მ სიზუსტეს ინარჩუნებს.' },
];

// ── In-memory store ────────────────────────────────────────────────────

const matches = new Map<string, WWWMatch>();

const DEFAULT_SETTINGS: WWWSettings = {
  mode: 'team',
  maxTeams: 2,
  maxPlayersPerTeam: 6,
  questionsCount: 10,
  discussionSeconds: 60,
  answerSeconds: 30,
  spectatorsAllowed: true,
  spectatorVoiceAllowed: false,
  hostIsJudge: true,
  autoRevealAnswer: true,
  questionCategory: 'mixed',
  difficulty: 'mixed',
};

function genId(): string {
  return randomBytes(8).toString('hex');
}

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function scheduleCleanup(id: string): void {
  setTimeout(() => { matches.delete(id); }, 2 * 60 * 60 * 1000);
}

function selectQuestions(settings: WWWSettings): string[] {
  let pool = [...QUESTIONS];

  if (settings.questionCategory !== 'mixed') {
    pool = pool.filter(q => q.category === settings.questionCategory);
  }
  if (settings.difficulty !== 'mixed') {
    pool = pool.filter(q => q.difficulty === settings.difficulty);
  }

  // Shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, settings.questionsCount).map(q => q.id);
}

function getQuestionById(id: string): WWWQuestion | null {
  return QUESTIONS.find(q => q.id === id) ?? null;
}

// ── Public API ─────────────────────────────────────────────────────────

export function createMatch(hostId: string, nickname: string, settings?: Partial<WWWSettings>): WWWMatch {
  const mergedSettings: WWWSettings = { ...DEFAULT_SETTINGS, ...settings };

  // Generate unique code
  const usedCodes = new Set([...matches.values()].map(m => m.code));
  let code: string;
  do { code = genCode(); } while (usedCodes.has(code));

  const teamA: WWWTeam = {
    id: 'team-a',
    name: 'გუნდი A',
    color: '#ff2244',
    captainId: hostId,
    playerIds: [hostId],
  };

  const teamB: WWWTeam = {
    id: 'team-b',
    name: 'გუნდი B',
    color: '#0090ff',
    captainId: null,
    playerIds: [],
  };

  const hostPlayer: WWWPlayer = {
    userId: hostId,
    nickname,
    teamId: 'team-a',
    role: 'captain',
    connected: true,
  };

  const match: WWWMatch = {
    id: genId(),
    code,
    status: 'waiting',
    hostId,
    players: { [hostId]: hostPlayer },
    spectators: [],
    settings: mergedSettings,
    teams: [teamA, teamB],
    questionIds: [],
    currentQuestionIndex: 0,
    submittedAnswers: {},
    scores: { 'team-a': 0, 'team-b': 0 },
    timerEndsAt: null,
    voiceSessionId: genId(),
    createdAt: Date.now(),
    chat: [],
  };

  matches.set(match.id, match);
  scheduleCleanup(match.id);
  return match;
}

export function getMatch(matchId: string): WWWMatch | null {
  return matches.get(matchId) ?? null;
}

export function getMatchByCode(code: string): WWWMatch | null {
  const upper = code.trim().toUpperCase();
  for (const m of matches.values()) {
    if (m.code === upper) return m;
  }
  return null;
}

export function getMatchList(): WWWMatchListItem[] {
  return [...matches.values()]
    .filter(m => m.status !== 'finished')
    .map(m => ({
      id: m.id,
      code: m.code,
      status: m.status,
      playerCount: Object.keys(m.players).length,
      maxPlayers: m.settings.maxTeams * m.settings.maxPlayersPerTeam,
      mode: m.settings.mode,
      category: m.settings.questionCategory,
    }));
}

export function joinMatch(matchId: string, userId: string, nickname: string): WWWMatch | null {
  const match = matches.get(matchId);
  if (!match) return null;
  if (match.status === 'finished') return null;

  // Already in match — just update connection
  if (match.players[userId]) {
    match.players[userId].connected = true;
    match.players[userId].nickname = nickname;
    return match;
  }

  match.players[userId] = {
    userId,
    nickname,
    teamId: null,
    role: 'player',
    connected: true,
  };

  return match;
}

export function spectateMatch(matchId: string, userId: string, nickname: string): WWWMatch | null {
  const match = matches.get(matchId);
  if (!match) return null;
  if (!match.settings.spectatorsAllowed) return null;

  if (!match.spectators.includes(userId)) {
    match.spectators.push(userId);
  }

  // Also add as spectator player record
  if (!match.players[userId]) {
    match.players[userId] = {
      userId,
      nickname,
      teamId: null,
      role: 'spectator',
      connected: true,
    };
  }

  return match;
}

export function leaveMatch(matchId: string, userId: string): WWWMatch | null {
  const match = matches.get(matchId);
  if (!match) return null;

  const player = match.players[userId];
  if (player) {
    // Remove from team
    if (player.teamId) {
      const team = match.teams.find(t => t.id === player.teamId);
      if (team) {
        team.playerIds = team.playerIds.filter(id => id !== userId);
        if (team.captainId === userId) {
          team.captainId = team.playerIds[0] ?? null;
          if (team.captainId) {
            const newCaptain = match.players[team.captainId];
            if (newCaptain) newCaptain.role = 'captain';
          }
        }
      }
    }
    delete match.players[userId];
  }

  match.spectators = match.spectators.filter(id => id !== userId);
  return match;
}

export function joinTeam(matchId: string, userId: string, teamId: string): WWWMatch | null {
  const match = matches.get(matchId);
  if (!match) return null;

  const player = match.players[userId];
  if (!player || player.role === 'spectator') return null;

  const targetTeam = match.teams.find(t => t.id === teamId);
  if (!targetTeam) return null;

  // Remove from old team
  if (player.teamId) {
    const oldTeam = match.teams.find(t => t.id === player.teamId);
    if (oldTeam) {
      oldTeam.playerIds = oldTeam.playerIds.filter(id => id !== userId);
      if (oldTeam.captainId === userId) {
        oldTeam.captainId = oldTeam.playerIds[0] ?? null;
        if (oldTeam.captainId) {
          const newCap = match.players[oldTeam.captainId];
          if (newCap) newCap.role = 'captain';
        }
      }
    }
    player.role = 'player';
  }

  // Join new team
  if (!targetTeam.playerIds.includes(userId)) {
    targetTeam.playerIds.push(userId);
  }
  player.teamId = teamId;

  // Auto-assign captain if none
  if (!targetTeam.captainId) {
    targetTeam.captainId = userId;
    player.role = 'captain';
  }

  return match;
}

export function assignCaptain(matchId: string, hostId: string, targetUserId: string, teamId: string): WWWMatch | null {
  const match = matches.get(matchId);
  if (!match || match.hostId !== hostId) return null;

  const team = match.teams.find(t => t.id === teamId);
  if (!team) return null;

  const target = match.players[targetUserId];
  if (!target || target.teamId !== teamId) return null;

  // Demote old captain
  if (team.captainId && match.players[team.captainId]) {
    match.players[team.captainId].role = 'player';
  }

  team.captainId = targetUserId;
  target.role = 'captain';
  return match;
}

export function startMatch(matchId: string, hostId: string): WWWMatch | null {
  const match = matches.get(matchId);
  if (!match || match.hostId !== hostId) return null;
  if (match.status !== 'waiting') return null;

  match.questionIds = selectQuestions(match.settings);
  match.currentQuestionIndex = 0;
  match.submittedAnswers = {};
  match.status = 'question';

  return match;
}

export function advanceToDiscussion(matchId: string): WWWMatch | null {
  const match = matches.get(matchId);
  if (!match) return null;
  if (match.status !== 'question') return null;

  match.status = 'discussion';
  match.timerEndsAt = Date.now() + match.settings.discussionSeconds * 1000;
  match.submittedAnswers = {};

  return match;
}

export function submitAnswer(matchId: string, userId: string, answerText: string): WWWMatch | null {
  const match = matches.get(matchId);
  if (!match) return null;
  if (match.status !== 'discussion' && match.status !== 'answering') return null;

  const player = match.players[userId];
  if (!player || player.role !== 'captain') return null;
  if (!player.teamId) return null;

  // Don't allow double submission
  if (match.submittedAnswers[player.teamId]) return null;

  match.submittedAnswers[player.teamId] = {
    teamId: player.teamId,
    captainId: userId,
    answerText: answerText.trim().slice(0, 500),
    submittedAt: Date.now(),
  };

  // Check if all teams with captains have submitted
  const teamsWithCaptains = match.teams.filter(t => t.captainId && t.playerIds.length > 0);
  const allSubmitted = teamsWithCaptains.every(t => match.submittedAnswers[t.id]);

  if (allSubmitted) {
    match.status = 'judging';
    match.timerEndsAt = null;
  } else {
    match.status = 'answering';
  }

  return match;
}

export function judgeAnswer(matchId: string, judgeId: string, teamId: string, isCorrect: boolean, judgeNote?: string): WWWMatch | null {
  const match = matches.get(matchId);
  if (!match) return null;
  if (match.status !== 'judging') return null;

  // Only host can judge
  if (match.hostId !== judgeId) return null;

  const answer = match.submittedAnswers[teamId];
  if (!answer) return null;

  answer.isCorrect = isCorrect;
  if (judgeNote) answer.judgeNote = judgeNote;

  if (isCorrect) {
    match.scores[teamId] = (match.scores[teamId] ?? 0) + 1;
  }

  // Check if all submitted answers are judged
  const allJudged = Object.values(match.submittedAnswers).every(a => a.isCorrect !== undefined);
  if (allJudged) {
    match.status = 'round_result';
  }

  return match;
}

export function nextQuestion(matchId: string, hostId: string): WWWMatch | null {
  const match = matches.get(matchId);
  if (!match || match.hostId !== hostId) return null;
  if (match.status !== 'round_result') return null;

  match.currentQuestionIndex++;

  if (match.currentQuestionIndex >= match.questionIds.length) {
    match.status = 'finished';
  } else {
    match.status = 'question';
    match.submittedAnswers = {};
    match.timerEndsAt = null;
  }

  return match;
}

export function sendChat(matchId: string, userId: string, nickname: string, text: string): WWWMatch | null {
  const match = matches.get(matchId);
  if (!match) return null;

  const cleaned = text.trim().slice(0, 300);
  if (!cleaned) return null;

  match.chat.push({ userId, nickname, text: cleaned, ts: Date.now() });
  if (match.chat.length > 200) match.chat = match.chat.slice(-200);

  return match;
}

export function handleDisconnect(userId: string): void {
  for (const match of matches.values()) {
    const player = match.players[userId];
    if (player) {
      player.connected = false;
    }
  }
}

export function toPublic(match: WWWMatch): WWWMatchPublic {
  const currentQId = match.questionIds[match.currentQuestionIndex];
  const currentQuestion = (match.status !== 'waiting' && currentQId)
    ? getQuestionById(currentQId)
    : null;

  return {
    id: match.id,
    code: match.code,
    status: match.status,
    hostId: match.hostId,
    players: { ...match.players },
    spectators: [...match.spectators],
    settings: { ...match.settings },
    teams: match.teams.map(t => ({ ...t, playerIds: [...t.playerIds] })),
    currentQuestion,
    currentQuestionIndex: match.currentQuestionIndex,
    totalQuestions: match.questionIds.length,
    submittedAnswers: { ...match.submittedAnswers },
    scores: { ...match.scores },
    timerEndsAt: match.timerEndsAt,
    voiceSessionId: match.voiceSessionId,
    chat: match.chat.slice(-80),
  };
}
