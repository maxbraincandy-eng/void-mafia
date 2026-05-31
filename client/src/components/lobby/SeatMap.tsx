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
  const rx = 40; // percent
  const ry = 38; // percent

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
      {/* Table oval */}
      <div
        className="absolute"
        style={{
          left: '25%',
          top: '25%',
          width: '50%',
          height: '50%',
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at center, rgba(10,5,32,0.9) 60%, rgba(0,245,255,0.04) 100%)',
          border: '1px solid rgba(0,245,255,0.08)',
          boxShadow: 'inset 0 0 40px rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span className="font-mono text-[10px] tracking-[0.25em] text-white/20 uppercase select-none">
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
            className="absolute flex flex-col items-center"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {player ? (
              /* Occupied seat */
              <div className="relative flex flex-col items-center gap-0.5">
                <div
                  className={clsx(
                    'w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center',
                    'transition-all duration-200',
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
                  {/* Overlays */}
                  {isHost && (
                    <span
                      className="absolute -top-1 -right-1 text-xs leading-none"
                      title="Host"
                    >
                      👑
                    </span>
                  )}
                  {isSpectator && (
                    <span
                      className="absolute bottom-0 right-0 text-[10px] leading-none"
                      title="Spectator"
                    >
                      👁
                    </span>
                  )}
                </div>
                <span className="font-mono text-[9px] text-white/50 text-center max-w-[48px] truncate leading-tight">
                  {player.name}
                </span>
              </div>
            ) : (
              /* Empty seat */
              <div className="relative flex flex-col items-center gap-0.5">
                <div
                  className={clsx(
                    'w-10 h-10 md:w-12 md:h-12 rounded-full',
                    'border border-white/10 bg-white/5',
                    'flex items-center justify-center',
                  )}
                >
                  <span className="font-mono text-[10px] text-white/20">#{seatNum}</span>
                </div>
                <span className="font-mono text-[9px] text-white/15 leading-tight">&nbsp;</span>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
