import { randomBytes } from 'crypto';

// ── Types ──────────────────────────────────────────────────────────────────
export type WWWDifficulty = 'easy' | 'medium' | 'hard' | 'mixed';
export type WWWCategory = 'philosophy' | 'history' | 'science' | 'movies' | 'literature' | 'geography' | 'psychology' | 'logic' | 'general' | 'mixed';
export type WWWMode = 'team' | 'single_team';
export type WWWStatus = 'waiting' | 'question' | 'discussion' | 'judging' | 'round_result' | 'finished';
export type WWWRole = 'player' | 'captain' | 'spectator';

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
  spectatorsAllowed: boolean;
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

export interface WWWChat {
  userId: string;
  nickname: string;
  text: string;
  ts: number;
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
  selectedQuestions: WWWQuestion[];
  currentQuestionIndex: number;
  submittedAnswers: Record<string, WWWSubmittedAnswer>;
  scores: Record<string, number>;
  timerEndsAt: number | null;
  voiceSessionId: string;
  chat: WWWChat[];
  createdAt: number;
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
  chat: WWWChat[];
}

export interface WWWMatchListItem {
  id: string;
  code: string;
  status: WWWStatus;
  playerCount: number;
  mode: WWWMode;
  category: WWWCategory;
  hostNickname: string;
}

