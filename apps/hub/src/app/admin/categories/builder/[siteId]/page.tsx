"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useCategoryData } from "@/components/admin/category-builder/config/useCategoryData"
import { useCategoryBuilder } from "@/components/admin/category-builder/config/useCategoryBuilder"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
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
  const { currentSite, sites, setCurrentSite } = useSiteSwitcher()
  const [categories, setCategories] = useState<Category[]>([])

  // Get category from URL params
  const urlCategory = searchParams.get('category') || ''

  const [selectedCategory, setSelectedCategory] = useState(urlCategory)
  const [blockListOpen, setBlockListOpen] = useState(false)

  // Keep the site switcher aligned with the route before redirecting.
  useEffect(() => {
    if (currentSite?.id === siteId) return

    const routeSite = sites.find((site) => site.id === siteId)
    if (routeSite) {
      setCurrentSite(routeSite)
      return
    }

    if (currentSite) {
      const categoryQuery = urlCategory ? `?category=${encodeURIComponent(urlCategory)}` : ''
      router.push(`/admin/categories/builder/${currentSite.id}${categoryQuery}`)
    }
  }, [currentSite, router, setCurrentSite, siteId, sites, urlCategory])

  // Load categories (raw rows — settings modal needs row-level _settings)
  useEffect(() => {
    async function loadCategories() {
      try {
        const { data, error } = await getCategoriesForSiteAction(siteId, { selectedSlug: urlCategory })
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

  useEffect(() => {
    if (categories.length === 0) return

    const matchingCategory = categories.find((category) => category.slug === urlCategory)
    if (matchingCategory) {
      if (selectedCategory !== matchingCategory.slug) {
        setSelectedCategory(matchingCategory.slug)
      }
      return
    }

    const firstCategory = categories[0]
    if (selectedCategory !== firstCategory.slug) {
      setSelectedCategory(firstCategory.slug)
    }
    if (urlCategory !== firstCategory.slug) {
      router.replace(`/admin/categories/builder/${siteId}?category=${encodeURIComponent(firstCategory.slug)}`)
    }
  }, [categories, router, selectedCategory, siteId, urlCategory])

  // Custom hooks for data and state management (blocks are template-merged)
  const { site, blocks, blocksLoading } = useCategoryData(siteId, selectedCategory)
  const [localBlocks, setLocalBlocks] = useState(blocks)

  // Update local blocks when server blocks change
  useEffect(() => {
    setLocalBlocks({ ...blocks })
  }, [blocks])

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
  const [blockSaveError, setBlockSaveError] = useState<string | null>(null)

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
      setBlockSaveError(null)
      return
    }

    setDraftContent(
      selectedBlock.content
        ? JSON.parse(JSON.stringify(selectedBlock.content))
        : {}
    )
    setDraftCategoryTitle(currentCategoryData?.title || selectedCategory)
    setDraftCategoryFeaturedImage(currentCategoryData?.featured_image || "")
    setBlockSaveError(null)
  }, [selectedBlock, currentCategoryData?.featured_image, currentCategoryData?.title, selectedCategory])

  // Handle category information updates
  const updateCurrentCategory = async (updates: { title?: string; meta_description?: string; featured_image?: string; is_published?: boolean }) => {
    if (!currentCategoryData?.id) return

    try {
      const { data, error } = await updateCategoryAction(currentCategoryData.id, updates)
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
    setBlockSaveError(null)
  }

  // Save the selected block's value edits (template-owned keys are pruned server-side)
  const handleSaveBlockEditor = async () => {
    if (!selectedBlock || !currentCategoryData?.id) return

    setIsSavingBlock(true)
    setBlockSaveError(null)

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
          const { data, error } = await updateCategoryAction(currentCategoryData.id, categoryUpdates)
          if (error || !data) {
            setBlockSaveError(error || "Failed to save category details")
            return
          }
          setCategories(prev => prev.map(c => c.id === data.id ? data : c))
        }
      }

      const contentBlocks = categoryBlocksToValueJson(nextBlocks)
      const result = await updateCategoryBlockValuesAction(currentCategoryData.id, contentBlocks)
      if (!result.success) {
        setBlockSaveError(result.error || "Failed to save block")
        return
      }

      setLocalBlocks((current) => ({
        ...current,
        [selectedCategory]: nextBlocks,
      }))
      builderState.setSelectedBlock(null)
    } catch (error) {
      setBlockSaveError(error instanceof Error ? error.message : "Failed to save block")
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
            saveMessage={builderState.saveMessage}
            isSaving={builderState.isSaving}
            onSave={builderState.handleSaveAllBlocks}
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
          error={blockSaveError}
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
