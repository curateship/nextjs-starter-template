"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createNewsletter } from "@/lib/actions/newsletters/newsletter-actions"
import type { Newsletter } from "@/lib/actions/newsletters/newsletter-actions"
export type { Newsletter }
import { useSiteContext } from "@/contexts/site-context"

interface CreateNewsletterModalProps {
  onSuccess: (newsletter: Newsletter) => void
  onCancel: () => void
}

export function CreateNewsletterModal({ onSuccess, onCancel }: CreateNewsletterModalProps) {
  const { currentSite } = useSiteContext()
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async (status: 'draft' | 'scheduled') => {
    if (!title.trim()) {
      setError('Newsletter title is required')
      return
    }

    if (!currentSite?.id) {
      setError('No site selected')
      return
    }

    setLoading(true)
    setError(null)

    const { data, error: createError } = await createNewsletter({
      siteId: currentSite.id,
      name: title.trim(),
      subject: subtitle.trim() || title.trim(),
      status,
    })

    if (createError) {
      setError(createError)
      setLoading(false)
      return
    }

    if (data) {
      onSuccess(data)
    }
    setLoading(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleCreate('draft')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 text-sm text-red-800 bg-red-100 border border-red-200 rounded-md">
          {error}
        </div>
      )}

      <div>
        <Label htmlFor="newsletter-title">Newsletter Title *</Label>
        <Input
          id="newsletter-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter newsletter title"
          required
        />
      </div>

      <div>
        <Label htmlFor="newsletter-subtitle">Subject Line</Label>
        <Textarea
          id="newsletter-subtitle"
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          placeholder="Email subject line (defaults to title if empty)"
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

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <div className="flex items-center space-x-2">
          <Button
            type="submit"
            variant="outline"
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Save as Draft'}
          </Button>
          <Button
            type="button"
            onClick={() => handleCreate('scheduled')}
            disabled={loading}
          >
            {loading ? 'Publishing...' : 'Publish'}
          </Button>
        </div>
      </div>
    </form>
  )
}
