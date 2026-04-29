"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  AdminModalBody,
  AdminModalFooter,
} from "@/components/admin/layout/builder/AdminModalLayout"
import { generateSlug } from "@/lib/utils/slug"
import type { Page } from "@/lib/actions/pages/page-actions"

interface CreatePageData {
  title: string
  slug: string
  meta_description: string
  is_homepage: boolean
  is_published: boolean
}

interface CreatePageModalProps {
  siteId: string
  onSuccess: (page: Page) => void
  onCancel: () => void
}

export function CreatePageModal({ siteId, onSuccess, onCancel }: CreatePageModalProps) {
  const [formData, setFormData] = useState<CreatePageData>({
    title: "",
    slug: "",
    meta_description: "",
    is_homepage: false,
    is_published: false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slugWarning, setSlugWarning] = useState<string | null>(null)
  const [checkingSlug, setCheckingSlug] = useState(false)
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)

  const handleTitleChange = (title: string) => {
    setFormData((prev) => ({
      ...prev,
      title,
      slug: slugManuallyEdited ? prev.slug : generateSlug(title),
    }))
  }

  const handleSlugChange = (slug: string) => {
    if (slug === "") {
      setSlugManuallyEdited(false)
      setFormData((prev) => ({ ...prev, slug: generateSlug(prev.title || "") }))
      return
    }

    setSlugManuallyEdited(true)
    setFormData((prev) => ({ ...prev, slug }))
  }

  useEffect(() => {
    const checkSlugConflict = async () => {
      const slug = formData.slug?.trim()
      if (!slug || slug.length < 2) {
        setSlugWarning(null)
        return
      }

      // Skip client-side slug checking - server will handle validation
    }

    const timeoutId = setTimeout(checkSlugConflict, 500)
    return () => clearTimeout(timeoutId)
  }, [formData.slug, siteId])

  const handleSaveDraft = async () => {
    if (!formData.title.trim()) {
      setError("Page title is required")
      return
    }

    try {
      setLoading(true)
      setError(null)

      const draftData = {
        ...formData,
        site_id: siteId,
        is_published: false,
      }

      const response = await fetch("/api/pages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draftData),
      })

      const result = await response.json()

      if (!response.ok || result.error) {
        setError(result.error || "Failed to create page")
        return
      }

      if (result.data) {
        onSuccess(result.data)
      }
    } catch (err) {
      setError("Failed to save page as draft")
    } finally {
      setLoading(false)
    }
  }

  const handlePublish = async () => {
    if (!formData.title.trim()) {
      setError("Page title is required")
      return
    }

    try {
      setLoading(true)
      setError(null)

      const publishData = {
        ...formData,
        site_id: siteId,
        is_published: true,
      }

      const response = await fetch("/api/pages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(publishData),
      })

      const result = await response.json()

      if (!response.ok || result.error) {
        setError(result.error || "Failed to create page")
        return
      }

      if (result.data) {
        onSuccess(result.data)
      }
    } catch (err) {
      setError("Failed to publish page")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSaveDraft()
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <AdminModalBody className="space-y-6 [&_label+button]:mt-2 [&_label+input]:mt-2 [&_label+textarea]:mt-2">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-100 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-6">
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

          <div className="col-span-2">
            <Label htmlFor="slug">Page URL</Label>
            <Input
              id="slug"
              value={formData.slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="page-url-slug"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {slugManuallyEdited
                ? "Custom URL slug. Clear this field to auto-generate from title again."
                : "Auto-generated from title. You can edit this to customize the URL."}
            </p>
            {formData.slug && (
              <p className="mt-1 text-xs text-blue-600">
                Page URL: <strong>/{formData.slug}</strong>
              </p>
            )}
            {checkingSlug && (
              <p className="mt-1 text-xs text-blue-600">
                Checking slug availability...
              </p>
            )}
            {slugWarning && (
              <p className="mt-1 text-xs text-amber-600">
                {slugWarning}
              </p>
            )}
          </div>

          <div className="col-span-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_homepage"
                checked={formData.is_homepage}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, is_homepage: checked === true }))
                }
              />
              <Label htmlFor="is_homepage">Set as homepage</Label>
            </div>
          </div>
        </div>

        <div>
          <Label htmlFor="meta_description">Meta Description</Label>
          <Textarea
            id="meta_description"
            value={formData.meta_description}
            onChange={(e) => setFormData((prev) => ({ ...prev, meta_description: e.target.value }))}
            placeholder="A brief description of this page for search engines"
            rows={3}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Recommended length: 150-160 characters
          </p>
        </div>
      </AdminModalBody>

      <AdminModalFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <div className="flex items-center space-x-2">
          <Button type="submit" variant="outline" disabled={loading}>
            {loading ? "Saving..." : "Save as Draft"}
          </Button>
          <Button type="button" onClick={handlePublish} disabled={loading}>
            {loading ? "Publishing..." : "Publish"}
          </Button>
        </div>
      </AdminModalFooter>
    </form>
  )
}
