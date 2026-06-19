import { motion } from 'framer-motion';
import clsx from 'clsx';
import { PlayerPublic } from '@/types/index';
import { Avatar } from '@/components/ui/Avatar';

interface Props {
  players: PlayerPublic[];
  myPlayerId: string | null;
  maxSeats?: number;
}

export function SeatMap({ players, myPlayerId, maxSeats = 16 }: Props) {
  const cx = 50; // percent
  const cy = 50; // percent
  const rx = 38; // percent — slightly smaller so seats don't clip
  const ry = 38; // percent — equal → perfect circle

  // Build a seat-indexed map for quick lookup
  const seatMap = new Map<number, PlayerPublic>();
  for (const p of players) {
    seatMap.set(p.seat, p);
  }

  // Determine total seats to render: at least the occupied ones, up to maxSeats
  const maxOccupied = players.reduce((m, p) => Math.max(m, p.seat), 0);
  const totalSeats = Math.max(maxOccupied, Math.min(maxSeats, 16));

  const seats = Array.from({ length: totalSeats }, (_, i) => i + 1);

  return (
    <div className="relative w-full" style={{ aspectRatio: '1' }}>
      {/* Table oval — centered with transform for pixel-perfect centering */}
      <div
        className="absolute"
        style={{
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: '46%',
          height: '46%',
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at center, rgba(10,5,32,0.9) 60%, rgba(0,245,255,0.04) 100%)',
          border: '1px solid rgba(0,245,255,0.08)',
          boxShadow: 'inset 0 0 40px rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span className="font-mono text-[12px] tracking-[0.25em] text-white/20 uppercase select-none">
          VOID MAFIA
        </span>
      </div>

      {/* Seats */}
      {seats.map((seatNum, index) => {
        // Angle starts from top (−π/2) going clockwise
        const angle = (2 * Math.PI * index) / totalSeats - Math.PI / 2;
        const x = cx + rx * Math.cos(angle);
        const y = cy + ry * Math.sin(angle);

        const player = seatMap.get(seatNum) ?? null;
        const isMe = player?.id === myPlayerId;
        const isHost = player?.isHost ?? false;
        const isSpectator = player?.isSpectator ?? false;

        return (
          <motion.div
            key={seatNum}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.04 }}
            className="absolute"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              // translate by exactly half the circle size (40px = w-10) so the circle center
              // sits precisely at the calculated coordinate — name label floats below via absolute
              transform: 'translate(-20px, -20px)',
            }}
          >
            {/* Fixed 40×40 anchor — circle center = element top-left + 20px */}
            <div className="relative w-10 h-10">
              {player ? (
                <>
                  <div
                    className={clsx(
                      'w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200',
                      isMe && 'ring-2 ring-neon-purple',
                      isSpectator && 'opacity-60',
                    )}
                  >
                    <Avatar
                      name={player.name}
                      size="md"
                      isAlive={player.isAlive}
                      isHost={false}
                      className={clsx(isSpectator && 'opacity-70 [filter:hue-rotate(240deg)]')}
                    />
                  </div>
                  {isHost && (
                    <span className="absolute -top-1 -right-1 text-xs leading-none pointer-events-none">👑</span>
                  )}
                  {isSpectator && (
                    <span className="absolute bottom-0 right-0 text-[12px] leading-none pointer-events-none">👁</span>
                  )}
                  {/* Name floats below without affecting the anchor box */}
                  <span className="absolute top-full left-1/2 -translate-x-1/2 mt-0.5 font-mono text-[12px] text-white/50 text-center w-12 truncate leading-tight pointer-events-none">
                    {player.name}
                  </span>
                </>
              ) : (
                <div
                  className={clsx(
                    'w-10 h-10 rounded-full border border-white/10 bg-white/5',
                    'flex items-center justify-center',
                  )}
                >
                  <span className="font-mono text-[12px] text-white/20">#{seatNum}</span>
                </div>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
