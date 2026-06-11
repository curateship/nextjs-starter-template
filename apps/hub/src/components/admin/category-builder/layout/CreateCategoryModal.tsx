"use client"

import { useState } from "react"
import { createCategoryAction, type Category } from "@/lib/actions/categories/category-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Dialog } from "@/components/ui/dialog"
import { DashboardModalContent, DashboardModalFooterActions, DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import {
  FeaturedImageCard,
  MetaDescriptionField,
  ModalErrorBanner,
  useCreateContent,
  useTitleSlug,
  TitleSlugFields,
} from "@/components/admin/layout/dashboard/content-modal-shared"

interface CreateCategoryModalProps {
  siteId: string
  existingCategories: Category[]
  defaultParentId?: string | null
  onClose: () => void
  onCreated: (category: Category, continueToBuilder?: boolean) => void
}

export function CreateCategoryModal({
  siteId,
  existingCategories,
  defaultParentId,
  onClose,
  onCreated
}: CreateCategoryModalProps) {
  // Categories regenerate the slug immediately when the field is cleared
  const { title, slug, slugManuallyEdited, handleTitleChange, handleSlugChange } = useTitleSlug({ regenerateOnClear: true })
  const [metaDescription, setMetaDescription] = useState("")
  const [parentId, setParentId] = useState<string>(defaultParentId || "")
  const [featuredImage, setFeaturedImage] = useState("")
  const [isPrivate, setIsPrivate] = useState(false)

  const { loading, loadingAction, error, submit } = useCreateContent<Category>({
    entityLabel: "category",
    title,
    titleRequiredMessage: "Category title is required",
    // Categories create through a server action rather than an API route
    create: (publish) => createCategoryAction(siteId, {
      title,
      slug,
      meta_description: metaDescription.trim() || null,
      parent_id: parentId || null,
      featured_image: featuredImage || null,
      content_blocks: {
        _settings: { is_private: isPrivate },
        show_featured_image: true
      },
      is_published: publish,
    }),
  })

  // Build the nested parent options with ancestor paths for the combobox
  const buildParentOptions = (): ComboboxOption[] => {
    const options: ComboboxOption[] = []

    const addCategory = (category: Category, ancestors: Category[] = []) => {
      const path = ancestors.length > 0
        ? ancestors.map(a => a.title).join(' > ')
        : undefined

      options.push({
        value: category.id,
        label: category.title,
        path
      })

      const children = existingCategories.filter(c => c.parent_id === category.id)
      children.forEach(child => addCategory(child, [...ancestors, category]))
    }

    const topLevel = existingCategories.filter(c => !c.parent_id)
    topLevel.forEach(category => addCategory(category))

    return options
  }

  const handleSave = async (continueToBuilder: boolean, publishNow = false) => {
    const action = publishNow ? "publish" : continueToBuilder ? "continue" : "draft"
    await submit(action, publishNow, (created) => {
      onCreated(created, continueToBuilder)
      onClose()
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSave(false)
  }

  const parentOptions = buildParentOptions()

  return (
    <Dialog open onOpenChange={onClose}>
      <form id="create-category-form" onSubmit={handleSubmit} className="contents">
        <DashboardModalContent
          title="Create Category"
          description="Add a new category to organize your content."
          footer={
            <>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <DashboardModalFooterActions>
                <Button form="create-category-form" type="submit" variant="outline" disabled={loading}>
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
              </CardHeader>
              <CardContent>
                <TitleSlugFields
                  titleLabel="Category Title *"
                  titlePlaceholder="e.g., Technology, Health, Travel"
                  slugLabel="Category URL"
                  slugPlaceholder="technology-health-travel"
                  title={title}
                  slug={slug}
                  slugManuallyEdited={slugManuallyEdited}
                  onTitleChange={handleTitleChange}
                  onSlugChange={handleSlugChange}
                />
                <Field>
                  <FieldLabel htmlFor="parent">Parent Category (Optional)</FieldLabel>
                  <Combobox
                    options={parentOptions}
                    value={parentId}
                    onValueChange={setParentId}
                    placeholder="None (top-level)"
                    searchPlaceholder="Search parent categories..."
                    emptyMessage="No parent categories found."
                    allowClear={true}
                  />
                  <FieldDescription>Create nested hierarchies. Search to find parent categories.</FieldDescription>
                </Field>
              </CardContent>
            </Card>

            <FeaturedImageCard imageUrl={featuredImage} onChange={setFeaturedImage} />

            <Card>
              <CardHeader>
                <DashboardModalCardTitle>Settings</DashboardModalCardTitle>
              </CardHeader>
              <CardContent>
                <Field>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      id="is_private"
                      checked={isPrivate}
                      onCheckedChange={(checked) => setIsPrivate(!!checked)}
                    />
                    <span className="text-sm">Private (accessible only via direct URL, hidden from listings)</span>
                  </label>
                </Field>
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
    </Dialog>
  )
}
