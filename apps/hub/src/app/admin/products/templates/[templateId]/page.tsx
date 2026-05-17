"use client"

import { use, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { BlockSelectionModal } from "@/components/admin/layout/builder/BlockSelectionModal"
import { BlockListPanel } from "@/components/admin/layout/builder/BlockListPanel"
import { ModalTabs, ModalTabsProvider } from "@/components/admin/layout/dashboard/modal-tabs"
import { DashboardModalContent } from "@/components/admin/layout/dashboard/modals"
import { PRODUCT_BLOCK_TYPES, getBlockTypeDefinition } from "@/components/admin/product-builder/config/product-block-types"
import {
  parseProductBlocksFromJson,
  productBlocksToJson,
  type ProductBuilderBlock,
} from "@/components/admin/product-builder/config/product-block-utils"
import {
  getProductTemplateById,
  updateProductTemplate,
  type ProductTemplate,
} from "@/lib/actions/products/product-template-actions"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { ProductPreview } from "@/components/admin/product-builder/layout/ProductPreview"
import { ProductHeroBlock } from "@/components/admin/product-builder/blocks/hero/ProductHeroBlock"
import { ProductDetailsBlock } from "@/components/admin/product-builder/blocks/details/ProductDetailsBlock"
import { ProductGalleryBlock } from "@/components/admin/product-builder/blocks/gallery/ProductGalleryBlock"
import { ProductFeaturesBlock } from "@/components/admin/product-builder/blocks/features/ProductFeaturesBlock"
import { ProductHotspotBlock } from "@/components/admin/product-builder/blocks/hotspot/ProductHotspotBlock"
import { ProductCheckoutBlock } from "@/components/admin/product-builder/blocks/checkout/ProductCheckoutBlock"
import { ProductLeadMagnetBlock } from "@/components/admin/product-builder/blocks/lead-magnet/ProductLeadMagnetBlock"
import { ProductEmailModalBlock } from "@/components/admin/product-builder/blocks/email-modal/ProductEmailModalBlock"
import { ProductFAQBlock } from "@/components/admin/product-builder/blocks/faq/ProductFAQBlock"
import { ProductTestimonialsBlock } from "@/components/admin/product-builder/blocks/testimonials/ProductTestimonialsBlock"
import { ProductListingViewBlock } from "@/components/admin/product-builder/blocks/listing-view/ProductListingViewBlock"
import { Check, Pencil, X } from "lucide-react"

interface PageProps {
  params: Promise<{ templateId: string }>
}

interface BlockSelection {
  type: string
  quantity: number
}

export default function ProductTemplateEditorPage({ params }: PageProps) {
  const { templateId } = use(params)
  const router = useRouter()
  const { currentSite, sites, setCurrentSite } = useSiteSwitcher()
  const [template, setTemplate] = useState<ProductTemplate | null>(null)
  const [blocks, setBlocks] = useState<ProductBuilderBlock[]>([])
  const [selectedBlock, setSelectedBlock] = useState<ProductBuilderBlock | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState("")
  const previewTitle = "Preview Product"
  const previewFeaturedImage = ""
  const [draftContent, setDraftContent] = useState<Record<string, any>>({})
  const [isSavingBlock, setIsSavingBlock] = useState(false)
  const [blockSaveError, setBlockSaveError] = useState<string | null>(null)

  const loadTemplate = useCallback(async () => {
    setLoading(true)

    const { data, error: fetchError } = await getProductTemplateById(templateId)
    if (fetchError || !data) {
      setError(fetchError || "Not found")
      setLoading(false)
      return
    }

    setTemplate(data)
    setNameInput(data.name)
    setBlocks(parseProductBlocksFromJson(data.content_blocks || {}))
    setSelectedBlock(null)
    setLoading(false)
  }, [templateId])

  useEffect(() => {
    loadTemplate()
  }, [loadTemplate])

  useEffect(() => {
    if (!template || currentSite?.id === template.site_id) return

    const templateSite = sites.find((site) => site.id === template.site_id)
    if (templateSite) {
      setCurrentSite(templateSite)
    }
  }, [currentSite?.id, setCurrentSite, sites, template])

  useEffect(() => {
    if (!selectedBlock) {
      setDraftContent({})
      setBlockSaveError(null)
      return
    }

    setDraftContent(
      selectedBlock.content
        ? JSON.parse(JSON.stringify(selectedBlock.content))
        : {}
    )
    setBlockSaveError(null)
  }, [selectedBlock])

  function handleDeleteBlock(block: ProductBuilderBlock) {
    setBlocks((prev) => prev.filter((item) => item.id !== block.id))

    if (selectedBlock?.id === block.id) {
      setSelectedBlock(null)
    }
  }

  function handleReorderBlocks(reorderedBlocks: ProductBuilderBlock[]) {
    setBlocks(reorderedBlocks.map((block, index) => ({
      ...block,
      display_order: index,
    })))
  }

  function handleDraftChange(field: string, value: any) {
    setDraftContent((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function handleUpdateBlock(blockId: string, updates: Partial<ProductBuilderBlock>) {
    setBlocks((currentBlocks) => currentBlocks.map((block) => {
      if (block.id !== blockId) return block

      const updatedBlock = {
        ...block,
        ...updates,
        content: updates.content !== undefined ? updates.content : block.content,
      }

      if (selectedBlock?.id === blockId) {
        setSelectedBlock(updatedBlock)
      }

      return updatedBlock
    }))
  }

  function handleCloseBlockEditor() {
    if (isSavingBlock) return
    setSelectedBlock(null)
    setBlockSaveError(null)
  }

  async function handleSaveBlockEditor() {
    if (!template || !selectedBlock) return

    setIsSavingBlock(true)
    setBlockSaveError(null)

    try {
      const previousBlocks = blocks
      const nextBlocks = blocks.map((block) =>
        block.id === selectedBlock.id
          ? {
              ...block,
              content: draftContent,
            }
          : block
      )
      setBlocks(nextBlocks)
      const contentBlocks = productBlocksToJson(nextBlocks, template.content_blocks || {})
      const { data, error: saveError } = await updateProductTemplate(template.id, {
        content_blocks: contentBlocks,
      })

      if (saveError || !data) {
        setBlocks(previousBlocks)
        setBlockSaveError(saveError || "Failed to save block")
        return
      }

      setBlocks(parseProductBlocksFromJson(data.content_blocks || {}))
      setTemplate(data)
      setSaveMessage("Saved!")
      setTimeout(() => setSaveMessage(""), 3000)
      setSelectedBlock(null)
    } catch (error) {
      setBlockSaveError(error instanceof Error ? error.message : "Failed to save block")
    } finally {
      setIsSavingBlock(false)
    }
  }

  function handleAddBlocks(selections: BlockSelection[]) {
    const newBlocks: ProductBuilderBlock[] = []

    for (const selection of selections) {
      const blockDefinition = getBlockTypeDefinition(selection.type)
      if (!blockDefinition) continue

      for (let index = 0; index < selection.quantity; index += 1) {
        const timestamp = Date.now() + index
        newBlocks.push({
          id: `${selection.type}-${timestamp}`,
          type: selection.type,
          title: blockDefinition.name,
          content: JSON.parse(JSON.stringify(blockDefinition.defaultContent)),
        })
      }
    }

    if (!newBlocks.length) return
    setBlocks((prev) => [...prev, ...newBlocks])
  }

  async function handleSave() {
    if (!template) return

    setIsSaving(true)
    setSaveMessage("Saving...")

    try {
      const contentBlocks = productBlocksToJson(blocks, template.content_blocks || {})
      const { data, error: saveError } = await updateProductTemplate(template.id, {
        content_blocks: contentBlocks,
      })

      if (saveError) {
        setSaveMessage(`Error: ${saveError}`)
        setTimeout(() => setSaveMessage(""), 5000)
      } else if (data) {
        setTemplate(data)
        setBlocks(parseProductBlocksFromJson(data.content_blocks || {}))
        setSaveMessage("Saved!")
        setTimeout(() => setSaveMessage(""), 3000)
      }
    } catch (err) {
      setSaveMessage(`Error: ${err instanceof Error ? err.message : 'Failed to save'}`)
      setTimeout(() => setSaveMessage(""), 5000)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSaveName() {
    if (!template || !nameInput.trim()) return

    const { data, error: saveError } = await updateProductTemplate(template.id, { name: nameInput.trim() })
    if (!saveError && data) {
      setTemplate(data)
    }

    setEditingName(false)
  }

  const templateSite = template
    ? sites.find((site) => site.id === template.site_id)
    : null
  const previewSiteSource = templateSite || (currentSite?.id === template?.site_id ? currentSite : null)
  const previewSite = previewSiteSource
    ? {
        id: previewSiteSource.id,
        name: previewSiteSource.name,
        subdomain: previewSiteSource.subdomain,
        settings: previewSiteSource.settings,
      }
    : undefined

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <DashboardStickyHeader />
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 border-r bg-background overflow-hidden">
            <div className="flex-1 overflow-y-auto bg-muted/30 p-8 h-full">
              <div className="mx-auto h-96 max-w-4xl rounded-lg bg-white shadow-sm animate-pulse" />
            </div>
          </div>
          <div className="w-[250px] p-2.5">
            <div className="space-y-1">
              {[1, 2, 3].map((item) => (
                <div key={item} className="p-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-7 h-7 bg-muted rounded animate-pulse" />
                    <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error && !template) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <DashboardStickyHeader />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={() => router.push("/admin/products/templates")} variant="outline">
              Back to Templates
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <DashboardStickyHeader
        rightActions={(
          <StickybarTopRightActions
            rightActions={(
              <div className="flex items-center gap-2">
                {editingName ? (
                  <div className="flex items-center gap-1">
                    <Input
                      value={nameInput}
                      onChange={(event) => setNameInput(event.target.value)}
                      className="h-8 w-48 text-sm"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') handleSaveName()
                        if (event.key === 'Escape') {
                          setEditingName(false)
                          setNameInput(template?.name || "")
                        }
                      }}
                      autoFocus
                    />
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleSaveName}>
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        setEditingName(false)
                        setNameInput(template?.name || "")
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setEditingName(true)} title="Rename template">
                    <Pencil className="w-3.5 h-3.5 mr-1" />
                    Rename
                  </Button>
                )}
              </div>
            )}
            saveMessage={saveMessage}
            isSaving={isSaving}
            onSave={handleSave}
            blockListOpen={blockListOpen}
            onToggleBlockList={() => setBlockListOpen(!blockListOpen)}
          />
        )}
      />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden border-r bg-background">
          <ScrollArea className="h-full">
            <ProductPreview
              blocks={blocks}
              product={{
                id: 'preview',
                title: previewTitle,
                slug: 'preview-template',
                meta_description: undefined,
                site_id: template?.site_id || currentSite?.id || 'preview-site',
                featured_image: previewFeaturedImage || null,
                is_published: false,
              }}
              site={previewSite}
              className="min-h-full"
              blocksLoading={loading}
              allBlocks={blocks}
              selectedBlock={selectedBlock}
              onSelectBlock={setSelectedBlock}
              onUpdateLeadMagnetBody={(blockId, htmlContent) => {
                const block = blocks.find((item) => item.id === blockId)
                if (!block) return

                handleUpdateBlock(blockId, {
                  content: {
                    ...block.content,
                    body: htmlContent,
                  },
                })
              }}
            />
          </ScrollArea>
        </div>

        {selectedBlock && (
          <Dialog
            open={!!selectedBlock}
            onOpenChange={(open) => {
              if (!open) {
                handleCloseBlockEditor()
              }
            }}
          >
            <ModalTabsProvider>
              <DashboardModalContent
                title={`Edit ${selectedBlock.title}`}
                titleAccessory={<ModalTabs />}
                className="max-w-[960px]"
                footerClassName={blockSaveError ? "sm:justify-between" : "sm:justify-end"}
                footer={(
                  <>
                    {blockSaveError ? (
                      <div className="text-sm text-red-600">{blockSaveError}</div>
                    ) : null}
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={handleCloseBlockEditor} disabled={isSavingBlock}>
                        Cancel
                      </Button>
                      <Button type="button" onClick={handleSaveBlockEditor} disabled={isSavingBlock}>
                        {isSavingBlock ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </>
                )}
              >
                {selectedBlock.type === "product-hero" && (
                        <ProductHeroBlock
                          content={draftContent}
                          onContentChange={handleDraftChange}
                          siteId={template?.site_id || currentSite?.id || ""}
                          blockId={selectedBlock.id}
                        />
                      )}

                      {selectedBlock.type === "product-details" && (
                        <ProductDetailsBlock
                          description={draftContent.description || ""}
                          specifications={draftContent.specifications || []}
                          onDescriptionChange={(value) => handleDraftChange("description", value)}
                          onSpecificationsChange={(specs) => handleDraftChange("specifications", specs)}
                          visibility={draftContent.visibility}
                          onVisibilityChange={(v) => handleDraftChange("visibility", v)}
                        />
                      )}

                      {selectedBlock.type === "product-gallery" && (
                        <ProductGalleryBlock
                          images={draftContent.images || []}
                          onImagesChange={(images) => handleDraftChange("images", images)}
                          visibility={draftContent.visibility}
                          onVisibilityChange={(v) => handleDraftChange("visibility", v)}
                        />
                      )}

                      {selectedBlock.type === "product-features" && (
                        <ProductFeaturesBlock
                          header={draftContent.header ?? ""}
                          subheader={draftContent.subheader ?? ""}
                          headerAlign={draftContent.headerAlign || "left"}
                          featuresCollection={draftContent.featuresCollection || []}
                          onHeaderChange={(value) => handleDraftChange("header", value)}
                          onSubheaderChange={(value) => handleDraftChange("subheader", value)}
                          onHeaderAlignChange={(value) => handleDraftChange("headerAlign", value)}
                          onFeaturesCollectionChange={(features) => handleDraftChange("featuresCollection", features)}
                          siteId={template?.site_id || currentSite?.id || ""}
                          blockId={selectedBlock.id}
                          visibility={draftContent.visibility}
                          onVisibilityChange={(v) => handleDraftChange("visibility", v)}
                        />
                      )}

                      {selectedBlock.type === "product-hotspot" && (
                        <ProductHotspotBlock
                          header={draftContent.header ?? "Interactive Product Overview"}
                          subheader={draftContent.subheader ?? "Hover over the blinking dots to discover more about our features"}
                          headerAlign={draftContent.headerAlign ?? "left"}
                          backgroundImage={draftContent.backgroundImage || ""}
                          productHotspots={draftContent.productHotspots || []}
                          showTooltipsAlways={draftContent.showTooltipsAlways || false}
                          onHeaderChange={(value) => handleDraftChange("header", value)}
                          onSubheaderChange={(value) => handleDraftChange("subheader", value)}
                          onHeaderAlignChange={(value) => handleDraftChange("headerAlign", value)}
                          onBackgroundImageChange={(value) => handleDraftChange("backgroundImage", value)}
                          onProductHotspotsChange={(value) => handleDraftChange("productHotspots", value)}
                          onShowTooltipsAlwaysChange={(value) => handleDraftChange("showTooltipsAlways", value)}
                          siteId={template?.site_id || currentSite?.id || ""}
                          blockId={selectedBlock.id}
                          visibility={draftContent.visibility}
                          onVisibilityChange={(v) => handleDraftChange("visibility", v)}
                        />
                      )}

                      {selectedBlock.type === "product-checkout" && (
                        <ProductCheckoutBlock
                          header={draftContent.header ?? ""}
                          subheader={draftContent.subheader ?? ""}
                          headerAlign={draftContent.headerAlign ?? "left"}
                          productPricingTiers={draftContent.productPricingTiers || []}
                          checkoutSettings={draftContent.checkoutSettings}
                          onHeaderChange={(value) => handleDraftChange("header", value)}
                          onSubheaderChange={(value) => handleDraftChange("subheader", value)}
                          onHeaderAlignChange={(value) => handleDraftChange("headerAlign", value)}
                          onProductPricingTiersChange={(value) => handleDraftChange("productPricingTiers", value)}
                          onCheckoutSettingsChange={(value) => handleDraftChange("checkoutSettings", value)}
                          visibility={draftContent.visibility}
                          onVisibilityChange={(v) => handleDraftChange("visibility", v)}
                        />
                      )}

                      {selectedBlock.type === "product-lead-magnet" && (
                        <ProductLeadMagnetBlock
                          content={draftContent}
                          onContentChange={handleDraftChange}
                          siteId={template?.site_id || currentSite?.id || ""}
                          blockId={selectedBlock.id}
                        />
                      )}

                      {selectedBlock.type === "product-email-modal" && (
                        <ProductEmailModalBlock
                          content={draftContent}
                          onContentChange={handleDraftChange}
                          siteId={template?.site_id || currentSite?.id || ""}
                          blockId={selectedBlock.id}
                        />
                      )}

                      {selectedBlock.type === "product-faq" && (
                        <ProductFAQBlock
                          header={draftContent.header ?? "Product FAQ"}
                          subheader={draftContent.subheader ?? "Get answers to common questions about this product, its features, compatibility, and support options."}
                          headerAlign={draftContent.headerAlign ?? "left"}
                          productFaqItems={draftContent.productFaqItems || []}
                          onHeaderChange={(value) => handleDraftChange("header", value)}
                          onSubheaderChange={(value) => handleDraftChange("subheader", value)}
                          onHeaderAlignChange={(value) => handleDraftChange("headerAlign", value)}
                          onProductFaqItemsChange={(value) => handleDraftChange("productFaqItems", value)}
                          visibility={draftContent.visibility}
                          onVisibilityChange={(v) => handleDraftChange("visibility", v)}
                        />
                      )}

                      {selectedBlock.type === "product-testimonials" && (
                        <ProductTestimonialsBlock
                          content={draftContent}
                          onContentChange={handleDraftChange}
                          siteId={template?.site_id || currentSite?.id || ""}
                          blockId={selectedBlock.id}
                        />
                      )}

                      {selectedBlock.type === "listing-views" && (
                        <ProductListingViewBlock
                          header={draftContent.header ?? "Latest Products"}
                          subheader={draftContent.subheader ?? "Check out our products"}
                          headerAlign={draftContent.headerAlign ?? "left"}
                          contentType={draftContent.contentType ?? "products"}
                          imageFit={draftContent.imageFit ?? "crop"}
                          displayMode={draftContent.displayMode ?? "grid"}
                          itemsToShow={draftContent.itemsToShow ?? 6}
                          columns={draftContent.columns ?? 3}
                          sortBy={draftContent.sortBy ?? "date"}
                          sortOrder={draftContent.sortOrder ?? "desc"}
                          isPaginated={draftContent.isPaginated ?? false}
                          itemsPerPage={draftContent.itemsPerPage ?? 12}
                          viewAllText={draftContent.viewAllText ?? ""}
                          viewAllLink={draftContent.viewAllLink ?? ""}
                          onHeaderChange={(value) => handleDraftChange("header", value)}
                          onSubheaderChange={(value) => handleDraftChange("subheader", value)}
                          onHeaderAlignChange={(value) => handleDraftChange("headerAlign", value)}
                          onContentTypeChange={(value) => handleDraftChange("contentType", value)}
                          onImageFitChange={(value) => handleDraftChange("imageFit", value)}
                          onDisplayModeChange={(value) => handleDraftChange("displayMode", value)}
                          onItemsToShowChange={(value) => handleDraftChange("itemsToShow", value)}
                          onColumnsChange={(value) => handleDraftChange("columns", value)}
                          onSortByChange={(value) => handleDraftChange("sortBy", value)}
                          onSortOrderChange={(value) => handleDraftChange("sortOrder", value)}
                          onIsPaginatedChange={(value) => handleDraftChange("isPaginated", value)}
                          onItemsPerPageChange={(value) => handleDraftChange("itemsPerPage", value)}
                          onViewAllTextChange={(value) => handleDraftChange("viewAllText", value)}
                          onViewAllLinkChange={(value) => handleDraftChange("viewAllLink", value)}
                          visibility={draftContent.visibility}
                          onVisibilityChange={(v) => handleDraftChange("visibility", v)}
                        />
                      )}
              </DashboardModalContent>
            </ModalTabsProvider>
          </Dialog>
        )}

        {blockListOpen && (
          <BlockListPanel
            blocks={blocks}
            blockTypes={PRODUCT_BLOCK_TYPES}
            entityName="product template"
            selectedBlock={selectedBlock}
            onSelectBlock={setSelectedBlock}
            onDeleteBlock={handleDeleteBlock}
            onReorderBlocks={handleReorderBlocks}
            onAddBlock={() => setBlockModalOpen(true)}
            deleting={null}
            blocksLoading={loading}
          />
        )}

        <BlockSelectionModal
          open={blockModalOpen}
          onOpenChange={setBlockModalOpen}
          onAddBlocks={handleAddBlocks}
          existingBlockTypes={blocks.map((block) => block.type)}
          blockTypes={PRODUCT_BLOCK_TYPES}
          entityName="product template"
        />
      </div>
    </div>
  )
}
