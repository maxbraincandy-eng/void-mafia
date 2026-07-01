import { randomBytes } from 'crypto';
// ── Question Bank (35 Georgian questions) ─────────────────────────────────
const QUESTIONS = [
    { id: 'q01', category: 'ფილოსოფია', difficulty: 'easy', questionText: 'რომელ ფილოსოფოსს ეკუთვნის გამოთქმა \"ვფიქრობ, მაშასადამე ვარსებობ\"?', correctAnswer: 'რენე დეკარტი', explanation: 'ლათ. \"Cogito, ergo sum\" — XVII ს. ფრანგი ფილოსოფოსი.' },
    { id: 'q02', category: 'ფილოსოფია', difficulty: 'medium', questionText: '\"ნება ძალაა\" — ვის ფილოსოფიაში ცენტრალური ცნებაა?', correctAnswer: 'ფრიდრიხ ნიცშე', explanation: '\"Wille zur Macht\" ნიცშეს მთავარი კონცეფციაა.' },
    { id: 'q03', category: 'ფილოსოფია', difficulty: 'medium', questionText: 'ვინ დაწერა \"კრიტიკა სუფთა გონებისა\"?', correctAnswer: 'იმანუელ კანტი', explanation: 'კანტის მთავარი ფილოსოფიური ნაშრომი, 1781 წ.' },
    { id: 'q04', category: 'ფილოსოფია', difficulty: 'hard', questionText: 'სოკრატეს სასწავლო მეთოდი, სადაც კითხვებით ეხმარება სტუდენტს ჭეშმარიტების \"გამოჩეკაში\", ეწოდება?', correctAnswer: 'მაიევტიკა', explanation: 'ბერძ. maieutikē — \"მეანობის ხელოვნება\".' },
    { id: 'q05', category: 'ფილოსოფია', difficulty: 'easy', questionText: 'ატომის თეორიის ფუძემდებელი ძველ საბერძნეთში?', correctAnswer: 'დემოკრიტე', explanation: 'ძვ.წ. V ს. ბერძენი ფილოსოფოსი.' },
    { id: 'q06', category: 'ისტორია', difficulty: 'easy', questionText: 'ვინ გახდა კოსმოსში პირველი ადამიანი?', correctAnswer: 'იური გაგარინი', explanation: '1961 წლის 12 აპრილი — \"ვოსტოკ 1\"-ით.' },
    { id: 'q07', category: 'ისტორია', difficulty: 'medium', questionText: 'ვატერლოოს ბრძოლაში (1815) ვინ განიცადა საბოლოო მარცხი?', correctAnswer: 'ნაპოლეონ ბონაპარტი', explanation: 'ბრიტანეთ-პრუსიის ალიანსმა დაამარცხა.' },
    { id: 'q08', category: 'ისტორია', difficulty: 'easy', questionText: 'პირველი ოლიმპიური თამაშები ძველ საბერძნეთში სად ჩატარდა?', correctAnswer: 'ოლიმპია', explanation: 'ძვ.წ. 776 წ. — პელოპონესზე.' },
    { id: 'q09', category: 'ისტორია', difficulty: 'hard', questionText: 'ბაბილონი ვინ დაიპყრო ძვ.წ. 539 წელს?', correctAnswer: 'კვიროს II (სპარსეთი)', explanation: 'სპარსეთის მეფემ ბაბილონი სისხლისღვრის გარეშე დაიპყრო.' },
    { id: 'q10', category: 'ისტორია', difficulty: 'medium', questionText: 'რომელ წელს დაიწყო პირველი მსოფლიო ომი?', correctAnswer: '1914', explanation: '1914 წლის 28 ივლისი — ომის გამოცხადება.' },
    { id: 'q11', category: 'მეცნიერება', difficulty: 'easy', questionText: 'ოქროს ქიმიური სიმბოლო?', correctAnswer: 'Au', explanation: 'ლათ. Aurum — ატომური ნომერი 79.' },
    { id: 'q12', category: 'მეცნიერება', difficulty: 'easy', questionText: 'წყლის ქიმიური ფორმულა?', correctAnswer: 'H₂O', explanation: 'ორი წყალბადი და ერთი ჟანგბადი.' },
    { id: 'q13', category: 'მეცნიერება', difficulty: 'medium', questionText: 'DNA-ს ორმაგი სპირალი ვინ აღმოაჩინა?', correctAnswer: 'უოტსონი და კრიკი', explanation: '1953 წელს ჯეიმს უოტსონმა და ფრენსის კრიკმა.' },
    { id: 'q14', category: 'მეცნიერება', difficulty: 'medium', questionText: 'სინათლის სიჩქარე ვაკუუმში (მიახ.)?', correctAnswer: '300 000 კმ/წმ', explanation: 'ზუსტი: 299,792,458 მ/წმ.' },
    { id: 'q15', category: 'მეცნიერება', difficulty: 'hard', questionText: 'ატომური ნომერი 79 — რომელი ელემენტი?', correctAnswer: 'ოქრო', explanation: 'Au, ატომური მასა 196.97.' },
    { id: 'q16', category: 'კინო', difficulty: 'easy', questionText: '\"ტიტანიკი\" (1997) ვინ გადაიღო?', correctAnswer: 'ჯეიმს კემერონი', explanation: '11 ოსკარი, 1,84 მლრდ $ კასაში.' },
    { id: 'q17', category: 'კინო', difficulty: 'medium', questionText: '\"ვარსკვლავური ომები\" (1977) ვინ გადაიღო?', correctAnswer: 'ჯორჯ ლუკასი', explanation: 'კოსმოსური ეპოსი.' },
    { id: 'q18', category: 'კინო', difficulty: 'medium', questionText: '\"მატრიქსი\" (1999) ვინ გადაიღო?', correctAnswer: 'ვაჩოვსკის დები', explanation: 'ლანა და ლილი ვაჩოვსკი.' },
    { id: 'q19', category: 'კინო', difficulty: 'hard', questionText: 'რომელმა 3 ფილმმა 11 ოსკარი მოიგო?', correctAnswer: 'ბენ-ჰური, ტიტანიკი, ბეჭდების მბრძანებელი', explanation: 'სამივე ფილმმა 11 ოსკარი მოიგო.' },
    { id: 'q20', category: 'კინო', difficulty: 'easy', questionText: '\"ლომი მეფე\" (1994) — ანიმაციური ფილმი ვის მიერ?', correctAnswer: 'Disney', explanation: 'ვოლტ დიზნიის კლასიკური ანიმაცია.' },
    { id: 'q21', category: 'ლიტერატურა', difficulty: 'easy', questionText: '\"პატარა უფლისწული\" ვინ დაწერა?', correctAnswer: 'ანტუან დე სენტ-ეგზიუპერი', explanation: '1943 წ. ფრანგი ავტორის შედევრი.' },
    { id: 'q22', category: 'ლიტერატურა', difficulty: 'easy', questionText: '\"ომი და მშვიდობა\" ვინ დაწერა?', correctAnswer: 'ლევ ტოლსტოი', explanation: '1869 წ. რუსი მწერლის ეპიკური რომანი.' },
    { id: 'q23', category: 'ლიტერატურა', difficulty: 'easy', questionText: '\"ჰამლეტი\" ვინ დაწერა?', correctAnswer: 'უილიამ შექსპირი', explanation: 'ინგლისელი დრამატურგი, XVI-XVII სს.' },
    { id: 'q24', category: 'ლიტერატურა', difficulty: 'medium', questionText: '\"კარამაზოვის ძმები\" ვინ დაწერა?', correctAnswer: 'ფიოდორ დოსტოევსკი', explanation: '1880 წ. ფსიქოლოგიური შედევრი.' },
    { id: 'q25', category: 'ლიტერატურა', difficulty: 'easy', questionText: '\"ვეფხისტყაოსანი\" ვინ დაწერა?', correctAnswer: 'შოთა რუსთველი', explanation: 'XII ს. ქართული პოეტური შედევრი.' },
    { id: 'q26', category: 'გეოგრაფია', difficulty: 'easy', questionText: 'მსოფლიოში ყველაზე დიდი ქვეყანა ფართობით?', correctAnswer: 'რუსეთი', explanation: '17+ მლნ კვ.კმ.' },
    { id: 'q27', category: 'გეოგრაფია', difficulty: 'easy', questionText: 'ყველაზე მაღალი მთა მსოფლიოში?', correctAnswer: 'ევერესტი', explanation: '8,849 მ, ჰიმალაი.' },
    { id: 'q28', category: 'გეოგრაფია', difficulty: 'medium', questionText: 'ყველაზე პატარა ქვეყანა მსოფლიოში?', correctAnswer: 'ვატიკანი', explanation: '0.44 კვ.კმ, რომის შიგნით.' },
    { id: 'q29', category: 'გეოგრაფია', difficulty: 'medium', questionText: 'მსოფლიოს ყველაზე გრძელი მდინარე?', correctAnswer: 'ნილოსი', explanation: '6,650 კმ, აფრიკა.' },
    { id: 'q30', category: 'ლოგიკა', difficulty: 'easy', questionText: 'თუ ყველა ადამიანი სიკვდილია, სოკრატე ადამიანია — მაშ სოკრატე...?', correctAnswer: 'სიკვდილია', explanation: 'კლასიკური სილოგიზმი.' },
    { id: 'q31', category: 'ლოგიკა', difficulty: 'medium', questionText: 'ნაგვის ყუთი 10 კვირაში ივსება. მე-9 კვირაზე რამდენი სავსეა?', correctAnswer: 'ნახევარი', explanation: 'თუ ორმაგი ზრდა — 9-ე კვირაზე ნახევარი.' },
    { id: 'q32', category: 'ლოგიკა', difficulty: 'hard', questionText: '3 მეთევზე, თითოეულმა 3 თევზი დაიჭირა. სულ რამდენი?', correctAnswer: '9', explanation: '3 × 3 = 9.' },
    { id: 'q33', category: 'ზოგადი ცოდნა', difficulty: 'easy', questionText: 'ჩინეთის დიდი კედლის სიგრძე (დაახ.)?', correctAnswer: '21 000 კმ', explanation: 'ყველა განშტოებებით.' },
    { id: 'q34', category: 'ზოგადი ცოდნა', difficulty: 'easy', questionText: 'FIFA World Cup რამდენ წელიწადში ერთხელ ჩატარდება?', correctAnswer: '4 წელიწადში', explanation: '1930 წლიდან.' },
    { id: 'q35', category: 'ზოგადი ცოდნა', difficulty: 'medium', questionText: 'სად არის ათენის ცნობილი პართენონი?', correctAnswer: 'ათენი, საბერძნეთი (აკროპოლისი)', explanation: 'ძვ.წ. 438 წ. ათენას საპატივად.' },
];
// ── In-memory state ────────────────────────────────────────────────────────
const matches = new Map();
const userMatch = new Map(); // userId → matchId
function code6() { return randomBytes(3).toString('hex').toUpperCase(); }
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
/** First team to this many points wins. */
export const WWW_WIN_SCORE = 10;
export function toPublic(m, viewerId) {
    const q = m.questions[m.currentQuestionIndex] ?? null;
    const showQuestion = m.status !== 'waiting' && m.status !== 'finished';
    // Isolation protocol: while teams are still thinking/being judged, only the
    // host sees every submitted answer; a team member sees ONLY their own team's
    // answer (never the opponent's). Answers are revealed to all once the round
    // result is shown or the game ends.
    const revealed = m.status === 'round_result' || m.status === 'finished';
    const isHost = viewerId != null && viewerId === m.hostId;
    let answers = m.answers;
    if (!revealed && !isHost) {
        const viewerTeam = viewerId != null ? m.players[viewerId]?.teamId : undefined;
        answers = viewerTeam && m.answers[viewerTeam] ? { [viewerTeam]: m.answers[viewerTeam] } : {};
    }
    return {
        id: m.id, code: m.code, status: m.status, hostId: m.hostId,
        players: m.players, settings: m.settings, teams: m.teams,
        currentQuestion: showQuestion ? q : null,
        currentQuestionIndex: m.currentQuestionIndex,
        totalQuestions: m.questions.length,
        answers, scores: m.scores,
        timerEndsAt: m.timerEndsAt, voiceSessionId: m.voiceSessionId,
        chat: m.chat.slice(-60),
    };
}
const TEAM_COLORS = ['#ff2244', '#0090ff', '#22c55e', '#f59e0b'];
const TEAM_NAMES = ['გუნდი A', 'გუნდი B', 'გუნდი C', 'გუნდი D'];
export function createMatch(hostId, nickname, opts = {}) {
    const id = randomBytes(8).toString('hex');
    const settings = {
        maxTeams: 2, maxPlayersPerTeam: 6, questionsCount: 10,
        discussionSeconds: 60, spectatorsAllowed: true, ...opts,
    };
    const teams = [
        { id: 'team_a', name: TEAM_NAMES[0], color: TEAM_COLORS[0], captainId: null, playerIds: [] },
        { id: 'team_b', name: TEAM_NAMES[1], color: TEAM_COLORS[1], captainId: null, playerIds: [] },
    ];
    const scores = { team_a: 0, team_b: 0 };
    const m = {
        id, code: code6(), status: 'waiting', hostId,
        // The creator is the HOST / moderator — not on any team (teamId null,
        // not a spectator). Participants pick Team A or Team B in the lobby.
        players: { [hostId]: { userId: hostId, nickname, teamId: null, isCaptain: false, isSpectator: false, connected: true } },
        settings, teams, questions: [],
        currentQuestionIndex: 0, answers: {}, scores,
        timerEndsAt: null, voiceSessionId: randomBytes(6).toString('hex'),
        chat: [], createdAt: Date.now(),
    };
    matches.set(id, m);
    userMatch.set(hostId, id);
    setTimeout(() => matches.delete(id), 2 * 60 * 60 * 1000);
    return m;
}
export function getMatch(id) { return matches.get(id) ?? null; }
export function getMatchByCode(code) {
    for (const m of matches.values())
        if (m.code === code.toUpperCase())
            return m;
    return null;
}
export function getMatchIdForUser(userId) { return userMatch.get(userId) ?? null; }
export function listMatches() {
    return [...matches.values()]
        .filter(m => m.status !== 'finished')
        .map(m => ({
        id: m.id, code: m.code, status: m.status,
        playerCount: Object.values(m.players).filter(p => !p.isSpectator).length,
        hostNickname: m.players[m.hostId]?.nickname ?? 'Host',
        questionsCount: m.settings.questionsCount,
    }));
}
export function joinMatch(matchId, userId, nickname) {
    const m = matches.get(matchId);
    if (!m)
        return null;
    if (m.players[userId]) {
        m.players[userId].connected = true;
        userMatch.set(userId, matchId);
        return { match: m, isNew: false };
    }
    if (m.status !== 'waiting')
        return null;
    // Auto-assign to team with fewer players
    let targetTeam = m.teams.reduce((a, b) => a.playerIds.length <= b.playerIds.length ? a : b);
    m.players[userId] = { userId, nickname, teamId: targetTeam.id, isCaptain: !targetTeam.captainId, isSpectator: false, connected: true };
    if (!targetTeam.captainId)
        targetTeam.captainId = userId;
    targetTeam.playerIds.push(userId);
    userMatch.set(userId, matchId);
    return { match: m, isNew: true };
}
export function spectateMatch(matchId, userId, nickname) {
    const m = matches.get(matchId);
    if (!m || !m.settings.spectatorsAllowed)
        return null;
    if (!m.players[userId]) {
        m.players[userId] = { userId, nickname, teamId: null, isCaptain: false, isSpectator: true, connected: true };
    }
    else {
        m.players[userId].connected = true;
    }
    userMatch.set(userId, matchId);
    return m;
}
export function leaveMatch(matchId, userId) {
    const m = matches.get(matchId);
    if (!m)
        return null;
    const player = m.players[userId];
    if (player) {
        player.connected = false;
        if (!player.isSpectator && player.teamId) {
            const team = m.teams.find(t => t.id === player.teamId);
            if (team) {
                team.playerIds = team.playerIds.filter(id => id !== userId);
                if (team.captainId === userId) {
                    team.captainId = team.playerIds[0] ?? null;
                    if (team.captainId && m.players[team.captainId]) {
                        m.players[team.captainId].isCaptain = true;
                    }
                }
            }
        }
    }
    userMatch.delete(userId);
    if (userId === m.hostId) {
        const next = Object.values(m.players).find(p => p.connected && p.userId !== userId);
        if (!next) {
            matches.delete(matchId);
            return null;
        }
        m.hostId = next.userId;
    }
    return m;
}
export function assignCaptain(matchId, hostId, teamId, newCaptainId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== hostId)
        return null;
    const team = m.teams.find(t => t.id === teamId);
    if (!team || !team.playerIds.includes(newCaptainId))
        return null;
    if (team.captainId && m.players[team.captainId])
        m.players[team.captainId].isCaptain = false;
    team.captainId = newCaptainId;
    if (m.players[newCaptainId])
        m.players[newCaptainId].isCaptain = true;
    return m;
}
/** Lobby role assignment: a participant picks Team A, Team B, or spectator.
 *  The host stays the moderator (cannot join a team). */
