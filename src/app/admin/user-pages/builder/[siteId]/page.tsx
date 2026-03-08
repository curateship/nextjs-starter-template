"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useUserPageData } from "@/hooks/useUserPageData"
import { useUserPageBuilder } from "@/hooks/useUserPageBuilder"
import { useSiteContext } from "@/contexts/site-context"
import { StickyHeader } from "@/components/admin/user-page-builder/layout/StickyHeader"
import { BlockPropertiesPanel } from "@/components/admin/user-page-builder/layout/BlockPropertiesPanel"
import { BlockListPanel } from "@/components/admin/user-page-builder/layout/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/user-page-builder/layout/BlockSelectionModal"
import {
  getUserPagesAction,
  createUserPageAction,
  updateUserPageAction,
  type UserPage
} from "@/lib/actions/user-pages/user-pages-actions"

export default function DashboardBuilderPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentSite } = useSiteContext()
  const [pages, setPages] = useState<UserPage[]>([])
  const [pagesLoading, setPagesLoading] = useState(true)
  const [pagesError, setPagesError] = useState<string | null>(null)

  // Get initial page from URL params or default to home
  const initialPage = searchParams.get('page') || 'home'
  const [selectedPage, setSelectedPage] = useState(initialPage)
  const [blockModalOpen, setBlockModalOpen] = useState(false)

  // Redirect when site changes in sidebar
  useEffect(() => {
    if (currentSite && currentSite.id !== siteId) {
      router.push(`/admin/user-pages/builder/${currentSite.id}`)
    }
  }, [currentSite, siteId, router])

  // Load dashboard pages data
  useEffect(() => {
    async function loadPages() {
      try {
        setPagesLoading(true)
        setPagesError(null)
        const { data, error } = await getUserPagesAction(siteId)
        if (error) {
          setPagesError(error)
          return
        }
        setPages(data || [])

        // If initial page doesn't exist, redirect to default page
        if (data && data.length > 0) {
          const pageExists = data.some(p => p.slug === initialPage)
          if (!pageExists) {
            const defaultPage = data.find(p => p.is_default) || data[0]
            setSelectedPage(defaultPage.slug)
            router.replace(`/admin/user-pages/builder/${siteId}?page=${defaultPage.slug}`)
          }
        }
      } catch (err) {
        setPagesError('Failed to load user pages')
      } finally {
        setPagesLoading(false)
      }
    }

    loadPages()
  }, [siteId, initialPage, router])

  // Custom hooks for data and state management
  const { site, pages: dataPages, blocks, configLoading, blocksLoading, configError, reloadBlocks } = useUserPageData(siteId)
  const [localBlocks, setLocalBlocks] = useState(blocks)

  // Update local blocks when server blocks change
  useEffect(() => {
    setLocalBlocks(blocks)
  }, [blocks])

  // Update pages from hook data when available
  useEffect(() => {
    if (dataPages && dataPages.length > 0 && !pagesLoading) {
      setPages(dataPages)
    }
  }, [dataPages, pagesLoading])

  const builderState = useUserPageBuilder({
    siteId,
    pages: pages.length > 0 ? pages : dataPages || [],
    blocks: localBlocks,
    setBlocks: setLocalBlocks,
    selectedPage,
    reloadBlocks
  })

  // Current page data with staged deletions filtered out
  const currentPageData = pages.find(p => p.slug === selectedPage)
  const currentPage = {
    slug: selectedPage,
    name: currentPageData?.title || selectedPage,
    blocks: (localBlocks[selectedPage] || []).filter((block, index, self) =>
      index === self.findIndex(b => b.id === block.id)
    )
  }

  // Handle page change with URL update
  const handlePageChange = (pageSlug: string) => {
    if (pageSlug !== selectedPage) {
      setSelectedPage(pageSlug)
      // Ensure blocks array exists for this page
      setLocalBlocks(prev => ({
        ...prev,
        [pageSlug]: prev[pageSlug] || []
      }))
      router.replace(`/admin/user-pages/builder/${siteId}?page=${pageSlug}`)
    }
  }

  // Handle page creation
  const handlePageCreated = async (pageData: { title: string; slug?: string; meta_description?: string }) => {
    const { data: newPage, error } = await createUserPageAction(siteId, pageData)
    if (error || !newPage) {
      console.error('Failed to create user page:', error)
      return
    }

    setPages(prev => [...prev, newPage])
    // Initialize blocks array for the new page
    setLocalBlocks(prev => ({
      ...prev,
      [newPage.slug]: []
    }))
    // Switch to the newly created page
    setSelectedPage(newPage.slug)
    router.replace(`/admin/user-pages/builder/${siteId}?page=${newPage.slug}`)
  }

  // Handle page updates
  const handlePageUpdated = async (pageId: string, pageData: { title?: string; slug?: string; meta_description?: string }) => {
    const { data: updatedPage, error } = await updateUserPageAction(pageId, pageData)
    if (error || !updatedPage) {
      console.error('Failed to update user page:', error)
      return
    }

    setPages(prev => prev.map(p => p.id === updatedPage.id ? updatedPage : p))

    // If the slug changed, we need to update our local blocks and URL
    const currentPage = pages.find(p => p.id === updatedPage.id)
    if (currentPage && currentPage.slug !== updatedPage.slug) {
      // Move blocks from old slug to new slug
      setLocalBlocks(prev => {
        const blocksForPage = prev[currentPage.slug] || []
        const { [currentPage.slug]: removed, ...rest } = prev
        return {
          ...rest,
          [updatedPage.slug]: blocksForPage
        }
      })

      // Update selected page and URL
      setSelectedPage(updatedPage.slug)
      router.replace(`/admin/user-pages/builder/${siteId}?page=${updatedPage.slug}`)
    }
  }

  // Only show error state for critical failures
  if ((configError || pagesError) && !site && !configLoading) {
    return (
      <AdminLayout noPadding>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-red-600 mb-2">{configError || pagesError || 'Dashboard configuration not found'}</p>
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
          { href: `/admin/sites/${siteId}/dashboard`, label: "Dashboard" },
          { href: `/admin/user-pages/${siteId}`, label: "User Pages" },
          { label: currentPageData?.title || "", isPage: true }
        ]}
        pages={pages}
        selectedPage={selectedPage}
        onPageChange={handlePageChange}
        onPageCreated={(pageData) => handlePageCreated({
          title: pageData.title,
          slug: pageData.slug,
          meta_description: pageData.meta_description ?? undefined
        })}
        onPageUpdated={(updatedPage) => {
          const dashboardPage = pages.find(p => p.id === updatedPage.id)
          if (dashboardPage) {
            handlePageUpdated(updatedPage.id, {
              title: updatedPage.title,
              slug: updatedPage.slug,
              meta_description: updatedPage.meta_description ?? undefined
            })
          }
        }}
        saveMessage={builderState.saveMessage}
        isSaving={builderState.isSaving}
        onSave={builderState.handleSaveAllBlocks}
        onPreviewPage={() => builderState.setSelectedBlock(null)}
        site={undefined}
        onOpenBlockModal={() => setBlockModalOpen(true)}
      />
      <div className="flex-1 flex overflow-hidden">
        <BlockPropertiesPanel
          selectedBlock={builderState.selectedBlock}
          updateBlockContent={builderState.updateBlockContent}
          siteId={siteId}
          currentPage={currentPage}
          site={site ? {
            id: site.id,
            name: site.name,
            subdomain: site.subdomain,
            settings: site.settings
          } : undefined}
          blocksLoading={blocksLoading}
        />

        <BlockListPanel
          currentPage={currentPage}
          selectedBlock={builderState.selectedBlock}
          onSelectBlock={builderState.setSelectedBlock}
          onDeleteBlock={builderState.handleDeleteBlock}
          onReorderBlocks={builderState.handleReorderBlocks}
          onPreviewPage={() => builderState.setSelectedBlock(null)}
          deleting={builderState.deleting}
          blocksLoading={blocksLoading}
        />

        <BlockSelectionModal
          open={blockModalOpen}
          onOpenChange={setBlockModalOpen}
          onAddBlocks={builderState.handleAddBlocks}
          existingBlockTypes={currentPage.blocks.map(b => b.type)}
        />
      </div>
    </div>
  )
}
