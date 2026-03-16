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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updateNewsletter, sendTestNewsletter } from "@/lib/actions/newsletters/newsletter-actions"
import { getAudienceCount } from "@/lib/actions/newsletters/audience-sync-actions"
import { getSegmentsBySite } from "@/lib/actions/newsletters/segment-actions"
import type { Newsletter } from "@/lib/actions/newsletters/newsletter-actions"
import type { Segment } from "@/lib/actions/newsletters/segment-actions"
import { Checkbox } from "@/components/ui/checkbox"
import { Users, TestTube } from "lucide-react"

interface NewsletterSettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  newsletter: Newsletter | null
  siteId: string
  onSuccess: (updatedNewsletter: Newsletter) => void
}

export function NewsletterSettingsModal({
  open,
  onOpenChange,
  newsletter,
  siteId,
  onSuccess,
}: NewsletterSettingsModalProps) {
  const [subject, setSubject] = useState('')
  const [filterTags, setFilterTags] = useState('')
  const [testEmail, setTestEmail] = useState('')
  const [audienceCount, setAudienceCount] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Segment picker state
  const [segments, setSegments] = useState<Segment[]>([])
  const [audienceMode, setAudienceMode] = useState<string>('none') // 'none' | 'all' | segment ID | 'custom'
  const [maxWidth, setMaxWidth] = useState(600)

  // Drip config state
  const [dripEnabled, setDripEnabled] = useState(false)
  const [dripBatchMin, setDripBatchMin] = useState('400')
  const [dripBatchMax, setDripBatchMax] = useState('500')
  const [dripIntervalMin, setDripIntervalMin] = useState('30')
  const [dripIntervalMax, setDripIntervalMax] = useState('60')
  const [dripBounceThreshold, setDripBounceThreshold] = useState('5')

  useEffect(() => {
    if (newsletter) {
      setSubject(newsletter.subject)
      setFilterTags(newsletter.audience_filter?.tags?.join(', ') || '')
      setMaxWidth(newsletter.metadata?.maxWidth || 600)
      const drip = newsletter.metadata?.drip_config
      setDripEnabled(drip?.enabled || false)
      setDripBatchMin(String(drip?.batch_size_min ?? 400))
      setDripBatchMax(String(drip?.batch_size_max ?? 500))
      setDripIntervalMin(String(drip?.interval_min_minutes ?? 30))
      setDripIntervalMax(String(drip?.interval_max_minutes ?? 60))
      setDripBounceThreshold(String(drip?.bounce_threshold_percent ?? 5))
      setError(null)
      setSuccessMsg(null)

      // Determine audience mode from saved data
      if (newsletter.audience_filter?.segment_id) {
        setAudienceMode(newsletter.audience_filter.segment_id)
      } else if (newsletter.audience_filter?.tags?.length) {
        setAudienceMode('custom')
      } else if (newsletter.audience_filter?.audience === 'all') {
        setAudienceMode('all')
      } else {
        setAudienceMode('none')
      }
    }
  }, [newsletter])

  // Load segments when modal opens
  useEffect(() => {
    if (!open || !siteId) return
    getSegmentsBySite(siteId).then(({ data }) => setSegments(data || []))
  }, [open, siteId])

  // Update audience count based on mode
  useEffect(() => {
    if (!open || !siteId) return

    if (audienceMode === 'none') {
      setAudienceCount(null)
      return
    }

    let tags: string[] = []

    if (audienceMode === 'custom') {
      tags = filterTags ? filterTags.split(',').map(t => t.trim()).filter(Boolean) : []
    } else if (audienceMode !== 'all') {
      // It's a segment ID — find the segment's tags
      const seg = segments.find(s => s.id === audienceMode)
      tags = seg?.filter_rules?.tags || []
    }

    const filter = tags.length ? { tags } : {}
    getAudienceCount(siteId, filter).then(({ count }) => setAudienceCount(count))
  }, [audienceMode, filterTags, siteId, open, segments])

  function handleAudienceModeChange(value: string) {
    setAudienceMode(value)
    if (value !== 'custom') {
      if (value === 'all' || value === 'none') {
        setFilterTags('')
      } else {
        const seg = segments.find(s => s.id === value)
        setFilterTags(seg?.filter_rules?.tags?.join(', ') || '')
      }
    }
  }

  function buildAudienceFilter(): Record<string, any> {
    if (audienceMode === 'none') return {}
    if (audienceMode === 'all') return { audience: 'all' }
    if (audienceMode === 'custom') {
      const tags = filterTags ? filterTags.split(',').map(t => t.trim()).filter(Boolean) : []
      return tags.length ? { tags } : {}
    }
    // Segment selected — store segment_id + resolved tags
    const seg = segments.find(s => s.id === audienceMode)
    const tags = seg?.filter_rules?.tags || []
    return { segment_id: audienceMode, tags }
  }

  const handleSave = async () => {
    if (!newsletter || !subject.trim()) {
      setError('Subject line is required')
      return
    }
    setSaving(true)
    setError(null)

    const metadata: Record<string, any> = { ...newsletter.metadata, maxWidth }
    if (dripEnabled) {
      metadata.drip_config = {
        ...(newsletter.metadata?.drip_config || {}),
        enabled: true,
        batch_size_min: parseInt(dripBatchMin) || 400,
        batch_size_max: parseInt(dripBatchMax) || 500,
        interval_min_minutes: parseInt(dripIntervalMin) || 30,
        interval_max_minutes: parseInt(dripIntervalMax) || 60,
        bounce_threshold_percent: parseFloat(dripBounceThreshold) || 5,
      }
    } else {
      metadata.drip_config = { ...(newsletter.metadata?.drip_config || {}), enabled: false }
    }

    const { data, error: updateError } = await updateNewsletter(newsletter.id, {
      subject: subject.trim(),
      status: 'draft',
      audience_filter: buildAudienceFilter(),
      metadata,
    })
    setSaving(false)
    if (updateError) {
      setError(updateError)
      return
    }
    if (data) {
      onSuccess(data)
      setSuccessMsg('Saved!')
      setTimeout(() => setSuccessMsg(null), 3000)
    }
  }

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


  if (!newsletter) return null
  const isSent = newsletter.status === 'sent' || newsletter.status === 'sending' || newsletter.status === 'paused'

  // Get selected segment for display
  const selectedSegment = audienceMode !== 'all' && audienceMode !== 'custom'
    ? segments.find(s => s.id === audienceMode)
    : null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[840px] max-w-[95vw] p-10" style={{ width: '840px', maxWidth: '95vw' }}>
          <DialogHeader className="mb-6">
            <DialogTitle className="flex items-center gap-3">
              Newsletter Settings
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${isSent ? 'bg-green-500' : 'bg-gray-400'}`} />
                <span className="text-sm font-medium">
                  {newsletter.status === 'sent' ? 'Sent' : newsletter.status === 'sending' ? 'Sending' : newsletter.status === 'scheduled' ? 'Scheduled' : 'Draft'}
                </span>
              </div>
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

          <div className="space-y-6">
            {/* Subject & Sub Header */}
            <div>
              <Label htmlFor="settings-subject">Subject Line *</Label>
              <Input
                id="settings-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject line"
                disabled={isSent}
              />
            </div>
            <div>
              <Label htmlFor="settings-max-width">Content Max Width (px)</Label>
              <Input
                id="settings-max-width"
                type="number"
                value={maxWidth}
                onChange={(e) => setMaxWidth(parseInt(e.target.value) || 600)}
                placeholder="600"
                disabled={isSent}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Maximum width of the email content. Default is 600px.
              </p>
            </div>

            {/* Audience */}
            <div>
              <h3 className="font-medium mb-4">Audience</h3>
              <div>
                <Label htmlFor="audience-select">Segment</Label>
                <Select value={audienceMode} onValueChange={handleAudienceModeChange} disabled={isSent}>
                  <SelectTrigger id="audience-select">
                    <SelectValue placeholder="Select audience" />
                  </SelectTrigger>
                  <SelectContent className="z-[60]">
                    <SelectItem value="none">No segment</SelectItem>
                    <SelectItem value="all">All Contacts</SelectItem>
                    {segments.map(seg => (
                      <SelectItem key={seg.id} value={seg.id}>{seg.name}</SelectItem>
                    ))}
                    <SelectItem value="custom">Custom filter...</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Show segment tags as badges when a segment is selected */}
              {selectedSegment && selectedSegment.filter_rules?.tags?.length ? (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {selectedSegment.filter_rules.tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              ) : null}

              {/* Show manual tags input for custom filter */}
              {audienceMode === 'custom' && (
                <div className="mt-3">
                  <Label htmlFor="filter-tags">Filter by Tags</Label>
                  <Input
                    id="filter-tags"
                    value={filterTags}
                    onChange={(e) => setFilterTags(e.target.value)}
                    placeholder="austin, fitness (comma-separated)"
                    disabled={isSent}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Only contacts with ALL these tags will receive this newsletter.
                  </p>
                </div>
              )}

              {audienceMode !== 'none' && (
                <div className="flex items-center gap-2 text-sm mt-3">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {audienceCount !== null
                      ? <>{audienceCount.toLocaleString()} active contact{audienceCount !== 1 ? 's' : ''}</>
                      : 'Calculating...'}
                  </span>
                </div>
              )}
            </div>

            {/* Drip Send */}
            {!isSent && (
              <div>
                <h3 className="font-medium mb-4">Drip Send</h3>
                <div className="flex items-center gap-2 mb-3">
                  <Checkbox
                    id="drip-toggle"
                    checked={dripEnabled}
                    onCheckedChange={(checked) => setDripEnabled(checked === true)}
                  />
                  <Label htmlFor="drip-toggle">Enable drip sending</Label>
                </div>
                {dripEnabled && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="drip-batch-min">Batch size min</Label>
                        <Input
                          id="drip-batch-min"
                          type="number"
                          value={dripBatchMin}
                          onChange={(e) => setDripBatchMin(e.target.value)}
                          min={1}
                        />
                      </div>
                      <div>
                        <Label htmlFor="drip-batch-max">Batch size max</Label>
                        <Input
                          id="drip-batch-max"
                          type="number"
                          value={dripBatchMax}
                          onChange={(e) => setDripBatchMax(e.target.value)}
                          min={1}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="drip-interval-min">Interval min (minutes)</Label>
                        <Input
                          id="drip-interval-min"
                          type="number"
                          value={dripIntervalMin}
                          onChange={(e) => setDripIntervalMin(e.target.value)}
                          min={1}
                        />
                      </div>
                      <div>
                        <Label htmlFor="drip-interval-max">Interval max (minutes)</Label>
                        <Input
                          id="drip-interval-max"
                          type="number"
                          value={dripIntervalMax}
                          onChange={(e) => setDripIntervalMax(e.target.value)}
                          min={1}
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="drip-bounce-threshold">Bounce threshold (%)</Label>
                      <Input
                        id="drip-bounce-threshold"
                        type="number"
                        value={dripBounceThreshold}
                        onChange={(e) => setDripBounceThreshold(e.target.value)}
                        min={0.1}
                        step="any"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Auto-pause and notify you if bounce rate exceeds this percentage
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Test Email */}
            {!isSent && (
              <div>
                <h3 className="font-medium mb-4">Test Email</h3>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label htmlFor="test-email">Email Address</Label>
                    <Input
                      id="test-email"
                      type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="your@email.com"
                    />
                  </div>
                  <Button variant="outline" onClick={handleSendTest} disabled={sendingTest || !testEmail}>
                    <TestTube className="h-4 w-4 mr-2" />
                    {sendingTest ? 'Sending...' : 'Send Test'}
                  </Button>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Close
              </Button>
              <Button onClick={handleSave} disabled={saving || isSent}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </>
  )
}
