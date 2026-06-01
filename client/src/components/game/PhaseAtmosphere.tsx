import { Phase } from '@/types/index';

interface Props {
  phase: Phase;
}

export function PhaseAtmosphere({ phase }: Props) {
  if (phase === 'night') {
    return (
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-neon-purple/6 rounded-full blur-[150px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[200px] bg-neon-pink/4 rounded-full blur-[120px]" />
      </div>
    );
  }
  if (phase === 'voting') {
    return (
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[200px] bg-neon-red/5 rounded-full blur-[100px]" />
      </div>
    );
  }
  if (phase === 'day' || phase === 'speech') {
    return (
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[150px] bg-neon-cyan/4 rounded-full blur-[100px]" />
      </div>
    );
  }
  return null;
}
