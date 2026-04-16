"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { getProductAdminTopNavLinks } from "@/components/admin/layout/dashboard/admin-top-nav-links"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useProductData } from "@/components/admin/product-builder/config/useProductData"
import { useProductBuilder } from "@/components/admin/product-builder/config/useProductBuilder"
import { useSiteSwitcher } from "@/components/admin/providers/site-switcher-provider"
import { getSiteUrl } from "@/lib/utils/site-url-generator"
import { BuilderToolbar, type BuilderItem } from "@/components/admin/shared/BuilderToolbar"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { ProductSettingsModal } from "@/components/admin/product-builder/layout/ProductSettingsModal"
import { CreateProductModal } from "@/components/admin/product-builder/layout/CreateProductModal"
import { ProductContentBlock } from "@/components/admin/product-builder/blocks/content/ProductContentBlock"
import { ProductHeroBlock } from "@/components/admin/product-builder/blocks/hero/ProductHeroBlock"
import { ProductDetailsBlock } from "@/components/admin/product-builder/blocks/details/ProductDetailsBlock"
import { ProductGalleryBlock } from "@/components/admin/product-builder/blocks/gallery/ProductGalleryBlock"
import { ProductFeaturesBlock } from "@/components/admin/product-builder/blocks/features/ProductFeaturesBlock"
import { ProductHotspotBlock } from "@/components/admin/product-builder/blocks/hotspot/ProductHotspotBlock"
import { ProductCheckoutBlock } from "@/components/admin/product-builder/blocks/checkout/ProductCheckoutBlock"
import { ProductLeadMagnetBlock } from "@/components/admin/product-builder/blocks/lead-magnet/ProductLeadMagnetBlock"
import { ProductFAQBlock } from "@/components/admin/product-builder/blocks/faq/ProductFAQBlock"
import { ProductListingViewBlock } from "@/components/admin/product-builder/blocks/listing-view/ProductListingViewBlock"
import { ProductRichTextEditorBlock } from "@/components/admin/product-builder/blocks/rich-text-editor/ProductRichTextEditorBlock"
import { ProductVideoBlock } from "@/components/admin/product-builder/blocks/video/ProductVideoBlock"
import {
  Dialog,
} from "@/components/ui/dialog"
import {
  AdminModalBody,
  AdminModalContent,
  AdminModalDescription,
  AdminModalFooter,
  AdminModalHeader,
  AdminModalTitle,
} from "@/components/admin/shared/AdminModalLayout"
import { ProductPreview } from "@/components/admin/product-builder/layout/ProductPreview"
import { BlockListPanel } from "@/components/admin/shared/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/shared/BlockSelectionModal"
import { PRODUCT_BLOCK_TYPES } from "@/components/admin/product-builder/config/product-block-types"
import { getSiteProductsAction, updateProductAction } from "@/lib/actions/products/product-actions"
import type { Product } from "@/lib/actions/products/product-actions"
import { ScrollArea } from "@/components/ui/scroll-area"

