"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogPortal,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { X } from "lucide-react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
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
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (newsletter) {
      setTitle(newsletter.title)
      setSubtitle(newsletter.subtitle)
      setError(null)
    }
  }, [newsletter])

  useEffect(() => {
    if (!open) {
      setError(null)
    }
  }, [open])

  const saveNewsletter = (isPublished: boolean) => {
    if (!title.trim()) {
      setError('Newsletter title is required')
      return
    }

    if (!newsletter) return

    setSaving(true)
    setError(null)

    const updated: Newsletter = {
      ...newsletter,
      title: title.trim(),
      subtitle: subtitle.trim(),
      is_published: isPublished,
      updated_at: new Date().toISOString(),
    }

    onSuccess(updated)
    setSaving(false)
    onOpenChange(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    saveNewsletter(false)
  }

  if (!newsletter) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4"
          onClick={(e) => e.target === e.currentTarget && onOpenChange(false)}
        >
          <div
            className="bg-background rounded-lg border shadow-lg w-[840px] max-w-[95vw] p-10 relative my-8"
            style={{ width: '840px', maxWidth: '95vw' }}
            onClick={(e) => e.stopPropagation()}
          >
            <DialogPrimitive.Close className="absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
            <DialogHeader className="mb-6">
              <DialogTitle className="flex items-center gap-3">
                Configure settings for &quot;{newsletter.title}&quot;
                <div className="flex items-center space-x-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      newsletter.is_published ? 'bg-green-500' : 'bg-gray-400'
                    }`}
                  />
                  <span className="text-sm font-medium">
                    {newsletter.is_published ? 'Published' : 'Draft'}
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
                <Label htmlFor="settings-title">Newsletter Title *</Label>
                <Input
                  id="settings-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter newsletter title"
                  required
                />
              </div>

              <div>
                <Label htmlFor="settings-subtitle">Newsletter Subtitle</Label>
                <Textarea
                  id="settings-subtitle"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="A brief description of this newsletter"
                  className="resize-none min-h-[40px] overflow-hidden"
                  style={{ height: 'auto' }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement
                    target.style.height = 'auto'
                    target.style.height = target.scrollHeight + 'px'
                  }}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Optional subtitle shown below the newsletter title
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
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save as Draft'}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => saveNewsletter(true)}
                    disabled={saving}
                  >
                    {saving
                      ? newsletter.is_published
                        ? 'Saving...'
                        : 'Publishing...'
                      : newsletter.is_published
                        ? 'Save'
                        : 'Publish'}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  )
}
