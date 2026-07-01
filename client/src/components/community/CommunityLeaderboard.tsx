import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import { Avatar, Spinner } from './shared';
import type { Res } from '@/types/index';
import type { CommunityLeaderboardEntry } from '@/types/index';

const RANK_CONFIG: Record<number, { label: string; color: string; bgColor: string; borderColor: string; coinPrize: number; glow: string }> = {
  1: {
    label: '🥇',
    color: '#ffd700',
    bgColor: 'rgba(255,215,0,0.08)',
    borderColor: 'rgba(255,215,0,0.35)',
    coinPrize: 500,
    glow: '0 0 24px rgba(255,215,0,0.25)',
  },
  2: {
    label: '🥈',
    color: '#c0c0c0',
    bgColor: 'rgba(192,192,192,0.06)',
    borderColor: 'rgba(192,192,192,0.25)',
    coinPrize: 400,
    glow: '0 0 16px rgba(192,192,192,0.15)',
  },
  3: {
    label: '🥉',
    color: '#cd7f32',
    bgColor: 'rgba(205,127,50,0.07)',
    borderColor: 'rgba(205,127,50,0.3)',
    coinPrize: 300,
    glow: '0 0 16px rgba(205,127,50,0.2)',
  },
};

function getNextMonday(): Date {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7;
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntilMonday);
  next.setHours(0, 0, 0, 0);
  return next;
}

function useCountdown() {
  const [timeLeft, setTimeLeft] = useState(() => getNextMonday().getTime() - Date.now());

  useEffect(() => {
    const tick = () => setTimeLeft(getNextMonday().getTime() - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const totalSeconds = Math.max(0, Math.floor(timeLeft / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds };
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 36 }}>
      <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#00f5ff', lineHeight: 1 }}>
        {String(value).padStart(2, '0')}
      </span>
      <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(0,245,255,0.4)', letterSpacing: '0.1em', marginTop: 2 }}>
        {label}
      </span>
    </div>
  );
}

function CountdownDivider() {
  return (
    <span style={{ fontFamily: 'monospace', fontSize: 16, color: 'rgba(0,245,255,0.35)', alignSelf: 'flex-start', marginTop: 1 }}>:</span>
  );
}

interface LeaderboardRowProps {
  entry: CommunityLeaderboardEntry;
  index: number;
}

function LeaderboardRow({ entry, index }: LeaderboardRowProps) {
  const rank = index + 1;
  const config = RANK_CONFIG[rank];
  const isTop3 = rank <= 3;

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, type: 'spring', stiffness: 300, damping: 24 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: isTop3 ? '12px 14px' : '9px 14px',
        borderRadius: 14,
        border: isTop3 ? `1px solid ${config.borderColor}` : '1px solid rgba(255,255,255,0.05)',
        background: isTop3 ? config.bgColor : 'rgba(255,255,255,0.02)',
        boxShadow: isTop3 ? config.glow : 'none',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {isTop3 && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          background: `linear-gradient(90deg, transparent, ${config.color}60, transparent)`,
        }} />
      )}

      <div style={{
        width: 28, textAlign: 'center', flexShrink: 0,
        fontFamily: 'monospace',
        fontSize: isTop3 ? 18 : 12,
        color: isTop3 ? config.color : 'rgba(255,255,255,0.2)',
        fontWeight: isTop3 ? 700 : 400,
      }}>
        {isTop3 ? config.label : rank}
      </div>

      <Avatar
        avatar={entry.username.charAt(0).toUpperCase()}
        avatarUrl={entry.avatarUrl}
        size={isTop3 ? 38 : 30}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontFamily: 'monospace',
          fontSize: isTop3 ? 13 : 12,
          fontWeight: isTop3 ? 700 : 400,
          color: isTop3 ? config.color : 'rgba(255,255,255,0.75)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {entry.username}
        </p>
        <p style={{
          fontFamily: 'monospace',
          fontSize: 10,
          color: isTop3 ? `${config.color}80` : 'rgba(255,255,255,0.2)',
          marginTop: 1,
        }}>
          {entry.score.toLocaleString()} ქულა
        </p>
      </div>

      {isTop3 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 8px',
          borderRadius: 10,
          background: `${config.color}15`,
          border: `1px solid ${config.color}40`,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 12 }}>🪙</span>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: config.color, fontWeight: 700 }}>
            {config.coinPrize}
          </span>
        </div>
      )}

      {!isTop3 && (
        <div style={{
          fontFamily: 'monospace',
          fontSize: 11,
          color: 'rgba(155,0,255,0.6)',
          flexShrink: 0,
        }}>
          {entry.score.toLocaleString()}
        </div>
      )}
    </motion.div>
  );
}

export function CommunityLeaderboard() {
  const [entries, setEntries] = useState<CommunityLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const countdown = useCountdown();

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await emitWithAck<undefined, Res<CommunityLeaderboardEntry[]>>('community:leaderboard');
      if (res.ok) {
        setEntries(res.data.slice(0, 20));
      } else {
        setError(res.error);
      }
    } catch (e: any) {
      setError(e?.message ?? 'შეცდომა');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{
        padding: '16px 16px 12px',
        background: 'linear-gradient(180deg, rgba(155,0,255,0.08) 0%, transparent 100%)',
        borderBottom: '1px solid rgba(155,0,255,0.12)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <h2 style={{
              fontFamily: 'monospace',
              fontSize: 14,
              fontWeight: 700,
              color: '#c084fc',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              margin: 0,
            }}>
              კვირის ლიდერბორდი
            </h2>
            <p style={{
              fontFamily: 'monospace',
              fontSize: 10,
              color: 'rgba(255,255,255,0.25)',
              marginTop: 3,
              letterSpacing: '0.06em',
            }}>
              TOP 20 · ენგეიჯმენტის მიხედვით
            </p>
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 4,
          }}>
            <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(0,245,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              განახლება
            </span>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3 }}>
              <CountdownUnit value={countdown.days} label="დღე" />
              <CountdownDivider />
              <CountdownUnit value={countdown.hours} label="სთ" />
              <CountdownDivider />
              <CountdownUnit value={countdown.minutes} label="წთ" />
              <CountdownDivider />
              <CountdownUnit value={countdown.seconds} label="წმ" />
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderRadius: 10,
          background: 'rgba(0,245,255,0.04)',
          border: '1px solid rgba(0,245,255,0.1)',
        }}>
          <span style={{ fontSize: 11 }}>💡</span>
          <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
            ტოპ 3 იღებს მონეტებს ყოველ ორშაბათს ავტომატურად
          </span>
        </div>
      </div>

      <div style={{ padding: '12px 12px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading && <Spinner color="#9b00ff" />}

        {!loading && error && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <p style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,80,80,0.7)', marginBottom: 12 }}>
              {error}
            </p>
            <button
              onClick={fetchLeaderboard}
              style={{
                fontFamily: 'monospace', fontSize: 11, padding: '8px 16px',
                borderRadius: 10, background: 'rgba(155,0,255,0.12)',
                border: '1px solid rgba(155,0,255,0.3)', color: '#c084fc', cursor: 'pointer',
              }}
            >
              ↺ თავიდან ცდა
            </button>
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <p style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>
              ჯერ არავინ არ არის
            </p>
          </div>
        )}

        {!loading && !error && entries.map((entry, index) => (
          <LeaderboardRow key={entry.playerId} entry={entry} index={index} />
        ))}
      </div>
    </div>
  );
}
