interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className = '', style }: SkeletonProps) {
  return (
    <div
      className={`skeleton-shimmer ${className}`}
      style={style}
    />
  );
}

export function SkeletonRoomCard() {
  return (
    <div className="px-4 py-3.5 flex items-center gap-3 rounded-2xl"
      style={{ background: 'rgba(10,5,24,0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <Skeleton className="w-2 h-2 rounded-full flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-3.5 w-2/3 rounded-lg" />
        <Skeleton className="h-2.5 w-1/3 rounded-lg" />
      </div>
      <Skeleton className="h-7 w-14 rounded-lg flex-shrink-0" />
    </div>
  );
}

export function SkeletonPost() {
  return (
    <div className="rounded-2xl p-4 space-y-3"
      style={{ background: 'rgba(10,5,24,0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="flex items-center gap-3">
        <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3 w-1/3 rounded-lg" />
          <Skeleton className="h-2.5 w-1/4 rounded-lg" />
        </div>
      </div>
      <Skeleton className="h-3 w-full rounded-lg" />
      <Skeleton className="h-3 w-4/5 rounded-lg" />
      <Skeleton className="h-3 w-2/3 rounded-lg" />
    </div>
  );
}

export function SkeletonGameRow() {
  return (
    <div className="flex items-center justify-between py-2 px-1">
      <div className="flex items-center gap-2 min-w-0">
        <Skeleton className="w-5 h-5 rounded-full flex-shrink-0" />
        <Skeleton className="h-3 w-24 rounded-lg" />
      </div>
      <Skeleton className="h-7 w-16 rounded-lg flex-shrink-0" />
    </div>
  );
}
