"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { getPageAdminTopNavLinks } from "@/components/admin/layout/dashboard/admin-top-nav-links"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useAccountPageData } from "@/components/admin/account-page-builder/config/useAccountPageData"
import { useAccountPageBuilder } from "@/components/admin/account-page-builder/config/useAccountPageBuilder"
import { useSiteSwitcher } from "@/components/admin/providers/site-switcher-provider"
import { StickybarTopRightActions } from "@/components/admin/shared/StickybarTopRightActions"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { AccountPageSettingsModal } from "@/components/admin/account-page-builder/layout/AccountPageSettingsModal"
import { BlockPropertiesPanel } from "@/components/admin/account-page-builder/layout/BlockPropertiesPanel"
import { BlockListPanel } from "@/components/admin/shared/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/shared/BlockSelectionModal"
import { ACCOUNT_PAGE_BLOCK_TYPES } from "@/components/admin/account-page-builder/config/account-page-block-types"
import {
  getAccountPagesAction,
  type AccountPage
} from "@/lib/actions/account-pages/account-pages-actions"

export default function AccountPageBuilderPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentSite } = useSiteSwitcher()
  const [pages, setPages] = useState<AccountPage[]>([])
  const [pagesLoading, setPagesLoading] = useState(true)
  const [pagesError, setPagesError] = useState<string | null>(null)

  // Get the initial page slug from the URL when present.
  const initialPage = searchParams.get('page') || ''
  const [selectedPage, setSelectedPage] = useState(initialPage)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(true)

  // Redirect when site changes in sidebar
  useEffect(() => {
    if (currentSite && currentSite.id !== siteId) {
      router.push(`/admin/account-pages/builder/${currentSite.id}`)
    }
  }, [currentSite, siteId, router])

  // Load account pages for the current site.
  useEffect(() => {
    async function loadPages() {
      try {
        setPagesLoading(true)
        setPagesError(null)
        const { data, error } = await getAccountPagesAction(siteId)
        if (error) {
          setPagesError(error)
          return
        }
        setPages(data || [])

        // If the requested page does not exist, fall back to the default account page.
        if (data && data.length > 0) {
          const pageExists = data.some(p => p.slug === initialPage)
          if (!pageExists) {
            const defaultPage = data.find(p => p.is_default) || data[0]
            setSelectedPage(defaultPage.slug)
            router.replace(`/admin/account-pages/builder/${siteId}?page=${defaultPage.slug}`)
          }
        }
      } catch (err) {
        setPagesError('Failed to load account pages')
      } finally {
        setPagesLoading(false)
      }
    }

    loadPages()
  }, [siteId, initialPage, router])

  // Custom hooks for data and state management
  const { site, pages: dataPages, blocks, configLoading, blocksLoading, configError, reloadBlocks } = useAccountPageData(siteId)
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

  const builderState = useAccountPageBuilder({
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

  const handlePageUpdated = (updatedPage: AccountPage) => {
    setPages(prev => prev.map(p => p.id === updatedPage.id ? updatedPage : p))

    const currentPage = pages.find(p => p.id === updatedPage.id)
    if (currentPage && currentPage.slug !== updatedPage.slug) {
      setLocalBlocks(prev => {
        const blocksForPage = prev[currentPage.slug] || []
        const { [currentPage.slug]: _removed, ...rest } = prev
        return {
          ...rest,
          [updatedPage.slug]: blocksForPage
        }
      })
      setSelectedPage(updatedPage.slug)
      router.replace(`/admin/account-pages/builder/${siteId}?page=${updatedPage.slug}`)
    }
  }

  const handleSelectSiteChrome = (type: 'navigation' | 'footer') => {
    const returnTo = encodeURIComponent(`/admin/account-pages/builder/${siteId}?page=${selectedPage}`)
    router.push(`/admin/sites/${siteId}/structure/${type}?returnTo=${returnTo}`)
  }

  // Only show error state for critical failures
  if ((configError || pagesError) && !site && !configLoading) {
    return (
      <AdminLayout noPadding>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-red-600 mb-2">{configError || pagesError || 'Account page configuration not found'}</p>
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
      <DashboardStickyHeader
        navLinks={getPageAdminTopNavLinks(siteId, "account-pages")}
        rightActions={(
          <StickybarTopRightActions
            saveMessage={builderState.saveMessage}
            isSaving={builderState.isSaving}
            onSave={builderState.handleSaveAllBlocks}
            blockListOpen={blockListOpen}
            onToggleBlockList={() => setBlockListOpen(!blockListOpen)}
            settingsDisabled={!currentPageData}
            renderSettingsModal={(show, setShow) => (
              <AccountPageSettingsModal
                open={show}
                onOpenChange={setShow}
                page={currentPageData || null}
                site={null}
                onSuccess={handlePageUpdated}
              />
            )}
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
          onSelectSiteChrome={handleSelectSiteChrome}
        />

        {blockListOpen && (
          <BlockListPanel
            blocks={currentPage.blocks}
            blockTypes={ACCOUNT_PAGE_BLOCK_TYPES}
            entityName="account page"
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
          blockTypes={ACCOUNT_PAGE_BLOCK_TYPES}
          entityName="account page"
        />
      </div>
    </div>
  )
}
