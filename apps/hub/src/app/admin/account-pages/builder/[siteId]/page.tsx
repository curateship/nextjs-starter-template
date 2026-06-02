"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useAccountPageData } from "@/components/admin/account-page-builder/config/useAccountPageData"
import { useAccountPageBuilder } from "@/components/admin/account-page-builder/config/useAccountPageBuilder"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { AccountPageSettingsModal } from "@/components/admin/account-page-builder/layout/AccountPageSettingsModal"
import { BlockPropertiesPanel } from "@/components/admin/account-page-builder/layout/BlockPropertiesPanel"
import { AccountPageBlockEditorDialog } from "@/components/admin/account-page-builder/layout/AccountPageBlockEditorDialog"
import { CreateAccountPageModal } from "@/components/admin/account-page-builder/layout/CreateAccountPageModal"
import { BlockListPanel } from "@/components/admin/layout/builder/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/layout/builder/BlockSelectionModal"
import { ACCOUNT_PAGE_BLOCK_TYPES } from "@/components/admin/account-page-builder/config/account-page-block-types"
import { Dialog } from "@/components/ui/dialog"
import {
  getAccountPagesAction,
  type AccountPage
} from "@/lib/actions/account-pages/account-pages-actions"
import { getAccountPagePath } from "@/lib/utils/account-page-path"
import { getSiteUrl } from "@/lib/utils/site-url-generator"

export default function AccountPageBuilderPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentSite, sites, setCurrentSite } = useSiteSwitcher()
  const [pages, setPages] = useState<AccountPage[]>([])
  const [pagesLoading, setPagesLoading] = useState(true)
  const [pagesError, setPagesError] = useState<string | null>(null)

  const pageFromUrl = searchParams.get('page') || ''
  const [selectedPage, setSelectedPage] = useState(pageFromUrl)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(false)
  const [draftContent, setDraftContent] = useState<Record<string, any>>({})
  const [isSavingBlock, setIsSavingBlock] = useState(false)
  const [createPageOpen, setCreatePageOpen] = useState(false)

  // Keep the site switcher aligned with the route before redirecting.
  useEffect(() => {
    if (currentSite?.id === siteId) return

    const routeSite = sites.find((site) => site.id === siteId)
    if (routeSite) {
      setCurrentSite(routeSite)
      return
    }

    if (currentSite) {
      const pageQuery = pageFromUrl ? `?page=${encodeURIComponent(pageFromUrl)}` : ''
      router.push(`/admin/account-pages/builder/${currentSite.id}${pageQuery}`)
    }
  }, [currentSite, pageFromUrl, router, setCurrentSite, siteId, sites])

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

      } catch (err) {
        setPagesError('Failed to load account pages')
      } finally {
        setPagesLoading(false)
      }
    }

    loadPages()
  }, [siteId])

  useEffect(() => {
    if (pages.length === 0) return

    const matchingPage = pages.find((page) => page.slug === pageFromUrl)
    if (matchingPage) {
      if (selectedPage !== matchingPage.slug) {
        setSelectedPage(matchingPage.slug)
      }
      return
    }

    const defaultPage = pages.find((page) => page.is_default) || pages[0]
    if (selectedPage !== defaultPage.slug) {
      setSelectedPage(defaultPage.slug)
    }
    if (pageFromUrl !== defaultPage.slug) {
      router.replace(`/admin/account-pages/builder/${siteId}?page=${encodeURIComponent(defaultPage.slug)}`)
    }
  }, [pageFromUrl, pages, router, selectedPage, siteId])

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

  useEffect(() => {
    if (!builderState.selectedBlock) return
    setDraftContent(builderState.selectedBlock.content)
  }, [builderState.selectedBlock])

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

  const handlePageCreated = (page: AccountPage) => {
    setPages(prev => [...prev, page])
    setLocalBlocks(prev => ({ ...prev, [page.slug]: [] }))
    setSelectedPage(page.slug)
    setCreatePageOpen(false)
    router.replace(`/admin/account-pages/builder/${siteId}?page=${encodeURIComponent(page.slug)}`)
  }

  const handleSelectSiteChrome = (type: 'navigation' | 'footer') => {
    const returnTo = encodeURIComponent(`/admin/account-pages/builder/${siteId}?page=${selectedPage}`)
    router.push(`/admin/sites/${siteId}/structure/${type}?returnTo=${returnTo}`)
  }

  const handleDraftChange = (field: string, value: any) => {
    setDraftContent((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleCloseBlockEditor = () => {
    if (!builderState.selectedBlock) return

    setDraftContent(builderState.selectedBlock.content)
    builderState.setSelectedBlock(null)
  }

  const handleSaveBlockEditor = async () => {
    if (!builderState.selectedBlock) return

    setIsSavingBlock(true)
    const saved = await builderState.saveSelectedBlockContent(draftContent)
    setIsSavingBlock(false)

    if (saved) {
      builderState.setSelectedBlock(null)
    }
  }

  const viewPageHref = site && currentPageData
    ? `${getSiteUrl(site)}${getAccountPagePath(currentPageData.slug)}`
    : null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <DashboardStickyHeader
        rightActions={(
          <StickybarTopRightActions
            saveMessage={builderState.saveMessage}
            isSaving={builderState.isSaving}
            onSave={currentPageData ? builderState.handleSaveAllBlocks : undefined}
            blockListOpen={blockListOpen}
            onToggleBlockList={currentPageData ? () => setBlockListOpen(!blockListOpen) : undefined}
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
      {!currentPageData ? (
        <div className="flex flex-1 items-center justify-center overflow-hidden p-6">
          <div className="max-w-md text-center">
            {pagesLoading ? (
              <>
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
                <p className="mt-4 text-sm text-muted-foreground">Loading account pages...</p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold">Create an account page first</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Blocks need a real account page before they can be saved or rendered on the frontend.
                </p>
                <Button className="mt-5" onClick={() => setCreatePageOpen(true)}>
                  Create Account Page
                </Button>
              </>
            )}
          </div>

          <Dialog open={!pagesLoading && createPageOpen} onOpenChange={setCreatePageOpen}>
            <CreateAccountPageModal
              siteId={siteId}
              onSuccess={handlePageCreated}
              onCancel={() => setCreatePageOpen(false)}
            />
          </Dialog>
        </div>
      ) : (
      <div className="flex-1 flex overflow-hidden">
        <BlockPropertiesPanel
          currentPage={currentPage}
          site={site ? {
            id: site.id,
            name: site.name,
            subdomain: site.subdomain,
            settings: site.settings
          } : undefined}
          blocksLoading={blocksLoading}
          selectedBlock={builderState.selectedBlock}
          onSelectBlock={builderState.setSelectedBlock}
          onSelectSiteChrome={handleSelectSiteChrome}
        />

        <AccountPageBlockEditorDialog
          selectedBlock={builderState.selectedBlock}
          draftContent={draftContent}
          isSaving={isSavingBlock}
          onOpenChange={(open) => {
            if (!open) {
              handleCloseBlockEditor()
            }
          }}
          onContentChange={handleDraftChange}
          onSave={handleSaveBlockEditor}
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
            viewPageHref={viewPageHref}
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
      )}
    </div>
  )
}
