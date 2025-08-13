import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ArrowLeft, Save, Eye, Plus, Settings } from "lucide-react"
import Link from "next/link"
import type { Product } from "@/lib/actions/product-actions"

interface ProductBuilderHeaderProps {
  products: Product[]
  selectedProduct: string
  onProductChange: (product: string) => void
  onProductCreated?: (product: Product) => void
  onProductUpdated?: (product: Product) => void
  saveMessage: string
  isSaving: boolean
  onSave: () => void
}

export function ProductBuilderHeader({
  products,
  selectedProduct,
  onProductChange,
  onProductCreated,
  onProductUpdated,
  saveMessage,
  isSaving,
  onSave
}: ProductBuilderHeaderProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const currentProduct = products.find(p => p.slug === selectedProduct)
  
  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-[57px] z-40">
      <div className="flex h-14 items-center px-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/products">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Products
            </Link>
          </Button>
          <div className="h-4 w-px bg-border"></div>
          <h1 className="text-lg font-semibold">Product Builder</h1>
          <div className="h-4 w-px bg-border"></div>
          <Select value={selectedProduct} onValueChange={onProductChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue>
                {currentProduct ? currentProduct.title : selectedProduct}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {products.map((product) => (
                <SelectItem key={product.id} value={product.slug}>
                  {product.title}
                  {!product.is_published && " (Draft)"}
                </SelectItem>
              ))}
              <div className="border-t pt-1 mt-2">
                <div 
                  className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground text-muted-foreground hover:text-foreground"
                  onClick={() => setShowCreateDialog(true)}
                >
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    <Plus className="h-4 w-4" />
                  </span>
                  Create Product
                </div>
              </div>
            </SelectContent>
          </Select>
          <Button 
            variant="outline"
            size="sm" 
            disabled={!currentProduct}
          >
            <Eye className="w-4 h-4 mr-2" />
            View Product
          </Button>
        </div>
        <div className="ml-auto flex items-center space-x-2">
          {saveMessage && (
            <span className={`text-sm ${saveMessage.includes('Error') || saveMessage.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
              {saveMessage}
            </span>
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
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Create New Product</DialogTitle>
            <DialogDescription>
              Add a new product to your catalog. You can customize the content after creation.
            </DialogDescription>
          </DialogHeader>
          <div className="p-4">
            <p className="text-sm text-muted-foreground">Product creation form will be implemented here.</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Product Settings Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Product Settings</DialogTitle>
            <DialogDescription>
              Configure settings for "{currentProduct?.title || selectedProduct}"
            </DialogDescription>
          </DialogHeader>
          <div className="p-4">
            <p className="text-sm text-muted-foreground">Product settings form will be implemented here.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}