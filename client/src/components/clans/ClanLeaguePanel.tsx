/**
 * Clan League — the weekly, all-clans table.
 *
 * Sits above Clan Wars on the clans page because it is the mode that actually
 * runs: wars need a clan-vs-clan lobby to score, the league scores whatever
 * games your members already play.
 *
 * The rules are printed rather than hidden, because two of them will otherwise
 * look like bugs to the people they affect: a clan with fewer than three
 * contributors is not paid, and a single player's weekly contribution is
 * capped. Both exist so a one-person clan cannot grind past a real one.
 */
import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import type { Res } from '@/types/index';
import { PlayerName } from '@/components/ui/PlayerName';

interface LeagueRow {
  clanId: string; clanName: string; clanTag: string;
  points: number; games: number; wins: number;
  contributors: number; eligible: boolean; rank: number;
}
interface MemberRow {
  playerId: string; username: string; avatarUrl: string | null;
  points: number; games: number; wins: number; capped: boolean;
}
interface LeagueAward {
  weekStart: number; clanId: string; clanName: string; clanTag: string;
  rank: number; points: number; coinsPerMember: number;
}
interface Rules { playerCap: number; minContributors: number; prizes: number[] }

const MEDAL = ['🥇', '🥈', '🥉'];
const RANK_COLOR = ['255,212,90', '203,213,225', '205,127,50'];

function countdown(toMs: number): string {
  const left = toMs - Date.now();
  if (left <= 0) return 'დასრულდა';
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  if (d > 0) return `${d} დღე ${h} სთ`;
  if (h > 0) return `${h} სთ ${m} წთ`;
  return `${m} წუთი`;
}

