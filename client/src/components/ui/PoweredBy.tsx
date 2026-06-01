import clsx from 'clsx';

const TEXT = 'powered by ბატონი მაქსი';

interface Props {
  className?: string;
}

export function PoweredBy({ className }: Props) {
  return (
    <span
      className={clsx('powered-by-cyber', className)}
      data-text={TEXT}
    >
      {TEXT}
    </span>
  );
}