// ── Question Bank ──────────────────────────────────────────────────────────
const QUESTION_BANK: WWWQuestion[] = [
  { id:'q01', category:'philosophy', difficulty:'easy', questionText:'რომელ ფილოსოფოსს ეკუთვნის გამოთქმა "ვფიქრობ, მაშასადამე ვარსებობ"?', correctAnswer:'რენე დეკარტი', explanation:'ლათ. "Cogito, ergo sum" — XVII საუკუნის ფრანგი ფილოსოფოსი.' },
  { id:'q02', category:'philosophy', difficulty:'medium', questionText:'"ნება ძალაა" — ვის ფილოსოფიაში ცენტრალური ცნებაა?', correctAnswer:'ფრიდრიხ ნიცშე', explanation:'"Wille zur Macht" ნიცშეს გამოჩენილი კონცეფციაა.' },
  { id:'q03', category:'philosophy', difficulty:'medium', questionText:'ვინ დაწერა "კრიტიკა სუფთა გონებისა"?', correctAnswer:'იმანუელ კანტი', explanation:'კანტის მთავარი ფილოსოფიური ნაშრომი, 1781 წ.' },
  { id:'q04', category:'philosophy', difficulty:'hard', questionText:'სოკრატეს სასწავლო მეთოდი, სადაც კითხვებით ეხმარება სტუდენტს ჭეშმარიტების "გამოჩეკაში", ეწოდება?', correctAnswer:'მაიევტიკა', explanation:'ბერძ. maieutikē — "მეანობის ხელოვნება".' },
  { id:'q05', category:'philosophy', difficulty:'easy', questionText:'ატომის თეორიის ფილოსოფოსი ძველ საბერძნეთში?', correctAnswer:'დემოკრიტე', explanation:'ძვ.წ. V ს. ბერძენი ფილოსოფოსი, ატომიზმის ფუძემდებელი.' },
  { id:'q06', category:'history', difficulty:'easy', questionText:'ვინ გახდა კოსმოსში პირველი ადამიანი?', correctAnswer:'იური გაგარინი', explanation:'1961 წლის 12 აპრილი — "ვოსტოკ 1"-ით.' },
  { id:'q07', category:'history', difficulty:'medium', questionText:'ვატერლოოს ბრძოლაში (1815) ვინ განიცადა საბოლოო მარცხი?', correctAnswer:'ნაპოლეონ ბონაპარტი', explanation:'ბრიტანეთ-პრუსიის ალიანსმა დაამარცხა.' },
  { id:'q08', category:'history', difficulty:'easy', questionText:'პირველი ოლიმპიური თამაშები ძველ საბერძნეთში სად ჩატარდა?', correctAnswer:'ოლიმპია', explanation:'ძვ.წ. 776 წ. — პელოპონესის ნახევარკუნძულზე.' },
  { id:'q09', category:'history', difficulty:'hard', questionText:'ბაბილონი ვინ დაიპყრო ძვ.წ. 539 წელს?', correctAnswer:'კვიროს II (სპარსეთი)', explanation:'სპარსეთის მეფემ ბაბილონი დაიპყრო სისხლისღვრის გარეშე.' },
  { id:'q10', category:'history', difficulty:'medium', questionText:'რომელ წელს დაიწყო პირველი მსოფლიო ომი?', correctAnswer:'1914', explanation:'1914 წლის 28 ივლისი — ომის გამოცხადება.' },
  { id:'q11', category:'science', difficulty:'easy', questionText:'ოქროს ქიმიური სიმბოლო?', correctAnswer:'Au', explanation:'ლათ. Aurum — ატომური ნომერი 79.' },
  { id:'q12', category:'science', difficulty:'easy', questionText:'წყლის ქიმიური ფორმულა?', correctAnswer:'H₂O', explanation:'ორი წყალბადი და ერთი ჟანგბადი.' },
  { id:'q13', category:'science', difficulty:'medium', questionText:'DNA-ს ორმაგი სპირალი ვინ აღმოაჩინა?', correctAnswer:'უოტსონი და კრიკი', explanation:'1953 წელს ჯეიმს უოტსონმა და ფრენსის კრიკმა.' },
  { id:'q14', category:'science', difficulty:'medium', questionText:'სინათლის სიჩქარე ვაკუუმში (მიახ.)?', correctAnswer:'300,000 კმ/წმ', explanation:'ზუსტი: 299,792,458 მ/წმ.' },
  { id:'q15', category:'science', difficulty:'hard', questionText:'ატომური ნომერი 79 — რომელი ელემენტი?', correctAnswer:'ოქრო', explanation:'Au, ატომური მასა 196.97.' },
  { id:'q16', category:'movies', difficulty:'easy', questionText:'"ტიტანიკი" (1997) ვინ გადაიღო?', correctAnswer:'ჯეიმს კემერონი', explanation:'11 ოსკარი, 1,84 მლრდ $ კასაში.' },
  { id:'q17', category:'movies', difficulty:'medium', questionText:'"ვარსკვლავური ომები" (1977) ვინ გადაიღო?', correctAnswer:'ჯორჯ ლუკასი', explanation:'კოსმოსური ეპოსი, რომელმაც კინოინდუსტრია შეცვალა.' },
  { id:'q18', category:'movies', difficulty:'medium', questionText:'"მატრიქსი" (1999) ვინ გადაიღო?', correctAnswer:'ვაჩოვსკის დები', explanation:'ლანა და ლილი ვაჩოვსკი.' },
  { id:'q19', category:'movies', difficulty:'hard', questionText:'ყველაზე მეტი ოსკარის ჯილდო მოიგო ერთდროულად — 11 ჯილდო. რომელი ფილმები?', correctAnswer:'ბენ-ჰური, ტიტანიკი, ბეჭდების მბრძანებელი (მეფის დაბრუნება)', explanation:'სამივე ფილმმა 11 ოსკარი მოიგო.' },
  { id:'q20', category:'movies', difficulty:'easy', questionText:'"ლომი მეფე" (The Lion King, 1994) — ანიმაციური ფილმი ვის მიერ?', correctAnswer:'Disney', explanation:'ვოლტ დიზნიის კლასიკური ანიმაცია.' },
  { id:'q21', category:'literature', difficulty:'easy', questionText:'"პატარა უფლისწული" ვინ დაწერა?', correctAnswer:'ანტუან დე სენტ-ეგზიუპერი', explanation:'1943 წ. ფრანგი ავტორის შედევრი.' },
  { id:'q22', category:'literature', difficulty:'easy', questionText:'"ომი და მშვიდობა" ვინ დაწერა?', correctAnswer:'ლევ ტოლსტოი', explanation:'1869 წ. რუსი მწერლის ეპიკური რომანი.' },
  { id:'q23', category:'literature', difficulty:'easy', questionText:'"ჰამლეტი" ვინ დაწერა?', correctAnswer:'უილიამ შექსპირი', explanation:'ინგლისელი დრამატურგი, XVI-XVII სს.' },
  { id:'q24', category:'literature', difficulty:'medium', questionText:'"კარამაზოვის ძმები" ვინ დაწერა?', correctAnswer:'ფიოდორ დოსტოევსკი', explanation:'1880 წ. ფსიქოლოგიური მასტერპისი.' },
  { id:'q25', category:'literature', difficulty:'easy', questionText:'"ვეფხისტყაოსანი" ვინ დაწერა?', correctAnswer:'შოთა რუსთველი', explanation:'XII ს. ქართული პოეტური შედევრი.' },
  { id:'q26', category:'geography', difficulty:'easy', questionText:'მსოფლიოში ყველაზე დიდი ქვეყანა ფართობით?', correctAnswer:'რუსეთი', explanation:'17+ მლნ კვ.კმ.' },
  { id:'q27', category:'geography', difficulty:'easy', questionText:'ყველაზე მაღალი მთა მსოფლიოში?', correctAnswer:'ევერესტი', explanation:'8,849 მ, ჰიმალაი.' },
  { id:'q28', category:'geography', difficulty:'medium', questionText:'ყველაზე პატარა ქვეყანა მსოფლიოში?', correctAnswer:'ვატიკანი', explanation:'0.44 კვ.კმ, რომის შიგნით.' },
  { id:'q29', category:'geography', difficulty:'medium', questionText:'მსოფლიოს ყველაზე გრძელი მდინარე?', correctAnswer:'ნილოსი', explanation:'6,650 კმ, აფრიკა.' },
  { id:'q30', category:'logic', difficulty:'easy', questionText:'თუ ყველა კაცი სიკვდილია, სოკრატე კაცია — მაშ სოკრატე...?', correctAnswer:'სიკვდილია', explanation:'კლასიკური სილოგიზმი — ლოგიკის ძირითადი მაგალითი.' },
  { id:'q31', category:'logic', difficulty:'medium', questionText:'ნაგვის ურნა 10 კვირაში ივსება. მე-10 კვირაზე სავსეა. მე-9 კვირაზე?', correctAnswer:'ნახევარი', explanation:'თუ 10-ე კვირაზე ივსება, 9-ე კვირაზე ნახევარი უნდა ყოფილიყო.' },
  { id:'q32', category:'logic', difficulty:'hard', questionText:'მდინარეს 3 მეთევზე ჭერს. თითოეულმა დამოუკიდებლად დაიჭირა 3 თევზი. სულ რამდენი?', correctAnswer:'9', explanation:'3 × 3 = 9.' },
  { id:'q33', category:'general', difficulty:'easy', questionText:'ჩინეთის დიდი კედლის სიგრძე (დაახლ.)?', correctAnswer:'21,000 კმ', explanation:'ყველა განშტოებებით — ყველაზე გრძელი ნაგებობა.' },
  { id:'q34', category:'general', difficulty:'easy', questionText:'FIFA World Cup რამდენ წელიწადში ერთხელ ჩატარდება?', correctAnswer:'4 წელიწადში', explanation:'1930 წლიდან — ყოველ 4 წელიწადში.' },
  { id:'q35', category:'general', difficulty:'medium', questionText:'სად არის ათინის სახელგანთქმული პართენონი?', correctAnswer:'ათენი, საბერძნეთი (აკროპოლისი)', explanation:'ძვ.წ. 438 წ. აშენდა ათენას საპატივად.' },
];

