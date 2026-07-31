"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardGroup, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { CategoryPicker } from "@/components/admin/layout/builder/CategoryPicker"
import { DashboardModalCardTitle, DashboardModalContent, DashboardModalFooterActions } from "@/components/admin/layout/dashboard/modals"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down.js"
import { getContentCategoriesAction, bulkAssignCategoriesToContentAction } from "@/lib/actions/categories/category-relationship-actions"
import { getPostTemplatesBySite, type PostTemplate } from "@/lib/actions/posts/post-template-actions"
import {
  FeaturedImageField,
  MetaDescriptionField,
  TitleSlugFields,
  putJson,
  useCreateContent,
  useTitleSlug,
} from "@/components/admin/layout/dashboard/content-modal-shared"
import type { Post } from "@/lib/actions/posts/post-actions"
import type { SiteWithTheme } from "@/lib/actions/sites/site-actions"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface PostSettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  post: Post | null
  site: SiteWithTheme | null
  onSuccess?: (updatedPost: Post) => void
}

export function PostSettingsModal({
  open,
  onOpenChange,
  post,
  onSuccess
}: PostSettingsModalProps) {
  // Posts regenerate the slug immediately when the field is cleared
  const { title, slug, slugManuallyEdited, handleTitleChange, handleSlugChange, reset } = useTitleSlug({ regenerateOnClear: true })
  const [metaDescription, setMetaDescription] = useState("")
  const [featuredImage, setFeaturedImage] = useState("")
  const [excerpt, setExcerpt] = useState("")
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [primaryCategoryId, setPrimaryCategoryId] = useState<string | null>(null)
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [templates, setTemplates] = useState<PostTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [selectedTemplateId, setSelectedTemplateId] = useState("")

  const { loading: saving, loadingAction: savingAction, setError, submit } = useCreateContent<Post>({
    entityLabel: "post",
    title,
    titleRequiredMessage: "Post title is required",
    create: (publish) => putJson(`/api/posts/${post?.id}`, {
      title,
      slug,
      meta_description: metaDescription,
      featured_image: featuredImage,
      excerpt,
      is_published: publish,
      template_id: selectedTemplateId,
    }),
    // Persist category selection after the post row is updated
    afterCreate: async () => {
      if (!post) return null
      const categoryResult = await bulkAssignCategoriesToContentAction({ data: { contentId: post.id, contentType: 'post', categoryIds: selectedCategoryIds, primaryCategoryId: primaryCategoryId } })
      return categoryResult.success ? null : (categoryResult.error || 'Failed to save categories')
    },
    failureMessage: (_, publish) => publish ? 'Failed to publish post' : 'Failed to save post as draft',
  })

  // Initialize form data and load the post's current categories
  useEffect(() => {
    let cancelled = false

    if (post) {
      reset(post.title, post.slug)
      setMetaDescription(post.meta_description || '')
      setFeaturedImage(post.featured_image || '')
      setExcerpt(post.excerpt || '')
      setSelectedTemplateId(post.template_id)
      setError(null)

      setSelectedCategoryIds([])
      setPrimaryCategoryId(null)
      setLoadingCategories(true)
      getContentCategoriesAction({ data: { contentId: post.id, contentType: 'post' } }).then(({ data }) => {
        if (cancelled) return
        if (data) {
          setSelectedCategoryIds(data.map((c) => c.id))
          setPrimaryCategoryId(data.find((c) => c.is_primary)?.id || data[0]?.id || null)
        }
      }).finally(() => {
        if (cancelled) return
        setLoadingCategories(false)
      })
    }

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post])

  useEffect(() => {
    let cancelled = false

    async function loadTemplates() {
      if (!post?.site_id) {
        setTemplates([])
        setTemplatesLoading(false)
        return
      }

      setTemplatesLoading(true)
      const { data } = await getPostTemplatesBySite({ data: { siteId: post.site_id } })

      if (!cancelled) {
        const loaded = data || []
        setTemplates(loaded)
        setSelectedTemplateId(post.template_id)
        setTemplatesLoading(false)
      }
    }

    loadTemplates()

    return () => {
      cancelled = true
    }
  }, [post?.site_id, post?.template_id])

  // Clear messages when modal is closed
  useEffect(() => {
    if (!open) {
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleSave = async (publish: boolean) => {
    if (!post) {
      setError('No post selected')
      return
    }
    if (!selectedTemplateId) {
      setError('Template is required')
      return
    }
    await submit(publish ? "publish" : "draft", publish, (updated) => {
      onSuccess?.(updated)
      onOpenChange(false)
    })
  }

  // Handle form submission (default to save as draft)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSave(false)
  }

  if (!post) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DashboardModalContent
        title={(
          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate">{post.title}</span>
            <div className="flex shrink-0 items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${
                post?.is_published ? 'bg-green-500' : 'bg-gray-400'
              }`} />
              <span className="text-sm font-medium">
                {post?.is_published ? 'Published' : 'Draft'}
              </span>
            </div>
          </div>
        )}
        footerClassName="sm:justify-between"
        footer={(
          <>
            <div />
            <DashboardModalFooterActions>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="post-settings-form"
                variant="outline"
                disabled={saving}
              >
                {savingAction === "draft" ? "Saving..." : "Save as Draft"}
              </Button>
              <Button
                type="button"
                onClick={() => handleSave(true)}
                disabled={saving}
              >
                {savingAction === "publish" ? (post?.is_published ? "Saving..." : "Publishing...") : (post?.is_published ? "Save" : "Publish")}
              </Button>
            </DashboardModalFooterActions>
          </>
        )}
      >
        <form id="post-settings-form" onSubmit={handleSubmit} className="contents">
          <CardGroup className="grid">
            <Card>
              <CardHeader>
                <DashboardModalCardTitle>Post details</DashboardModalCardTitle>
                <CardDescription>Name the post, set its URL, image, and summary.</CardDescription>
              </CardHeader>
              <CardContent>
                <Field>
                  <FieldLabel htmlFor="modal-post-template">Template</FieldLabel>
                  {templatesLoading ? (
                    <div className="border-input inline-flex h-10 items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs">
                      <Skeleton className="h-4 w-24 rounded-sm" />
                      <ChevronDown className="size-4 opacity-50" />
                    </div>
                  ) : (
                    <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                      <SelectTrigger id="modal-post-template">
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
                  idPrefix="modal-"
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
                />

                <FeaturedImageField imageUrl={featuredImage} onChange={setFeaturedImage} />

                <Field>
                  <FieldLabel htmlFor="excerpt">Post Excerpt</FieldLabel>
                  <Input
                    id="excerpt"
                    value={excerpt}
                    onChange={(e) => setExcerpt(e.target.value)}
                    placeholder="A brief summary of your post"
                  />
                </Field>
              </CardContent>
            </Card>

            {post?.site_id && (
              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Categories</DashboardModalCardTitle>
                  <CardDescription>Organize this post by topic.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Field>
                    <CategoryPicker
                      siteId={post.site_id}
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
                <CardDescription>Set the search description for this post.</CardDescription>
              </CardHeader>
              <CardContent>
                <MetaDescriptionField
                  idPrefix="modal-"
                  value={metaDescription}
                  onChange={setMetaDescription}
                  placeholder="A brief description of this post for search engines"
                  description={
                    <FieldDescription>
                      Recommended length: 150-160 characters ({metaDescription.length}/160)
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
