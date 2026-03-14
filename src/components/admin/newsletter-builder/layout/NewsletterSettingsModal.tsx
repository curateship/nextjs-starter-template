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
import { Textarea } from "@/components/ui/textarea"
import { updateNewsletter, sendNewsletter, sendTestNewsletter } from "@/lib/actions/newsletters/newsletter-actions"
import { getAudienceCount } from "@/lib/actions/newsletters/audience-sync-actions"
import type { Newsletter } from "@/lib/actions/newsletters/newsletter-actions"
import { Users, TestTube, Send } from "lucide-react"

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
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [filterTags, setFilterTags] = useState('')
  const [testEmail, setTestEmail] = useState('')
  const [audienceCount, setAudienceCount] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [sending, setSending] = useState(false)
  const [confirmSendOpen, setConfirmSendOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  useEffect(() => {
    if (newsletter) {
      setName(newsletter.name)
      setSubject(newsletter.subject)
      setFilterTags(newsletter.audience_filter?.tags?.join(', ') || '')
      setError(null)
      setSuccessMsg(null)
    }
  }, [newsletter])

  useEffect(() => {
    if (!open || !siteId) return
    const tags = filterTags ? filterTags.split(',').map(t => t.trim()).filter(Boolean) : []
    const filter = tags.length ? { tags } : {}
    getAudienceCount(siteId, filter).then(({ count }) => setAudienceCount(count))
  }, [filterTags, siteId, open])

  const handleSave = async () => {
    if (!newsletter || !name.trim()) {
      setError('Newsletter title is required')
      return
    }
    setSaving(true)
    setError(null)

    const tags = filterTags ? filterTags.split(',').map(t => t.trim()).filter(Boolean) : []
    const audienceFilter = tags.length ? { tags } : {}

    const { data, error: updateError } = await updateNewsletter(newsletter.id, {
      name: name.trim(),
      subject: subject.trim() || name.trim(),
      audience_filter: audienceFilter,
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

    // Save first
    await handleSave()

    const { success, error: sendError } = await sendTestNewsletter(newsletter.id, testEmail)
    if (sendError) {
      setError(sendError)
    } else if (success) {
      setSuccessMsg('Test email sent!')
      setTimeout(() => setSuccessMsg(null), 3000)
    }
    setSendingTest(false)
  }

  const handleSend = async () => {
    if (!newsletter) return
    setConfirmSendOpen(false)
    setSending(true)
    setError(null)

    await handleSave()

    const { success, error: sendError } = await sendNewsletter(newsletter.id)
    if (sendError) {
      setError(sendError)
    } else if (success) {
      setSuccessMsg('Newsletter sent!')
      // Reload newsletter data
      const { getNewsletterById } = await import("@/lib/actions/newsletters/newsletter-actions")
      const { data } = await getNewsletterById(newsletter.id)
      if (data) onSuccess(data)
    }
    setSending(false)
  }

  if (!newsletter) return null
  const isSent = newsletter.status === 'sent' || newsletter.status === 'sending'

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
            {/* Title & Subject */}
            <div>
              <Label htmlFor="settings-name">Newsletter Title *</Label>
              <Input
                id="settings-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter newsletter title"
                disabled={isSent}
              />
            </div>
            <div>
              <Label htmlFor="settings-subject">Subject Line</Label>
              <Textarea
                id="settings-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject line"
                className="resize-none min-h-[40px] overflow-hidden"
                disabled={isSent}
                style={{ height: 'auto' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = 'auto'
                  target.style.height = target.scrollHeight + 'px'
                }}
              />
            </div>

            {/* Audience */}
            <div>
              <h3 className="font-medium mb-4">Audience</h3>
              <div>
                <Label htmlFor="filter-tags">Filter by Tags (optional)</Label>
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
              <div className="flex items-center gap-2 text-sm mt-3">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span>
                  {audienceCount !== null
                    ? <>{audienceCount.toLocaleString()} active contact{audienceCount !== 1 ? 's' : ''}</>
                    : 'Calculating...'}
                </span>
              </div>
            </div>

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
              <div className="flex items-center space-x-2">
                <Button variant="outline" onClick={handleSave} disabled={saving || isSent}>
                  {saving ? 'Saving...' : 'Save Settings'}
                </Button>
                {!isSent && (
                  <Button onClick={() => setConfirmSendOpen(true)} disabled={sending}>
                    <Send className="h-4 w-4 mr-2" />
                    {sending ? 'Sending...' : 'Send Newsletter'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Send Dialog */}
      {confirmSendOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setConfirmSendOpen(false)} />
          <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-[60]">
            <h2 className="text-lg font-semibold mb-2">Send Newsletter</h2>
            <p className="text-sm text-muted-foreground mb-4">
              This will send &quot;{subject || name}&quot; to {audienceCount?.toLocaleString() || 'all'} active contacts. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setConfirmSendOpen(false)} variant="outline">Cancel</Button>
              <Button onClick={handleSend} disabled={sending}>
                {sending ? 'Sending...' : 'Send Now'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
