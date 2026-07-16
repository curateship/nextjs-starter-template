"use client"

import { useState, useEffect } from "react"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardGroup, CardHeader } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { CategoryPicker } from "@/components/admin/layout/builder/CategoryPicker"
import { DashboardModalCardTitle, DashboardModalContent, DashboardModalFooterActions } from "@/components/admin/layout/dashboard/modals"
import { getContentCategoriesAction, bulkAssignCategoriesToContentAction } from "@/lib/actions/categories/category-relationship-actions"
import { updateDirectoryAction } from "@/lib/actions/directories/directory-actions"
import { getDirectoryTemplatesBySite, type DirectoryTemplate } from "@/lib/actions/directories/directory-template-actions"
import { deriveDirectoryMetaDescriptionFromBlocks } from "@/lib/actions/directories/directory-template-inheritance"
import {
  FeaturedImageField,
  MetaDescriptionField,
  TitleSlugFields,
  useCreateContent,
  useTitleSlug,
} from "@/components/admin/layout/dashboard/content-modal-shared"
import type { Directory } from "@/lib/actions/directories/directory-actions"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface DirectorySettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  directory: Directory | null
  site: any | null
  blocks?: Array<{ type?: string; content?: Record<string, any> }>
  onSuccess?: (updatedDirectory: Directory) => void
}

