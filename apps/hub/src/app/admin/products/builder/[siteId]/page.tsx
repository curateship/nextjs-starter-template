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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { BlockPropertiesPanel } from "@/components/admin/product-builder/layout/BlockPropertiesPanel"
import { BlockListPanel } from "@/components/admin/shared/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/shared/BlockSelectionModal"
import { PRODUCT_BLOCK_TYPES } from "@/components/admin/product-builder/config/product-block-types"
import { getSiteProductsAction, updateProductAction } from "@/lib/actions/products/product-actions"
import type { Product } from "@/lib/actions/products/product-actions"

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
  const { site, blocks, siteBlocks, siteLoading, blocksLoading, siteError, reloadBlocks } = useProductData(siteId)
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
    if (!currentProductData?.id) return
    
    try {
      const { data, error } = await updateProductAction(currentProductData.id, updates)
      if (error) {
        console.error('Failed to update product:', error)
        return
      }
      if (data) {
        handleProductUpdated(data)
      }
    } catch (error) {
      console.error('Failed to update product:', error)
    }
  }

  const [isPublishing, setIsPublishing] = useState(false)
  const handlePublish = async () => {
    if (!currentProductData?.id) return
    try {
      setIsPublishing(true)
      await updateCurrentProduct({ is_published: true })
    } finally {
      setIsPublishing(false)
    }
  }

  const handleTitleChange = (title: string) => {
    updateCurrentProduct({ title })
  }

  const handleDescriptionChange = (description: string) => {
    updateCurrentProduct({ description })
  }

  const handleFeaturedImageChange = (featured_image: string) => {
    updateCurrentProduct({ featured_image })
  }

  const handleStatusChange = (status: string) => {
    updateCurrentProduct({ is_published: status === 'published' })
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
            <DialogContent size="admin">
              <DialogHeader>
                <DialogTitle>Create New Product</DialogTitle>
                <DialogDescription>Add a new product to your catalog. You can customize the content after creation.</DialogDescription>
              </DialogHeader>
              <CreateProductModal
                onSuccess={(product) => { handleProductCreated(product); setShow(false); }}
                onCancel={() => setShow(false)}
              />
            </DialogContent>
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
        <BlockPropertiesPanel
          selectedBlock={builderState.selectedBlock}
          updateBlockContent={builderState.updateBlockContent}
          siteId={siteId}
          currentProduct={{
            ...currentProduct,
            id: currentProductData?.id,
            title: currentProductData?.title,
            meta_description: currentProductData?.description || undefined,
            site_id: currentProductData?.site_id,
            featured_image: currentProductData?.featured_image,
            description: currentProductData?.description
          }}
          site={{
            id: siteId,
            name: site?.name || 'Product Site',
            subdomain: site?.subdomain || 'preview',
            settings: site?.settings
          }}
          blocksLoading={blocksLoading}
          onTitleChange={handleTitleChange}
          onDescriptionChange={handleDescriptionChange}
          onFeaturedImageChange={handleFeaturedImageChange}
          onStatusChange={handleStatusChange}
          onSelectBlock={builderState.setSelectedBlock}
          onBack={() => builderState.setSelectedBlock(null)}
        />

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
