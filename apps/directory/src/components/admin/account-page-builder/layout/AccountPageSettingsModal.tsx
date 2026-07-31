"use client"

import { useState, useEffect } from "react"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription } from "@/components/ui/field"
import { DashboardModalCardTitle, DashboardModalContent, DashboardModalFooterActions } from "@/components/admin/layout/dashboard/modals"
import {
  MetaDescriptionField,
  TitleSlugFields,
  putJson,
  useCreateContent,
  useTitleSlug,
} from "@/components/admin/layout/dashboard/content-modal-shared"
import type { AccountPage } from "@/lib/actions/account-pages/account-pages-actions"
import { getAccountPageDisplayPath, isPublicProfileTemplateSlug } from "@/lib/utils/account-page-path"
import type { Site } from "@/lib/actions/sites/site-actions"

interface AccountPageSettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  page: AccountPage | null
  // Accepted for caller compatibility; the modal does not currently use it
  site?: Site | null
  onSuccess?: (updatedPage: AccountPage) => void
}

export function AccountPageSettingsModal({
  open,
  onOpenChange,
  page,
  onSuccess,
}: AccountPageSettingsModalProps) {
  // Account pages regenerate the slug immediately when the field is cleared
  const { title, slug, slugManuallyEdited, handleTitleChange, handleSlugChange, reset } = useTitleSlug({ regenerateOnClear: true })
  const [metaDescription, setMetaDescription] = useState("")
  const [isDefault, setIsDefault] = useState(false)
  const isProfileTemplate = isPublicProfileTemplateSlug(slug)

  const { loading: saving, loadingAction: savingAction, setError, submit } = useCreateContent<AccountPage>({
    entityLabel: "account page",
    title,
    titleRequiredMessage: "Page title is required",
    create: (publish) => putJson(`/api/account-pages/${page?.id}`, {
      title,
      slug,
      meta_description: metaDescription,
      is_default: isDefault,
      is_published: publish,
    }),
    failureMessage: (_, publish) => publish ? "Failed to publish account page" : "Failed to save account page as draft",
  })

  // Load the selected page's current values whenever it changes
  useEffect(() => {
    if (!page) return
    reset(page.title, page.slug)
    setMetaDescription(page.meta_description || "")
    setIsDefault(page.is_default)
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  useEffect(() => {
    if (!open) {
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleSave = async (publish: boolean) => {
    if (!page) {
      setError("No page selected")
      return
    }
    await submit(publish ? "publish" : "draft", publish, (updated) => {
      onSuccess?.(updated)
      onOpenChange(false)
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSave(false)
  }

  if (!page) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form id="account-page-settings-form" onSubmit={handleSubmit} className="contents">
        <DashboardModalContent
          title={
            <span className="flex items-center gap-3">
              Configure settings for &quot;{page.title}&quot;
              <span className="flex items-center space-x-2">
                <span className={`h-2 w-2 rounded-full ${page.is_published ? "bg-green-500" : "bg-gray-400"}`} />
                <span className="text-sm font-medium">{page.is_published ? "Published" : "Draft"}</span>
              </span>
            </span>
          }
          footer={
            <>
              <div />
              <DashboardModalFooterActions>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button form="account-page-settings-form" type="submit" variant="outline" disabled={saving}>
                  {savingAction === "draft" ? "Saving..." : "Save as Draft"}
                </Button>
                <Button type="button" onClick={() => handleSave(true)} disabled={saving}>
                  {savingAction === "publish" ? (page.is_published ? "Saving..." : "Publishing...") : page.is_published ? "Save" : "Publish"}
                </Button>
              </DashboardModalFooterActions>
            </>
          }
          footerClassName="sm:justify-between"
        >
          <CardGroup className="grid">
            <Card>
              <CardHeader>
                <DashboardModalCardTitle>Page setup</DashboardModalCardTitle>
              </CardHeader>
              <CardContent>
                <TitleSlugFields
                  idPrefix="modal-"
                  titleLabel="Page Title *"
                  titlePlaceholder="Enter page title"
                  slugLabel="Page URL"
                  slugPlaceholder="page-url-slug"
                  title={title}
                  slug={slug}
                  slugManuallyEdited={slugManuallyEdited}
                  onTitleChange={handleTitleChange}
                  onSlugChange={handleSlugChange}
                  slugAutoDescription={
                    isProfileTemplate
                      ? "The my-profile slug is used as the public profile template."
                      : "Auto-generated from title. Account pages render under /account."
                  }
                  urlPreview={slug ? (
                    <FieldDescription className="text-blue-600">
                      Page URL: {getAccountPageDisplayPath(slug)}
                    </FieldDescription>
                  ) : null}
                />
                <Field>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <Checkbox
                      id="modal-is_default"
                      checked={isDefault === true}
                      onCheckedChange={(checked) => setIsDefault(checked === true)}
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
                <MetaDescriptionField
                  idPrefix="modal-"
                  value={metaDescription}
                  onChange={setMetaDescription}
                  placeholder="A brief description of this page for search engines"
                  description={
                    <FieldDescription>
                      Recommended length: 150-160 characters ({metaDescription.length}/160)
                    </FieldDescription>
                  }
                />
              </CardContent>
            </Card>
          </CardGroup>
        </DashboardModalContent>
      </form>
    </Dialog>
  )
}
