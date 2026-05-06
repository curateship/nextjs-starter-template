import { useEffect, useState } from "react"
import { useParams } from "@tanstack/react-router"
import { ExternalLinkIcon, RefreshCwIcon } from "lucide-react"
import { SurfaceCard } from "@/components/surface-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getRun, getRunResults, type ScraperResult, type ScraperRun } from "@/lib/api"
import { formatDateTime, formatNumber, formatStatus } from "@/lib/format"

export function RunDetailPage() {
  const { runId } = useParams({ from: "/runs/$runId" })
  const [run, setRun] = useState<ScraperRun | null>(null)
  const [results, setResults] = useState<ScraperResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadRun() {
    try {
      setLoading(true)
      setError(null)
      const [runResponse, resultsResponse] = await Promise.all([
        getRun(runId),
        getRunResults(runId),
      ])
      setRun(runResponse.run)
      setResults(resultsResponse.results)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load run")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRun()
  }, [runId])

  return (
    <div className="grid gap-6">
      <SurfaceCard
        title="Run Detail"
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => void loadRun()}>
            <RefreshCwIcon className="size-4" />
            Refresh
          </Button>
        }
      >
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading run...</p>
        ) : error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : run ? (
          <div className="grid gap-4 md:grid-cols-4">
            <Metric label="Module" value={run.module_key} />
            <Metric label="Status" value={formatStatus(run.status)} />
            <Metric label="Results" value={formatNumber(run.total_results)} />
            <Metric label="Created" value={formatDateTime(run.created_at)} />
          </div>
        ) : null}
      </SurfaceCard>

      <SurfaceCard title="Results">
        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground">No results yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Words</TableHead>
                  <TableHead>Links</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result) => (
                  <TableRow key={result.id}>
                    <TableCell>
                      <p className="font-medium">{result.title || result.source_url || "Untitled"}</p>
                      {result.summary ? (
                        <p className="mt-1 max-w-xl truncate text-sm text-muted-foreground">{result.summary}</p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{String(result.metrics.status_code ?? "-")}</Badge>
                    </TableCell>
                    <TableCell>{String(result.metrics.word_count ?? "-")}</TableCell>
                    <TableCell>{String(result.metrics.link_count ?? "-")}</TableCell>
                    <TableCell>
                      {result.source_url ? (
                        <Button asChild variant="ghost" size="icon">
                          <a href={result.source_url} target="_blank" rel="noreferrer">
                            <ExternalLinkIcon className="size-4" />
                            <span className="sr-only">Open URL</span>
                          </a>
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SurfaceCard>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/80 p-4">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className="mt-2 truncate text-sm font-medium">{value}</p>
    </div>
  )
}
