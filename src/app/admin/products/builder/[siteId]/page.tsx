"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useProductData } from "@/hooks/useProductData"
import { useProductBuilder } from "@/hooks/useProductBuilder"
import { useSiteContext } from "@/contexts/site-context"
import { ProductBuilderHeader } from "@/components/admin/product-builder/ProductBuilderHeader"
import { BlockPropertiesPanel } from "@/components/admin/product-builder/BlockPropertiesPanel"
import { BlockListPanel } from "@/components/admin/product-builder/BlockListPanel"
import { BlockTypesPanel } from "@/components/admin/product-builder/BlockTypesPanel"
import { getSiteProductsAction } from "@/lib/actions/products/product-actions"
import type { Product } from "@/lib/actions/products/product-actions"

export default function ProductBuilderEditor({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentSite } = useSiteContext()
  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [productsError, setProductsError] = useState<string | null>(null)
  // Get initial product from URL params or default to first product
  const initialProduct = searchParams.get('product') || ''
  const [selectedProduct, setSelectedProduct] = useState(initialProduct)
  
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
  const handleProductCreated = (newProduct: Product) => {
    setProducts(prev => [...prev, newProduct])
    // Initialize blocks array for the new product
    setLocalBlocks(prev => ({
      ...prev,
      [newProduct.slug]: []
    }))
    // Switch to the newly created product
    setSelectedProduct(newProduct.slug)
    router.replace(`/admin/products/builder/${siteId}?product=${newProduct.slug}`)
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

  // Only show loading state for critical errors (not during normal loading)
  if (!site && siteError) {
    return (
      <AdminLayout>
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
    <AdminLayout>
      <div className="flex flex-col -m-4 -mt-6 h-full">
        <ProductBuilderHeader
          products={products}
          selectedProduct={selectedProduct}
          onProductChange={handleProductChange}
          onProductCreated={handleProductCreated}
          onProductUpdated={handleProductUpdated}
          saveMessage={builderState.saveMessage}
          isSaving={builderState.isSaving}
          onSave={builderState.handleSaveAllBlocks}
          onPreviewProduct={() => builderState.setSelectedBlock(null)}
          productsLoading={productsLoading}
        />
        
        <div className="flex-1 flex">
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
          />
          
          <BlockListPanel
            currentProduct={currentProduct}
            selectedBlock={builderState.selectedBlock}
            onSelectBlock={builderState.setSelectedBlock}
            onDeleteBlock={builderState.handleDeleteBlock}
            onReorderBlocks={builderState.handleReorderBlocks}
            deleting={null}
            blocksLoading={blocksLoading}
          />
          
          <BlockTypesPanel
            onAddProductDefaultBlock={builderState.handleAddProductDefaultBlock}
            onAddProductHeroBlock={builderState.handleAddProductHeroBlock}
            onAddProductFeaturesBlock={builderState.handleAddProductFeaturesBlock}
            onAddProductHotspotBlock={builderState.handleAddProductHotspotBlock}
            onAddProductPricingBlock={builderState.handleAddProductPricingBlock}
            onAddProductFAQBlock={builderState.handleAddProductFAQBlock}
            onAddListingViewsBlock={builderState.handleAddListingViewsBlock}
          />
        </div>
      </div>
    </AdminLayout>
  )
}