export function ClanLeaguePanel({ myClanId }: { myClanId: string | null }) {
  const [open, setOpen] = useState(true);
  const [table, setTable] = useState<LeagueRow[]>([]);
  const [rules, setRules] = useState<Rules | null>(null);
  const [weekEnd, setWeekEnd] = useState<number | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [trophies, setTrophies] = useState<{ first: number; podium: number } | null>(null);
  const [history, setHistory] = useState<LeagueAward[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showMine, setShowMine] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await emitWithAck<any, Res<{ weekStart: number; weekEnd: number; table: LeagueRow[]; rules: Rules }>>(
        'clan:league', {});
      if ('ok' in res && res.ok) {
        setTable(res.data.table);
        setRules(res.data.rules);
        setWeekEnd(res.data.weekEnd);
      }
    } catch { /* leave prior state */ }
    finally { setLoading(false); }

    if (myClanId) {
      try {
        const d = await emitWithAck<{ clanId: string }, Res<{ row: LeagueRow | null; members: MemberRow[]; trophies: { first: number; podium: number } }>>(
          'clan:league_detail', { clanId: myClanId });
        if ('ok' in d && d.ok) { setMembers(d.data.members); setTrophies(d.data.trophies); }
      } catch { /* optional detail */ }
    }
  }, [myClanId]);

  useEffect(() => { load(); }, [load]);
  // Re-render the countdown once a minute; the data itself doesn't need polling.
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  void tick;

  const loadHistory = async () => {
    setShowHistory(v => !v);
    if (history.length) return;
    try {
      const r = await emitWithAck<any, Res<LeagueAward[]>>('clan:league_history', { limit: 12 });
      if ('ok' in r && r.ok) setHistory(r.data);
    } catch { /* leave empty */ }
  };

  const mine = myClanId ? table.find(r => r.clanId === myClanId) ?? null : null;

  return (
    <div className="relative z-10 vm-page px-4 mt-6">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.25em] text-white/30 hover:text-white/60 transition-colors"
        >
          <span style={{ color: open ? '#ffd45a' : undefined }}>🏆</span>
          კლანების ლიგა
          <span className="text-[12px]">{open ? '▲' : '▼'}</span>
          {weekEnd && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[11px] font-mono"
              style={{ background: 'rgba(255,212,90,0.12)', color: '#ffd45a', border: '1px solid rgba(255,212,90,0.28)' }}>
              {countdown(weekEnd)}
            </span>
          )}
        </button>
        {trophies && trophies.podium > 0 && (
          <span className="font-mono text-[11px] px-2 py-1 rounded-lg"
            style={{ background: 'rgba(255,212,90,0.10)', border: '1px solid rgba(255,212,90,0.25)', color: '#ffd45a' }}>
            🥇 {trophies.first} · პოდიუმი {trophies.podium}
          </span>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            {loading && table.length === 0 && (
              <p className="font-mono text-[12px] text-white/25 py-6 text-center">იტვირთება…</p>
            )}

            {!loading && table.length === 0 && (
              <div className="rounded-2xl px-4 py-6 text-center"
                style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                <p className="font-mono text-[12px] text-white/40 leading-relaxed">
                  ამ კვირას ჯერ არავის უთამაშია.<br />ითამაშე მაფია და კლანი ცხრილში გამოჩნდება.
                </p>
              </div>
            )}

            {table.length > 0 && (
              <div className="space-y-1.5">
                {table.map(r => {
                  const isMine = r.clanId === myClanId;
                  const podium = r.eligible && r.rank <= 3;
                  const accent = podium ? RANK_COLOR[r.rank - 1] : isMine ? '0,229,255' : '255,255,255';
                  return (
                    <div key={r.clanId}
                      className="rounded-xl px-3 py-2 flex items-center gap-2.5"
                      style={{
                        border: `1px solid rgba(${accent},${podium || isMine ? 0.3 : 0.08})`,
                        background: podium ? `rgba(${accent},0.07)` : isMine ? 'rgba(0,229,255,0.05)' : 'rgba(255,255,255,0.02)',
                      }}>
                      <span className="w-6 text-center font-mono text-[13px] shrink-0"
                        style={{ color: podium ? `rgb(${accent})` : 'rgba(255,255,255,0.3)' }}>
                        {podium ? MEDAL[r.rank - 1] : r.rank}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-mono text-[11px] px-1 rounded shrink-0"
                            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)' }}>
                            {r.clanTag}
                          </span>
                          <span className="font-display font-bold text-[13px] text-white/85 truncate">{r.clanName}</span>
                          {isMine && <span className="font-mono text-[10px] text-neon-cyan/70 shrink-0">შენი</span>}
                        </div>
                        <p className="font-mono text-[10px] text-white/30">
                          {r.wins}/{r.games} მოგება · {r.contributors} მოთამაშე
                          {!r.eligible && <span style={{ color: 'rgba(251,146,60,0.8)' }}> · არ იღებს ჯილდოს</span>}
                        </p>
                      </div>
                      <span className="font-display font-bold text-[15px] shrink-0"
                        style={{ color: podium ? `rgb(${accent})` : 'rgba(255,255,255,0.6)' }}>
                        {r.points}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Rules — printed, not buried: the two anti-farming rules look like
                bugs to whoever they hit unless they are stated. */}
            {rules && (
              <div className="mt-2.5 rounded-xl px-3 py-2"
                style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                <p className="font-mono text-[10px] text-white/35 leading-relaxed">
                  ყოველი თამაში ქულას აძლევს კლანს — მოგება მეტს, ranked კიდევ მეტს.
                  ერთი მოთამაშის კვირეული წვლილი შემოსაზღვრულია {rules.playerCap} ქულით, და
                  ჯილდოს იღებს კლანი, რომელსაც კვირაში მინიმუმ {rules.minContributors} მოთამაშე უთამაშია.
                  ორშაბათს ცხრილი ნულდება და პირველი სამი კლანის <b>ყველა</b> მონაწილე იღებს{' '}
                  {rules.prizes.join(' / ')} მონეტას.
                </p>
              </div>
            )}

            <div className="flex gap-2 mt-2">
              {myClanId && members.length > 0 && (
                <button onClick={() => setShowMine(v => !v)}
                  className="flex-1 py-1.5 rounded-lg font-mono text-[11px] transition-all active:scale-[0.98]"
                  style={{ border: '1px solid rgba(0,229,255,0.22)', background: 'rgba(0,229,255,0.06)', color: 'rgba(0,229,255,0.8)' }}>
                  {showMine ? 'დამალე წვლილი' : `ჩემი კლანის წვლილი (${members.length})`}
                </button>
              )}
              <button onClick={loadHistory}
                className="flex-1 py-1.5 rounded-lg font-mono text-[11px] transition-all active:scale-[0.98]"
                style={{ border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.5)' }}>
                {showHistory ? 'დამალე ისტორია' : 'გასული კვირები'}
              </button>
            </div>

            <AnimatePresence initial={false}>
              {showMine && members.length > 0 && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden">
                  <div className="mt-2 space-y-1">
                    {mine && (
                      <p className="font-mono text-[10px] text-white/30 px-1">
                        #{mine.rank} · {mine.points} ქულა
                      </p>
                    )}
                    {members.map(m => (
                      <div key={m.playerId} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
                        style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                        <PlayerName profileId={m.playerId} name={m.username}
                          className="font-mono text-[11px] text-white/70 truncate" badgeSize={11} />
                        <span className="ml-auto font-mono text-[10px] text-white/25 shrink-0">
                          {m.wins}/{m.games}
                        </span>
                        <span className="font-mono text-[11px] shrink-0"
                          style={{ color: m.capped ? 'rgba(251,146,60,0.9)' : 'rgba(255,255,255,0.6)' }}>
                          {m.points}{m.capped ? ' ⌐' : ''}
                        </span>
                      </div>
                    ))}
                    {members.some(m => m.capped) && (
                      <p className="font-mono text-[10px] text-white/25 px-1">⌐ = კვირეულ ლიმიტს მიაღწია</p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence initial={false}>
              {showHistory && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden">
                  <div className="mt-2 space-y-1">
                    {history.length === 0 && (
                      <p className="font-mono text-[11px] text-white/25 py-3 text-center">ჯერ არცერთი კვირა არ დასრულებულა.</p>
                    )}
                    {history.map((a, i) => (
                      <div key={`${a.weekStart}-${a.clanId}-${i}`} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
                        style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                        <span className="text-[12px] shrink-0">{MEDAL[a.rank - 1] ?? a.rank}</span>
                        <span className="font-mono text-[11px] text-white/70 truncate">{a.clanName}</span>
                        <span className="ml-auto font-mono text-[10px] text-white/25 shrink-0">
                          {new Date(a.weekStart).toLocaleDateString('ka-GE', { day: 'numeric', month: 'short' })}
                        </span>
                        <span className="font-mono text-[10px] shrink-0" style={{ color: 'rgba(255,212,90,0.75)' }}>
                          +{a.coinsPerMember} 🪙
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