export function setRole(matchId, userId, role) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'waiting')
        return null;
    if (userId === m.hostId)
        return null; // the host is the moderator, not a team member
    const player = m.players[userId];
    if (!player)
        return null;
    // Remove from the current team (reassign captaincy if they were the captain).
    if (player.teamId) {
        const cur = m.teams.find(t => t.id === player.teamId);
        if (cur) {
            cur.playerIds = cur.playerIds.filter(id => id !== userId);
            if (cur.captainId === userId) {
                cur.captainId = cur.playerIds[0] ?? null;
                if (cur.captainId && m.players[cur.captainId])
                    m.players[cur.captainId].isCaptain = true;
            }
        }
    }
    player.isCaptain = false;
    if (role === 'spectator') {
        player.teamId = null;
        player.isSpectator = true;
        return m;
    }
    const team = m.teams.find(t => t.id === role);
    if (!team)
        return null;
    player.teamId = role;
    player.isSpectator = false;
    team.playerIds.push(userId);
    if (!team.captainId) {
        team.captainId = userId;
        player.isCaptain = true;
    }
    return m;
}
export function startMatch(matchId, hostId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== hostId || m.status !== 'waiting')
        return null;
    // Both teams need at least one player (host is the moderator, not a team).
    if (m.teams.some(t => t.playerIds.length === 0))
        return null;
    // Ensure each team has a captain
    for (const team of m.teams) {
        if (team.playerIds.length > 0 && !team.captainId) {
            team.captainId = team.playerIds[0];
            if (m.players[team.captainId])
                m.players[team.captainId].isCaptain = true;
        }
    }
    // Enough questions for a first-to-WWW_WIN_SCORE race (a close game can run
    // ~2×WIN_SCORE rounds), capped by the pool size.
    m.questions = shuffle([...QUESTIONS]).slice(0, Math.min(2 * WWW_WIN_SCORE + 5, QUESTIONS.length));
    m.currentQuestionIndex = 0;
    m.answers = {};
    m.status = 'question';
    return m;
}
export function advanceToDiscussion(matchId, hostId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== hostId || m.status !== 'question')
        return null;
    m.status = 'discussion';
    m.timerEndsAt = Date.now() + m.settings.discussionSeconds * 1000;
    m.answers = {};
    return m;
}
export function submitAnswer(matchId, userId, answerText) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'discussion')
        return null;
    const player = m.players[userId];
    if (!player || !player.isCaptain || !player.teamId)
        return null;
    m.answers[player.teamId] = {
        teamId: player.teamId, captainId: userId,
        answerText: answerText.trim().slice(0, 200), submittedAt: Date.now(),
    };
    // Auto-advance to judging if all active teams submitted
    const activeTeams = m.teams.filter(t => t.playerIds.length > 0);
    if (activeTeams.every(t => m.answers[t.id])) {
        m.status = 'judging';
        m.timerEndsAt = null;
    }
    return m;
}
export function judgeAnswer(matchId, hostId, teamId, isCorrect) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== hostId)
        return null;
    if (m.status !== 'judging' && m.status !== 'discussion')
        return null;
    const answer = m.answers[teamId];
    if (!answer)
        return null;
    // Guard: already judged — do not double-apply
    if (answer.isCorrect !== undefined)
        return null;
    // Only update this specific team's answer
    answer.isCorrect = isCorrect;
    // Score increment only happens once (guarded above)
    if (isCorrect)
        m.scores[teamId] = (m.scores[teamId] ?? 0) + 1;
    // Victory: first team to WWW_WIN_SCORE points ends the game immediately.
    if ((m.scores[teamId] ?? 0) >= WWW_WIN_SCORE) {
        m.status = 'finished';
        m.timerEndsAt = null;
        return m;
    }
    // Check if all submitted answers are judged
    const judged = Object.values(m.answers).filter(a => a.isCorrect !== undefined).length;
    const total = Object.values(m.answers).length;
    if (judged >= total && total > 0) {
        m.status = 'round_result';
        m.timerEndsAt = null;
    }
    return m;
}
export function autoAdvanceToJudging(matchId) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'discussion')
        return null;
    // Fill missing answers for teams that didn't submit
    for (const team of m.teams) {
        if (team.playerIds.length > 0 && !m.answers[team.id]) {
            m.answers[team.id] = {
                teamId: team.id,
                captainId: team.captainId ?? '',
                answerText: '',
                submittedAt: Date.now(),
                isCorrect: undefined,
            };
        }
    }
    m.status = 'judging';
    m.timerEndsAt = null;
    return m;
}
export function nextQuestion(matchId, hostId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== hostId || m.status !== 'round_result')
        return null;
    m.currentQuestionIndex += 1;
    m.answers = {};
    m.timerEndsAt = null;
    m.status = m.currentQuestionIndex >= m.questions.length ? 'finished' : 'question';
    return m;
}
export function sendChat(matchId, userId, nickname, text) {
    const m = matches.get(matchId);
    if (!m)
        return null;
    m.chat.push({ userId, nickname, text: text.slice(0, 300), ts: Date.now() });
    if (m.chat.length > 200)
        m.chat = m.chat.slice(-200);
    return m;
}
export function disconnectUser(userId) {
    const matchId = userMatch.get(userId);
    if (!matchId)
        return null;
    const m = matches.get(matchId);
    if (m?.players[userId])
        m.players[userId].connected = false;
    userMatch.delete(userId);
    return matchId;
}
//# sourceMappingURL=wwwService.js.map