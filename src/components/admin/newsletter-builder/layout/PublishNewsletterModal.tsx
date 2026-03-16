"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { updateNewsletter, sendNewsletter, sendTestNewsletter } from "@/lib/actions/newsletters/newsletter-actions"
import { getAudienceCount } from "@/lib/actions/newsletters/audience-sync-actions"
import { getSegmentsBySite } from "@/lib/actions/newsletters/segment-actions"
import type { Newsletter } from "@/lib/actions/newsletters/newsletter-actions"
import type { Segment } from "@/lib/actions/newsletters/segment-actions"
import { Users, TestTube, Send, Radio } from "lucide-react"

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
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Load segments
  useEffect(() => {
    if (!open || !siteId) return
    getSegmentsBySite(siteId).then(({ data }) => setSegments(data || []))
  }, [open, siteId])

  // Load audience count
  useEffect(() => {
    if (!open || !siteId || !newsletter) return

    const filter = newsletter.audience_filter
    if (!filter || (!filter.audience && !filter.tags?.length && !filter.segment_id)) {
      setAudienceCount(null)
      return
    }

    const tags = filter.tags || []
    const countFilter = tags.length ? { tags } : {}
    getAudienceCount(siteId, countFilter).then(({ count }) => setAudienceCount(count))
  }, [open, siteId, newsletter])

  useEffect(() => {
    if (open) {
      setError(null)
      setSuccessMsg(null)
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
    ? 'No audience selected'
    : filter.audience === 'all'
      ? 'All Contacts'
      : segmentName
        ? `Segment: ${segmentName}`
        : `Custom filter: ${filter.tags?.join(', ')}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[560px] max-w-[95vw] p-8">
        <DialogHeader className="mb-6">
          <DialogTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            Publish Newsletter
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}
        {successMsg && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-800 text-sm">{successMsg}</p>
          </div>
        )}

        <div className="space-y-5">
          {/* Subject */}
          <div className="flex items-start justify-between py-3">
            <span className="text-sm text-muted-foreground">Subject</span>
            <span className="text-sm font-medium text-right max-w-[300px]">{newsletter.subject}</span>
          </div>

          {/* Audience */}
          <div className="flex items-start justify-between py-3">
            <span className="text-sm text-muted-foreground">Audience</span>
            <div className="text-right">
              <span className="text-sm font-medium">{audienceLabel}</span>
              {hasAudience && (
                <div className="flex items-center gap-1.5 justify-end mt-1">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {audienceCount !== null
                      ? `${audienceCount.toLocaleString()} contact${audienceCount !== 1 ? 's' : ''}`
                      : 'Calculating...'}
                  </span>
                </div>
              )}
              {filter.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 justify-end mt-1.5">
                  {filter.tags.map((tag: string) => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Drip Config */}
          <div className="flex items-start justify-between py-3">
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

          {/* Test Email */}
          <div className="py-3">
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

          {/* Warning if no audience */}
          {!hasAudience && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-orange-800 text-sm">
                No audience selected. Configure audience in Settings before broadcasting.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAndBroadcast}
              disabled={sending || !hasAudience}
            >
              <Send className="h-4 w-4 mr-2" />
              {sending ? 'Broadcasting...' : 'Confirm and Broadcast'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
