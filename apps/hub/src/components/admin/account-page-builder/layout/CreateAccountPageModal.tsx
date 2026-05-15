"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { DashboardModalContent, DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { generateSlug } from "@/lib/utils/slug"
import type { AccountPage } from "@/lib/actions/account-pages/account-pages-actions"

interface CreateAccountPageFormData {
  title: string
  slug: string
  meta_description: string
  is_default: boolean
  is_published: boolean
}

interface CreateAccountPageModalProps {
  siteId: string
  onSuccess: (page: AccountPage) => void
  onCancel: () => void
}

export function CreateAccountPageModal({
  siteId,
  onSuccess,
  onCancel,
}: CreateAccountPageModalProps) {
  const [formData, setFormData] = useState<CreateAccountPageFormData>({
    title: "",
    slug: "",
    meta_description: "",
    is_default: false,
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

      const response = await fetch("/api/account-pages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draftData),
      })

      const result = await response.json()

      if (!response.ok || result.error) {
        setError(result.error || "Failed to create account page")
        return
      }

      if (result.data) {
        onSuccess(result.data)
      }
    } catch (err) {
      setError("Failed to save account page as draft")
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

      const response = await fetch("/api/account-pages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(publishData),
      })

      const result = await response.json()

      if (!response.ok || result.error) {
        setError(result.error || "Failed to create account page")
        return
      }

      if (result.data) {
        onSuccess(result.data)
      }
    } catch (err) {
      setError("Failed to publish account page")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSaveDraft()
  }

  return (
    <form id="create-account-page-form" onSubmit={handleSubmit} className="contents">
      <DashboardModalContent
        title="Create New Account Page"
        description="Add a new account page to your site. You can customize the content after creation."
        footer={
          <>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <div className="flex items-center space-x-2">
              <Button form="create-account-page-form" type="submit" variant="outline" disabled={loading}>
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
                    : "Auto-generated from title. Account pages render under /account."}
                </FieldDescription>
                {formData.slug && (
                  <FieldDescription className="text-blue-600">
                    Page URL: /account/{formData.slug}
                  </FieldDescription>
                )}
                {checkingSlug && (
                  <FieldDescription className="text-blue-600">Checking slug availability...</FieldDescription>
                )}
                {slugWarning && (
                  <FieldDescription className="text-amber-600">{slugWarning}</FieldDescription>
                )}
              </Field>
              <Field>
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    id="is_default"
                    checked={formData.is_default}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, is_default: checked === true }))
                    }
                  />
                  <div>
                    <span className="text-sm font-medium">Set as default page</span>
                    <p className="text-xs text-muted-foreground">
                      The default page is the first non-auth account page used when a signed-in user needs a landing page
                    </p>
                  </div>
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
                  rows={3}
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
