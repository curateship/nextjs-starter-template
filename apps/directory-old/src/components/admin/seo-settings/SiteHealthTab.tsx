'use client'

import { useCallback, useEffect, useState } from 'react'
import CheckCircle from "lucide-react/dist/esm/icons/circle-check-big.js"
import Clock from "lucide-react/dist/esm/icons/clock.js"
import XCircle from "lucide-react/dist/esm/icons/circle-x.js"
import { RelativeDate } from '@/components/admin/layout/list'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardGroup, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getCronJobs, toggleCronJob, type CronJob } from '@/lib/actions/cron/cron-actions'

interface SiteHealthTabProps {
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

function formatDuration(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return null
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function SiteHealthTab({ refreshSignal, onLoadingChange }: SiteHealthTabProps) {
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(true)
  const [togglingJobId, setTogglingJobId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const cronResult = await getCronJobs()
    if (cronResult.data) setJobs(cronResult.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData, refreshSignal])

  useEffect(() => {
    onLoadingChange?.(loading)
  }, [loading, onLoadingChange])

  async function handleToggle(jobId: string, enabled: boolean) {
    setTogglingJobId(jobId)
    setJobs((prev) => prev.map((job) => job.id === jobId ? { ...job, enabled } : job))
    const { success } = await toggleCronJob({ data: { jobId: jobId, enabled: enabled } })
    if (!success) {
      setJobs((prev) => prev.map((job) => job.id === jobId ? { ...job, enabled: !enabled } : job))
    }
    setTogglingJobId(null)
  }

  if (loading) {
    return null
  }

  const enabledJobs = jobs.filter((job) => job.enabled).length
  const failedJobs = jobs.filter((job) => job.lastRun?.status && job.lastRun.status !== 'success').length

  return (
    <CardGroup className="grid">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Cron Jobs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cron jobs configured</p>
          ) : (
            <div className="space-y-3">
              <div className="mb-4 flex items-center gap-3">
                <Badge variant="secondary">{jobs.length} total</Badge>
                <Badge className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300">{enabledJobs} active</Badge>
                {failedJobs > 0 && <Badge variant="destructive">{failedJobs} last failed</Badge>}
              </div>

              {jobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between gap-4 border-b py-3 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">{job.name}</span>
                      <Badge variant="secondary" className="font-mono text-xs">{formatSchedule(job.schedule)}</Badge>
                      <Badge variant={job.enabled ? 'default' : 'secondary'} className="text-xs">
                        {job.enabled ? 'Active' : 'Stopped'}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      {job.lastRun?.status === 'success' ? (
                        <span className="inline-flex items-center gap-1 font-medium text-green-700 dark:text-green-300">
                          <CheckCircle className="h-4 w-4" />
                          Last run succeeded
                        </span>
                      ) : job.lastRun?.status ? (
                        <span className="inline-flex items-center gap-1 font-medium text-destructive">
                          <XCircle className="h-4 w-4" />
                          Last run failed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          No runs yet
                        </span>
                      )}
                      <span><RelativeDate date={job.lastRun?.startedAt ?? job.lastRunAt} fallback="Never" /></span>
                      {job.lastRun?.httpStatus && <span>HTTP {job.lastRun.httpStatus}</span>}
                      {formatDuration(job.lastRun?.durationMs) && <span>{formatDuration(job.lastRun?.durationMs)}</span>}
                    </div>
                  </div>
                  <Button
                    variant={job.enabled ? 'destructive' : 'outline'}
                    size="sm"
                    onClick={() => handleToggle(job.id, !job.enabled)}
                    disabled={togglingJobId === job.id}
                    className="shrink-0"
                  >
                    {job.enabled ? 'Stop' : 'Start'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </CardGroup>
  )
}
