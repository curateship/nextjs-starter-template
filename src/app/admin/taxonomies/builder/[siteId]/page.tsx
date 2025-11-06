"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useTaxonomyData } from "@/hooks/useTaxonomyData"
import { useTaxonomyBuilder } from "@/hooks/useTaxonomyBuilder"
import { useSiteContext } from "@/contexts/site-context"
import { StickyHeader } from "@/components/admin/taxonomy-builder/StickyHeader"
import { BlockPropertiesPanel } from "@/components/admin/taxonomy-builder/BlockPropertiesPanel"
import { BlockListPanel } from "@/components/admin/taxonomy-builder/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/taxonomy-builder/BlockSelectionModal"
import { getSiteTaxonomyTypesAction, type TaxonomyType } from "@/lib/actions/taxonomies/taxonomy-type-actions"
import { getTaxonomiesForTypeAction, updateTaxonomyAction } from "@/lib/actions/taxonomies/taxonomy-actions"
import type { Taxonomy } from "@/lib/actions/taxonomies/taxonomy-actions"

export default function TaxonomyBuilderEditor({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentSite } = useSiteContext()
  const [taxonomyTypes, setTaxonomyTypes] = useState<TaxonomyType[]>([])
  const [taxonomies, setTaxonomies] = useState<Taxonomy[]>([])

  // Get taxonomy type and term from URL params
  const urlTypeId = searchParams.get('type') || ''
  const urlTaxonomy = searchParams.get('taxonomy') || ''

  const [selectedTypeId, setSelectedTypeId] = useState(urlTypeId)
  const [selectedTaxonomy, setSelectedTaxonomy] = useState(urlTaxonomy)
  const [blockModalOpen, setBlockModalOpen] = useState(false)

  // Sync state with URL params whenever they change
  useEffect(() => {
    if (urlTypeId && urlTypeId !== selectedTypeId) {
      setSelectedTypeId(urlTypeId)
    }
    if (urlTaxonomy && urlTaxonomy !== selectedTaxonomy) {
      setSelectedTaxonomy(urlTaxonomy)
    }
  }, [urlTypeId, urlTaxonomy])

  // Redirect when site changes in sidebar
  useEffect(() => {
    if (currentSite && currentSite.id !== siteId) {
      router.push(`/admin/taxonomies/builder/${currentSite.id}`)
    }
  }, [currentSite, siteId, router])

  // Load taxonomy types
  useEffect(() => {
    async function loadTaxonomyTypes() {
      try {
        const { data, error } = await getSiteTaxonomyTypesAction(siteId)
        if (error) {
          console.error('Failed to load taxonomy types:', error)
          return
        }
        setTaxonomyTypes(data || [])

        // If no type selected but we have types, select the first one
        if (data && data.length > 0 && !selectedTypeId) {
          setSelectedTypeId(data[0].id)
          router.replace(`/admin/taxonomies/builder/${siteId}?type=${data[0].id}`)
        }
      } catch (err) {
        console.error('Error loading taxonomy types:', err)
      }
    }

    loadTaxonomyTypes()
  }, [siteId, selectedTypeId, router])

  // Load taxonomies for selected type
  useEffect(() => {
    async function loadTaxonomies() {
      if (!selectedTypeId) {
        return
      }

      try {
        const { data, error } = await getTaxonomiesForTypeAction(siteId, selectedTypeId)
        if (error) {
          console.error('Failed to load taxonomies:', error)
          return
        }
        setTaxonomies(data || [])

        // If URL taxonomy parameter exists, ensure it's selected
        if (urlTaxonomy && data && data.length > 0) {
          const taxonomyExists = data.some(t => t.slug === urlTaxonomy)
          if (taxonomyExists) {
            setSelectedTaxonomy(urlTaxonomy)
          } else {
            // Taxonomy doesn't exist, redirect to first taxonomy
            const firstTaxonomy = data[0]
            setSelectedTaxonomy(firstTaxonomy.slug)
            router.replace(`/admin/taxonomies/builder/${siteId}?type=${selectedTypeId}&taxonomy=${firstTaxonomy.slug}`)
          }
        } else if (data && data.length > 0 && !urlTaxonomy) {
          // No taxonomy in URL, select first one
          const firstTaxonomy = data[0]
          setSelectedTaxonomy(firstTaxonomy.slug)
          router.replace(`/admin/taxonomies/builder/${siteId}?type=${selectedTypeId}&taxonomy=${firstTaxonomy.slug}`)
        }
      } catch (err) {
        console.error('Failed to load taxonomies:', err)
      }
    }

    loadTaxonomies()
  }, [siteId, selectedTypeId, urlTaxonomy, router])

  // Custom hooks for data and state management
  const { site, blocks, siteBlocks, blocksLoading, siteError } = useTaxonomyData(siteId, selectedTypeId)
  const [localBlocks, setLocalBlocks] = useState(blocks)

  // Update local blocks when server blocks change
  useEffect(() => {
    setLocalBlocks(blocks)
  }, [blocks])

  const builderState = useTaxonomyBuilder({
    blocks: localBlocks,
    setBlocks: setLocalBlocks,
    selectedTaxonomy,
    taxonomyId: taxonomies.find(t => t.slug === selectedTaxonomy)?.id,
    currentTaxonomy: taxonomies.find(t => t.slug === selectedTaxonomy)
  })

  // Current taxonomy data with staged deletions filtered out
  const currentTaxonomyData = taxonomies.find(t => t.slug === selectedTaxonomy)
  const currentTaxonomy = {
    slug: selectedTaxonomy,
    name: currentTaxonomyData?.title || selectedTaxonomy,
    blocks: localBlocks[selectedTaxonomy] || []
  }

  // Handle taxonomy change with URL update
  const handleTaxonomyChange = (taxonomySlug: string) => {
    if (taxonomySlug !== selectedTaxonomy) {
      setSelectedTaxonomy(taxonomySlug)
      // Ensure blocks array exists for this taxonomy
      setLocalBlocks(prev => ({
        ...prev,
        [taxonomySlug]: prev[taxonomySlug] || []
      }))
      router.replace(`/admin/taxonomies/builder/${siteId}?type=${selectedTypeId}&taxonomy=${taxonomySlug}`)
    }
  }

  // Handle taxonomy information updates
  const updateCurrentTaxonomy = async (updates: { title?: string; description?: string; featured_image?: string; is_published?: boolean }) => {
    if (!currentTaxonomyData?.id) return

    try {
      const { data, error } = await updateTaxonomyAction(currentTaxonomyData.id, updates)
      if (error) {
        console.error('Failed to update taxonomy:', error)
        return
      }
      if (data) {
        setTaxonomies(prev => prev.map(t => t.id === data.id ? data : t))
      }
    } catch (error) {
      console.error('Failed to update taxonomy:', error)
    }
  }

  const handleTitleChange = (title: string) => {
    updateCurrentTaxonomy({ title })
  }

  const handleDescriptionChange = (description: string) => {
    updateCurrentTaxonomy({ description })
  }

  const handleFeaturedImageChange = (featured_image: string) => {
    updateCurrentTaxonomy({ featured_image })
  }

  const handleStatusChange = (status: string) => {
    updateCurrentTaxonomy({ is_published: status === 'published' })
  }

  // Only show loading state for critical errors (not during normal loading)
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

  const currentType = taxonomyTypes.find(t => t.id === selectedTypeId)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <StickyHeader
        breadcrumbItems={[
          { href: site ? `/admin/sites/${site.id}/dashboard` : `/admin/sites/${siteId}/dashboard`, label: "Dashboard" },
          { href: `/admin/taxonomies/${siteId}`, label: "Taxonomies" },
          { href: currentType ? `/admin/taxonomies/${siteId}/${currentType.slug}` : `/admin/taxonomies/${siteId}`, label: currentType?.name || "" },
          { label: currentTaxonomyData?.title || "", isPage: true }
        ]}
        taxonomies={taxonomies}
        selectedTaxonomy={selectedTaxonomy}
        onTaxonomyChange={handleTaxonomyChange}
        onTaxonomyCreated={(taxonomy) => {
          setTaxonomies(prev => [...prev, taxonomy])
        }}
        onTaxonomyUpdated={(updatedTaxonomy) => {
          setTaxonomies(prev => prev.map(t => t.id === updatedTaxonomy.id ? updatedTaxonomy : t))
        }}
        saveMessage={builderState.saveMessage}
        isSaving={builderState.isSaving}
        onSave={builderState.handleSaveAllBlocks}
        site={site}
        taxonomyType={currentType}
      />
      <div className="flex-1 overflow-y-auto">
        <AdminLayout noPadding>
          <div className="flex-1 flex">
            <BlockPropertiesPanel
              selectedBlock={builderState.selectedBlock}
              updateBlockContent={builderState.updateBlockContent}
              siteId={siteId}
              currentTaxonomy={{
                ...currentTaxonomy,
                id: currentTaxonomyData?.id,
                title: currentTaxonomyData?.title,
                meta_description: currentTaxonomyData?.meta_description || undefined,
                site_id: currentTaxonomyData?.site_id,
                featured_image: currentTaxonomyData?.featured_image,
                description: currentTaxonomyData?.description
              }}
              site={{
                id: siteId,
                name: site?.name || 'Taxonomy Site',
                subdomain: site?.subdomain || 'preview',
                settings: site?.settings
              }}
              siteBlocks={siteBlocks}
              blocksLoading={blocksLoading}
              onTitleChange={handleTitleChange}
              onDescriptionChange={handleDescriptionChange}
              onFeaturedImageChange={handleFeaturedImageChange}
              onStatusChange={handleStatusChange}
            />

            <BlockListPanel
              currentTaxonomy={currentTaxonomy}
              selectedBlock={builderState.selectedBlock}
              onSelectBlock={builderState.setSelectedBlock}
              onDeleteBlock={builderState.handleDeleteBlock}
              onReorderBlocks={builderState.handleReorderBlocks}
              onOpenBlockModal={() => setBlockModalOpen(true)}
              onPreviewTaxonomy={() => builderState.setSelectedBlock(null)}
              deleting={null}
              blocksLoading={blocksLoading}
            />
          </div>

          <BlockSelectionModal
            open={blockModalOpen}
            onOpenChange={setBlockModalOpen}
            onAddBlocks={builderState.handleAddBlocks}
            existingBlockTypes={currentTaxonomy.blocks.map(b => b.type)}
          />
        </AdminLayout>
      </div>
    </div>
  )
}
