import { useEffect, useState } from "react"
import { Link } from "@tanstack/react-router"
import { listRuns, listSchedules, type RunSummary, type ScheduleRecord } from "@/lib/api"
import { formatDateTime, formatNumber } from "@/lib/format"
import { StatusPill } from "@/components/status-pill"
import { SurfaceCard } from "@/components/surface-card"

export function OverviewPage() {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        setLoading(true)
        setError(null)
        const [runsResponse, schedulesResponse] = await Promise.all([
          listRuns(),
          listSchedules(),
        ])

        if (!active) {
          return
        }

        setRuns(runsResponse.runs)
        setSchedules(schedulesResponse.schedules)
      } catch (caughtError) {
        if (!active) {
          return
        }

        setError(caughtError instanceof Error ? caughtError.message : "Failed to load overview")
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  const queuedRuns = runs.filter((run) => run.status === "queued").length
  const activeRuns = runs.filter((run) => run.status === "running").length
  const successfulRuns = runs.filter((run) => run.status === "succeeded").length

  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total runs", value: formatNumber(runs.length) },
          { label: "Queued", value: formatNumber(queuedRuns) },
          { label: "Running", value: formatNumber(activeRuns) },
          { label: "Succeeded", value: formatNumber(successfulRuns) },
        ].map((stat) => (
          <div key={stat.label} className="rounded-3xl border border-border/70 bg-card/95 p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{stat.label}</p>
            <p className="mt-3 text-3xl font-semibold">{stat.value}</p>
          </div>
        ))}
      </section>

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SurfaceCard
          title="Recent Runs"
          description="The worker picks up queued runs from Postgres and stores normalized place snapshots per run."
          actions={
            <Link to="/google-maps/runs" className="scraper-link text-sm font-medium">
              View all runs
            </Link>
          }
        >
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading runs...</p>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet. Create the first Google Maps search.</p>
          ) : (
            <div className="space-y-3">
              {runs.slice(0, 5).map((run) => (
                <Link
                  key={run.id}
                  to="/google-maps/runs/$runId"
                  params={{ runId: run.id }}
                  className="block rounded-2xl border border-border/70 bg-background/80 p-4 transition-colors hover:bg-muted/40"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-semibold">{run.keyword}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{run.area}</p>
                    </div>
                    <StatusPill status={run.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    <span>Created {formatDateTime(run.created_at)}</span>
                    <span>Saved {formatNumber(run.total_places_saved)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard
          title="Schedules"
          description="Recurring schedules enqueue normal runs with the same fixed Google Maps input shape."
          actions={
            <Link to="/google-maps/schedules" className="scraper-link text-sm font-medium">
              Manage schedules
            </Link>
          }
        >
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading schedules...</p>
          ) : schedules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No schedules configured.</p>
          ) : (
            <div className="space-y-3">
              {schedules.slice(0, 4).map((schedule) => (
                <div key={schedule.id} className="rounded-2xl border border-border/70 bg-background/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{schedule.keyword}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{schedule.area}</p>
                    </div>
                    <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      {schedule.cadence}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Next run {formatDateTime(schedule.next_run_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>
      </section>
    </>
  )
}
