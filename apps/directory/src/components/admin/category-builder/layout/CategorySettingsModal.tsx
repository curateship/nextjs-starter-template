"use client"

import { useState, useEffect } from "react"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { DashboardModalContent, DashboardModalFooterActions, DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { updateCategoryAction, type Category, type UpdateCategoryData } from "@/lib/actions/categories/category-actions"
import { getCategoryTemplatesBySite, type CategoryTemplate } from "@/lib/actions/categories/category-template-actions"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  FeaturedImageField,
  MetaDescriptionField,
  TitleSlugFields,
  useCreateContent,
  useTitleSlug,
} from "@/components/admin/layout/dashboard/content-modal-shared"

interface CategorySettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: Category | null
  existingCategories: Category[]
  onSuccess?: (updatedCategory: Category) => void
}

export function CategorySettingsModal({
  open,
  onOpenChange,
  category,
  existingCategories,
  onSuccess
}: CategorySettingsModalProps) {
  // Categories regenerate the slug immediately when the field is cleared
  const { title, slug, slugManuallyEdited, handleTitleChange, handleSlugChange, reset } = useTitleSlug({ regenerateOnClear: true })
  const [metaDescription, setMetaDescription] = useState("")
  const [featuredImage, setFeaturedImage] = useState('')
  const [parentId, setParentId] = useState<string>("")
  const [isPrivate, setIsPrivate] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [templates, setTemplates] = useState<CategoryTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)

  const { loading: saving, loadingAction: savingAction, setError, submit } = useCreateContent<Category>({
    entityLabel: "category",
    title,
    titleRequiredMessage: "Category title is required",
    // Categories update through a server action; preserve _settings.is_private in content_blocks
    create: (publish) => {
      const payload: UpdateCategoryData = {
        title,
        slug,
        // Switching templates prunes block values server-side
        template_id: selectedTemplateId || undefined,
        meta_description: metaDescription,
        is_published: publish,
        featured_image: featuredImage || null,
        parent_id: parentId || null,
        content_blocks: {
          ...category?.content_blocks,
          _settings: {
            ...category?.content_blocks?._settings,
            is_private: isPrivate
          }
        }
      }
      return updateCategoryAction({ data: { categoryId: category!.id, data: payload } })
    },
    failureMessage: (_, publish) => publish ? 'Failed to publish category' : 'Failed to save category as draft',
  })

  // Prevent selecting itself or any of its descendants as the parent
  const isDescendant = (potentialDescendant: Category, ancestorId: string): boolean => {
    let current: Category | undefined = potentialDescendant
    while (current) {
      if (current.id === ancestorId) return true
      current = existingCategories.find(c => c.id === current?.parent_id)
    }
    return false
  }

  // Build the nested parent options with ancestor paths for the combobox
  const buildParentOptions = (): ComboboxOption[] => {
    const options: ComboboxOption[] = []

    const addCategory = (cat: Category, ancestors: Category[] = []) => {
      if (category && (cat.id === category.id || isDescendant(cat, category.id))) {
        return
      }

      const path = ancestors.length > 0
        ? ancestors.map(a => a.title).join(' > ')
        : undefined

      options.push({
        value: cat.id,
        label: cat.title,
        path
      })

      const children = existingCategories.filter(c => c.parent_id === cat.id)
      children.forEach(child => addCategory(child, [...ancestors, cat]))
    }

    const topLevel = existingCategories.filter(c => !c.parent_id)
    topLevel.forEach(cat => addCategory(cat))

    return options
  }

  // Load the selected category's current values whenever it changes
  useEffect(() => {
    if (category) {
      reset(category.title, category.slug)
      setMetaDescription(category.meta_description || '')
      setIsPrivate(category.content_blocks?._settings?.is_private === true)
      setFeaturedImage(category.featured_image || '')
      setParentId(category.parent_id || '')
      setSelectedTemplateId(category.template_id || '')
      setError(null)

      // Load the site's templates for the switcher
      setTemplatesLoading(true)
      getCategoryTemplatesBySite({ data: { siteId: category.site_id } }).then(({ data }) => {
        const loadedTemplates = data || []
        setTemplates(loadedTemplates)
        setSelectedTemplateId(category.template_id || loadedTemplates.find((template) => template.is_default)?.id || loadedTemplates[0]?.id || '')
      }).finally(() => {
        setTemplatesLoading(false)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category])

  const handleSave = async (publish: boolean) => {
    if (!category) {
      setError('No category selected')
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

  if (!category) {
    return null
  }

  const parentOptions = buildParentOptions()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DashboardModalContent
        title={
          <span className="flex items-center gap-3">
            Configure settings for &quot;{category.title}&quot;
            <span className="flex items-center space-x-2">
              <span className={`w-2 h-2 rounded-full ${category?.is_published ? 'bg-green-500 dark:bg-green-600' : 'bg-gray-400'}`} />
              <span className="text-sm font-medium">{category?.is_published ? 'Published' : 'Draft'}</span>
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
              <Button form="category-settings-form" type="submit" variant="outline" disabled={saving}>
                {savingAction === "draft" ? "Saving..." : "Save as Draft"}
              </Button>
              <Button type="button" onClick={() => handleSave(true)} disabled={saving}>
                {savingAction === "publish" ? "Saving..." : category?.is_published ? "Save" : "Publish"}
              </Button>
            </DashboardModalFooterActions>
          </>
        }
        footerClassName="sm:justify-between"
      >
        <form id="category-settings-form" onSubmit={handleSubmit} className="contents">
          <CardGroup className="grid">
            <Card>
              <CardHeader>
                <DashboardModalCardTitle>Setup</DashboardModalCardTitle>
              </CardHeader>
              <CardContent>
                <TitleSlugFields
                  idPrefix="modal-"
                  titleLabel="Category Title *"
                  titlePlaceholder="Enter category title"
                  slugLabel="Category URL"
                  slugPlaceholder="category-url-slug"
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
                    onValueChange={(value) => {
                      setParentId(value)
                    }}
                    placeholder="None (top-level)"
                    searchPlaceholder="Search parent categories..."
                    emptyMessage="No parent categories found."
                    allowClear={true}
                  />
                  <FieldDescription>Create nested hierarchies. Search to find parent categories.</FieldDescription>
                </Field>
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
                    Changing the template updates this category&apos;s inherited blocks immediately after saving.
                  </FieldDescription>
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <DashboardModalCardTitle>Image</DashboardModalCardTitle>
              </CardHeader>
              <CardContent>
                <FeaturedImageField imageUrl={featuredImage} onChange={setFeaturedImage} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <DashboardModalCardTitle>Settings</DashboardModalCardTitle>
              </CardHeader>
              <CardContent>
                <Field>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      id="modal-is-private"
                      checked={isPrivate}
                      onCheckedChange={(checked) => {
                        setIsPrivate(!!checked)
                      }}
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
        </form>
      </DashboardModalContent>
    </Dialog>
  )
}