export function DirectorySettingsModal({
  open,
  onOpenChange,
  directory,
  blocks,
  onSuccess
}: DirectorySettingsModalProps) {
  const { title, slug, slugManuallyEdited, handleTitleChange, handleSlugChange, reset } = useTitleSlug({ regenerateOnClear: true })
  const [metaDescription, setMetaDescription] = useState("")
  const [featuredImage, setFeaturedImage] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [templates, setTemplates] = useState<DirectoryTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [primaryCategoryId, setPrimaryCategoryId] = useState<string | null>(null)
  const [loadingCategories, setLoadingCategories] = useState(false)

  const { loading: saving, loadingAction: savingAction, error, setError, submit } = useCreateContent<Directory>({
    entityLabel: "listing",
    title,
    titleRequiredMessage: "Listing title is required",
    // Directories update through a server action with a status field rather than is_published
    create: (publish) => updateDirectoryAction(directory!.id, {
      title,
      slug,
      meta_description: metaDescription,
      template_id: selectedTemplateId,
      status: publish ? 'published' : 'draft',
      featured_image: featuredImage || null,
    }),
    // Persist category selection after the listing row is updated
    afterCreate: async (updated) => {
      const categoryResult = await bulkAssignCategoriesToContentAction(updated.id, 'directory', selectedCategoryIds, primaryCategoryId)
      return categoryResult.success ? null : (categoryResult.error || 'Failed to save categories')
    },
    failureMessage: (_, publish) => publish ? 'Failed to publish directory' : 'Failed to save directory',
  })

  // Initialize form data, templates, and the listing's current categories
  useEffect(() => {
    if (!open || !directory) return

    let cancelled = false
    const derivedMetaDescription = deriveDirectoryMetaDescriptionFromBlocks(
      blocks?.length ? blocks : Object.values(directory.content_blocks || {})
    )

    // Directory settings historically starts in auto-slug mode regardless of the stored slug
    reset(directory.title || '', directory.slug || '', { detectManualEdit: false })
    setMetaDescription(directory.meta_description || derivedMetaDescription)
    setFeaturedImage(directory.featured_image || '')
    setSelectedTemplateId(directory.template_id || '')

    setSelectedCategoryIds([])
    setPrimaryCategoryId(null)
    setLoadingCategories(true)
    setTemplatesLoading(true)

    getDirectoryTemplatesBySite(directory.site_id).then(({ data }) => {
      if (!cancelled) {
        const loadedTemplates = data || []
        setTemplates(loadedTemplates)
        setSelectedTemplateId(directory.template_id || loadedTemplates.find((template) => template.is_default)?.id || loadedTemplates[0]?.id || '')
      }
    }).finally(() => {
      if (!cancelled) {
        setTemplatesLoading(false)
      }
    })

    getContentCategoriesAction(directory.id, 'directory').then(({ data }) => {
      if (!cancelled) {
        setSelectedCategoryIds(data ? data.map((c) => c.id) : [])
        setPrimaryCategoryId(data?.find((c) => c.is_primary)?.id || data?.[0]?.id || null)
      }
    }).finally(() => {
      if (!cancelled) {
        setLoadingCategories(false)
      }
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, directory, open])

  const handleSave = async (publish: boolean) => {
    if (!directory) return
    if (!selectedTemplateId) {
      setError('Template is required')
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

  if (!directory) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DashboardModalContent
        title={(
          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate">{directory.title}</span>
            <div className="flex shrink-0 items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${directory?.status === 'published' ? 'bg-green-500' : 'bg-gray-400'}`} />
              <span className="text-sm font-medium">
                {directory?.status === 'published' ? 'Published' : 'Draft'}
              </span>
            </div>
          </div>
        )}
        footerClassName="sm:justify-between"
        footer={(
          <>
            <div />
            <DashboardModalFooterActions>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" form="directory-settings-form" variant="outline" disabled={saving}>
                {savingAction === 'draft' ? 'Saving...' : 'Save as Draft'}
              </Button>
              <Button type="button" onClick={() => handleSave(true)} disabled={saving}>
                {savingAction === 'publish' ? 'Saving...' : directory?.status === 'published' ? 'Save' : 'Publish'}
              </Button>
            </DashboardModalFooterActions>
          </>
        )}
      >
        {error && (
          <div className="px-6 pb-2">
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
          </div>
        )}

        <form id="directory-settings-form" onSubmit={handleSubmit} className="contents">
          <CardGroup className="grid">
            <Card>
              <CardHeader>
                <DashboardModalCardTitle>Listing details</DashboardModalCardTitle>
                <CardDescription>Name the listing, set its URL, and featured image.</CardDescription>
              </CardHeader>
              <CardContent>
                <Field>
                  <FieldLabel htmlFor="modal-template">Template</FieldLabel>
                  <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId} disabled={templatesLoading || saving}>
                    <SelectTrigger id="modal-template">
                      <SelectValue placeholder={templatesLoading ? "Loading templates..." : "Select template"} />
                    </SelectTrigger>
                    <SelectContent className="z-60">
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Changing the template updates this listing&apos;s inherited blocks immediately after saving.
                  </FieldDescription>
                </Field>

                <TitleSlugFields
                  idPrefix="modal-"
                  titleLabel="Listing Title *"
                  titlePlaceholder="Enter listing title"
                  slugLabel="Listing URL"
                  slugPlaceholder="listing-url-slug"
                  title={title}
                  slug={slug}
                  slugManuallyEdited={slugManuallyEdited}
                  onTitleChange={handleTitleChange}
                  onSlugChange={handleSlugChange}
                />

                <FeaturedImageField imageUrl={featuredImage} onChange={setFeaturedImage} />
              </CardContent>
            </Card>

            {directory?.site_id && (
              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Categories</DashboardModalCardTitle>
                  <CardDescription>Organize this listing by topic.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Field>
                    <CategoryPicker
                      siteId={directory.site_id}
                      selectedCategoryIds={selectedCategoryIds}
                      onSelectionChange={setSelectedCategoryIds}
                      primaryCategoryId={primaryCategoryId}
                      onPrimaryCategoryChange={setPrimaryCategoryId}
                      loadingSelectedCategories={loadingCategories}
                      variant="combobox"
                    />
                  </Field>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <DashboardModalCardTitle>SEO</DashboardModalCardTitle>
                <CardDescription>Set the search description for this listing.</CardDescription>
              </CardHeader>
              <CardContent>
                <MetaDescriptionField
                  value={metaDescription}
                  onChange={setMetaDescription}
                  placeholder="SEO meta description"
                  description={
                    <FieldDescription>
                      Used for SEO. Keep it under 160 characters. Currently: {metaDescription.length}/160
                    </FieldDescription>
                  }
                />
              </CardContent>
            </Card>
          </CardGroup>
        </form>
      </DashboardModalContent>
    </Dialog>
  )
}
