"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import {
  AdminModalBody,
  AdminModalContent,
  AdminModalDescription,
  AdminModalFooter,
  AdminModalHeader,
  AdminModalTitle,
} from "@/components/admin/shared/AdminModalLayout"

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
  const [activeTab, setActiveTab] = useState("general")
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
  const [dripSendWindowStart, setDripSendWindowStart] = useState('08:00')
  const [dripSendWindowEnd, setDripSendWindowEnd] = useState('15:00')
  const [dripSendWindowTimezone, setDripSendWindowTimezone] = useState('America/New_York')
  const [dripSendWindowEnabled, setDripSendWindowEnabled] = useState(false)

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
      setDripSendWindowEnabled(!!drip?.send_window_start)
      setDripSendWindowStart(drip?.send_window_start || '08:00')
      setDripSendWindowEnd(drip?.send_window_end || '15:00')
      setDripSendWindowTimezone(drip?.send_window_timezone || 'America/New_York')
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

  useEffect(() => {
    if (open) {
      setActiveTab("general")
    }
  }, [open, newsletter?.id])

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

    if (audienceMode === 'custom') {
      const tags = filterTags ? filterTags.split(',').map(t => t.trim()).filter(Boolean) : []
      const filter = tags.length ? { tags } : {}
      getAudienceCount(siteId, filter).then(({ count }) => setAudienceCount(count))
    } else if (audienceMode === 'all') {
      getAudienceCount(siteId, {}).then(({ count }) => setAudienceCount(count))
    } else {
      // It's a segment ID — count via join table
      getAudienceCount(siteId, { segment_id: audienceMode }).then(({ count }) => setAudienceCount(count))
    }
  }, [audienceMode, filterTags, siteId, open, segments])

  function handleAudienceModeChange(value: string) {
    setAudienceMode(value)
    if (value !== 'custom') {
      setFilterTags('')
    }
  }

  function buildAudienceFilter(): Record<string, any> {
    if (audienceMode === 'none') return {}
    if (audienceMode === 'all') return { audience: 'all' }
    if (audienceMode === 'custom') {
      const tags = filterTags ? filterTags.split(',').map(t => t.trim()).filter(Boolean) : []
      return tags.length ? { tags } : {}
    }
    // Segment selected — store segment_id only
    return { segment_id: audienceMode }
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
        ...(dripSendWindowEnabled ? {
          send_window_start: dripSendWindowStart,
          send_window_end: dripSendWindowEnd,
          send_window_timezone: dripSendWindowTimezone,
        } : {
          send_window_start: null,
          send_window_end: null,
          send_window_timezone: null,
        }),
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <AdminModalContent>
          <AdminModalHeader>
            <AdminModalTitle className="flex items-center gap-3">
              Newsletter Settings
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${isSent ? 'bg-green-500' : 'bg-gray-400'}`} />
                <span className="text-sm font-medium">
                  {newsletter.status === 'sent' ? 'Sent' : newsletter.status === 'sending' ? 'Sending' : newsletter.status === 'scheduled' ? 'Scheduled' : 'Draft'}
                </span>
              </div>
            </AdminModalTitle>
            <AdminModalDescription>
              Update the subject, drip settings, and audience for this newsletter.
            </AdminModalDescription>
          </AdminModalHeader>

          <AdminModalBody className="space-y-4 [&_label+button]:mt-2 [&_label+input]:mt-2">
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

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="grid-cols-3">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="drip-options">Drip Options</TabsTrigger>
                <TabsTrigger value="audience-filter">Audience Filter</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="mt-0 space-y-4 min-h-[340px]">
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
              </TabsContent>

              <TabsContent value="drip-options" className="mt-0 space-y-4 min-h-[340px]">
                {isSent && (
                  <p className="text-sm text-muted-foreground">
                    Drip settings are locked after sending starts.
                  </p>
                )}

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Checkbox
                      id="drip-toggle"
                      checked={dripEnabled}
                      onCheckedChange={(checked) => setDripEnabled(checked === true)}
                      disabled={isSent}
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
                            disabled={isSent}
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
                            disabled={isSent}
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
                            disabled={isSent}
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
                            disabled={isSent}
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
                          disabled={isSent}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Auto-pause and notify you if bounce rate exceeds this percentage
                        </p>
                      </div>

                      <div className="pt-2">
                        <div className="flex items-center gap-2 mb-3">
                          <Checkbox
                            id="send-window-toggle"
                            checked={dripSendWindowEnabled}
                            onCheckedChange={(checked) => setDripSendWindowEnabled(checked === true)}
                            disabled={isSent}
                          />
                          <Label htmlFor="send-window-toggle">Limit sending to specific hours</Label>
                        </div>
                        {dripSendWindowEnabled && (
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label htmlFor="send-window-start">Start time</Label>
                                <Input
                                  id="send-window-start"
                                  type="time"
                                  value={dripSendWindowStart}
                                  onChange={(e) => setDripSendWindowStart(e.target.value)}
                                  disabled={isSent}
                                />
                              </div>
                              <div>
                                <Label htmlFor="send-window-end">End time</Label>
                                <Input
                                  id="send-window-end"
                                  type="time"
                                  value={dripSendWindowEnd}
                                  onChange={(e) => setDripSendWindowEnd(e.target.value)}
                                  disabled={isSent}
                                />
                              </div>
                            </div>
                            <div>
                              <Label htmlFor="send-window-tz">Timezone</Label>
                              <Select value={dripSendWindowTimezone} onValueChange={setDripSendWindowTimezone} disabled={isSent}>
                                <SelectTrigger id="send-window-tz" size="button">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="z-60">
                                  <SelectItem value="America/New_York">Eastern Time</SelectItem>
                                  <SelectItem value="America/Chicago">Central Time</SelectItem>
                                  <SelectItem value="America/Denver">Mountain Time</SelectItem>
                                  <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                                  <SelectItem value="UTC">UTC</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Emails will only be sent between {dripSendWindowStart} and {dripSendWindowEnd} in the selected timezone
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="audience-filter" className="mt-0 space-y-4 min-h-[340px]">
                <div>
                  <div>
                    <Label htmlFor="audience-select">Segment</Label>
                    <Select value={audienceMode} onValueChange={handleAudienceModeChange} disabled={isSent}>
                      <SelectTrigger id="audience-select" size="button">
                        <SelectValue placeholder="Select audience" />
                      </SelectTrigger>
                      <SelectContent className="z-60">
                        <SelectItem value="none">No segment</SelectItem>
                        <SelectItem value="all">All Contacts</SelectItem>
                        {segments.map(seg => (
                          <SelectItem key={seg.id} value={seg.id}>{seg.name}</SelectItem>
                        ))}
                        <SelectItem value="custom">Custom filter...</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

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
              </TabsContent>
            </Tabs>

          </AdminModalBody>
          <AdminModalFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Close
            </Button>
            <Button onClick={handleSave} disabled={saving || isSent}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </AdminModalFooter>
        </AdminModalContent>
      </Dialog>

    </>
  )
}
