"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field } from "@/components/ui/field"
import { DashboardModalCardTitle, DashboardModalContent, DashboardModalFooterActions } from "@/components/admin/layout/dashboard/modals"
import {
  TitleSlugFields,
  MetaDescriptionField,
  postJson,
  useCreateContent,
  useTitleSlug,
} from "@/components/admin/layout/dashboard/content-modal-shared"
import type { Page } from "@/lib/actions/pages/page-actions"

interface CreatePageModalProps {
  siteId: string
  onSuccess: (page: Page) => void
  onCancel: () => void
}

export function CreatePageModal({ siteId, onSuccess, onCancel }: CreatePageModalProps) {
  // Pages regenerate the slug immediately when the field is cleared
  const { title, slug, slugManuallyEdited, handleTitleChange, handleSlugChange } = useTitleSlug({ regenerateOnClear: true })
  const [metaDescription, setMetaDescription] = useState("")
  const [isHomepage, setIsHomepage] = useState(false)

  const { loading, loadingAction, submit } = useCreateContent<Page>({
    entityLabel: "page",
    title,
    titleRequiredMessage: "Page title is required",
    create: (publish) => postJson("/api/pages", {
      title,
      slug,
      meta_description: metaDescription,
      is_homepage: isHomepage,
      is_published: publish,
      site_id: siteId,
    }),
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await submit("draft", false, onSuccess)
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
            <DashboardModalFooterActions>
              <Button form="create-page-form" type="submit" variant="outline" disabled={loading}>
                {loadingAction === "draft" ? "Saving..." : "Save as Draft"}
              </Button>
              <Button type="button" onClick={() => submit("publish", true, onSuccess)} disabled={loading}>
                {loadingAction === "publish" ? "Publishing..." : "Publish"}
              </Button>
            </DashboardModalFooterActions>
          </>
        }
      >

        <CardGroup className="grid">
          <Card>
            <CardHeader>
              <DashboardModalCardTitle>Page setup</DashboardModalCardTitle>
            </CardHeader>
            <CardContent>
              <TitleSlugFields
                titleLabel="Page Title *"
                titlePlaceholder="Enter page title"
                slugLabel="Page URL"
                slugPlaceholder="page-url-slug"
                title={title}
                slug={slug}
                slugManuallyEdited={slugManuallyEdited}
                onTitleChange={handleTitleChange}
                onSlugChange={handleSlugChange}
                urlPreview={slug ? (
                  <p className="text-xs text-blue-600">Page URL: <strong>/{slug}</strong></p>
                ) : null}
              />

              <Field>
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    id="is_homepage"
                    checked={isHomepage}
                    onCheckedChange={(checked) => setIsHomepage(checked === true)}
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
              <MetaDescriptionField
                value={metaDescription}
                onChange={setMetaDescription}
                placeholder="A brief description of this page for search engines"
              />
            </CardContent>
          </Card>
        </CardGroup>
      </DashboardModalContent>
    </form>
  )
}
