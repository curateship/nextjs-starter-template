"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export interface Newsletter {
  id: string
  title: string
  subtitle: string
  is_published: boolean
  created_at: string
  updated_at: string
}

interface CreateNewsletterModalProps {
  onSuccess: (newsletter: Newsletter) => void
  onCancel: () => void
}

export function CreateNewsletterModal({ onSuccess, onCancel }: CreateNewsletterModalProps) {
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createNewsletter = (isPublished: boolean) => {
    if (!title.trim()) {
      setError('Newsletter title is required')
      return
    }

    setLoading(true)
    setError(null)

    const now = new Date().toISOString()
    const newsletter: Newsletter = {
      id: crypto.randomUUID(),
      title: title.trim(),
      subtitle: subtitle.trim(),
      is_published: isPublished,
      created_at: now,
      updated_at: now,
    }

    onSuccess(newsletter)
    setLoading(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createNewsletter(false)
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
        <Label htmlFor="newsletter-subtitle">Newsletter Subtitle</Label>
        <Textarea
          id="newsletter-subtitle"
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
            onClick={() => createNewsletter(true)}
            disabled={loading}
          >
            {loading ? 'Publishing...' : 'Publish'}
          </Button>
        </div>
      </div>
    </form>
  )
}
