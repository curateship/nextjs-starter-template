"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AdminLayout, AdminPageHeader, AdminCard } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogPortal,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CreateGlobalProductForm } from "@/components/admin/layout/product-builder/create-global-product-form"
import { ProductSettingsModal } from "@/components/admin/layout/product-builder/product-settings-modal"
import { Eye, Edit, Copy, Trash2, Plus, Settings, MoreHorizontal, Package, X } from "lucide-react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { getSiteProductsAction, deleteProductAction, duplicateProductAction } from "@/lib/actions/product-actions"
import { useSiteContext } from "@/contexts/site-context"
import type { Product } from "@/lib/actions/product-actions"

export default function ProductsPage() {
  const router = useRouter()
  const { currentSite } = useSiteContext()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [deleteProductId, setDeleteProductId] = useState<string | null>(null)
  const [duplicatingProductId, setDuplicatingProductId] = useState<string | null>(null)
  const [settingsProductId, setSettingsProductId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const filterRef = useRef<HTMLDivElement>(null)

  // Load products
  useEffect(() => {
    async function loadProducts() {
      if (!currentSite?.id) {
        // Keep loading true when no site is selected (during site switching)
        setLoading(true)
        setProducts([])
        return
      }
      
      try {
        setLoading(true)
        setError(null)

        const { data: productsData, error: productsError } = await getSiteProductsAction(currentSite.id)
        if (productsError) {
          setError(productsError)
          setLoading(false)
          return
        }
        
        if (productsData) {
          setProducts(productsData)
        }
        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load products')
        setLoading(false)
      }
    }

    loadProducts()
  }, [currentSite?.id])

  // Close filter dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false)
      }
    }

    if (isFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isFilterOpen])

  const handleDeleteProduct = async (productId: string) => {
    setPendingDeleteId(productId)
    setConfirmDialogOpen(true)
  }

  const confirmDeleteProduct = async () => {
    if (!pendingDeleteId) return
    
    try {
      setDeleteProductId(pendingDeleteId)
      setConfirmDialogOpen(false)
      const { success, error: deleteError } = await deleteProductAction(pendingDeleteId)
      
      if (deleteError) {
        setErrorMessage(deleteError)
        setErrorDialogOpen(true)
        return
      }
      
      if (success) {
        setProducts(prev => prev.filter(product => product.id !== pendingDeleteId))
      }
    } catch (err) {
      setErrorMessage('Failed to delete product')
      setErrorDialogOpen(true)
    } finally {
      setDeleteProductId(null)
      setPendingDeleteId(null)
    }
  }

  const cancelDeleteProduct = () => {
    setConfirmDialogOpen(false)
    setPendingDeleteId(null)
  }

  const handleDuplicateProduct = async (productId: string) => {
    try {
      setDuplicatingProductId(productId)
      const originalProduct = products.find(p => p.id === productId)
      const duplicateTitle = `${originalProduct?.title || 'Product'} Copy`
      
      const { data, error: duplicateError } = await duplicateProductAction(productId, duplicateTitle)
      
      if (duplicateError) {
        setErrorMessage(`Failed to duplicate product: ${duplicateError}`)
        setErrorDialogOpen(true)
        return
      }
      
      if (data) {
        setProducts(prev => [...prev, data])
      }
    } catch (err) {
      setErrorMessage('Failed to duplicate product')
      setErrorDialogOpen(true)
    } finally {
      setDuplicatingProductId(null)
    }
  }

  const getStatusBadge = (product: Product) => {
    if (product.is_published) {
      return <Badge variant="default" className="bg-green-100 text-green-800">Published</Badge>
    }
    return <Badge variant="secondary">Draft</Badge>
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays === 1) return '1 day ago'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`
    return `${Math.ceil(diffDays / 30)} months ago`
  }

  const handleProductUpdated = (updatedProduct: Product) => {
    setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p))
  }

  // Filter products based on status
  const filteredProducts = products.filter(product => {
    if (filterStatus === 'published') return product.is_published
    if (filterStatus === 'draft') return !product.is_published
    return true // 'all'
  })

  // Get counts for each status
  const statusCounts = {
    all: products.length,
    published: products.filter(p => p.is_published).length,
    draft: products.filter(p => !p.is_published).length
  }

  
  return (
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <AdminPageHeader
          title="Products"
          subtitle="Manage your product catalog"
          primaryAction={{
            label: "Create Product",
            onClick: () => setShowCreateDialog(true)
          }}
        />
        
        <AdminCard>
            <div className="p-6 border-b">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold">Products List</h3>
                  <div className="text-sm text-muted-foreground mt-1">
                    {loading ? (
                      <div className="h-4 bg-gray-200 rounded animate-pulse w-24"></div>
                    ) : (
                      `${filteredProducts.length} product${filteredProducts.length !== 1 ? 's' : ''} ${filterStatus === 'all' ? 'total' : filterStatus}`
                    )}
                  </div>
                </div>
                <div className="relative" ref={filterRef}>
                  <Button 
                    variant="outline"
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                    className="flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    <span>Filter</span>
                    <svg className={`w-4 h-4 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </Button>
                  {isFilterOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-card border rounded-md shadow-lg z-10">
                      <div className="py-1">
                        <button 
                          onClick={() => { setFilterStatus('all'); setIsFilterOpen(false) }}
                          className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted ${
                            filterStatus === 'all' ? 'bg-muted font-medium' : ''
                          }`}
                        >
                          All Products ({statusCounts.all})
                        </button>
                        <button 
                          onClick={() => { setFilterStatus('published'); setIsFilterOpen(false) }}
                          className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted ${
                            filterStatus === 'published' ? 'bg-muted font-medium' : ''
                          }`}
                        >
                          Published ({statusCounts.published})
                        </button>
                        <button 
                          onClick={() => { setFilterStatus('draft'); setIsFilterOpen(false) }}
                          className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted ${
                            filterStatus === 'draft' ? 'bg-muted font-medium' : ''
                          }`}
                        >
                          Draft ({statusCounts.draft})
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Table Header */}
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-5 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-2">Product</div>
                <div>Status</div>
                <div>Modified</div>
                <div>Actions</div>
              </div>
            </div>
            
            <div className="divide-y">
              {loading ? (
                // Skeleton loading state for products
                <div className="space-y-0">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="p-6 border-b">
                      <div className="grid grid-cols-5 gap-4 items-center">
                        <div className="col-span-2">
                          <div className="flex items-center space-x-4">
                            <div className="w-12 h-12 bg-gray-200 rounded animate-pulse"></div>
                            <div>
                              <div className="h-4 bg-gray-200 rounded animate-pulse mb-2 w-32"></div>
                              <div className="h-3 bg-gray-100 rounded animate-pulse w-24"></div>
                            </div>
                          </div>
                        </div>
                        <div>
                          <div className="h-6 bg-gray-200 rounded-full animate-pulse w-20"></div>
                        </div>
                        <div>
                          <div className="h-3 bg-gray-100 rounded animate-pulse w-16"></div>
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
                            <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="p-8 text-center">
                  <p className="text-red-600 mb-4">{error}</p>
                  <Button onClick={() => window.location.reload()} variant="outline" size="sm">
                    Try Again
                  </Button>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="p-8 text-center">
                  <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    {products.length === 0 
                      ? 'No products found' 
                      : `No ${filterStatus === 'all' ? '' : filterStatus} products found`
                    }
                  </p>
                  <Button onClick={() => setShowCreateDialog(true)} variant="outline">
                    Create Your First Product
                  </Button>
                </div>
              ) : (
                filteredProducts.map((product) => (
                  <div key={product.id} className="p-6">
                    <div className="grid grid-cols-5 gap-4 items-center">
                      <div className="col-span-2">
                        <Link 
                          href={`/admin/products/builder/${product.site_id}?product=${product.slug}`}
                          className="flex items-center space-x-4 hover:opacity-80 transition-opacity"
                        >
                          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center overflow-hidden">
                            {product.featured_image ? (
                              <img 
                                src={product.featured_image} 
                                alt={product.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Package className="h-6 w-6 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <h4 className="font-medium hover:underline">{product.title}</h4>
                            <p className="text-sm text-muted-foreground">
                              /products/{product.slug}
                            </p>
                          </div>
                        </Link>
                      </div>
                      <div>
                        {getStatusBadge(product)}
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(product.updated_at)}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0"
                          onClick={() => setSettingsProductId(product.id)}
                          title="Product Settings"
                        >
                          <Settings className="h-4 w-4" />
                          <span className="sr-only">Product Settings</span>
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 w-8 p-0"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Open menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/products/builder/${product.site_id}?product=${product.slug}`} className="flex items-center">
                                <Edit className="mr-2 h-4 w-4" />
                                Edit Product
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link 
                                href={`/products/${product.slug}`}
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center"
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                Preview Product
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => handleDuplicateProduct(product.id)}
                              disabled={duplicatingProductId === product.id}
                              className="flex items-center"
                            >
                              {duplicatingProductId === product.id ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                                  Duplicating...
                                </>
                              ) : (
                                <>
                                  <Copy className="mr-2 h-4 w-4" />
                                  Duplicate Product
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDeleteProduct(product.id)}
                              disabled={deleteProductId === product.id}
                              className="flex items-center text-red-600 focus:text-red-600"
                            >
                              {deleteProductId === product.id ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600 mr-2"></div>
                                  Deleting...
                                </>
                              ) : (
                                <>
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete Product
                                </>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </AdminCard>
        
        {/* Create Product Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogPortal>
            <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4"
                 onClick={(e) => e.target === e.currentTarget && setShowCreateDialog(false)}>
              <div className="bg-background rounded-lg border shadow-lg w-[840px] max-w-[95vw] p-6 relative my-8"
                   style={{ width: '840px', maxWidth: '95vw' }}
                   onClick={(e) => e.stopPropagation()}>
                <DialogPrimitive.Close className="absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </DialogPrimitive.Close>
                <DialogHeader>
                  <DialogTitle>Create New Product</DialogTitle>
                  <DialogDescription>
                    Add a new product to your catalog. You can customize the content after creation.
                  </DialogDescription>
                </DialogHeader>
                <CreateGlobalProductForm 
                  onSuccess={(product) => {
                    setProducts(prev => [...prev, product])
                    setShowCreateDialog(false)
                  }}
                  onCancel={() => setShowCreateDialog(false)}
                />
              </div>
            </div>
          </DialogPortal>
        </Dialog>

        {/* Product Settings Modal */}
        <ProductSettingsModal 
          open={settingsProductId !== null}
          onOpenChange={(open) => setSettingsProductId(open ? settingsProductId : null)}
          product={products.find(p => p.id === settingsProductId) || null}
          site={null}
          onSuccess={handleProductUpdated}
        />

        {/* Confirmation Dialog */}
        <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Product</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this product? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button 
                onClick={cancelDeleteProduct}
                variant="outline"
              >
                Cancel
              </Button>
              <Button 
                onClick={confirmDeleteProduct}
                variant="destructive"
              >
                Delete
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Error Dialog */}
        <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Error</DialogTitle>
              <DialogDescription>
                {errorMessage}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end">
              <Button 
                onClick={() => setErrorDialogOpen(false)}
                variant="default"
              >
                OK
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  )
}