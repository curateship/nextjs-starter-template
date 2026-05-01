'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle, Clock, Mail, Shield, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useSiteSwitcher } from '@/components/admin/layout/providers/site-switcher-provider'
import { getCronJobs, type CronJob } from '@/lib/actions/cron/cron-actions'
import {
  getDeliverabilityReport,
  type DeliverabilityReport,
} from '@/lib/actions/newsletters/deliverability-actions'

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

function dnsStatusIcon(status: string) {
  if (status === 'pass') return <CheckCircle className="h-4 w-4 text-green-600" />
  if (status === 'fail') return <XCircle className="h-4 w-4 text-red-600" />
  return <AlertTriangle className="h-4 w-4 text-yellow-600" />
}

export function SiteHealthTab({ refreshSignal, onLoadingChange }: SiteHealthTabProps) {
  const { currentSite } = useSiteSwitcher()
  const [report, setReport] = useState<DeliverabilityReport | null>(null)
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [emailResult, cronResult] = await Promise.all([
      currentSite?.id ? getDeliverabilityReport(currentSite.id) : Promise.resolve({ data: null, error: null }),
      getCronJobs(),
    ])
    if (emailResult.data) setReport(emailResult.data)
    if (cronResult.data) setJobs(cronResult.data)
    setLoading(false)
  }, [currentSite?.id])

  useEffect(() => {
    loadData()
  }, [loadData, refreshSignal])

  useEffect(() => {
    onLoadingChange?.(loading)
  }, [loading, onLoadingChange])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <Card key={item}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
          <CardContent className="space-y-3">
            {[1, 2, 3].map((item) => <Skeleton key={item} className="h-12 w-full" />)}
          </CardContent>
        </Card>
      </div>
    )
  }

  const enabledJobs = jobs.filter((job) => job.enabled).length
  const failedJobs = jobs.filter((job) => job.lastRun?.status === 'error').length

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Domain Health</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {report?.domain ? (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{report.domain.domain}</span>
                <div className="flex items-center gap-3">
                  {(['spf', 'dkim', 'dmarc'] as const).map((record) => (
                    <div key={record} className="flex items-center gap-1">
                      {dnsStatusIcon(report.domain![record])}
                      <span className="text-xs font-medium uppercase">{record}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not configured</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Emails Sent (30d)</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{report?.emailMetrics?.totalSent?.toLocaleString() ?? '-'}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bounce Rate</CardTitle>
            {report && report.emailMetrics.bounceRate > 2 && <AlertCircle className="h-4 w-4 text-red-500" />}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${report && report.emailMetrics.bounceRate > 2 ? 'text-red-600' : ''}`}>
              {report?.emailMetrics?.bounceRate ?? '-'}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Complaint Rate</CardTitle>
            {report && report.emailMetrics.complaintRate > 0.1 && <AlertCircle className="h-4 w-4 text-red-500" />}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${report && report.emailMetrics.complaintRate > 0.1 ? 'text-red-600' : ''}`}>
              {report?.emailMetrics?.complaintRate ?? '-'}%
            </div>
          </CardContent>
        </Card>
      </div>

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
                <Badge className="bg-green-100 text-green-800">{enabledJobs} running</Badge>
                {failedJobs > 0 && <Badge variant="destructive">{failedJobs} failed</Badge>}
              </div>

              {jobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between border-b py-2 last:border-0">
                  <div className="flex items-center gap-3">
                    {job.lastRun?.status === 'success' ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : job.lastRun?.status === 'error' ? (
                      <XCircle className="h-4 w-4 text-red-600" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium">{job.name}</span>
                    <Badge variant="secondary" className="font-mono text-xs">{formatSchedule(job.schedule)}</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>{timeAgo(job.lastRun?.startedAt ?? job.lastRunAt)}</span>
                    <Badge variant={job.enabled ? 'default' : 'secondary'} className="text-xs">
                      {job.enabled ? 'Active' : 'Stopped'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
