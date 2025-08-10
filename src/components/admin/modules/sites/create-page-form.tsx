"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { createPageAction } from "@/lib/actions/page-actions"
import type { Page, CreatePageData } from "@/lib/actions/page-actions"

interface CreatePageFormProps {
  siteId: string
  onSuccess: (page: Page) => void
  onCancel: () => void
}

export function CreatePageForm({ siteId, onSuccess, onCancel }: CreatePageFormProps) {
  const [formData, setFormData] = useState<CreatePageData>({
    title: '',
    slug: '',
    meta_description: '',
    meta_keywords: '',
    is_homepage: false,
    is_published: true
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Generate slug from title
  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }

  // Handle title change and auto-generate slug if slug is empty
  const handleTitleChange = (title: string) => {
    setFormData(prev => ({
      ...prev,
      title,
      slug: prev.slug || generateSlug(title)
    }))
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.title.trim()) {
      setError('Page title is required')
      return
    }

    try {
      setLoading(true)
      setError(null)
      
      const { data, error: actionError } = await createPageAction(siteId, formData)
      
      if (actionError) {
        setError(actionError)
        return
      }
      
      if (data) {
        onSuccess(data)
      }
    } catch (err) {
      setError('Failed to create page')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 text-sm text-red-800 bg-red-100 border border-red-200 rounded-md">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Page Title */}
        <div className="col-span-2">
          <Label htmlFor="title">Page Title *</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Enter page title"
            required
          />
        </div>

        {/* Page Slug */}
        <div className="col-span-2">
          <Label htmlFor="slug">Page Slug</Label>
          <Input
            id="slug"
            value={formData.slug}
            onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
            placeholder="page-url-slug"
          />
          <p className="text-xs text-muted-foreground mt-1">
            The URL slug for this page. Leave empty to auto-generate from title.
          </p>
        </div>


        {/* Status Checkboxes */}
        <div className="col-span-2 space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_published"
              checked={formData.is_published}
              onCheckedChange={(checked) => 
                setFormData(prev => ({ ...prev, is_published: checked === true }))
              }
            />
            <Label htmlFor="is_published">Publish immediately</Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_homepage"
              checked={formData.is_homepage}
              onCheckedChange={(checked) => 
                setFormData(prev => ({ ...prev, is_homepage: checked === true }))
              }
            />
            <Label htmlFor="is_homepage">Set as homepage</Label>
          </div>
        </div>
      </div>

      {/* Meta Description */}
      <div>
        <Label htmlFor="meta_description">Meta Description</Label>
        <Textarea
          id="meta_description"
          value={formData.meta_description}
          onChange={(e) => setFormData(prev => ({ ...prev, meta_description: e.target.value }))}
          placeholder="A brief description of this page for search engines"
          rows={3}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Recommended length: 150-160 characters
        </p>
      </div>

      {/* Meta Keywords */}
      <div>
        <Label htmlFor="meta_keywords">Meta Keywords</Label>
        <Input
          id="meta_keywords"
          value={formData.meta_keywords}
          onChange={(e) => setFormData(prev => ({ ...prev, meta_keywords: e.target.value }))}
          placeholder="keyword1, keyword2, keyword3"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Separate keywords with commas
        </p>
      </div>

      {/* Form Actions */}
      <div className="flex items-center justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create Page'}
        </Button>
      </div>
    </form>
  )
}