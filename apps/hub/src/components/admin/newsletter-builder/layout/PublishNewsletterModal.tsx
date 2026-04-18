"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  AdminModalBody,
  AdminModalContent,
  AdminModalDescription,
  AdminModalFooter,
  AdminModalHeader,
  AdminModalTitle,
} from "@/components/admin/layout/builder/AdminModalLayout"
import { updateNewsletter, sendNewsletter, sendTestNewsletter } from "@/lib/actions/newsletters/newsletter-actions"
import { getAudienceCount } from "@/lib/actions/newsletters/audience-sync-actions"
import { getSegmentsBySite } from "@/lib/actions/newsletters/segment-actions"
import { getCronStatus } from "@/lib/actions/cron/cron-actions"
import type { Newsletter } from "@/lib/actions/newsletters/newsletter-actions"
import type { Segment } from "@/lib/actions/newsletters/segment-actions"
import { Users, TestTube, Send, Radio, AlertTriangle, CheckCircle2 } from "lucide-react"

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
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Load segments
  useEffect(() => {
    if (!open || !siteId) return
    getSegmentsBySite(siteId).then(({ data }) => setSegments(data || []))
  }, [open, siteId])

  useEffect(() => {
    if (!open || !siteId) return
    setCronStatusLoaded(false)
    getCronStatus(siteId).then(({ data }) => {
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
      getAudienceCount(siteId, { segment_id: filter.segment_id }).then(({ count }) => setAudienceCount(count))
    } else {
      const tags = filter.tags || []
      const countFilter = tags.length ? { tags } : {}
      getAudienceCount(siteId, countFilter).then(({ count }) => setAudienceCount(count))
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

    const { success, error: sendError } = await sendTestNewsletter(newsletter.id, testEmail)
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

    const { success, error: sendError } = await sendNewsletter(newsletter.id)
    setSending(false)
    if (sendError) {
      setError(sendError)
      return
    }
    if (success) {
      const { getNewsletterById } = await import("@/lib/actions/newsletters/newsletter-actions")
      const { data } = await getNewsletterById(newsletter.id)
      if (data) onSuccess(data)
      onOpenChange(false)
    }
  }

  if (!newsletter) return null

  const filter = newsletter.audience_filter || {}
  const drip = newsletter.metadata?.drip_config
  const hasAudience = filter.audience === 'all' || filter.tags?.length || filter.segment_id

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
      <AdminModalContent>
        <AdminModalHeader>
          <AdminModalTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            Publish Newsletter
          </AdminModalTitle>
          <AdminModalDescription>
            Review the audience and delivery settings before broadcasting this newsletter.
          </AdminModalDescription>
        </AdminModalHeader>

        <AdminModalBody className="space-y-4 [&_label+input]:mt-2">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
          {successMsg && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <p className="text-sm text-green-800">{successMsg}</p>
            </div>
          )}

          <div className="space-y-2">
          {/* Subject */}
          <div className="flex items-start justify-between py-1.5">
            <span className="text-sm text-muted-foreground">Subject</span>
            <span className="text-sm font-medium text-right max-w-[300px]">{newsletter.subject}</span>
          </div>

          {/* Audience */}
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

          {/* Drip Config */}
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
                  <div className="flex items-center justify-end gap-1.5 text-xs text-green-700">
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

          {/* Test Email */}
          <div className="pt-7">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor="publish-test-email" className="text-sm text-muted-foreground">Send a test first</Label>
                <Input
                  id="publish-test-email"
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="mt-1"
                />
              </div>
              <Button variant="outline" onClick={handleSendTest} disabled={sendingTest || !testEmail}>
                <TestTube className="h-4 w-4 mr-1" />
                {sendingTest ? 'Sending...' : 'Test'}
              </Button>
            </div>
          </div>
          </div>
        </AdminModalBody>
        <AdminModalFooter className="sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={!hasAudience ? 0 : -1}>
                  <Button
                    onClick={handleConfirmAndBroadcast}
                    disabled={sending || !hasAudience}
                  >
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
        </AdminModalFooter>
      </AdminModalContent>
    </Dialog>
  )
}
