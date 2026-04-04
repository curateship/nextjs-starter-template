"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { getPageAdminTopNavLinks } from "@/components/admin/layout/dashboard/admin-top-nav-links"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useUserPageData } from "@/components/admin/user-page-builder/config/useUserPageData"
import { useUserPageBuilder } from "@/components/admin/user-page-builder/config/useUserPageBuilder"
import { useSiteSwitcher } from "@/components/admin/providers/site-switcher-provider"
import { BuilderToolbar } from "@/components/admin/shared/BuilderToolbar"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { UserPageSettingsModal } from "@/components/admin/user-page-builder/layout/UserPageSettingsModal"
import { CreateUserPageModal } from "@/components/admin/user-page-builder/layout/CreateUserPageModal"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { BlockPropertiesPanel } from "@/components/admin/user-page-builder/layout/BlockPropertiesPanel"
import { BlockListPanel } from "@/components/admin/shared/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/shared/BlockSelectionModal"
import { USER_PAGE_BLOCK_TYPES } from "@/components/admin/user-page-builder/config/user-page-block-types"
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
  const { currentSite } = useSiteSwitcher()
  const [pages, setPages] = useState<UserPage[]>([])
  const [pagesLoading, setPagesLoading] = useState(true)
  const [pagesError, setPagesError] = useState<string | null>(null)

  // Get initial page from URL params or default to home
  const initialPage = searchParams.get('page') || 'home'
  const [selectedPage, setSelectedPage] = useState(initialPage)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(true)

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
      <DashboardStickyHeader navLinks={getPageAdminTopNavLinks(siteId, "user-pages")} />
      <BuilderToolbar
        className="top-16 z-40"
        breadcrumbItems={[
          { href: `/admin/sites/${siteId}/dashboard`, label: "Dashboard" },
          { href: `/admin/user-pages/${siteId}`, label: "User Pages" },
          { label: currentPageData?.title || "", isPage: true }
        ]}
        items={pages}
        selectedItemSlug={selectedPage}
        onItemChange={handlePageChange}
        entityName="User Page"
        getItemUrl={(item) => `/user-dashboard${item.slug === 'home' ? '' : '/' + item.slug}`}
        saveMessage={builderState.saveMessage}
        isSaving={builderState.isSaving}
        onSave={builderState.handleSaveAllBlocks}
        blockListOpen={blockListOpen}
        onToggleBlockList={() => setBlockListOpen(!blockListOpen)}
        showSidebarToggle={false}
        renderCreateModal={(show, setShow) => (
          <Dialog open={show} onOpenChange={setShow}>
            <DialogContent className="w-[840px] max-w-[95vw]" style={{ width: '840px', maxWidth: '95vw' }}>
              <DialogHeader>
                <DialogTitle>Create New User Page</DialogTitle>
                <DialogDescription>Add a new user page to your dashboard. You can customize the content after creation.</DialogDescription>
              </DialogHeader>
              <CreateUserPageModal
                siteId={siteId}
                onSuccess={(page) => {
                  handlePageCreated({
                    title: page.title,
                    slug: page.slug,
                    meta_description: page.meta_description ?? undefined
                  })
                  setShow(false)
                }}
                onCancel={() => setShow(false)}
              />
            </DialogContent>
          </Dialog>
        )}
        renderSettingsModal={(show, setShow, currentItem) => (
          <UserPageSettingsModal
            open={show}
            onOpenChange={setShow}
            page={(currentItem ? currentPageData : null) || null}
            site={null}
            onSuccess={(updatedPage) => {
              const dashboardPage = pages.find(p => p.id === updatedPage.id)
              if (dashboardPage) {
                handlePageUpdated(updatedPage.id, {
                  title: updatedPage.title,
                  slug: updatedPage.slug,
                  meta_description: updatedPage.meta_description ?? undefined
                })
              }
            }}
          />
        )}
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

        {blockListOpen && (
          <BlockListPanel
            blocks={currentPage.blocks}
            blockTypes={USER_PAGE_BLOCK_TYPES}
            entityName="user page"
            selectedBlock={builderState.selectedBlock}
            onSelectBlock={builderState.setSelectedBlock}
            onDeleteBlock={builderState.handleDeleteBlock}
            onReorderBlocks={builderState.handleReorderBlocks}
            onPreview={() => builderState.setSelectedBlock(null)}
            onAddBlock={() => setBlockModalOpen(true)}
            deleting={builderState.deleting}
            blocksLoading={blocksLoading}
          />
        )}

        <BlockSelectionModal
          open={blockModalOpen}
          onOpenChange={setBlockModalOpen}
          onAddBlocks={builderState.handleAddBlocks}
          existingBlockTypes={currentPage.blocks.map(b => b.type)}
          blockTypes={USER_PAGE_BLOCK_TYPES}
          entityName="user page"
        />
      </div>
    </div>
  )
}
