"use client"

import { useState, useEffect } from "react"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Field, FieldLabel } from "@/components/ui/field"
import { DashboardModalCardTitle, DashboardModalContent } from "@/components/admin/layout/dashboard/modals"
import { sendNewsletter, sendTestNewsletter } from "@/lib/actions/newsletters/newsletter-actions"
import { getAudienceCount } from "@/lib/actions/newsletters/audience-sync-actions"
import { getSegmentsBySite } from "@/lib/actions/newsletters/segment-actions"
import { getCronStatus } from "@/lib/actions/cron/cron-actions"
import type { Newsletter } from "@/lib/actions/newsletters/newsletter-actions"
import type { Segment } from "@/lib/actions/newsletters/segment-actions"
import Users from "lucide-react/dist/esm/icons/users.js"
import TestTube from "lucide-react/dist/esm/icons/test-tube.js"
import Send from "lucide-react/dist/esm/icons/send.js"
import Radio from "lucide-react/dist/esm/icons/radio.js"
import AlertTriangle from "lucide-react/dist/esm/icons/triangle-alert.js"
import CheckCircle2 from "lucide-react/dist/esm/icons/circle-check.js"
import { formatNewsletterSendWindows, getNewsletterSendWindows } from "@/lib/actions/newsletters/send-windows"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"

interface PublishNewsletterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  newsletter: Newsletter | null
  siteId: string
  onSuccess: (updatedNewsletter: Newsletter) => void
}