// ── In-memory state ────────────────────────────────────────────────────────
const matches = new Map<string, WWWMatch>();
const userMatchMap = new Map<string, string>(); // userId -> matchId

function generateCode(): string {
  return randomBytes(3).toString('hex').toUpperCase();
}

function getQuestionsForMatch(settings: WWWSettings): WWWQuestion[] {
  let pool = [...QUESTION_BANK];
  if (settings.questionCategory !== 'mixed') {
    pool = pool.filter(q => q.category === settings.questionCategory);
    if (pool.length < settings.questionsCount) pool = [...QUESTION_BANK];
  }
  if (settings.difficulty !== 'mixed') {
    const filtered = pool.filter(q => q.difficulty === settings.difficulty);
    if (filtered.length >= settings.questionsCount) pool = filtered;
  }
  // shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, Math.min(settings.questionsCount, pool.length));
}

export function toPublic(match: WWWMatch): WWWMatchPublic {
  return {
    id: match.id,
    code: match.code,
    status: match.status,
    hostId: match.hostId,
    players: match.players,
    spectators: match.spectators,
    settings: match.settings,
    teams: match.teams,
    currentQuestion: match.status !== 'waiting' && match.status !== 'finished'
      ? (match.selectedQuestions[match.currentQuestionIndex] ?? null)
      : null,
    currentQuestionIndex: match.currentQuestionIndex,
    totalQuestions: match.selectedQuestions.length,
    submittedAnswers: match.submittedAnswers,
    scores: match.scores,
    timerEndsAt: match.timerEndsAt,
    voiceSessionId: match.voiceSessionId,
    chat: match.chat.slice(-50),
  };
}

