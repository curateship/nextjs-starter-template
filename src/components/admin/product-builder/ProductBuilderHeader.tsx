import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ArrowLeft, Save, Eye, Plus, Settings, CheckCircle, Sparkles, ChevronDown, ExternalLink } from "lucide-react"
import Link from "next/link"
import { useSiteContext } from "@/contexts/site-context"
import { ProductSettingsModal } from "@/components/admin/product-builder/ProductSettingsModal"
import { CreateProductModal } from "@/components/admin/product-builder/CreateProductModal"
import { AIGenerationDialog } from "@/components/admin/ai-generation/AIGenerationDialog"
import type { Product } from "@/lib/actions/products/product-actions"

interface ProductBuilderHeaderProps {
  products: Product[]
  selectedProduct: string
  onProductChange: (product: string) => void
  onProductCreated?: (product: Product) => void
  onProductUpdated?: (product: Product) => void
  saveMessage: string
  isSaving: boolean
  onSave: () => void
  productsLoading?: boolean
  onAIComplete?: () => void
}

export function ProductBuilderHeader({
  products,
  selectedProduct,
  onProductChange,
  onProductCreated,
  onProductUpdated,
  saveMessage,
  isSaving,
  onSave,
  productsLoading = false,
  onAIComplete
}: ProductBuilderHeaderProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showAIDialog, setShowAIDialog] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const { currentSite } = useSiteContext()
  const currentProduct = products.find(p => p.slug === selectedProduct)

  const handleCreateProduct = () => {
    setDropdownOpen(false)
    setTimeout(() => {
      setShowCreateDialog(true)
    }, 100)
  }
  
  
  // Generate product URL for frontend viewing
  const getProductUrl = (productSlug?: string) => {
    const slug = productSlug || currentProduct?.slug
    if (!slug || !currentSite?.subdomain) {
      return '#'
    }

    // Use dedicated product routing
    const url = `http://localhost:3000/products/${slug}`
    return url
  }
  
  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-[57px] z-40">
      <div className="flex h-14 items-center px-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/products">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-9 px-3 font-semibold text-base hover:bg-transparent">
                {currentProduct ? currentProduct.title : "Select Product"}
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[240px]">
              {products.map((product) => (
                <DropdownMenuItem
                  key={product.id}
                  onSelect={(e) => e.preventDefault()}
                  className={product.slug === selectedProduct ? "bg-accent" : ""}
                >
                  <div className="flex items-center justify-between flex-1">
                    <span
                      onClick={() => {
                        onProductChange(product.slug)
                        setDropdownOpen(false)
                      }}
                      className="flex-1 cursor-pointer"
                    >
                      {product.title}
                      {!product.is_published && " (Draft)"}
                    </span>
                    <Link
                      href={getProductUrl(product.slug)}
                      target="_blank"
                      onClick={(e) => e.stopPropagation()}
                      className="ml-2"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleCreateProduct}>
                <Plus className="mr-2 h-4 w-4" />
                Create Product
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="ml-auto flex items-center space-x-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowAIDialog(true)}
            disabled={!currentProduct?.id}
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            AI Generate
          </Button>
          {saveMessage && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md ${
              saveMessage.includes('Error') || saveMessage.includes('Failed') 
                ? 'bg-red-50 border border-red-200' 
                : 'bg-green-50 border border-green-200'
            }`}>
              <CheckCircle className={`w-4 h-4 ${
                saveMessage.includes('Error') || saveMessage.includes('Failed') 
                  ? 'text-red-600' 
                  : 'text-green-600'
              }`} />
              <span className={`text-sm font-medium ${
                saveMessage.includes('Error') || saveMessage.includes('Failed') 
                  ? 'text-red-800' 
                  : 'text-green-700'
              }`}>
                {saveMessage}
              </span>
            </div>
          )}
          <Button 
            variant="outline"
            size="sm" 
            onClick={() => setShowEditDialog(true)}
            disabled={!currentProduct}
          >
            <Settings className="w-4 h-4 mr-2" />
            Edit Settings
          </Button>
          <Button 
            size="sm" 
            onClick={onSave}
            disabled={isSaving}
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Create Product Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="w-[840px] max-w-[95vw]" style={{ width: '840px', maxWidth: '95vw' }}>
          <DialogHeader>
            <DialogTitle>Create New Product</DialogTitle>
            <DialogDescription>
              Add a new product to your catalog. You can customize the content after creation.
            </DialogDescription>
          </DialogHeader>
          <CreateProductModal
            onSuccess={(product) => {
              if (onProductCreated) {
                onProductCreated(product)
              }
              setShowCreateDialog(false)
              onProductChange(product.slug)
            }}
            onCancel={() => setShowCreateDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Product Settings Modal */}
      <ProductSettingsModal
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        product={currentProduct || null}
        site={currentSite}
        onSuccess={(updatedProduct) => {
          // Update the product in the list
          if (onProductUpdated) {
            onProductUpdated(updatedProduct)
          }
        }}
      />

      {/* AI Generation Dialog - Only render when product is selected */}
      {currentProduct?.id && (
        <AIGenerationDialog
          open={showAIDialog}
          onOpenChange={setShowAIDialog}
          contentType="product"
          siteId={currentSite?.id}
          productId={currentProduct.id}
          onAIComplete={() => {
            // Called after successful DB save
            if (onAIComplete) {
              onAIComplete()
            }
          }}
        />
      )}
    </div>
  )
}