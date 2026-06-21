"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  Bot,
  CalendarDays,
  Clock,
  ExternalLink,
  FileText,
  History,
  Loader2,
  Play,
  Workflow,
} from "lucide-react"

import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { AdminErrorDialog } from "@/components/admin/layout/list"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getAiAutomationById,
  runAiAutomationNow,
} from "@/lib/actions/ai-automations/automation-actions"
import type {
  AiAgentAutomation,
  AiAgentAutomationReference,
  AiAgentAutomationRun,
  AiAutomationStatus,
} from "@/lib/actions/ai-automations/types"
import { AI_PROVIDER_LABELS } from "@/lib/utils/ai-models"

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function formatDateTime(value: string | null) {
  if (!value) return "Not scheduled"
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function formatDuration(ms: number | null) {
  if (ms == null) return "-"
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

function formatBytes(bytes: number | null) {
  if (!bytes) return null
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1)
  return `${parseFloat((bytes / Math.pow(1024, index)).toFixed(2))} ${sizes[index]}`
}

function formatFrequency(frequency: AiAgentAutomation["recurrence"]["frequency"]) {
  if (frequency === "daily") return "Daily"
  if (frequency === "weekly") return "Weekly"
  return "Monthly"
}

function formatScheduleDay(automation: AiAgentAutomation) {
  if (automation.recurrence.frequency === "weekly") {
    return WEEKDAYS[automation.recurrence.dayOfWeek ?? 1]
  }

  if (automation.recurrence.frequency === "monthly") {
    return `Day ${automation.recurrence.dayOfMonth ?? 1}`
  }

  return null
}

function formatScheduleLine(automation: AiAgentAutomation) {
  const day = formatScheduleDay(automation)
  return [formatFrequency(automation.recurrence.frequency), day, automation.recurrence.time].filter(Boolean).join(" · ")
}

function formatTriggerType(triggerType: string) {
  return triggerType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function getStatusBadge(status: AiAutomationStatus | AiAgentAutomationRun["status"]) {
  if (status === "active" || status === "success") {
    return <Badge className="bg-green-100 text-green-800">{status === "active" ? "Active" : "Success"}</Badge>
  }
  if (status === "paused" || status === "running") {
    return <Badge className="bg-yellow-100 text-yellow-800">{status === "paused" ? "Paused" : "Running"}</Badge>
  }
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>
  return <Badge variant="secondary">Draft</Badge>
}

function getRunPreview(run: AiAgentAutomationRun) {
  if (run.output) return run.output
  if (run.error) return run.error
  return run.status === "running" ? "Run in progress." : "No output captured."
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1">
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  )
}

function ResultsSkeleton() {
  return (
    <div className="grid gap-6">
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <Skeleton className="h-7 w-64" />
              <Skeleton className="h-4 w-full max-w-xl" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-14 w-24" />
              <Skeleton className="h-14 w-24" />
              <Skeleton className="h-14 w-24" />
            </div>
          </div>
        </CardContent>
      </Card>

      <CardGroup className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-6 w-20" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <Skeleton className="h-72 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-48 w-full" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-28" />
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            </CardContent>
          </Card>
        </div>
      </CardGroup>
    </div>
  )
}

export default function AutomationResultsPage() {
  const params = useParams()
  const automationId = params.automationId as string
  const [automation, setAutomation] = useState<AiAgentAutomation | null>(null)
  const [references, setReferences] = useState<AiAgentAutomationReference[]>([])
  const [runs, setRuns] = useState<AiAgentAutomationRun[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  const showError = useCallback((message: string) => {
    setErrorMessage(message)
    setErrorDialogOpen(true)
  }, [])

  const loadAutomation = useCallback(async () => {
    setLoading(true)
    const { data, references: referenceRows, runs: runRows, error } = await getAiAutomationById(automationId)
    if (error || !data) {
      showError(error || "Automation not found")
      setLoading(false)
      return
    }

    setAutomation(data)
    setReferences(referenceRows)
    setRuns(runRows)
    setLoading(false)
  }, [automationId, showError])

  useEffect(() => {
    loadAutomation()
  }, [loadAutomation])

  const handleRunNow = async () => {
    if (!automation) return

    setRunning(true)
    const { error } = await runAiAutomationNow(automation.id)
    if (error) showError(error)
    await loadAutomation()
    setRunning(false)
  }

  const latestRun = runs[0] ?? null
  const referenceChars = references.reduce((total, reference) => total + reference.extracted_chars, 0)

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[{ label: "Automations", href: "/admin/automations" }, { label: automation?.name ?? "Results" }]}
            actions={
              <Button type="button" variant="outline" size="sm" onClick={handleRunNow} disabled={running || loading || !automation}>
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Run Now
              </Button>
            }
          />

          {loading ? (
            <ResultsSkeleton />
          ) : !automation ? (
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">Automation not found.</p>
                <Button asChild variant="outline" className="mt-4">
                  <Link href="/admin/automations">Back to Automations</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6">
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex flex-col gap-5 border-b bg-muted/20 p-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h1 className="truncate text-xl font-semibold">{automation.name}</h1>
                        {getStatusBadge(automation.status)}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Bot className="h-4 w-4" />
                          {automation.model}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="h-4 w-4" />
                          {formatScheduleLine(automation)}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="h-4 w-4" />
                          Next: {formatDateTime(automation.next_run_at)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 lg:w-[360px]">
                      <div className="rounded-md border bg-background p-3">
                        <div className="text-xs text-muted-foreground">Runs</div>
                        <div className="mt-1 text-lg font-semibold">{runs.length}</div>
                      </div>
                      <div className="rounded-md border bg-background p-3">
                        <div className="text-xs text-muted-foreground">References</div>
                        <div className="mt-1 text-lg font-semibold">{references.length}</div>
                      </div>
                      <div className="rounded-md border bg-background p-3">
                        <div className="text-xs text-muted-foreground">Last run</div>
                        <div className="mt-1 truncate text-sm font-medium">
                          {latestRun ? formatDateTime(latestRun.started_at) : "Never"}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <CardGroup className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="grid gap-6">
                  <Card className="overflow-hidden">
                    <CardHeader className="border-b bg-muted/20">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <CardTitle className="text-base">Latest Result</CardTitle>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {latestRun ? formatDateTime(latestRun.started_at) : "No automation runs yet."}
                          </p>
                        </div>
                        {latestRun ? (
                          <div className="flex flex-wrap items-center gap-2">
                            {getStatusBadge(latestRun.status)}
                            <Badge variant="outline">{formatTriggerType(latestRun.trigger_type)}</Badge>
                            <Badge variant="outline">{formatDuration(latestRun.duration_ms)}</Badge>
                          </div>
                        ) : null}
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      {!latestRun ? (
                        <div className="flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center">
                          <div className="rounded-full border bg-muted/30 p-3">
                            <Play className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <div className="text-sm font-medium">No result yet</div>
                            <p className="mt-1 text-sm text-muted-foreground">Run the automation to generate its first result.</p>
                          </div>
                          <Button type="button" variant="outline" size="sm" onClick={handleRunNow} disabled={running}>
                            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                            Run Now
                          </Button>
                        </div>
                      ) : (
                        <div className="grid gap-0">
                          {latestRun.output ? (
                            <section>
                              <div className="border-b px-5 py-3 text-sm font-medium">Output</div>
                              <pre className="max-h-[560px] min-h-72 overflow-auto whitespace-pre-wrap break-words bg-background p-5 text-sm leading-relaxed">
                                {latestRun.output}
                              </pre>
                            </section>
                          ) : null}

                          {latestRun.error ? (
                            <section>
                              <div className="border-y px-5 py-3 text-sm font-medium text-destructive">Error</div>
                              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words bg-destructive/10 p-5 text-sm leading-relaxed text-destructive">
                                {latestRun.error}
                              </pre>
                            </section>
                          ) : null}

                          {!latestRun.output && !latestRun.error ? (
                            <div className="flex min-h-72 items-center justify-center p-8 text-center text-sm text-muted-foreground">
                              {latestRun.status === "running" ? "Run in progress." : "No output captured for this run."}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <History className="h-4 w-4 text-muted-foreground" />
                        Run History
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {runs.length === 0 ? (
                        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                          No runs yet.
                        </div>
                      ) : (
                        <div className="overflow-hidden rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead column="meta">Status</TableHead>
                                <TableHead column="meta">Trigger</TableHead>
                                <TableHead column="meta">Started</TableHead>
                                <TableHead column="meta">Duration</TableHead>
                                <TableHead column="main">Result</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {runs.map((run) => (
                                <TableRow key={run.id}>
                                  <TableCell column="meta">{getStatusBadge(run.status)}</TableCell>
                                  <TableCell column="mutedMeta">{formatTriggerType(run.trigger_type)}</TableCell>
                                  <TableCell column="mutedMeta">{formatDateTime(run.started_at)}</TableCell>
                                  <TableCell column="mutedMeta">{formatDuration(run.duration_ms)}</TableCell>
                                  <TableCell column="main">
                                    <div className="max-w-[520px] truncate text-sm text-muted-foreground">
                                      {getRunPreview(run)}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid content-start gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Workflow className="h-4 w-4 text-muted-foreground" />
                        Prompt
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs leading-relaxed">
                        {automation.prompt || "No prompt saved."}
                      </pre>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        References
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {references.length === 0 ? (
                        <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                          No references added.
                        </div>
                      ) : (
                        <div className="overflow-hidden rounded-md border">
                          {references.map((reference) => (
                            <div key={reference.id} className="grid gap-2 border-b p-3 last:border-b-0">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium">{reference.label}</div>
                                {reference.source_url ? (
                                  <a
                                    href={reference.source_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex max-w-full items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground"
                                  >
                                    <span className="truncate">{reference.source_url}</span>
                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                  </a>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">{reference.reference_type === "url" ? "URL" : "File"}</Badge>
                                <span className="text-xs text-muted-foreground">{formatBytes(reference.file_size) ?? "-"}</span>
                                <span className="text-xs text-muted-foreground">
                                  {reference.extracted_chars.toLocaleString()} chars
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Configuration</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                        <DetailItem label="Provider" value={AI_PROVIDER_LABELS[automation.provider]} />
                        <DetailItem label="Model" value={automation.model} />
                        <DetailItem label="Schedule" value={formatScheduleLine(automation)} />
                        <DetailItem label="Timezone" value={automation.recurrence.timezone} />
                        <DetailItem label="Reference text" value={`${referenceChars.toLocaleString()} chars`} />
                        <DetailItem label="Updated" value={formatDateTime(automation.updated_at)} />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CardGroup>
            </div>
          )}

          <AdminErrorDialog open={errorDialogOpen} message={errorMessage} onOpenChange={setErrorDialogOpen} />
        </div>
      </AdminLayout>
    </>
  )
}
