import { Skeleton } from "@/components/ui/skeleton"

export function DashboardLoadingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading dashboard"
      aria-busy="true"
      className="w-full space-y-2 md:space-y-3"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 md:gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-foreground/5 bg-card">
        <div className="flex items-center justify-between gap-4 bg-muted/50 p-4">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="space-y-4 p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}

export function WorkspaceLoadingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading workspace"
      aria-busy="true"
      className="grid h-full min-h-96 grid-cols-1 gap-2 p-2 md:gap-3 md:p-3 lg:grid-cols-4"
    >
      <Skeleton className="min-h-80 w-full lg:col-span-3" />
      <div className="space-y-2 sm:space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  )
}

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

export function ShellLoadingSkeleton() {
  return (
    <div className="flex min-h-screen bg-muted/40">
      <aside className="hidden w-64 border-r p-4 md:block">
        <Skeleton className="mb-6 h-8 w-36" />
        <div className="space-y-2">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      </aside>
      <main className="flex-1 p-4">
        <div className="mb-6 flex items-center justify-between border-b pb-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-64 w-full" />
        </div>
      </main>
    </div>
  )
}

export function LoginLoadingSkeleton() {
  return (
    <main className="grid min-h-screen place-items-center bg-muted/40 p-2 md:p-3">
      <div className="w-full max-w-sm rounded-xl border border-foreground/5 bg-card p-6">
        <Skeleton className="mb-3 h-7 w-48" />
        <Skeleton className="mb-6 h-4 w-40" />
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </main>
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
