import { useEffect, useState } from "react"
import { Link } from "@tanstack/react-router"
import { ExternalLinkIcon, RefreshCwIcon } from "lucide-react"
import { SurfaceCard } from "@/components/surface-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createRun, listRuns, type ScraperRun } from "@/lib/api"
import { formatDateTime, formatNumber, formatStatus } from "@/lib/format"

const MODULE_KEY = "page_metadata"

export function PageMetadataModulePage() {
  const [runs, setRuns] = useState<ScraperRun[]>([])
  const [url, setUrl] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  async function loadRuns() {
    try {
      setLoading(true)
      setError(null)
      const response = await listRuns(MODULE_KEY)
      setRuns(response.runs)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load runs")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRuns()
  }, [])

  async function handleCreateRun() {
    const trimmedUrl = url.trim()
    if (!trimmedUrl || submitting) {
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      await createRun({
        module_key: MODULE_KEY,
        input: { url: trimmedUrl },
      })
      setUrl("")
      await loadRuns()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to create run")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid gap-6">
      <SurfaceCard title="Page Metadata" description="Create runs for public URLs.">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="metadataUrl">URL</Label>
            <Input
              id="metadataUrl"
              type="url"
              value={url}
              placeholder="https://example.com"
              onChange={(event) => setUrl(event.target.value)}
            />
          </div>
          <Button type="button" onClick={() => void handleCreateRun()} disabled={submitting || !url.trim()}>
            {submitting ? "Creating..." : "Create Run"}
          </Button>
        </div>
        {error ? (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
      </SurfaceCard>

      <SurfaceCard
        title="Runs"
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => void loadRuns()}>
            <RefreshCwIcon className="size-4" />
            Refresh
          </Button>
        }
      >
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading runs...</p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Results</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="max-w-md truncate">{String(run.input.url ?? "-")}</TableCell>
                    <TableCell>
                      <Badge variant={run.status === "failed" ? "destructive" : "secondary"}>
                        {formatStatus(run.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatNumber(run.total_results)}</TableCell>
                    <TableCell>{formatDateTime(run.created_at)}</TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="icon">
                        <Link to="/runs/$runId" params={{ runId: run.id }}>
                          <ExternalLinkIcon className="size-4" />
                          <span className="sr-only">Open run</span>
                        </Link>
                      </Button>
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
