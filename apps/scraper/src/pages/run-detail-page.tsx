import { useEffect, useState } from "react"
import { useParams } from "@tanstack/react-router"
import { cancelRun, getRun, getRunResults, type RunDetail, type RunResultRecord } from "@/lib/api"
import { formatDateTime, formatNumber } from "@/lib/format"
import { StatusPill } from "@/components/status-pill"
import { SurfaceCard } from "@/components/surface-card"

function isPollingStatus(status?: string) {
  return status === "queued" || status === "running"
}

export function RunDetailPage() {
  const { runId } = useParams({ from: "/runs/$runId" })
  const [run, setRun] = useState<RunDetail | null>(null)
  const [results, setResults] = useState<RunResultRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const [runResponse, resultsResponse] = await Promise.all([
          getRun(runId),
          getRunResults(runId),
        ])

        if (!active) {
          return
        }

        setRun(runResponse.run)
        setResults(resultsResponse.results)
        setError(null)
      } catch (caughtError) {
        if (!active) {
          return
        }

        setError(caughtError instanceof Error ? caughtError.message : "Failed to load run")
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()
    const timer = window.setInterval(() => {
      if (active && isPollingStatus(run?.status)) {
        void load()
      }
    }, 5000)

    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [run?.status, runId])

  async function handleCancel() {
    try {
      setCancelling(true)
      const response = await cancelRun(runId)
      setRun((current) => (current ? { ...current, ...response.run } : current))
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to cancel run")
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="grid gap-6">
      <SurfaceCard
        title={run ? `${run.keyword} in ${run.area}` : "Run Detail"}
        description="The run stays fixed to the Google Maps module and stores per-run snapshots on top of the global place catalog."
        actions={
          run && (run.status === "queued" || run.status === "running") ? (
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling || Boolean(run.cancel_requested_at)}
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm transition-colors hover:bg-muted disabled:opacity-60"
            >
              {run.cancel_requested_at ? "Cancel requested" : cancelling ? "Cancelling..." : "Cancel run"}
            </button>
          ) : null
        }
      >
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading run...</p>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : run ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Status</p>
              <div className="mt-3">
                <StatusPill status={run.status} />
              </div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Places saved</p>
              <p className="mt-3 text-2xl font-semibold">{formatNumber(run.total_places_saved)}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Attempts</p>
              <p className="mt-3 text-2xl font-semibold">{formatNumber(run.attempt_count)}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Created</p>
              <p className="mt-3 text-sm text-muted-foreground">{formatDateTime(run.created_at)}</p>
            </div>
          </div>
        ) : null}
      </SurfaceCard>

      <SurfaceCard title="Run Timeline" description="Timestamps are stored directly on the run row for simpler auditing.">
        {run ? (
          <dl className="grid gap-4 md:grid-cols-2">
            {[
              ["Queued", run.created_at],
              ["Started", run.started_at],
              ["Finished", run.finished_at],
              ["Scheduled for", run.scheduled_for],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-border/70 bg-background/80 p-4">
                <dt className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</dt>
                <dd className="mt-2 text-sm">{formatDateTime(value)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Run metadata unavailable.</p>
        )}
      </SurfaceCard>

      <SurfaceCard title="Results" description="Each row points to a deduped place plus the snapshot captured in this run.">
        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground">No saved places yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                <tr>
                  <th className="pb-3 pr-4">#</th>
                  <th className="pb-3 pr-4">Business</th>
                  <th className="pb-3 pr-4">Rating</th>
                  <th className="pb-3 pr-4">Contact</th>
                  <th className="pb-3 pr-4">Captured</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <tr key={result.id} className="border-t border-border/70 align-top">
                    <td className="py-4 pr-4">{formatNumber(result.position)}</td>
                    <td className="py-4 pr-4">
                      <a
                        href={result.place.google_maps_url}
                        target="_blank"
                        rel="noreferrer"
                        className="scraper-link font-medium"
                      >
                        {result.place.name}
                      </a>
                      <p className="mt-1 text-muted-foreground">{result.place.address || "No address"}</p>
                    </td>
                    <td className="py-4 pr-4">
                      <p>{result.snapshot.rating ?? "—"}</p>
                      <p className="mt-1 text-muted-foreground">
                        {formatNumber(result.snapshot.review_count)} reviews
                      </p>
                    </td>
                    <td className="py-4 pr-4">
                      <p>{result.place.phone || "—"}</p>
                      <p className="mt-1 text-muted-foreground">{result.place.website || "No website"}</p>
                    </td>
                    <td className="py-4 pr-4 text-muted-foreground">{formatDateTime(result.snapshot.scraped_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SurfaceCard>
    </div>
  )
}
