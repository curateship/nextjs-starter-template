"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useCategoryData } from "@/components/admin/category-builder/config/useCategoryData"
import { useCategoryBuilder } from "@/components/admin/category-builder/config/useCategoryBuilder"
import { useSiteContext } from "@/contexts/site-context"
import { StickyHeader } from "@/components/admin/category-builder/layout/StickyHeader"
import { BlockPropertiesPanel } from "@/components/admin/category-builder/layout/BlockPropertiesPanel"
import { BlockListPanel } from "@/components/admin/category-builder/layout/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/category-builder/layout/BlockSelectionModal"
import { getCategoriesForSiteAction, updateCategoryAction } from "@/lib/actions/categories/category-actions"
import type { Category } from "@/lib/actions/categories/category-actions"

export default function CategoryBuilderEditor({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentSite } = useSiteContext()
  const [categories, setCategories] = useState<Category[]>([])

  // Get category from URL params
  const urlCategory = searchParams.get('category') || ''

  const [selectedCategory, setSelectedCategory] = useState(urlCategory)
  const [blockModalOpen, setBlockModalOpen] = useState(false)

  // Sync state with URL params whenever they change
  useEffect(() => {
    if (urlCategory && urlCategory !== selectedCategory) {
      setSelectedCategory(urlCategory)
    }
  }, [urlCategory])

  // Redirect when site changes in sidebar
  useEffect(() => {
    if (currentSite && currentSite.id !== siteId) {
      router.push(`/admin/categories/builder/${currentSite.id}`)
    }
  }, [currentSite, siteId, router])

  // Load categories
  useEffect(() => {
    async function loadCategories() {
      try {
        const { data, error } = await getCategoriesForSiteAction(siteId)
        if (error) {
          console.error('Failed to load categories:', error)
          return
        }
        setCategories(data || [])

        // If URL category parameter exists, ensure it's selected
        if (urlCategory && data && data.length > 0) {
          const categoryExists = data.some(c => c.slug === urlCategory)
          if (categoryExists) {
            setSelectedCategory(urlCategory)
          } else {
            // Category doesn't exist, redirect to first category
            const firstCategory = data[0]
            setSelectedCategory(firstCategory.slug)
            router.replace(`/admin/categories/builder/${siteId}?category=${firstCategory.slug}`)
          }
        } else if (data && data.length > 0 && !urlCategory) {
          // No category in URL, select first one
          const firstCategory = data[0]
          setSelectedCategory(firstCategory.slug)
          router.replace(`/admin/categories/builder/${siteId}?category=${firstCategory.slug}`)
        }
      } catch (err) {
        console.error('Failed to load categories:', err)
      }
    }

    loadCategories()
  }, [siteId, urlCategory, router])

  // Custom hooks for data and state management
  const { site, blocks, siteBlocks, blocksLoading, siteError } = useCategoryData(siteId)
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
    currentCategory: categories.find(c => c.slug === selectedCategory)
  })

  // Current category data
  const currentCategoryData = categories.find(c => c.slug === selectedCategory)
  const currentCategory = {
    slug: selectedCategory,
    name: currentCategoryData?.title || selectedCategory,
    blocks: localBlocks[selectedCategory] || []
  }

  // Handle category change with URL update
  const handleCategoryChange = (categorySlug: string) => {
    if (categorySlug !== selectedCategory) {
      setSelectedCategory(categorySlug)
      setLocalBlocks(prev => ({
        ...prev,
        [categorySlug]: prev[categorySlug] || []
      }))
      router.replace(`/admin/categories/builder/${siteId}?category=${categorySlug}`)
    }
  }

  // Handle category information updates
  const updateCurrentCategory = async (updates: { title?: string; description?: string; featured_image?: string; is_published?: boolean }) => {
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

  const handleTitleChange = (title: string) => {
    updateCurrentCategory({ title })
  }

  // Only show loading state for critical errors
  if (!site && siteError) {
    return (
      <AdminLayout noPadding>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-red-600 mb-2">{siteError}</p>
            <p className="text-sm text-muted-foreground mb-4">
              Site ID: <code>{siteId}</code>
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Please go to Sites page to get a valid site ID, or create a new site.
            </p>
            <div className="space-x-2">
              <Button asChild>
                <Link href="/admin/sites">Go to Sites</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/admin/sites/new">Create New Site</Link>
              </Button>
            </div>
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <StickyHeader
        breadcrumbItems={[
          { href: site ? `/admin/sites/${site.id}/dashboard` : `/admin/sites/${siteId}/dashboard`, label: "Dashboard" },
          { href: `/admin/categories/${siteId}`, label: "Categories" },
          { label: currentCategoryData?.title || "", isPage: true }
        ]}
        categories={categories}
        selectedCategory={selectedCategory}
        onCategoryChange={handleCategoryChange}
        onCategoryCreated={(category) => {
          setCategories(prev => [...prev, category])
        }}
        onCategoryUpdated={(updatedCategory) => {
          setCategories(prev => prev.map(c => c.id === updatedCategory.id ? updatedCategory : c))
        }}
        saveMessage={builderState.saveMessage}
        isSaving={builderState.isSaving}
        onSave={builderState.handleSaveAllBlocks}
        onPublish={handlePublish}
        isPublishing={isPublishing}
        site={site}
        onOpenBlockModal={() => setBlockModalOpen(true)}
      />
      <div className="flex-1 flex overflow-hidden">
        <BlockPropertiesPanel
          selectedBlock={builderState.selectedBlock}
          updateBlockContent={builderState.updateBlockContent}
          siteId={siteId}
          currentCategory={{
            ...currentCategory,
            id: currentCategoryData?.id,
            title: currentCategoryData?.title,
            meta_description: currentCategoryData?.meta_description || undefined,
            site_id: currentCategoryData?.site_id,
            featured_image: currentCategoryData?.featured_image,
            description: currentCategoryData?.description
          }}
          site={{
            id: siteId,
            name: site?.name || 'Category Site',
            subdomain: site?.subdomain || 'preview',
            settings: site?.settings
          }}
          siteBlocks={siteBlocks}
          blocksLoading={blocksLoading}
          onTitleChange={handleTitleChange}
          onSelectBlock={builderState.setSelectedBlock}
          onBack={() => builderState.setSelectedBlock(null)}
        />

        <BlockListPanel
          currentCategory={currentCategory}
          selectedBlock={builderState.selectedBlock}
          onSelectBlock={builderState.setSelectedBlock}
          onDeleteBlock={builderState.handleDeleteBlock}
          onReorderBlocks={builderState.handleReorderBlocks}
          onPreviewCategory={() => builderState.setSelectedBlock(null)}
          deleting={null}
          blocksLoading={blocksLoading}
        />

        <BlockSelectionModal
          open={blockModalOpen}
          onOpenChange={setBlockModalOpen}
          onAddBlocks={builderState.handleAddBlocks}
          existingBlockTypes={currentCategory.blocks.map(b => b.type)}
        />
      </div>
    </div>
  )
}