export default function ProductBuilderEditor({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentSite } = useSiteSwitcher()
  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [productsError, setProductsError] = useState<string | null>(null)
  // Get initial product from URL params or default to first product
  const initialProduct = searchParams.get('product') || ''
  const [selectedProduct, setSelectedProduct] = useState(initialProduct)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(true)
  const [draftContent, setDraftContent] = useState<Record<string, any>>({})
  const [draftProductData, setDraftProductData] = useState({
    title: "",
    description: "",
    featured_image: "",
  })
  const [isSavingBlock, setIsSavingBlock] = useState(false)
  
  // Redirect when site changes in sidebar
  useEffect(() => {
    if (currentSite && currentSite.id !== siteId) {
      router.push(`/admin/products/builder/${currentSite.id}`)
    }
  }, [currentSite, siteId, router])
  
  // Load products data
  useEffect(() => {
    async function loadProducts() {
      try {
        setProductsLoading(true)
        setProductsError(null)
        const { data, error } = await getSiteProductsAction(siteId)
        if (error) {
          setProductsError(error)
          return
        }
        setProducts(data || [])
        
        // If initial product doesn't exist, redirect to first product
        if (data && data.length > 0) {
          const productExists = data.some(p => p.slug === initialProduct)
          if (!productExists) {
            const firstProduct = data[0]
            setSelectedProduct(firstProduct.slug)
            router.replace(`/admin/products/builder/${siteId}?product=${firstProduct.slug}`)
          }
        }
      } catch (err) {
        setProductsError('Failed to load products')
      } finally {
        setProductsLoading(false)
      }
    }
    
    loadProducts()
  }, [siteId, initialProduct, router])
  
  // Custom hooks for data and state management
  const { site, blocks, siteLoading, blocksLoading, siteError, reloadBlocks } = useProductData(siteId)
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
    setDraftProductData({
      title: currentProductData?.title || "",
      description: currentProductData?.description || "",
      featured_image: currentProductData?.featured_image || "",
    })
  }, [selectedBlock, currentProductData?.description, currentProductData?.featured_image, currentProductData?.title])
  
  // Handle product change with URL update
  const handleProductChange = (productSlug: string) => {
    if (productSlug !== selectedProduct) {
      setSelectedProduct(productSlug)
      // Ensure blocks array exists for this product
      setLocalBlocks(prev => ({
        ...prev,
        [productSlug]: prev[productSlug] || []
      }))
      router.replace(`/admin/products/builder/${siteId}?product=${productSlug}`)
    }
  }

  // Handle product creation
  const handleProductCreated = async (newProduct: Product) => {
    setProducts(prev => [...prev, newProduct])
    setSelectedProduct(newProduct.slug)
    router.replace(`/admin/products/builder/${siteId}?product=${newProduct.slug}`)
    // Reload blocks from DB to pick up API-generated default blocks
    await reloadBlocks()
  }

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
  const updateCurrentProduct = async (updates: { title?: string; description?: string; featured_image?: string; is_published?: boolean }) => {
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
    setDraftProductData({
      title: currentProductData?.title || "",
      description: currentProductData?.description || "",
      featured_image: currentProductData?.featured_image || "",
    })
    builderState.setSelectedBlock(null)
  }

  const handleSaveBlockEditor = async () => {
    if (!selectedBlock) return

    setIsSavingBlock(true)

    let savedProduct = true

    if (selectedBlock.type === "product-content" || selectedBlock.type === "product-default") {
      const productUpdates: {
        title?: string
        description?: string
        featured_image?: string
      } = {}

      const currentTitle = currentProductData?.title || ""
      const currentDescription = currentProductData?.description || ""
      const currentFeaturedImage = currentProductData?.featured_image || ""

      if (draftProductData.title !== currentTitle) {
        productUpdates.title = draftProductData.title
      }

      if (draftProductData.description !== currentDescription) {
        productUpdates.description = draftProductData.description
      }

      if (draftProductData.featured_image !== currentFeaturedImage) {
        productUpdates.featured_image = draftProductData.featured_image
      }

      if (Object.keys(productUpdates).length > 0) {
        savedProduct = await updateCurrentProduct(productUpdates)
      }
    }

    const savedBlock = savedProduct ? await builderState.saveSelectedBlockContent(draftContent) : false
    setIsSavingBlock(false)

    if (savedProduct && savedBlock) {
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


  return (
    <div className="flex flex-col h-full overflow-hidden">
      <StickyHeader navLinks={getProductAdminTopNavLinks("products")} />
      <BuilderToolbar
        className="top-16 z-40"
        breadcrumbItems={[
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/products", label: "Products" },
          { label: currentProductData?.title || "", isPage: true }
        ]}
        items={products}
        selectedItemSlug={selectedProduct}
        onItemChange={handleProductChange}
        entityName="Product"
        getItemUrl={(item) => `${currentSite ? getSiteUrl(currentSite) : ''}/products/${item.slug}`}
        saveMessage={builderState.saveMessage}
        isSaving={builderState.isSaving}
        onSave={builderState.handleSaveAllBlocks}
        onPublish={handlePublish}
        isPublishing={isPublishing}
        blockListOpen={blockListOpen}
        onToggleBlockList={() => setBlockListOpen(!blockListOpen)}
        showSidebarToggle={false}
        renderCreateModal={(show, setShow) => (
        <Dialog open={show} onOpenChange={setShow}>
            <AdminModalContent>
              <AdminModalHeader>
                <AdminModalTitle>Create New Product</AdminModalTitle>
                <AdminModalDescription>Add a new product to your catalog. You can customize the content after creation.</AdminModalDescription>
              </AdminModalHeader>
              <CreateProductModal
                onSuccess={(product) => { handleProductCreated(product); setShow(false); }}
                onCancel={() => setShow(false)}
              />
            </AdminModalContent>
          </Dialog>
        )}
        renderSettingsModal={(show, setShow, currentItem) => (
          <ProductSettingsModal
            open={show}
            onOpenChange={setShow}
            product={(currentItem ? currentProductData : null) || null}
            site={currentSite}
            onSuccess={handleProductUpdated}
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
                meta_description: currentProductData.description || undefined,
                site_id: currentProductData.site_id,
                featured_image: currentProductData.featured_image || null,
                description: currentProductData.description || null,
                is_published: currentProductData.is_published || false,
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
              onSelectBlock={builderState.setSelectedBlock}
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
            <AdminModalContent size="wide" className="h-[calc(100vh-4rem)] max-h-[820px]">
              <AdminModalHeader>
                <AdminModalTitle>Edit {selectedBlock.title}</AdminModalTitle>
              </AdminModalHeader>

              <AdminModalBody className="flex-1 min-h-0 overflow-hidden p-0">
                <ScrollArea className="h-full">
                  <div className="px-6 pt-6 pb-0 pr-8 [&_h3]:pt-4">
                    {(selectedBlock.type === "product-content" || selectedBlock.type === "product-default") && (
                      <ProductContentBlock
                        content={draftContent}
                        onContentChange={handleDraftChange}
                        siteId={siteId}
                        blockId={selectedBlock.id}
                        productData={{
                          title: draftProductData.title,
                          name: currentProductData?.title,
                          featured_image: draftProductData.featured_image || null,
                          description: draftProductData.description,
                        }}
                        onProductTitleChange={(title) => {
                          setDraftProductData((current) => ({ ...current, title }))
                        }}
                        onProductDescriptionChange={(description) => {
                          setDraftProductData((current) => ({ ...current, description }))
                        }}
                        onProductFeaturedImageChange={(featured_image) => {
                          setDraftProductData((current) => ({ ...current, featured_image }))
                        }}
                      />
                    )}

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
                        showThumbnails={draftContent.showThumbnails || false}
                        onImagesChange={(images) => handleDraftChange("images", images)}
                        onShowThumbnailsChange={(show) => handleDraftChange("showThumbnails", show)}
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

                    {selectedBlock.type === "listing-views" && (
                      <ProductListingViewBlock
                        header={draftContent.header ?? "Latest Products"}
                        subheader={draftContent.subheader ?? "Check out our products"}
                        headerAlign={draftContent.headerAlign ?? "left"}
                        contentType={draftContent.contentType ?? "products"}
                        displayMode={draftContent.displayMode ?? "grid"}
                        itemsToShow={draftContent.itemsToShow ?? 6}
                        columns={draftContent.columns ?? 3}
                        sortBy={draftContent.sortBy ?? "date"}
                        sortOrder={draftContent.sortOrder ?? "desc"}
                        showImage={draftContent.showImage ?? true}
                        showTitle={draftContent.showTitle ?? true}
                        showDescription={draftContent.showDescription ?? true}
                        isPaginated={draftContent.isPaginated ?? false}
                        itemsPerPage={draftContent.itemsPerPage ?? 12}
                        viewAllText={draftContent.viewAllText ?? ""}
                        viewAllLink={draftContent.viewAllLink ?? ""}
                        onHeaderChange={(value) => handleDraftChange("header", value)}
                        onSubheaderChange={(value) => handleDraftChange("subheader", value)}
                        onHeaderAlignChange={(value) => handleDraftChange("headerAlign", value)}
                        onContentTypeChange={(value) => handleDraftChange("contentType", value)}
                        onDisplayModeChange={(value) => handleDraftChange("displayMode", value)}
                        onItemsToShowChange={(value) => handleDraftChange("itemsToShow", value)}
                        onColumnsChange={(value) => handleDraftChange("columns", value)}
                        onSortByChange={(value) => handleDraftChange("sortBy", value)}
                        onSortOrderChange={(value) => handleDraftChange("sortOrder", value)}
                        onShowImageChange={(value) => handleDraftChange("showImage", value)}
                        onShowTitleChange={(value) => handleDraftChange("showTitle", value)}
                        onShowDescriptionChange={(value) => handleDraftChange("showDescription", value)}
                        onIsPaginatedChange={(value) => handleDraftChange("isPaginated", value)}
                        onItemsPerPageChange={(value) => handleDraftChange("itemsPerPage", value)}
                        onViewAllTextChange={(value) => handleDraftChange("viewAllText", value)}
                        onViewAllLinkChange={(value) => handleDraftChange("viewAllLink", value)}
                        visibility={draftContent.visibility}
                        onVisibilityChange={(v) => handleDraftChange("visibility", v)}
                      />
                    )}

                    {selectedBlock.type === "product-rich-text" && (
                      <ProductRichTextEditorBlock
                        content={{
                          header: draftContent.header || "",
                          subheader: draftContent.subheader || "",
                          headerAlign: draftContent.headerAlign || "left",
                          richtextContent: draftContent.richtextContent || "",
                          hideHeader: draftContent.hideHeader,
                          hideEditorHeader: draftContent.hideEditorHeader,
                        }}
                        onContentChange={(contentObj) => {
                          handleDraftChange("header", contentObj.header)
                          handleDraftChange("subheader", contentObj.subheader)
                          handleDraftChange("headerAlign", contentObj.headerAlign)
                          handleDraftChange("richtextContent", contentObj.richtextContent)
                        }}
                        visibility={draftContent.visibility}
                        onVisibilityChange={(v) => handleDraftChange("visibility", v)}
                      />
                    )}

                    {selectedBlock.type === "product-video" && (
                      <ProductVideoBlock
                        header={draftContent.header ?? ""}
                        subheader={draftContent.subheader ?? ""}
                        headerAlign={draftContent.headerAlign ?? "left"}
                        videoUrl={draftContent.videoUrl || ""}
                        coverImage={draftContent.coverImage || ""}
                        autoplay={draftContent.autoplay || false}
                        loop={draftContent.loop || false}
                        muted={draftContent.muted || false}
                        onHeaderChange={(value) => handleDraftChange("header", value)}
                        onSubheaderChange={(value) => handleDraftChange("subheader", value)}
                        onHeaderAlignChange={(value) => handleDraftChange("headerAlign", value)}
                        onVideoUrlChange={(value) => handleDraftChange("videoUrl", value)}
                        onCoverImageChange={(value) => handleDraftChange("coverImage", value)}
                        onAutoplayChange={(value) => handleDraftChange("autoplay", value)}
                        onLoopChange={(value) => handleDraftChange("loop", value)}
                        onMutedChange={(value) => handleDraftChange("muted", value)}
                        visibility={draftContent.visibility}
                        onVisibilityChange={(v) => handleDraftChange("visibility", v)}
                        siteId={siteId}
                        blockId={selectedBlock.id}
                      />
                    )}
                  </div>
                </ScrollArea>
              </AdminModalBody>

              <AdminModalFooter className="sm:justify-end">
                <Button type="button" variant="outline" onClick={handleCloseBlockEditor} disabled={isSavingBlock}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleSaveBlockEditor} disabled={isSavingBlock}>
                  {isSavingBlock ? "Saving..." : "Save"}
                </Button>
              </AdminModalFooter>
            </AdminModalContent>
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
            onPreview={() => builderState.setSelectedBlock(null)}
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
