/**
 * The subject ID card — the thing a player actually wants to look at and show
 * off. Replaces the wall of monospace the terminal used to print.
 *
 * Everything on it is server truth: the code, the sector, the four scores and
 * the integrity number are all computed from the manifest server-side. The card
 * only draws them.
 */
import { motion } from 'framer-motion';
import { TRAIT_INFO, sectorOf, fileSize, type Subject, type TraitKey } from './types';

/** Integrity as a ring — a number in a circle reads as a status, a bare "46%" doesn't. */
function IntegrityRing({ value, color }: { value: number; color: string }) {
  const R = 30, C = 2 * Math.PI * R;
  return (
    <svg width={76} height={76} viewBox="0 0 76 76" aria-label={`მთლიანობა ${value}%`}>
      <circle cx={38} cy={38} r={R} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={5} />
      <motion.circle
        cx={38} cy={38} r={R} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round"
        transform="rotate(-90 38 38)"
        initial={{ strokeDasharray: `0 ${C}` }}
        animate={{ strokeDasharray: `${(value / 100) * C} ${C}` }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
        style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}
      />
      <text x={38} y={36} textAnchor="middle" fill={color}
        style={{ font: 'bold 17px ui-monospace, monospace' }}>{value}</text>
      <text x={38} y={50} textAnchor="middle" fill="rgba(255,255,255,0.35)"
        style={{ font: '9px ui-monospace, monospace' }}>%</text>
    </svg>
  );
}

export function MarsCard({
  subject, onEdit, onPurge, compact = false,
}: {
  subject: Subject;
  onEdit?: () => void;
  onPurge?: () => void;
  compact?: boolean;
}) {
  const sec = sectorOf(subject.sector);
  const peak = Math.max(...(Object.values(subject.traits) as number[]));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden"
      style={{
        border: `1px solid ${sec.color}44`,
        background: `linear-gradient(160deg, ${sec.color}12, rgba(1,10,6,0.9))`,
        boxShadow: `0 8px 40px ${sec.color}18`,
      }}
    >
      {/* Identity strip */}
      <div className="flex items-center gap-3 p-3">
        <div className="shrink-0 rounded-xl overflow-hidden" style={{
          width: 68, height: 68, border: `1px solid ${sec.color}55`, background: 'rgba(0,0,0,0.4)',
        }}>
          {subject.portrait
            ? <img src={subject.portrait} alt="" className="w-full h-full object-cover" />
            : (
              <div className="w-full h-full flex items-center justify-center font-mono"
                style={{ color: `${sec.color}66`, fontSize: 24 }}>
                {subject.designation.slice(0, 1).toUpperCase() || '?'}
              </div>
            )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px]" style={{ color: `${sec.color}aa` }}>SUBJECT #{subject.code}</p>
          <p className="font-display font-bold text-[17px] text-white truncate">{subject.designation}</p>
          <span className="inline-block mt-1 font-mono text-[10px] px-2 py-0.5 rounded-full"
            style={{ background: `${sec.color}1e`, border: `1px solid ${sec.color}55`, color: sec.color }}>
            {subject.sector} · {sec.ka}
          </span>
        </div>

        <IntegrityRing value={subject.integrity} color={sec.color} />
      </div>

      <p className="px-3 pb-2 font-mono text-[11px] leading-snug" style={{ color: 'rgba(255,255,255,0.5)' }}>
        {sec.why}
      </p>

      {/* Trait bars */}
      <div className="px-3 pb-3 space-y-2">
        {(Object.keys(TRAIT_INFO) as TraitKey[]).map(k => {
          const v = subject.traits[k] ?? 0;
          const info = TRAIT_INFO[k];
          return (
            <div key={k}>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[11px] font-bold" style={{ color: info.color }}>{info.ka}</span>
                {!compact && <span className="font-mono text-[9px]" style={{ color: 'rgba(255,255,255,0.28)' }}>{info.hint}</span>}
                <span className="ml-auto font-mono text-[12px] font-bold" style={{ color: info.color }}>{v}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                <motion.div
                  initial={{ width: 0 }} animate={{ width: `${v}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                  style={{ height: '100%', background: info.color, boxShadow: `0 0 8px ${info.color}77` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* A flat profile looks broken. It isn't — say why instead of leaving
          four empty bars to be interpreted. */}
      {peak < 35 && (
        <p className="mx-3 mb-3 px-2.5 py-2 rounded-lg font-mono text-[10px] leading-snug"
          style={{ background: 'rgba(255,212,90,0.09)', border: '1px solid rgba(255,212,90,0.28)', color: '#ffd45a' }}>
          ქულები დაბალია, რადგან მანიფესტი მოკლე ან ერთფეროვანია. დაწერე უფრო ვრცლად და ხელახლა ატვირთე.
        </p>
      )}

      {/* Archived documents — private, only ever shown to their own subject. */}
      {subject.docs.length > 0 && (
        <div className="px-3 pb-3">
          <p className="font-mono text-[10px] mb-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
            არქივში შენახული ({subject.docs.length}) · მხოლოდ შენ ხედავ
          </p>
          <div className="space-y-1">
            {subject.docs.map((d, i) => (
              <a key={i} href={d.data} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                <span className="text-[14px]">{d.type === 'application/pdf' ? '📄' : '🖼'}</span>
                <span className="font-mono text-[11px] truncate flex-1" style={{ color: 'rgba(255,255,255,0.7)' }}>{d.name}</span>
                <span className="font-mono text-[10px] shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>{fileSize(d.size)}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {(onEdit || onPurge) && (
        <div className="flex gap-2 px-3 pb-3">
          {onEdit && (
            <button onClick={onEdit}
              className="flex-1 py-2 rounded-xl font-mono text-[12px] font-bold transition-all active:scale-[0.98]"
              style={{ border: `1px solid ${sec.color}66`, background: `${sec.color}1a`, color: sec.color }}>
              ↻ განახლება
            </button>
          )}
          {onPurge && (
            <button onClick={onPurge}
              className="px-3 py-2 rounded-xl font-mono text-[12px] transition-all active:scale-[0.98]"
              style={{ border: '1px solid rgba(255,95,109,0.35)', color: 'rgba(255,95,109,0.85)' }}>
              წაშლა
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}
