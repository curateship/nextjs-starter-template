"use client"

import { useState, useEffect } from "react"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { use } from "react"
import { useRouter, useSearchParams } from "@/lib/navigation-client"
import { useCategoryData } from "@/components/admin/category-builder/config/useCategoryData"
import { useCategoryBuilder } from "@/components/admin/category-builder/config/useCategoryBuilder"
import {
  useBuilderRouteSiteSync,
  useSelectedBuilderSlug,
  useSyncedBuilderBlocks,
} from "@/components/admin/layout/builder/useBuilderRouteState"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { CategorySettingsModal } from "@/components/admin/category-builder/layout/CategorySettingsModal"
import { BlockPropertiesPanel } from "@/components/admin/category-builder/layout/BlockPropertiesPanel"
import { CategoryBlockListPanel } from "@/components/admin/category-builder/layout/CategoryBlockListPanel"
import { CategoryBlockEditorModal } from "@/components/admin/category-builder/layout/CategoryBlockEditorModal"
import { CATEGORY_CORE_BLOCK_TYPE, categoryBlocksToValueJson } from "@/lib/actions/categories/category-template-inheritance"
import { getCategoriesForSiteAction, updateCategoryAction, updateCategoryBlockValuesAction } from "@/lib/actions/categories/category-actions"
import type { Category } from "@/lib/actions/categories/category-actions"
import { getSiteUrl } from "@/lib/utils/site-url-generator"

