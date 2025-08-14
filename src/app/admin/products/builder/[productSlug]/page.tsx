"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { useProductData } from "@/hooks/useProductData"
import { useProductBuilder } from "@/hooks/useProductBuilder"
import { ProductBuilderHeader } from "@/components/admin/layout/product-builder/ProductBuilderHeader"
import { ProductBlockPropertiesPanel } from "@/components/admin/layout/product-builder/ProductBlockPropertiesPanel"
import { ProductBlockListPanel } from "@/components/admin/layout/product-builder/ProductBlockListPanel"
import { ProductBlockTypesPanel } from "@/components/admin/layout/product-builder/ProductBlockTypesPanel"
import { transformAdminBlocksToFrontend } from "@/lib/utils/admin-to-frontend-blocks"
import { getSiteBlocksAction } from "@/lib/actions/page-blocks-actions"

export default function ProductBuilderPage({ params }: { params: Promise<{ productSlug: string }> }) {
  const { productSlug } = use(params)
  const router = useRouter()
  // Data and state management
  const { products, blocks, productsLoading, productsError, reloadProducts } = useProductData()
  const [localBlocks, setLocalBlocks] = useState(blocks)
  const [selectedProduct, setSelectedProduct] = useState(productSlug)
  const [siteBlocks, setSiteBlocks] = useState<{ navigation?: any; footer?: any }>({})
  const [siteBlocksLoading, setSiteBlocksLoading] = useState(false)
  
  // Update local blocks when server blocks change
  useEffect(() => {
    setLocalBlocks(blocks)
  }, [blocks])
  
  // Set initial product from URL parameter
  useEffect(() => {
    if (productSlug && productSlug !== selectedProduct) {
      setSelectedProduct(productSlug)
    }
  }, [productSlug, selectedProduct])
  
  // Validate that the product exists when products load
  useEffect(() => {
    if (products.length > 0 && productSlug) {
      const productExists = products.some(p => p.slug === productSlug)
      if (!productExists) {
        // Product doesn't exist, redirect to products list
        router.push('/admin/products')
      }
    }
  }, [products, productSlug, router])

  // Load site blocks for navigation and footer
  useEffect(() => {
    async function loadSiteBlocks() {
      const currentProduct = products.find(p => p.slug === selectedProduct)
      if (!currentProduct?.site_id) return

      setSiteBlocksLoading(true)
      try {
        const result = await getSiteBlocksAction(currentProduct.site_id)
        if (result.success && result.blocks) {
          // Find navigation and footer blocks from all pages
          const allBlocks = Object.values(result.blocks).flat()
          const navigationBlock = allBlocks.find(block => block.type === 'navigation')
          const footerBlock = allBlocks.find(block => block.type === 'footer')
          
          // Transform to frontend format
          const transformedBlocks = transformAdminBlocksToFrontend(
            [navigationBlock, footerBlock].filter(Boolean)
          )
          
          setSiteBlocks({
            navigation: transformedBlocks.navigation,
            footer: transformedBlocks.footer
          })
        }
      } catch (error) {
        console.error('Failed to load site blocks:', error)
      } finally {
        setSiteBlocksLoading(false)
      }
    }

    if (products.length > 0) {
      loadSiteBlocks()
    }
  }, [products, selectedProduct])
  
  // Current product data with staged deletions filtered out
  const currentProductData = products.find(p => p.slug === selectedProduct)
  
  const builderState = useProductBuilder({
    blocks: localBlocks,
    setBlocks: setLocalBlocks,
    selectedProduct,
    productId: currentProductData?.id
  })
  const currentProduct = {
    slug: selectedProduct,
    name: currentProductData?.title || selectedProduct,
    blocks: (localBlocks[selectedProduct] || []).filter(block => !builderState.deletedBlockIds.has(block.id))
  }
  
  // Handle product change
  const handleProductChange = (newProductSlug: string) => {
    if (newProductSlug !== selectedProduct) {
      // Navigate to the new product's builder page
      router.push(`/admin/products/builder/${newProductSlug}`)
    }
  }

  // Show loading state
  if (productsLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Loading product builder...</p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  // Show error state
  if (productsError) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-red-600 mb-2">{productsError}</p>
            <p className="text-sm text-muted-foreground mb-4">
              Please try refreshing the page or check your connection.
            </p>
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
          onProductUpdated={async (updatedProduct) => {
            // Reload products data to get fresh product information
            await reloadProducts()
            
            // If the slug changed, redirect to the new URL
            if (updatedProduct.slug !== productSlug) {
              router.push(`/admin/products/builder/${updatedProduct.slug}`)
            }
          }}
          saveMessage={builderState.saveMessage}
          isSaving={builderState.isSaving}
          onSave={builderState.handleSaveAllBlocks}
          onPreviewProduct={() => builderState.setSelectedBlock(null)}
        />
        
        <div className="flex-1 flex">
          <ProductBlockPropertiesPanel
            selectedBlock={builderState.selectedBlock}
            updateBlockContent={builderState.updateBlockContent}
            siteId={currentProductData?.site_id || ''}
            currentProduct={{
              ...currentProduct,
              id: currentProductData?.id,
              title: currentProductData?.title,
              meta_description: currentProductData?.meta_description,
              site_id: currentProductData?.site_id
            }}
            site={{
              id: currentProductData?.site_id || '',
              name: 'Product Site',
              subdomain: 'preview'
            }}
            siteBlocks={siteBlocks}
          />
          
          <ProductBlockListPanel
            currentProduct={currentProduct}
            selectedBlock={builderState.selectedBlock}
            onSelectBlock={builderState.setSelectedBlock}
            onDeleteBlock={builderState.handleDeleteBlock}
            onReorderBlocks={builderState.handleReorderBlocks}
            deleting={builderState.deleting}
          />
          
          <ProductBlockTypesPanel
            onAddProductHeroBlock={builderState.handleAddProductHeroBlock}
            onAddProductFeaturesBlock={builderState.handleAddProductFeaturesBlock}
            onAddProductHotspotBlock={builderState.handleAddProductHotspotBlock}
          />
        </div>
      </div>
    </AdminLayout>
  )
} 