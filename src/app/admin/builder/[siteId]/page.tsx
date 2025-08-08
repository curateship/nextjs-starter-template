"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useSiteData } from "@/hooks/useSiteData"
import { useSiteBuilder } from "@/hooks/useSiteBuilder"
import { SiteBuilderHeader } from "@/components/admin/layout/site-builder/SiteBuilderHeader"
import { BlockPropertiesPanel } from "@/components/admin/layout/site-builder/BlockPropertiesPanel"
import { BlockListPanel } from "@/components/admin/layout/site-builder/BlockListPanel"
import { BlockTypesPanel } from "@/components/admin/layout/site-builder/BlockTypesPanel"

export default function SiteBuilderEditor({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const [selectedPage, setSelectedPage] = useState("home")
  
  // Custom hooks for data and state management
  const { site, blocks, siteLoading, blocksLoading, siteError } = useSiteData(siteId)
  const [localBlocks, setLocalBlocks] = useState(blocks)
  
  // Update local blocks when server blocks change
  useEffect(() => {
    setLocalBlocks(blocks)
  }, [blocks])
  
  const builderState = useSiteBuilder({ 
    siteId, 
    blocks: localBlocks, 
    setBlocks: setLocalBlocks, 
    selectedPage 
  })
  
  // Current page data with staged deletions filtered out
  const currentPage = {
    slug: selectedPage,
    name: selectedPage === 'home' ? 'Home' : selectedPage === 'about' ? 'About' : 'Contact',
    blocks: (localBlocks[selectedPage] || []).filter(block => !builderState.deletedBlockIds.has(block.id))
  }

  // Show loading state
  if (siteLoading || blocksLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <p>Loading site...</p>
        </div>
      </AdminLayout>
    )
  }

  // Show error state
  if (siteError || !site) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-red-600 mb-2">{siteError || 'Site not found'}</p>
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
    <AdminLayout>
      <div className="flex flex-col -m-4 -mt-6 h-full">
        <SiteBuilderHeader
          site={site}
          selectedPage={selectedPage}
          onPageChange={setSelectedPage}
          saveMessage={builderState.saveMessage}
          isSaving={builderState.isSaving}
          onSave={builderState.handleSaveAllBlocks}
        />
        
        <div className="flex-1 flex">
          <BlockPropertiesPanel
            selectedBlock={builderState.selectedBlock}
            updateBlockContent={builderState.updateBlockContent}
          />
          
          <BlockListPanel
            currentPage={currentPage}
            selectedBlock={builderState.selectedBlock}
            onSelectBlock={builderState.setSelectedBlock}
            onDeleteBlock={builderState.handleDeleteBlock}
            deleting={builderState.deleting}
          />
          
          <BlockTypesPanel
            onAddHeroBlock={builderState.handleAddHeroBlock}
          />
        </div>
      </div>
    </AdminLayout>
  )
}