export default function CategoryBuilderEditor({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const [categories, setCategories] = useState<Category[]>([])

  // Get category from URL params
  const urlCategory = searchParams.get('category') || ''

  const [selectedCategory, setSelectedCategory] = useState(urlCategory)
  const [blockListOpen, setBlockListOpen] = useState(false)

  useBuilderRouteSiteSync({
    builderPath: "/admin/categories/builder",
    queryParam: "category",
    queryValue: urlCategory,
    siteId,
  })

  // Load categories (raw rows — settings modal needs row-level _settings)
  useEffect(() => {
    async function loadCategories() {
      try {
        const { data, error } = await getCategoriesForSiteAction({ data: { siteId: siteId, options: { selectedSlug: urlCategory } } })
        if (error) {
          console.error('Failed to load categories:', error)
          return
        }
        setCategories(data || [])

      } catch (err) {
        console.error('Failed to load categories:', err)
      }
    }

    loadCategories()
  }, [siteId, urlCategory])

  useSelectedBuilderSlug({
    builderPath: "/admin/categories/builder",
    items: categories,
    queryParam: "category",
    selectedSlug: selectedCategory,
    setSelectedSlug: setSelectedCategory,
    siteId,
    slugFromUrl: urlCategory,
  })

  // Custom hooks for data and state management (blocks are template-merged)
  const { site, blocks, blocksLoading } = useCategoryData(siteId, selectedCategory)
  const [localBlocks, setLocalBlocks] = useSyncedBuilderBlocks(blocks, { shallowCopy: true })

  const builderState = useCategoryBuilder({
    blocks: localBlocks,
    setBlocks: setLocalBlocks,
    selectedCategory,
    categoryId: categories.find(c => c.slug === selectedCategory)?.id,
  })
  const selectedBlock = builderState.selectedBlock
  const [draftContent, setDraftContent] = useState<Record<string, any>>({})
  // Core block drafts for the category row's title/featured image (directory core pattern)
  const [draftCategoryTitle, setDraftCategoryTitle] = useState("")
  const [draftCategoryFeaturedImage, setDraftCategoryFeaturedImage] = useState("")
  const [isSavingBlock, setIsSavingBlock] = useState(false)

  // Current category data
  const currentCategoryData = categories.find(c => c.slug === selectedCategory)
  const currentCategory = {
    slug: selectedCategory,
    name: currentCategoryData?.title || selectedCategory,
    blocks: localBlocks[selectedCategory] || []
  }

  // Draft block content edits stay local until saved
  useEffect(() => {
    if (!selectedBlock) {
      setDraftContent({})
      setDraftCategoryTitle("")
      dismissErrorToast()
      return
    }

    setDraftContent(
      selectedBlock.content
        ? JSON.parse(JSON.stringify(selectedBlock.content))
        : {}
    )
    setDraftCategoryTitle(currentCategoryData?.title || selectedCategory)
    setDraftCategoryFeaturedImage(currentCategoryData?.featured_image || "")
    dismissErrorToast()
  }, [selectedBlock, currentCategoryData?.featured_image, currentCategoryData?.title, selectedCategory])

  // Handle category information updates
  const updateCurrentCategory = async (updates: { title?: string; meta_description?: string; featured_image?: string; is_published?: boolean }) => {
    if (!currentCategoryData?.id) return

    try {
      const { data, error } = await updateCategoryAction({ data: { categoryId: currentCategoryData.id, data: updates } })
      if (error) {
        console.error('Failed to update category:', error)
        return
      }
      if (data) {
        setCategories(prev => prev.map(c => c.id === data.id ? data : c))
      }
    } catch (error) {
      console.error('Failed to update category:', error)
    }
  }

  const [isPublishing, setIsPublishing] = useState(false)
  const handlePublish = async () => {
    if (!currentCategoryData?.id) return
    try {
      setIsPublishing(true)
      await updateCurrentCategory({ is_published: true })
    } finally {
      setIsPublishing(false)
    }
  }

  const handleDraftChange = (field: string, value: any) => {
    setDraftContent((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleCloseBlockEditor = () => {
    if (isSavingBlock) return
    builderState.setSelectedBlock(null)
    dismissErrorToast()
  }

  // Save the selected block's value edits (template-owned keys are pruned server-side)
  const handleSaveBlockEditor = async () => {
    if (!selectedBlock || !currentCategoryData?.id) return

    setIsSavingBlock(true)
    dismissErrorToast()

    try {
      const currentBlocks = localBlocks[selectedCategory] || []
      const nextBlocks = currentBlocks.map((block) =>
        block.id === selectedBlock.id
          ? { ...block, content: draftContent }
          : block
      )

      // Core block edits the category row's title/featured image — save those first
      if (selectedBlock.type === CATEGORY_CORE_BLOCK_TYPE) {
        const nextTitle = draftCategoryTitle.trim() || currentCategoryData.title
        const nextFeaturedImage = draftCategoryFeaturedImage.trim() || null
        const currentFeaturedImage = currentCategoryData.featured_image || null
        const categoryUpdates: { title?: string; featured_image?: string | null } = {}

        if (nextTitle !== currentCategoryData.title) {
          categoryUpdates.title = nextTitle
        }

        if (nextFeaturedImage !== currentFeaturedImage) {
          categoryUpdates.featured_image = nextFeaturedImage
        }

        if (Object.keys(categoryUpdates).length > 0) {
          const { data, error } = await updateCategoryAction({ data: { categoryId: currentCategoryData.id, data: categoryUpdates } })
          if (error || !data) {
            showErrorToast(error || "Failed to save category details")
            return
          }
          setCategories(prev => prev.map(c => c.id === data.id ? data : c))
        }
      }

      const contentBlocks = categoryBlocksToValueJson(nextBlocks)
      const result = await updateCategoryBlockValuesAction({ data: { categoryId: currentCategoryData.id, contentBlocks: contentBlocks } })
      if (!result.success) {
        showErrorToast(result.error || "Failed to save block")
        return
      }

      setLocalBlocks((current) => ({
        ...current,
        [selectedCategory]: nextBlocks,
      }))
      builderState.setSelectedBlock(null)
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : "Failed to save block")
    } finally {
      setIsSavingBlock(false)
    }
  }

  // Overlay the in-progress draft on the preview
  const previewBlocks = selectedBlock
    ? currentCategory.blocks.map((block) => (
        block.id === selectedBlock.id
          ? { ...block, content: draftContent }
          : block
      ))
    : currentCategory.blocks

  // Preview the in-progress title/image edits while the Core editor is open
  const selectedBlockIsCore = selectedBlock?.type === CATEGORY_CORE_BLOCK_TYPE
  const previewCategoryTitle = selectedBlockIsCore
    ? draftCategoryTitle.trim() || currentCategoryData?.title
    : currentCategoryData?.title
  const previewCategoryFeaturedImage = selectedBlockIsCore
    ? draftCategoryFeaturedImage.trim() || null
    : currentCategoryData?.featured_image

  const viewPageHref = site && currentCategoryData
    ? `${getSiteUrl(site)}/categories/${currentCategoryData.slug}`
    : null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <DashboardStickyHeader
        rightActions={(
          <StickybarTopRightActions
            saveStatus={builderState.saveStatus}
            isSaving={builderState.isSaving}
            onPublish={handlePublish}
            isPublishing={isPublishing}
            isPublished={Boolean(currentCategoryData?.is_published)}
            blockListOpen={blockListOpen}
            onToggleBlockList={() => setBlockListOpen(!blockListOpen)}
            settingsDisabled={!currentCategoryData}
            renderSettingsModal={(show, setShow) => (
              <CategorySettingsModal
                open={show}
                onOpenChange={setShow}
                category={currentCategoryData || null}
                existingCategories={categories}
                onSuccess={(updatedCategory) => {
                  setCategories(prev => prev.map(c => c.id === updatedCategory.id ? updatedCategory : c))
                }}
              />
            )}
          />
        )}
      />
      <div className="flex-1 flex overflow-hidden">
        <BlockPropertiesPanel
          siteId={siteId}
          currentCategory={{
            ...currentCategory,
            blocks: previewBlocks,
            id: currentCategoryData?.id,
            title: previewCategoryTitle,
            meta_description: currentCategoryData?.meta_description || undefined,
            site_id: currentCategoryData?.site_id,
            featured_image: previewCategoryFeaturedImage,
            parent_id: currentCategoryData?.parent_id,
            updated_at: currentCategoryData?.updated_at
          }}
          site={{
            id: siteId,
            name: site?.name || 'Category Site',
            subdomain: site?.subdomain || 'preview',
            settings: site?.settings
          }}
          blocksLoading={blocksLoading}
          onSelectBlock={builderState.setSelectedBlock}
        />

        <CategoryBlockEditorModal
          block={selectedBlock}
          content={draftContent}
          siteId={siteId}
          onContentChange={handleDraftChange}
          onClose={handleCloseBlockEditor}
          onSave={handleSaveBlockEditor}
          saving={isSavingBlock}
          mode="listing"
          categoryTitle={draftCategoryTitle}
          categoryFeaturedImage={draftCategoryFeaturedImage}
          onCategoryTitleChange={setDraftCategoryTitle}
          onCategoryFeaturedImageChange={setDraftCategoryFeaturedImage}
        />

        {blockListOpen && (
          <CategoryBlockListPanel
            blocks={currentCategory.blocks}
            selectedBlock={selectedBlock}
            onSelectBlock={builderState.setSelectedBlock}
            viewPageHref={viewPageHref}
            blocksLoading={blocksLoading}
          />
        )}
      </div>
    </div>
  )
}