const DEFAULT_SETTINGS: WWWSettings = {
  mode: 'team',
  maxTeams: 2,
  maxPlayersPerTeam: 6,
  questionsCount: 10,
  discussionSeconds: 60,
  spectatorsAllowed: true,
  hostIsJudge: true,
  autoRevealAnswer: true,
  questionCategory: 'mixed',
  difficulty: 'mixed',
};

export function createMatch(hostId: string, nickname: string, partial: Partial<WWWSettings> = {}): WWWMatch {
  const id = randomBytes(8).toString('hex');
  const settings = { ...DEFAULT_SETTINGS, ...partial };
  const voiceSessionId = randomBytes(6).toString('hex');
  const code = generateCode();

  const teamA: WWWTeam = { id: 'team_a', name: 'გუნდი A', color: '#ff2244', captainId: hostId, playerIds: [hostId] };
  const teamB: WWWTeam = { id: 'team_b', name: 'გუნდი B', color: '#0090ff', captainId: null, playerIds: [] };

  const match: WWWMatch = {
    id, code, status: 'waiting', hostId,
    players: { [hostId]: { userId: hostId, nickname, teamId: 'team_a', role: 'captain', connected: true } },
    spectators: [],
    settings,
    teams: [teamA, teamB],
    selectedQuestions: [],
    currentQuestionIndex: 0,
    submittedAnswers: {},
    scores: { team_a: 0, team_b: 0 },
    timerEndsAt: null,
    voiceSessionId,
    chat: [],
    createdAt: Date.now(),
  };

  matches.set(id, match);
  userMatchMap.set(hostId, id);

  // cleanup after 2 hours
  setTimeout(() => { if (matches.has(id)) matches.delete(id); }, 2 * 60 * 60 * 1000);

  return match;
}

export function getMatch(matchId: string): WWWMatch | null {
  return matches.get(matchId) ?? null;
}

export function getMatchByCode(code: string): WWWMatch | null {
  for (const m of matches.values()) {
    if (m.code === code.toUpperCase()) return m;
  }
  return null;
}

