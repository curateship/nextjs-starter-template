"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardGroup, CardHeader } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { CategoryPicker } from "@/components/admin/layout/builder/CategoryPicker"
import { DashboardModalContent, DashboardModalFooterActions, DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { ChevronDown } from "lucide-react"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { bulkAssignCategoriesToContentAction } from "@/lib/actions/categories/category-relationship-actions"
import { getDirectoryTemplatesBySite } from "@/lib/actions/directories/directory-template-actions"
import {
  FeaturedImageCard,
  MetaDescriptionField,
  ModalErrorBanner,
  TitleSlugFields,
  postJson,
  useCreateContent,
  useTitleSlug,
} from "@/components/admin/layout/dashboard/content-modal-shared"
import { generateSlug } from "@/lib/utils/slug"
import type { Directory } from "@/lib/actions/directories/directory-actions"
import type { DirectoryTemplate } from "@/lib/actions/directories/directory-template-actions"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface CreateDirectoryModalProps {
  onSuccess: (directory: Directory, continueToBuilder?: boolean) => void
  onCancel: () => void
}

export function CreateDirectoryModal({ onSuccess, onCancel }: CreateDirectoryModalProps) {
  const { currentSite } = useSiteSwitcher()
  const { title, slug, slugManuallyEdited, handleTitleChange, handleSlugChange, setTitle, setSlug } = useTitleSlug()
  const [metaDescription, setMetaDescription] = useState("")
  const [featuredImage, setFeaturedImage] = useState("")
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [primaryCategoryId, setPrimaryCategoryId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<DirectoryTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')

  // Load directory templates and preselect the default (or first)
  useEffect(() => {
    let cancelled = false

    async function loadTemplates() {
      if (!currentSite?.id) {
        setTemplates([])
        setTemplatesLoading(false)
        return
      }

      setTemplatesLoading(true)
      const { data } = await getDirectoryTemplatesBySite(currentSite.id)

      if (!cancelled) {
        const loaded = data || []
        setTemplates(loaded)
        const defaultTemplate = loaded.find((template) => template.is_default)
        setSelectedTemplateId(defaultTemplate?.id || loaded[0]?.id || '')
        setTemplatesLoading(false)
      }
    }

    loadTemplates()

    return () => {
      cancelled = true
    }
  }, [currentSite?.id])

  const { loading, loadingAction, error, setError, submit } = useCreateContent<Directory>({
    entityLabel: "listing",
    title,
    titleRequiredMessage: "Title is required",
    create: (publish) => postJson("/api/directories", {
      title: title.trim(),
      slug: slug.trim() || generateSlug(title.trim()),
      site_id: currentSite?.id,
      template_id: selectedTemplateId,
      meta_description: metaDescription.trim() || null,
      featured_image: featuredImage || null,
      status: publish ? 'published' : 'draft',
      content_blocks: {},
    }),
    // Assign selected categories after the listing row exists
    afterCreate: async (created) => {
      if (selectedCategoryIds.length === 0) return null
      const categoryResult = await bulkAssignCategoriesToContentAction(created.id, 'directory', selectedCategoryIds, primaryCategoryId)
      return categoryResult.success ? null : (categoryResult.error || 'Failed to save categories')
    },
  })

  // Clear the form after a successful create so reopening starts fresh
  const resetForm = () => {
    const defaultTemplate = templates.find((template) => template.is_default)
    setTitle('')
    setSlug('')
    setMetaDescription('')
    setFeaturedImage('')
    setError(null)
    setSelectedCategoryIds([])
    setPrimaryCategoryId(null)
    setSelectedTemplateId(defaultTemplate?.id || templates[0]?.id || '')
  }

  const handleSave = async (continueToBuilder: boolean, publishNow = false) => {
    if (!currentSite?.id) {
      setError("No site selected")
      return
    }
    if (!selectedTemplateId) {
      setError("Template is required")
      return
    }
    const action = publishNow ? "publish" : continueToBuilder ? "continue" : "draft"
    await submit(action, publishNow, (created) => {
      resetForm()
      onSuccess(created, continueToBuilder)
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSave(false)
  }

  return (
    <form id="create-directory-form" onSubmit={handleSubmit} className="contents">
      <DashboardModalContent
        title="Add Listing"
        description="Add a new listing to your directory. You can customize the content after creation."
        footer={
          <>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <DashboardModalFooterActions>
              <Button form="create-directory-form" type="submit" variant="outline" disabled={loading}>
                {loadingAction === 'draft' ? 'Saving...' : 'Save as Draft'}
              </Button>
              <Button type="button" onClick={() => handleSave(true)} disabled={loading}>
                {loadingAction === 'continue' ? 'Saving...' : 'Continue'}
              </Button>
              <Button type="button" onClick={() => handleSave(false, true)} disabled={loading}>
                {loadingAction === 'publish' ? 'Publishing...' : 'Publish'}
              </Button>
            </DashboardModalFooterActions>
          </>
        }
      >
        <ModalErrorBanner error={error} />
        <CardGroup className="grid">
          <Card>
            <CardHeader>
              <DashboardModalCardTitle>Setup</DashboardModalCardTitle>
              <CardDescription>Choose a template and set the title and URL for this listing.</CardDescription>
            </CardHeader>
            <CardContent>
              <Field>
                <FieldLabel htmlFor="template">Start from Template</FieldLabel>
                {templatesLoading ? (
                  <div className="border-input inline-flex h-10 items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap">
                    <Skeleton className="h-4 w-24 rounded-sm" />
                    <ChevronDown className="size-4 opacity-50" />
                  </div>
                ) : (
                  <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                    <SelectTrigger id="template">
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent className="z-60">
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>

              <TitleSlugFields
                titleLabel="Listing Title *"
                titlePlaceholder="Enter listing title"
                slugLabel="Listing URL"
                slugPlaceholder="listing-url-slug"
                title={title}
                slug={slug}
                slugManuallyEdited={slugManuallyEdited}
                onTitleChange={handleTitleChange}
                onSlugChange={handleSlugChange}
                urlPreview={slug ? (
                  <FieldDescription className="text-blue-600">
                    Listing URL: /directory/{slug}
                  </FieldDescription>
                ) : null}
              />
            </CardContent>
          </Card>

          <FeaturedImageCard imageUrl={featuredImage} onChange={setFeaturedImage} />

          <Card>
            <CardHeader>
              <DashboardModalCardTitle>Settings</DashboardModalCardTitle>
            </CardHeader>
            <CardContent>
              {currentSite?.id && (
                <Field>
                  <CategoryPicker
                    siteId={currentSite.id}
                    selectedCategoryIds={selectedCategoryIds}
                    onSelectionChange={setSelectedCategoryIds}
                    primaryCategoryId={primaryCategoryId}
                    onPrimaryCategoryChange={setPrimaryCategoryId}
                    variant="combobox"
                  />
                </Field>
              )}
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
      </DashboardModalContent>
    </form>
  )
}