export function PublishNewsletterModal({
  open,
  onOpenChange,
  newsletter,
  siteId,
  onSuccess,
}: PublishNewsletterModalProps) {
  const [audienceCount, setAudienceCount] = useState<number | null>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [sending, setSending] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [cronStatus, setCronStatus] = useState<{ isRunning: boolean; enabledCount: number; totalCount: number; lastRunAt: string | null } | null>(null)
  const [cronStatusLoaded, setCronStatusLoaded] = useState(false)
  // Failures report through the one shared error toast, never inside the modal
  // body — see workspace/docs/admin-action-feedback.md.
  const setError = (message: string | null) => {
    if (message) showErrorToast(message)
    else dismissErrorToast()
  }
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Load segments
  useEffect(() => {
    if (!open || !siteId) return
    getSegmentsBySite({ data: { siteId: siteId } }).then(({ data }) => setSegments(data || []))
  }, [open, siteId])

  useEffect(() => {
    if (!open || !siteId) return
    setCronStatusLoaded(false)
    getCronStatus({ data: { siteId: siteId } }).then(({ data }) => {
      setCronStatus(data)
      setCronStatusLoaded(true)
    })
  }, [open, siteId])

  // Load audience count
  useEffect(() => {
    if (!open || !siteId || !newsletter) return

    const filter = newsletter.audience_filter
    if (!filter || (!filter.audience && !filter.tags?.length && !filter.segment_id)) {
      setAudienceCount(null)
      return
    }

    if (filter.segment_id) {
      getAudienceCount({ data: { siteId: siteId, audienceFilter: { segment_id: filter.segment_id } } }).then(({ count }) => setAudienceCount(count))
    } else {
      const tags = filter.tags || []
      const countFilter = tags.length ? { tags } : {}
      getAudienceCount({ data: { siteId: siteId, audienceFilter: countFilter } }).then(({ count }) => setAudienceCount(count))
    }
  }, [open, siteId, newsletter])

  useEffect(() => {
    if (open) {
      setError(null)
      setSuccessMsg(null)
    } else {
      setCronStatus(null)
      setCronStatusLoaded(false)
    }
  }, [open])

  const handleSendTest = async () => {
    if (!newsletter || !testEmail) return
    setSendingTest(true)
    setError(null)
    setSuccessMsg(null)

    const { success, error: sendError } = await sendTestNewsletter({ data: { newsletterId: newsletter.id, testEmail: testEmail } })
    if (sendError) {
      setError(sendError)
    } else if (success) {
      setSuccessMsg(`Test sent to ${testEmail}`)
    }
    setSendingTest(false)
  }

  const handleConfirmAndBroadcast = async () => {
    if (!newsletter) return
    setSending(true)
    setError(null)

    const { success, error: sendError } = await sendNewsletter({ data: { newsletterId: newsletter.id } })
    setSending(false)
    if (sendError) {
      setError(sendError)
      return
    }
    if (success) {
      const { getNewsletterById } = await import("@/lib/actions/newsletters/newsletter-actions")
      const { data } = await getNewsletterById({ data: { newsletterId: newsletter.id } })
      if (data) onSuccess(data)
      onOpenChange(false)
    }
  }

  if (!newsletter) return null

  const filter = newsletter.audience_filter || {}
  const drip = newsletter.metadata?.drip_config
  const hasAudience = filter.audience === 'all' || filter.tags?.length || filter.segment_id
  const sendWindowLabel = drip?.enabled && getNewsletterSendWindows(drip).length > 0
    ? formatNewsletterSendWindows(drip)
    : null

  // Resolve segment name
  const segmentName = filter.segment_id
    ? segments.find(s => s.id === filter.segment_id)?.name || 'Selected Segment'
    : null

  const audienceLabel = !hasAudience
    ? 'No audience selected. Configure in Settings.'
    : filter.audience === 'all'
      ? 'All Contacts'
      : segmentName
        ? `Segment: ${segmentName}`
        : `Custom filter: ${filter.tags?.join(', ')}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DashboardModalContent
        title={
          <span className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            Publish Newsletter
          </span>
        }
        description="Review the audience and delivery settings before broadcasting this newsletter."
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="w-full sm:w-auto" tabIndex={!hasAudience ? 0 : -1}>
                    <Button onClick={handleConfirmAndBroadcast} disabled={sending || !hasAudience}>
                      <Send className="mr-2 h-4 w-4" />
                      {sending ? 'Broadcasting...' : 'Confirm and Broadcast'}
                    </Button>
                  </span>
                </TooltipTrigger>
                {!hasAudience && (
                  <TooltipContent side="top">
                    Fix the audience requirement first.
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </>
        }
      >
        {successMsg && (
          <div className="px-6 pb-2">
            <div className="rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/50 p-3">
              <p className="text-sm text-green-800 dark:text-green-300">{successMsg}</p>
            </div>
          </div>
        )}

        <CardGroup className="grid">
          <Card>
            <CardHeader>
              <DashboardModalCardTitle>Send details</DashboardModalCardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-start justify-between py-1.5">
                  <span className="text-sm text-muted-foreground">Subject</span>
                  <span className="text-sm font-medium text-right max-w-[300px]">{newsletter.subject}</span>
                </div>

                <div className="flex items-start justify-between py-1.5">
                  <span className="text-sm text-muted-foreground">Audience</span>
                  <div className="text-right">
                    {hasAudience ? (
                      <>
                        <span className="text-sm font-medium">{audienceLabel}</span>
                        <div className="flex items-center gap-1.5 justify-end mt-1">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {audienceCount !== null
                              ? `${audienceCount.toLocaleString()} contact${audienceCount !== 1 ? 's' : ''}`
                              : 'Calculating...'}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-end gap-1.5 text-xs text-orange-700">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>{audienceLabel}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-start justify-between py-1.5">
                  <span className="text-sm text-muted-foreground">Delivery</span>
                  <div className="text-right">
                    {drip?.enabled ? (
                      <>
                        <span className="text-sm font-medium">Drip Send</span>
                        <p className="text-xs text-muted-foreground mt-1">
                          {drip.batch_size_min}-{drip.batch_size_max} per batch
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Every {drip.interval_min_minutes}-{drip.interval_max_minutes} min
                        </p>
                        {sendWindowLabel && (
                          <p className="text-xs text-muted-foreground">
                            Window: {sendWindowLabel}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Bounce threshold: {drip.bounce_threshold_percent}%
                        </p>
                      </>
                    ) : (
                      <span className="text-sm font-medium">Send All at Once</span>
                    )}
                  </div>
                </div>

                <div className="flex items-start justify-between py-1.5">
                  <span className="text-sm text-muted-foreground">Cron Status</span>
                  <div className="text-right">
                    {!cronStatusLoaded ? (
                      <p className="text-xs text-muted-foreground">Checking...</p>
                    ) : cronStatus?.totalCount === 0 ? (
                      <div className="flex items-center justify-end gap-1.5 text-xs text-orange-700">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>No crons setup.</span>
                      </div>
                    ) : cronStatus ? (
                      cronStatus.isRunning ? (
                        <div className="flex items-center justify-end gap-1.5 text-xs text-green-700 dark:text-green-300">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>{cronStatus.enabledCount} cron{cronStatus.enabledCount !== 1 ? 's' : ''} running</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5 text-xs text-orange-700">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <span>No crons are running.</span>
                        </div>
                      )
                    ) : (
                      <div className="flex items-center justify-end gap-1.5 text-xs text-orange-700">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>Unable to load cron status.</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <Field>
                <FieldLabel htmlFor="publish-test-email">Send a test first</FieldLabel>
                <div className="flex items-center gap-2">
                  <Input
                    id="publish-test-email"
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="flex-1"
                  />
                  <Button variant="outline" onClick={handleSendTest} disabled={sendingTest || !testEmail}>
                    <TestTube className="h-4 w-4 mr-1" />
                    {sendingTest ? 'Sending...' : 'Test'}
                  </Button>
                </div>
              </Field>
            </CardContent>
          </Card>
        </CardGroup>
      </DashboardModalContent>
    </Dialog>
  )
}