export function getMatchList(): WWWMatchListItem[] {
  const result: WWWMatchListItem[] = [];
  for (const m of matches.values()) {
    if (m.status === 'finished') continue;
    const hostPlayer = m.players[m.hostId];
    result.push({
      id: m.id, code: m.code, status: m.status,
      playerCount: Object.keys(m.players).length,
      mode: m.settings.mode,
      category: m.settings.questionCategory,
      hostNickname: hostPlayer?.nickname ?? 'Unknown',
    });
  }
  return result;
}

export function joinMatch(matchId: string, userId: string, nickname: string): WWWMatch | null {
  const match = matches.get(matchId);
  if (!match || match.status !== 'waiting') return null;
  if (match.players[userId]) {
    match.players[userId]!.connected = true;
    return match;
  }
  match.players[userId] = { userId, nickname, teamId: null, role: 'player', connected: true };
  userMatchMap.set(userId, matchId);
  return match;
}

export function spectateMatch(matchId: string, userId: string, nickname: string): WWWMatch | null {
  const match = matches.get(matchId);
  if (!match) return null;
  if (!match.settings.spectatorsAllowed) return null;
  if (!match.spectators.includes(userId)) match.spectators.push(userId);
  if (!match.players[userId]) {
    match.players[userId] = { userId, nickname, teamId: null, role: 'spectator', connected: true };
  }
  userMatchMap.set(userId, matchId);
  return match;
}

export function leaveMatch(matchId: string, userId: string): WWWMatch | null {
  const match = matches.get(matchId);
  if (!match) return null;

  if (match.players[userId]) {
    match.players[userId]!.connected = false;
    const teamId = match.players[userId]!.teamId;
    if (teamId) {
      const team = match.teams.find(t => t.id === teamId);
      if (team) {
        team.playerIds = team.playerIds.filter(id => id !== userId);
        if (team.captainId === userId) {
          team.captainId = team.playerIds[0] ?? null;
          if (team.captainId && match.players[team.captainId]) {
            match.players[team.captainId]!.role = 'captain';
          }
        }
      }
    }
  }
  match.spectators = match.spectators.filter(id => id !== userId);
  userMatchMap.delete(userId);

  // If host leaves, assign new host
  if (userId === match.hostId) {
    const remaining = Object.values(match.players).filter(p => p.connected && p.userId !== userId);
    if (remaining.length > 0) {
      match.hostId = remaining[0]!.userId;
    } else {
      matches.delete(matchId);
      return null;
    }
  }
  return match;
}

export function joinTeam(matchId: string, userId: string, teamId: string): WWWMatch | null {
  const match = matches.get(matchId);
  if (!match || match.status !== 'waiting') return null;
  const player = match.players[userId];
  if (!player || player.role === 'spectator') return null;

  // Remove from old team
  if (player.teamId) {
    const oldTeam = match.teams.find(t => t.id === player.teamId);
    if (oldTeam) {
      oldTeam.playerIds = oldTeam.playerIds.filter(id => id !== userId);
      if (oldTeam.captainId === userId) {
        oldTeam.captainId = oldTeam.playerIds[0] ?? null;
        if (oldTeam.captainId && match.players[oldTeam.captainId]) {
          match.players[oldTeam.captainId]!.role = 'captain';
        }
      }
    }
  }

  const team = match.teams.find(t => t.id === teamId);
  if (!team) return null;
  if (!team.playerIds.includes(userId)) team.playerIds.push(userId);
  player.teamId = teamId;

  if (!team.captainId) {
    team.captainId = userId;
    player.role = 'captain';
  } else {
    player.role = 'player';
  }
  return match;
}

export function assignCaptain(matchId: string, hostId: string, targetUserId: string, teamId: string): WWWMatch | null {
  const match = matches.get(matchId);
  if (!match || match.hostId !== hostId) return null;
  const team = match.teams.find(t => t.id === teamId);
  if (!team || !team.playerIds.includes(targetUserId)) return null;

  // Demote old captain
  if (team.captainId && match.players[team.captainId]) {
    match.players[team.captainId]!.role = 'player';
  }
  team.captainId = targetUserId;
  if (match.players[targetUserId]) {
    match.players[targetUserId]!.role = 'captain';
  }
  return match;
}

