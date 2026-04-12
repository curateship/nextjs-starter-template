import { useEffect, useState } from "react"
import { Link } from "@tanstack/react-router"
import { listRuns, type RunSummary } from "@/lib/api"
import { formatDateTime, formatNumber } from "@/lib/format"
import { StatusPill } from "@/components/status-pill"
import { SurfaceCard } from "@/components/surface-card"

export function RunsPage() {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        setLoading(true)
        setError(null)
        const response = await listRuns()

        if (!active) {
          return
        }

        setRuns(response.runs)
      } catch (caughtError) {
        if (!active) {
          return
        }

        setError(caughtError instanceof Error ? caughtError.message : "Failed to load runs")
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

  return (
    <SurfaceCard
      title="Runs"
      description="Each run creates a fresh browser context and stores deduped places plus a per-run snapshot."
      actions={
        <Link
          to="/google-maps/runs/new"
          className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Create run
        </Link>
      }
    >
      {error ? (
        <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading runs...</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No runs yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              <tr>
                <th className="pb-3 pr-4">Query</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Saved</th>
                <th className="pb-3 pr-4">Attempts</th>
                <th className="pb-3 pr-4">Created</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-t border-border/70 align-top">
                  <td className="py-4 pr-4">
                    <Link to="/google-maps/runs/$runId" params={{ runId: run.id }} className="scraper-link font-medium">
                      {run.keyword}
                    </Link>
                    <p className="mt-1 text-muted-foreground">{run.area}</p>
                  </td>
                  <td className="py-4 pr-4">
                    <div className="space-y-2">
                      <StatusPill status={run.status} />
                      {run.cancel_requested_at ? (
                        <p className="text-xs text-muted-foreground">Cancel requested</p>
                      ) : null}
                    </div>
                  </td>
                  <td className="py-4 pr-4">{formatNumber(run.total_places_saved)}</td>
                  <td className="py-4 pr-4">{formatNumber(run.attempt_count)}</td>
                  <td className="py-4 pr-4 text-muted-foreground">{formatDateTime(run.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SurfaceCard>
  )
}
