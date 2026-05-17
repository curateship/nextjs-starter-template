"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useProductData } from "@/components/admin/product-builder/config/useProductData"
import { useProductBuilder } from "@/components/admin/product-builder/config/useProductBuilder"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { ProductSettingsModal } from "@/components/admin/product-builder/layout/ProductSettingsModal"
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
import {
  Dialog,
} from "@/components/ui/dialog"
import { ModalTabs, ModalTabsProvider } from "@/components/admin/layout/dashboard/modal-tabs"
import { DashboardModalContent } from "@/components/admin/layout/dashboard/modals"
import { ProductPreview } from "@/components/admin/product-builder/layout/ProductPreview"
import { BlockListPanel } from "@/components/admin/layout/builder/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/layout/builder/BlockSelectionModal"
import { PRODUCT_BLOCK_TYPES } from "@/components/admin/product-builder/config/product-block-types"
import { getSiteProductsAction, updateProductAction } from "@/lib/actions/products/product-actions"
import type { Product } from "@/lib/actions/products/product-actions"
import { getSiteUrl } from "@/lib/utils/site-url-generator"
import { ScrollArea } from "@/components/ui/scroll-area"

export default function ProductBuilderEditor({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentSite, sites, setCurrentSite } = useSiteSwitcher()
  const [products, setProducts] = useState<Product[]>([])
  const productFromUrl = searchParams.get('product') || ''
  const [selectedProduct, setSelectedProduct] = useState(productFromUrl)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(true)
  const [draftContent, setDraftContent] = useState<Record<string, any>>({})
  const [isSavingBlock, setIsSavingBlock] = useState(false)
  
  // Keep the site switcher aligned with the route before redirecting.
  useEffect(() => {
    if (currentSite?.id === siteId) return

    const routeSite = sites.find((site) => site.id === siteId)
    if (routeSite) {
      setCurrentSite(routeSite)
      return
    }

    if (currentSite) {
      const productQuery = productFromUrl ? `?product=${encodeURIComponent(productFromUrl)}` : ''
      router.push(`/admin/products/builder/${currentSite.id}${productQuery}`)
    }
  }, [currentSite, productFromUrl, router, setCurrentSite, siteId, sites])
  
  // Load products data
  useEffect(() => {
    async function loadProducts() {
      try {
        const { data, error } = await getSiteProductsAction(siteId)
        if (error) {
          return
        }
        setProducts(data || [])
        
      } catch (err) {
        console.error('Failed to load products', err)
      }
    }
    
    loadProducts()
  }, [siteId])

  useEffect(() => {
    if (products.length === 0) return

    const matchingProduct = products.find((product) => product.slug === productFromUrl)
    if (matchingProduct) {
      if (selectedProduct !== matchingProduct.slug) {
        setSelectedProduct(matchingProduct.slug)
      }
      return
    }

    const firstProduct = products[0]
    if (selectedProduct !== firstProduct.slug) {
      setSelectedProduct(firstProduct.slug)
    }
    if (productFromUrl !== firstProduct.slug) {
      router.replace(`/admin/products/builder/${siteId}?product=${encodeURIComponent(firstProduct.slug)}`)
    }
  }, [productFromUrl, products, router, selectedProduct, siteId])
  
  // Custom hooks for data and state management
  const { site, blocks, blocksLoading, siteError } = useProductData(siteId)
  const [localBlocks, setLocalBlocks] = useState(blocks)
  
  // Update local blocks when server blocks change
  useEffect(() => {
    setLocalBlocks(blocks)
  }, [blocks])
  
  const builderState = useProductBuilder({ 
    blocks: localBlocks, 
    setBlocks: setLocalBlocks, 
    selectedProduct,
    productId: products.find(p => p.slug === selectedProduct)?.id,
    currentProduct: products.find(p => p.slug === selectedProduct)
  })
  
  // Current product data with staged deletions filtered out
  const currentProductData = products.find(p => p.slug === selectedProduct)
  const currentProduct = {
    slug: selectedProduct,
    name: currentProductData?.title || selectedProduct,
    blocks: localBlocks[selectedProduct] || []
  }
  const selectedBlock = builderState.selectedBlock

  useEffect(() => {
    if (!selectedBlock) return

    setDraftContent(selectedBlock.content)
  }, [selectedBlock])
  
  // Handle product updates
  const handleProductUpdated = (updatedProduct: Product) => {
    setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p))
    
    // If the slug changed, we need to update our local blocks and URL
    const currentProduct = products.find(p => p.id === updatedProduct.id)
    if (currentProduct && currentProduct.slug !== updatedProduct.slug) {
      // Move blocks from old slug to new slug
      setLocalBlocks(prev => {
        const blocksForProduct = prev[currentProduct.slug] || []
        const { [currentProduct.slug]: removed, ...rest } = prev
        return {
          ...rest,
          [updatedProduct.slug]: blocksForProduct
        }
      })
      
      // Update selected product and URL
      setSelectedProduct(updatedProduct.slug)
      router.replace(`/admin/products/builder/${siteId}?product=${updatedProduct.slug}`)
    }
  }

  // Handle product information updates
  const updateCurrentProduct = async (updates: { title?: string; featured_image?: string; is_published?: boolean }) => {
    if (!currentProductData?.id) return false
    
    try {
      const { data, error } = await updateProductAction(currentProductData.id, updates)
      if (error) {
        console.error('Failed to update product:', error)
        return false
      }
      if (data) {
        handleProductUpdated(data)
        return true
      }
    } catch (error) {
      console.error('Failed to update product:', error)
    }
    return false
  }

  const [isPublishing, setIsPublishing] = useState(false)

  const handleDraftChange = (field: string, value: any) => {
    setDraftContent((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleCloseBlockEditor = () => {
    if (!selectedBlock) return

    setDraftContent(selectedBlock.content)
    builderState.setSelectedBlock(null)
  }

  const handleSaveBlockEditor = async () => {
    if (!selectedBlock) return

    setIsSavingBlock(true)
    builderState.handleUpdateBlock(selectedBlock.id, {
      content: draftContent,
    })

    const savedBlock = await builderState.saveSelectedBlockContent(draftContent)
    setIsSavingBlock(false)

    if (savedBlock) {
      builderState.setSelectedBlock(null)
    }
  }

  const handlePublish = async () => {
    if (!currentProductData?.id) return
    try {
      setIsPublishing(true)
      await updateCurrentProduct({ is_published: true })
    } finally {
      setIsPublishing(false)
    }
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

  const viewPageHref = site && currentProductData
    ? `${getSiteUrl(site)}/products/${currentProductData.slug}`
    : null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <StickyHeader
        rightActions={(
          <StickybarTopRightActions
            saveMessage={builderState.saveMessage}
            isSaving={builderState.isSaving}
            onSave={builderState.handleSaveAllBlocks}
            onPublish={handlePublish}
            isPublishing={isPublishing}
            isPublished={Boolean(currentProductData?.is_published)}
            blockListOpen={blockListOpen}
            onToggleBlockList={() => setBlockListOpen(!blockListOpen)}
            settingsDisabled={!currentProductData}
            renderSettingsModal={(show, setShow) => (
              <ProductSettingsModal
                open={show}
                onOpenChange={setShow}
                product={currentProductData || null}
                site={currentSite}
                onSuccess={handleProductUpdated}
              />
            )}
          />
        )}
      />
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden border-r bg-background">
          <ScrollArea className="h-full">
            <ProductPreview
              blocks={currentProduct.blocks}
              product={currentProductData ? {
                id: currentProductData.id,
                title: currentProductData.title,
                slug: currentProductData.slug,
                meta_description: currentProductData.meta_description || undefined,
                site_id: currentProductData.site_id,
                featured_image: currentProductData.featured_image || null,
                is_published: currentProductData.is_published || false,
                updated_at: currentProductData.updated_at,
              } : undefined}
              site={{
                id: siteId,
                name: site?.name || "Product Site",
                subdomain: site?.subdomain || "preview",
                settings: site?.settings,
              }}
              className="min-h-full"
              blocksLoading={blocksLoading}
              allBlocks={currentProduct.blocks}
              selectedBlock={builderState.selectedBlock}
              onSelectBlock={builderState.setSelectedBlock}
              onUpdateLeadMagnetBody={(blockId, htmlContent) => {
                const block = currentProduct.blocks.find((item) => item.id === blockId)
                if (!block) return

                builderState.handleUpdateBlock(blockId, {
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
                footerClassName="sm:justify-end"
                footer={(
                  <>
                    <Button type="button" variant="outline" onClick={handleCloseBlockEditor} disabled={isSavingBlock}>
                      Cancel
                    </Button>
                    <Button type="button" onClick={handleSaveBlockEditor} disabled={isSavingBlock}>
                      {isSavingBlock ? "Saving..." : "Save"}
                    </Button>
                  </>
                )}
              >
                {selectedBlock.type === "product-hero" && (
                        <ProductHeroBlock
                          content={draftContent}
                          onContentChange={handleDraftChange}
                          siteId={siteId}
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
                          siteId={siteId}
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
                          siteId={siteId}
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
                          siteId={siteId}
                          blockId={selectedBlock.id}
                        />
                      )}

                      {selectedBlock.type === "product-email-modal" && (
                        <ProductEmailModalBlock
                          content={draftContent}
                          onContentChange={handleDraftChange}
                          siteId={siteId}
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
                          siteId={siteId}
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
            blocks={currentProduct.blocks}
            blockTypes={PRODUCT_BLOCK_TYPES}
            entityName="product"
            selectedBlock={builderState.selectedBlock}
            onSelectBlock={builderState.setSelectedBlock}
            onDeleteBlock={builderState.handleDeleteBlock}
            onReorderBlocks={builderState.handleReorderBlocks}
            viewPageHref={viewPageHref}
            onAddBlock={() => setBlockModalOpen(true)}
            deleting={null}
            blocksLoading={blocksLoading}
          />
        )}

        <BlockSelectionModal
          open={blockModalOpen}
          onOpenChange={setBlockModalOpen}
          onAddBlocks={builderState.handleAddBlocks}
          existingBlockTypes={currentProduct.blocks.map(b => b.type)}
          blockTypes={PRODUCT_BLOCK_TYPES}
          entityName="product"
        />
      </div>
    </div>
  )
}
