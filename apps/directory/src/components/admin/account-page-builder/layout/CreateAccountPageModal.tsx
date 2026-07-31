"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription } from "@/components/ui/field"
import { DashboardModalContent, DashboardModalFooterActions, DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import {
  MetaDescriptionField,
  TitleSlugFields,
  postJson,
  useCreateContent,
  useTitleSlug,
} from "@/components/admin/layout/dashboard/content-modal-shared"
import type { AccountPage } from "@/lib/actions/account-pages/account-pages-actions"
import { getAccountPageDisplayPath, isPublicProfileTemplateSlug } from "@/lib/utils/account-page-path"

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
  // Account pages regenerate the slug immediately when the field is cleared
  const { title, slug, slugManuallyEdited, handleTitleChange, handleSlugChange } = useTitleSlug({ regenerateOnClear: true })
  const [metaDescription, setMetaDescription] = useState("")
  const [isDefault, setIsDefault] = useState(false)
  const isProfileTemplate = isPublicProfileTemplateSlug(slug)

  const { loading, loadingAction, submit } = useCreateContent<AccountPage>({
    entityLabel: "account page",
    title,
    titleRequiredMessage: "Page title is required",
    create: (publish) => postJson("/api/account-pages", {
      title,
      slug,
      meta_description: metaDescription,
      is_default: isDefault,
      is_published: publish,
      site_id: siteId,
    }),
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await submit("draft", false, onSuccess)
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
            <DashboardModalFooterActions>
              <Button form="create-account-page-form" type="submit" variant="outline" disabled={loading}>
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
                    id="is_default"
                    checked={isDefault}
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
