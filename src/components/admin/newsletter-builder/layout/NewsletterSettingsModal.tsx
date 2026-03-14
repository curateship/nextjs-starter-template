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
import { updateBroadcast } from "@/lib/actions/newsletters/broadcast-actions"
import type { Newsletter } from "./CreateNewsletterModal"

interface NewsletterSettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  newsletter: Newsletter | null
  onSuccess: (updatedNewsletter: Newsletter) => void
}

export function NewsletterSettingsModal({
  open,
  onOpenChange,
  newsletter,
  onSuccess,
}: NewsletterSettingsModalProps) {
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (newsletter) {
      setName(newsletter.name)
      setSubject(newsletter.subject)
      setError(null)
    }
  }, [newsletter])

  useEffect(() => {
    if (!open) setError(null)
  }, [open])

  const handleSave = async (status: 'draft' | 'scheduled') => {
    if (!name.trim()) {
      setError('Newsletter title is required')
      return
    }
    if (!newsletter) return

    setSaving(true)
    setError(null)

    const { data, error: updateError } = await updateBroadcast(newsletter.id, {
      name: name.trim(),
      subject: subject.trim() || name.trim(),
      status,
    })

    if (updateError) {
      setError(updateError)
      setSaving(false)
      return
    }

    if (data) {
      onSuccess(data)
      onOpenChange(false)
    }
    setSaving(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSave('draft')
  }

  if (!newsletter) return null

  const isPublished = newsletter.status === 'scheduled' || newsletter.status === 'sent'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[840px] max-w-[95vw] p-10" style={{ width: '840px', maxWidth: '95vw' }}>
        <DialogHeader className="mb-6">
          <DialogTitle className="flex items-center gap-3">
            Configure settings for &quot;{newsletter.name}&quot;
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isPublished ? 'bg-green-500' : 'bg-gray-400'}`} />
              <span className="text-sm font-medium">
                {newsletter.status === 'sent' ? 'Sent' : newsletter.status === 'scheduled' ? 'Scheduled' : 'Draft'}
              </span>
            </div>
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="settings-name">Newsletter Title *</Label>
            <Input
              id="settings-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter newsletter title"
              required
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
              style={{ height: 'auto' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement
                target.style.height = 'auto'
                target.style.height = target.scrollHeight + 'px'
              }}
            />
            <p className="text-xs text-muted-foreground mt-1">
              The subject line recipients will see in their inbox
            </p>
          </div>

          <div className="flex justify-between pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <div className="flex items-center space-x-2">
              <Button type="submit" variant="outline" disabled={saving}>
                {saving ? 'Saving...' : 'Save as Draft'}
              </Button>
              <Button
                type="button"
                onClick={() => handleSave('scheduled')}
                disabled={saving}
              >
                {saving ? 'Saving...' : isPublished ? 'Save' : 'Publish'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
