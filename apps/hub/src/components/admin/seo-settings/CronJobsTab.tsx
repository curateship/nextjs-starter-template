'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  getCronJobRuns,
  getCronJobs,
  toggleCronJob,
  type CronJob,
  type CronJobRun,
} from '@/lib/actions/cron/cron-actions'

interface CronJobsTabProps {
  searchQuery: string
  refreshSignal: number
  onLoadingChange?: (loading: boolean) => void
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
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function CronJobsTab({ searchQuery, refreshSignal, onLoadingChange }: CronJobsTabProps) {
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedJob, setSelectedJob] = useState<CronJob | null>(null)
  const [runs, setRuns] = useState<CronJobRun[]>([])
  const [runsLoading, setRunsLoading] = useState(false)

  const loadJobs = useCallback(async () => {
    setLoading(true)
    const { data } = await getCronJobs()
    if (data) setJobs(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadJobs()
  }, [loadJobs, refreshSignal])

  useEffect(() => {
    onLoadingChange?.(loading)
  }, [loading, onLoadingChange])

  async function handleToggle(jobId: string, enabled: boolean) {
    setJobs((prev) => prev.map((job) => job.id === jobId ? { ...job, enabled } : job))
    const { success } = await toggleCronJob(jobId, enabled)
    if (!success) {
      setJobs((prev) => prev.map((job) => job.id === jobId ? { ...job, enabled: !enabled } : job))
    }
  }

  async function openRunHistory(job: CronJob) {
    setSelectedJob(job)
    setRunsLoading(true)
    const { data } = await getCronJobRuns(job.id)
    if (data) setRuns(data)
    setRunsLoading(false)
  }

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredJobs = normalizedSearchQuery
    ? jobs.filter((job) => {
        const searchText = [
          job.name,
          job.endpoint,
          job.schedule,
          job.lastRun?.status,
          job.enabled ? 'enabled' : 'disabled',
        ].filter(Boolean).join(' ').toLowerCase()

        return searchText.includes(normalizedSearchQuery)
      })
    : jobs

  return (
    <>
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <Card key={item} className="p-5">
              <div className="mb-3 h-5 w-48 animate-pulse rounded bg-muted" />
              <div className="h-4 w-32 animate-pulse rounded bg-muted/60" />
            </Card>
          ))}
        </div>
      ) : filteredJobs.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          {normalizedSearchQuery ? 'No cron jobs match your search.' : 'No cron jobs configured'}
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredJobs.map((job) => (
            <Card key={job.id} className="p-5">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-3">
                    <h3 className="cursor-pointer truncate font-medium hover:underline" onClick={() => openRunHistory(job)}>
                      {job.name}
                    </h3>
                    <Badge variant="secondary" className="shrink-0 font-mono text-xs">
                      {formatSchedule(job.schedule)}
                    </Badge>
                    {job.lastRun && (
                      <Badge className={job.lastRun.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                        {job.lastRun.status === 'success' ? (
                          <CheckCircle className="mr-1 h-3 w-3" />
                        ) : (
                          <XCircle className="mr-1 h-3 w-3" />
                        )}
                        {job.lastRun.status}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="font-mono text-xs">{job.endpoint}</span>
                    <span>Last run: {timeAgo(job.lastRun?.startedAt ?? job.lastRunAt)}</span>
                    {job.lastRun?.durationMs !== undefined && <span>{formatDuration(job.lastRun.durationMs)}</span>}
                  </div>
                </div>

                <Button
                  variant={job.enabled ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={() => handleToggle(job.id, !job.enabled)}
                  className="ml-4 shrink-0"
                >
                  {job.enabled ? 'Stop' : 'Start'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selectedJob} onOpenChange={() => setSelectedJob(null)}>
        <DialogContent size="admin" className="max-h-[80vh] p-10">
          <DialogHeader>
            <DialogTitle>{selectedJob?.name} - Run History</DialogTitle>
          </DialogHeader>

          {runsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((item) => <div key={item} className="h-12 animate-pulse rounded bg-muted" />)}
            </div>
          ) : runs.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No runs recorded yet</p>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => (
                <div key={run.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                  {run.status === 'success' ? (
                    <CheckCircle className="h-4 w-4 shrink-0 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-red-600" />
                  )}
                  <span className="text-muted-foreground">{formatTime(run.startedAt)}</span>
                  <Badge variant="secondary" className="text-xs">{run.httpStatus ?? '-'}</Badge>
                  <span className="text-muted-foreground">{formatDuration(run.durationMs)}</span>
                  {run.response && (
                    <span className="flex-1 truncate font-mono text-xs text-muted-foreground">
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
