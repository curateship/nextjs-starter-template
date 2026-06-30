"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardGroup, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { CategoryPicker } from "@/components/admin/layout/builder/CategoryPicker"
import { DashboardModalCardTitle, DashboardModalContent, DashboardModalFooterActions } from "@/components/admin/layout/dashboard/modals"
import { Field, FieldLabel } from "@/components/ui/field"
import { ChevronDown } from "lucide-react"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { bulkAssignCategoriesToContentAction } from "@/lib/actions/categories/category-relationship-actions"
import { getPostTemplatesBySite } from "@/lib/actions/posts/post-template-actions"
import {
  FeaturedImageField,
  MetaDescriptionField,
  ModalErrorBanner,
  TitleSlugFields,
  postJson,
  useCreateContent,
  useTitleSlug,
} from "@/components/admin/layout/dashboard/content-modal-shared"
import type { Post } from "@/lib/actions/posts/post-actions"
import type { PostTemplate } from "@/lib/actions/posts/post-template-actions"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface CreatePostModalProps {
  onSuccess: (post: Post, continueToBuilder?: boolean) => void
  onCancel: () => void
}

export function CreatePostModal({ onSuccess, onCancel }: CreatePostModalProps) {
  const { currentSite } = useSiteSwitcher()
  // Posts regenerate the slug immediately when the field is cleared
  const { title, slug, slugManuallyEdited, handleTitleChange, handleSlugChange } = useTitleSlug({ regenerateOnClear: true })
  const [metaDescription, setMetaDescription] = useState("")
  const [featuredImage, setFeaturedImage] = useState("")
  const [excerpt, setExcerpt] = useState("")
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [primaryCategoryId, setPrimaryCategoryId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<PostTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')

  // Load post templates and preselect the default
  useEffect(() => {
    let cancelled = false

    async function loadTemplates() {
      if (!currentSite?.id) {
        setTemplates([])
        setTemplatesLoading(false)
        return
      }

      setTemplatesLoading(true)
      const { data } = await getPostTemplatesBySite(currentSite.id)

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

  const { loading, loadingAction, error, setError, submit } = useCreateContent<Post>({
    entityLabel: "post",
    title,
    titleRequiredMessage: "Post title is required",
    create: (publish) => postJson("/api/posts", {
      title,
      slug,
      site_id: currentSite?.id,
      template_id: selectedTemplateId,
      meta_description: metaDescription,
      featured_image: featuredImage || null,
      excerpt: excerpt || null,
      is_published: publish,
      content_blocks: {},
    }),
    // Assign selected categories after the post row exists
    afterCreate: async (created) => {
      if (selectedCategoryIds.length === 0) return null
      const categoryResult = await bulkAssignCategoriesToContentAction(created.id, "post", selectedCategoryIds, primaryCategoryId)
      return categoryResult.success ? null : (categoryResult.error || "Failed to save categories")
    },
  })

  const handleSave = async (continueToBuilder = false, publishNow = false) => {
    if (!currentSite?.id) {
      setError("No site selected")
      return
    }
    if (!selectedTemplateId) {
      setError("Template is required")
      return
    }
    const action = publishNow ? "publish" : continueToBuilder ? "continue" : "draft"
    await submit(action, publishNow, (created) => onSuccess(created, continueToBuilder))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSave(false)
  }

  return (
    <DashboardModalContent
      title="Create New Post"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <DashboardModalFooterActions>
            <Button type="submit" form="create-post-form" variant="outline" disabled={loading}>
              {loadingAction === "draft" ? "Saving..." : "Save as Draft"}
            </Button>
            <Button type="button" onClick={() => handleSave(true)} disabled={loading}>
              {loadingAction === "continue" ? "Saving..." : "Continue"}
            </Button>
            <Button type="button" onClick={() => handleSave(false, true)} disabled={loading}>
              {loadingAction === "publish" ? "Publishing..." : "Publish"}
            </Button>
          </DashboardModalFooterActions>
        </>
      )}
    >
      <form id="create-post-form" onSubmit={handleSubmit} className="contents">
        <ModalErrorBanner error={error} />

        <CardGroup className="grid">
          <Card>
            <CardHeader>
              <DashboardModalCardTitle>Post details</DashboardModalCardTitle>
              <CardDescription>Name the post, set its URL, image, and summary.</CardDescription>
            </CardHeader>
            <CardContent>
              <Field>
                <FieldLabel htmlFor="template">Start from Template</FieldLabel>
                {templatesLoading ? (
                  <div className="border-input inline-flex h-10 items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs">
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
                titleLabel="Post Title *"
                titlePlaceholder="Enter post title"
                slugLabel="Post URL"
                slugPlaceholder="post-url-slug"
                title={title}
                slug={slug}
                slugManuallyEdited={slugManuallyEdited}
                onTitleChange={handleTitleChange}
                onSlugChange={handleSlugChange}
                slugAutoDescription={null}
                urlPreview={slug ? (
                  <p className="text-xs text-blue-600">Post URL: <strong>/posts/{slug}</strong></p>
                ) : null}
              />

              <FeaturedImageField imageUrl={featuredImage} onChange={setFeaturedImage} />

              <Field>
                <FieldLabel htmlFor="excerpt">Post Excerpt</FieldLabel>
                <Textarea
                  id="excerpt"
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  placeholder="A brief summary of your post"
                  rows={1}
                  className="h-10 min-h-10 resize-none overflow-hidden"
                />
              </Field>
            </CardContent>
          </Card>

          {currentSite?.id && (
            <Card>
              <CardHeader>
                <DashboardModalCardTitle>Categories</DashboardModalCardTitle>
                <CardDescription>Organize this post by topic.</CardDescription>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <DashboardModalCardTitle>SEO</DashboardModalCardTitle>
              <CardDescription>Set the search description for this post.</CardDescription>
            </CardHeader>
            <CardContent>
              <MetaDescriptionField
                value={metaDescription}
                onChange={setMetaDescription}
                placeholder="A brief description of this post for search engines"
              />
            </CardContent>
          </Card>
        </CardGroup>
      </form>
    </DashboardModalContent>
  )
}