export function startMatch(matchId: string, hostId: string): WWWMatch | null {
  const match = matches.get(matchId);
  if (!match || match.hostId !== hostId || match.status !== 'waiting') return null;

  match.selectedQuestions = getQuestionsForMatch(match.settings);
  match.currentQuestionIndex = 0;
  match.submittedAnswers = {};
  match.status = 'question';
  return match;
}

export function startDiscussion(matchId: string, hostId: string): WWWMatch | null {
  const match = matches.get(matchId);
  if (!match || match.hostId !== hostId || match.status !== 'question') return null;
  match.status = 'discussion';
  match.timerEndsAt = Date.now() + match.settings.discussionSeconds * 1000;
  match.submittedAnswers = {};
  return match;
}

export function submitAnswer(matchId: string, userId: string, answerText: string): WWWMatch | null {
  const match = matches.get(matchId);
  if (!match || match.status !== 'discussion') return null;
  const player = match.players[userId];
  if (!player || player.role !== 'captain' || !player.teamId) return null;

  match.submittedAnswers[player.teamId] = {
    teamId: player.teamId,
    captainId: userId,
    answerText: answerText.trim(),
    submittedAt: Date.now(),
  };

  // If all teams submitted, move to judging
  const teamsWithPlayers = match.teams.filter(t => t.playerIds.length > 0);
  const allSubmitted = teamsWithPlayers.every(t => match.submittedAnswers[t.id]);
  if (allSubmitted) {
    match.status = 'judging';
    match.timerEndsAt = null;
  }
  return match;
}

export function judgeAnswer(matchId: string, judgeId: string, teamId: string, isCorrect: boolean, judgeNote?: string): WWWMatch | null {
  const match = matches.get(matchId);
  if (!match || match.hostId !== judgeId) return null;
  if (!['discussion', 'judging'].includes(match.status)) return null;

  const answer = match.submittedAnswers[teamId];
  if (!answer) return null;
  answer.isCorrect = isCorrect;
  if (judgeNote) answer.judgeNote = judgeNote;

  if (isCorrect) {
    match.scores[teamId] = (match.scores[teamId] ?? 0) + 1;
  }

  // Check if all teams are judged
  const teamsWithAnswers = Object.keys(match.submittedAnswers);
  const allJudged = teamsWithAnswers.every(tid => match.submittedAnswers[tid]?.isCorrect !== undefined);
  if (allJudged) {
    match.status = 'round_result';
    match.timerEndsAt = null;
  }
  return match;
}

export function nextQuestion(matchId: string, hostId: string): WWWMatch | null {
  const match = matches.get(matchId);
  if (!match || match.hostId !== hostId || match.status !== 'round_result') return null;

  match.currentQuestionIndex += 1;
  match.submittedAnswers = {};
  match.timerEndsAt = null;

  if (match.currentQuestionIndex >= match.selectedQuestions.length) {
    match.status = 'finished';
  } else {
    match.status = 'question';
  }
  return match;
}

export function sendChat(matchId: string, userId: string, nickname: string, text: string): WWWMatch | null {
  const match = matches.get(matchId);
  if (!match) return null;
  match.chat.push({ userId, nickname, text: text.slice(0, 300), ts: Date.now() });
  if (match.chat.length > 200) match.chat = match.chat.slice(-200);
  return match;
}

export function handleDisconnect(userId: string): string | null {
  const matchId = userMatchMap.get(userId);
  if (!matchId) return null;
  const match = matches.get(matchId);
  if (match?.players[userId]) {
    match.players[userId]!.connected = false;
  }
  userMatchMap.delete(userId);
  return matchId;
}
