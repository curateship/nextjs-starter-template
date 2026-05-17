"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { DashboardModalCardTitle, DashboardModalContent } from "@/components/admin/layout/dashboard/modals"
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
  const [checkingSlug] = useState(false)
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
    <form id="create-page-form" onSubmit={handleSubmit} className="contents">
      <DashboardModalContent
        title="Create New Page"
        description="Add a new page to your site. You can customize the content after creation."
        footer={
          <>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <div className="flex items-center space-x-2">
              <Button form="create-page-form" type="submit" variant="outline" disabled={loading}>
                {loading ? "Saving..." : "Save as Draft"}
              </Button>
              <Button type="button" onClick={handlePublish} disabled={loading}>
                {loading ? "Publishing..." : "Publish"}
              </Button>
            </div>
          </>
        }
        footerClassName="sm:justify-between"
      >
        {error && (
          <div className="px-6 pb-2">
            <div className="rounded-md border border-red-200 bg-red-100 p-4 text-sm text-red-800">
              {error}
            </div>
          </div>
        )}

        <CardGroup className="grid">
          <Card>
            <CardHeader>
              <DashboardModalCardTitle>Page setup</DashboardModalCardTitle>
            </CardHeader>
            <CardContent>
              <Field>
                <FieldLabel htmlFor="title">Page Title *</FieldLabel>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Enter page title"
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="slug">Page URL</FieldLabel>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="page-url-slug"
                />
                <FieldDescription>
                  {slugManuallyEdited
                    ? "Custom URL slug. Clear this field to auto-generate from title again."
                    : "Auto-generated from title. You can edit this to customize the URL."}
                </FieldDescription>
                {formData.slug && (
                  <p className="text-xs text-blue-600">Page URL: <strong>/{formData.slug}</strong></p>
                )}
                {checkingSlug && (
                  <p className="text-xs text-blue-600">Checking slug availability...</p>
                )}
                {slugWarning && (
                  <p className="text-xs text-amber-600">{slugWarning}</p>
                )}
              </Field>

              <Field>
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    id="is_homepage"
                    checked={formData.is_homepage}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, is_homepage: checked === true }))
                    }
                  />
                  <span className="text-sm font-medium">Set as homepage</span>
                </label>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <DashboardModalCardTitle>SEO</DashboardModalCardTitle>
            </CardHeader>
            <CardContent>
              <Field>
                <FieldLabel htmlFor="meta_description">Meta Description</FieldLabel>
                <Textarea
                  id="meta_description"
                  value={formData.meta_description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, meta_description: e.target.value }))}
                  placeholder="A brief description of this page for search engines"
                  rows={1}
                  className="min-h-10 [field-sizing:content]"
                />
                <FieldDescription>Recommended length: 150-160 characters</FieldDescription>
              </Field>
            </CardContent>
          </Card>
        </CardGroup>
      </DashboardModalContent>
    </form>
  )
}
