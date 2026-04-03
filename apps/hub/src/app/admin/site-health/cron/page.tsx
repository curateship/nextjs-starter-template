"use client"

import { useState, useEffect } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { getSiteHealthAdminTopNavLinks } from "@/components/admin/layout/dashboard/admin-top-nav-links"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  getCronJobs,
  toggleCronJob,
  getCronJobRuns,
} from "@/lib/actions/cron/cron-actions"
import type { CronJob, CronJobRun } from "@/lib/actions/cron/cron-actions"
import { RefreshCw, CheckCircle, XCircle } from "lucide-react"

export default function CronJobsPage() {
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedJob, setSelectedJob] = useState<CronJob | null>(null)
  const [runs, setRuns] = useState<CronJobRun[]>([])
  const [runsLoading, setRunsLoading] = useState(false)

  useEffect(() => {
    loadJobs()
  }, [])

  async function loadJobs() {
    setLoading(true)
    const { data } = await getCronJobs()
    if (data) setJobs(data)
    setLoading(false)
  }

  async function handleToggle(jobId: string, enabled: boolean) {
    // Optimistic update
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, enabled } : j))
    const { success } = await toggleCronJob(jobId, enabled)
    if (!success) {
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, enabled: !enabled } : j))
    }
  }

  async function openRunHistory(job: CronJob) {
    setSelectedJob(job)
    loadRuns(job.id)
  }

  async function loadRuns(jobId: string) {
    setRunsLoading(true)
    const { data } = await getCronJobRuns(jobId)
    if (data) setRuns(data)
    setRunsLoading(false)
  }

  function formatSchedule(schedule: string) {
    if (schedule.startsWith('*/')) {
      const mins = schedule.split(' ')[0].slice(2)
      return `Every ${mins} min`
    }
    if (schedule.startsWith('0 ')) return 'Every hour'
    return schedule
  }

  function timeAgo(dateStr: string | null) {
    if (!dateStr) return 'Never'
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  function formatDuration(ms: number | null) {
    if (ms === null) return '-'
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  return (
    <>
      <StickyHeader navLinks={getSiteHealthAdminTopNavLinks("cron")} />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[
              { label: "Site Health", href: "/admin/site-health" },
              { label: "Cron Jobs" },
            ]}
            actions={
              <Button variant="outline" onClick={loadJobs} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            }
          />

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Card key={i} className="p-5">
                  <div className="h-5 bg-muted rounded animate-pulse w-48 mb-3" />
                  <div className="h-4 bg-muted/60 rounded animate-pulse w-32" />
                </Card>
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              No cron jobs configured
            </Card>
          ) : (
            <div className="space-y-3">
              {jobs.map(job => (
                <Card key={job.id} className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-medium truncate cursor-pointer hover:underline" onClick={() => openRunHistory(job)}>{job.name}</h3>
                        <Badge variant="secondary" className="text-xs font-mono shrink-0">
                          {formatSchedule(job.schedule)}
                        </Badge>
                        {job.lastRun && (
                          <Badge
                            className={
                              job.lastRun.status === 'success'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }
                          >
                            {job.lastRun.status === 'success' ? (
                              <CheckCircle className="h-3 w-3 mr-1" />
                            ) : (
                              <XCircle className="h-3 w-3 mr-1" />
                            )}
                            {job.lastRun.status}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="font-mono text-xs">{job.endpoint}</span>
                        <span>Last run: {timeAgo(job.lastRun?.startedAt ?? job.lastRunAt)}</span>
                        {job.lastRun?.durationMs !== undefined && (
                          <span>{formatDuration(job.lastRun.durationMs)}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 ml-4 shrink-0">
                      <Button
                        variant={job.enabled ? "destructive" : "outline"}
                        size="sm"
                        onClick={() => handleToggle(job.id, !job.enabled)}
                      >
                        {job.enabled ? "Stop" : "Start"}
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </AdminLayout>

      <Dialog open={!!selectedJob} onOpenChange={() => setSelectedJob(null)}>
        <DialogContent className="w-[840px] max-w-[95vw] max-h-[80vh] overflow-y-auto p-10" style={{ width: '840px', maxWidth: '95vw' }}>
          <DialogHeader>
            <DialogTitle>{selectedJob?.name} — Run History</DialogTitle>
          </DialogHeader>

          {runsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : runs.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No runs recorded yet</p>
          ) : (
            <div className="space-y-2">
              {runs.map(run => (
                <div key={run.id} className="flex items-center gap-3 p-3 rounded-lg border text-sm">
                  {run.status === 'success' ? (
                    <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                  )}
                  <span className="text-muted-foreground">{formatTime(run.startedAt)}</span>
                  <Badge variant="secondary" className="text-xs">
                    {run.httpStatus ?? '-'}
                  </Badge>
                  <span className="text-muted-foreground">{formatDuration(run.durationMs)}</span>
                  {run.response && (
                    <span className="text-xs text-muted-foreground font-mono truncate flex-1">
                      {run.response.substring(0, 100)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
