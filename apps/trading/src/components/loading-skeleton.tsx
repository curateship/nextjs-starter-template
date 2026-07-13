import * as React from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export function DashboardLoadingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading dashboard"
      aria-busy="true"
      className="w-full"
    >
      <div
        data-slot="dashboard-table-skeleton"
        className="overflow-hidden rounded-xl border border-foreground/5 bg-card"
      >
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

/**
 * Keeps a page behind its supplied skeleton until fonts and browser layout
 * have settled. The real page stays mounted invisibly so its final size is
 * calculated before the user sees it.
 */
export function PageLoadBoundary({
  children,
  fallback,
  readyToReveal = true,
}: {
  children: React.ReactNode
  fallback: React.ReactNode
  readyToReveal?: boolean
}) {
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    if (!readyToReveal) return

    let active = true
    let firstFrame = 0
    let secondFrame = 0

    const revealAfterLayout = () => {
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          if (active) setReady(true)
        })
      })
    }

    void document.fonts.ready.then(revealAfterLayout)

    return () => {
      active = false
      window.cancelAnimationFrame(firstFrame)
      window.cancelAnimationFrame(secondFrame)
    }
  }, [readyToReveal])

  return (
    <div
      data-slot="page-loading-boundary"
      className="relative flex h-full min-h-0 min-w-0 flex-1"
    >
      <div
        aria-hidden={!ready}
        className={cn(
          "flex h-full min-h-0 min-w-0 flex-1",
          !ready && "invisible"
        )}
      >
        {children}
      </div>
      {!ready ? (
        <div className="absolute inset-0 flex bg-muted/60">{fallback}</div>
      ) : null}
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
    <div className="flex min-h-screen bg-muted/60">
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
    <main className="grid min-h-screen place-items-center bg-muted/60 p-2 md:p-3">
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
