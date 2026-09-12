interface SkeletonProps {
  height?: string | number
  width?: string | number
  borderRadius?: string
  className?: string
}

export function Skeleton({ height = 20, width = '100%', borderRadius = '4px', className = '' }: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ height, width, borderRadius }}
      aria-hidden="true"
    />
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="skeleton-table" role="status" aria-label="Loading…">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="skeleton-table__row">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} height={16} width={c === 0 ? '30%' : `${60 / cols}%`} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card" role="status" aria-label="Loading…">
      <Skeleton height={20} width="40%" className="skeleton--mb" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={14} width={i === lines - 1 ? '60%' : '100%'} className="skeleton--mb" />
      ))}
    </div>
  )
}
