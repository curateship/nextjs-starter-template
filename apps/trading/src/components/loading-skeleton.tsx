import { Skeleton } from "@/components/ui/skeleton"

export function ChartLoadingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading chart"
      aria-busy="true"
      className="absolute inset-0 flex flex-col gap-2 p-3"
    >
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="min-h-0 w-full flex-1" />
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  )
}

export function MarketListLoadingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading markets"
      aria-busy="true"
      className="space-y-2 p-2"
    >
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="flex items-center gap-2 rounded-md p-1">
          <Skeleton className="size-4 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-14" />
        </div>
      ))}
    </div>
  )
}

export function MediaGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="aspect-square w-full" />
      ))}
    </div>
  )
}
