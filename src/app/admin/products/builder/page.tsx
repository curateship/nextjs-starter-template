"use client"

import { useState, useEffect } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { useProductData } from "@/hooks/useProductData"
import { useProductBuilder } from "@/hooks/useProductBuilder"
import { ProductBuilderHeader } from "@/components/admin/layout/product-builder/ProductBuilderHeader"
import { ProductBlockPropertiesPanel } from "@/components/admin/layout/product-builder/ProductBlockPropertiesPanel"
import { ProductBlockListPanel } from "@/components/admin/layout/product-builder/ProductBlockListPanel"
import { ProductBlockTypesPanel } from "@/components/admin/layout/product-builder/ProductBlockTypesPanel"

export default function ProductBuilderPage() {
  // Data and state management
  const { products, blocks, productsLoading, productsError } = useProductData()
  const [localBlocks, setLocalBlocks] = useState(blocks)
  const [selectedProduct, setSelectedProduct] = useState("")
  
  // Update local blocks when server blocks change
  useEffect(() => {
    setLocalBlocks(blocks)
  }, [blocks])
  
  // Set initial product when products load
  useEffect(() => {
    if (products.length > 0 && !selectedProduct) {
      setSelectedProduct(products[0].slug)
    }
  }, [products, selectedProduct])
  
  const builderState = useProductBuilder({
    blocks: localBlocks,
    setBlocks: setLocalBlocks,
    selectedProduct
  })
  
  // Current product data with staged deletions filtered out
  const currentProductData = products.find(p => p.slug === selectedProduct)
  const currentProduct = {
    slug: selectedProduct,
    name: currentProductData?.title || selectedProduct,
    blocks: (localBlocks[selectedProduct] || []).filter(block => !builderState.deletedBlockIds.has(block.id))
  }
  
  // Handle product change
  const handleProductChange = (productSlug: string) => {
    if (productSlug !== selectedProduct) {
      setSelectedProduct(productSlug)
      // Ensure blocks array exists for this product
      setLocalBlocks(prev => ({
        ...prev,
        [productSlug]: prev[productSlug] || []
      }))
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
          saveMessage={builderState.saveMessage}
          isSaving={builderState.isSaving}
          onSave={builderState.handleSaveAllBlocks}
        />
        
        <div className="flex-1 flex">
          <ProductBlockPropertiesPanel
            selectedBlock={builderState.selectedBlock}
            updateBlockContent={builderState.updateBlockContent}
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
            onAddProductDetailsBlock={builderState.handleAddProductDetailsBlock}
            onAddProductGalleryBlock={builderState.handleAddProductGalleryBlock}
          />
        </div>
      </div>
    </AdminLayout>
  )
} 