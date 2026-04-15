"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { getProductAdminTopNavLinks } from "@/components/admin/layout/dashboard/admin-top-nav-links"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { Card } from "@/components/ui/card"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogPortal,
} from "@/components/ui/dialog"
import {
  AdminModalContent,
  AdminModalDescription,
  AdminModalHeader,
  AdminModalTitle,
} from "@/components/admin/shared/AdminModalLayout"

import { Checkbox } from "@/components/ui/checkbox"
import dynamic from "next/dynamic"

const CreateProductModal = dynamic(() =>
  import("@/components/admin/product-builder/layout/CreateProductModal").then(m => ({ default: m.CreateProductModal })),
  { ssr: false }
)
const ProductSettingsModal = dynamic(() =>
  import("@/components/admin/product-builder/layout/ProductSettingsModal").then(m => ({ default: m.ProductSettingsModal })),
  { ssr: false }
)
import { Eye, Copy, Trash2, Settings, Package, X, ArrowUp, ArrowDown, ChevronsUpDown, Plus, List, Globe, FileEdit } from "lucide-react"
import { cn } from "@/lib/utils/tailwind"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { getSiteProductsWithCategoriesAction, deleteProductAction, deleteProductsAction, duplicateProductAction, getProductIdsAction } from "@/lib/actions/products/product-actions"
import type { CategoryInfo } from "@/lib/actions/categories/category-relationship-actions"
import { Pagination, PaginationInfo } from "@/components/ui/pagination"
import { useSiteSwitcher } from "@/components/admin/providers/site-switcher-provider"
import { getSiteUrl } from "@/lib/utils/site-url-generator"
import type { Product } from "@/lib/actions/products/product-actions"

export default function ProductsPage() {
  const router = useRouter()
  const { currentSite, pageSize: contextPageSize } = useSiteSwitcher()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [deleteProductId, setDeleteProductId] = useState<string | null>(null)
  const [duplicatingProductId, setDuplicatingProductId] = useState<string | null>(null)
  const [settingsProductId, setSettingsProductId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all')
  const [filterPrivacy, setFilterPrivacy] = useState<'all' | 'public' | 'private'>('all')
  const [productCategories, setProductCategories] = useState<Record<string, CategoryInfo[]>>({})

  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set())
  // Tracks if user selected all items across all pages
  const [allSelected, setAllSelected] = useState(false)
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [sortColumn, setSortColumn] = useState<'title' | 'category' | 'status' | 'modified' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = contextPageSize


  // Load products
  useEffect(() => {
    async function loadProducts() {
      if (!currentSite?.id) {
        setLoading(true)
        setProducts([])
        return
      }

      try {
        setLoading(true)
        setError(null)

        const { data: productsData, categories, total: productsTotal, error: productsError } = await getSiteProductsWithCategoriesAction(currentSite.id, { page: currentPage, pageSize })
        if (productsError) {
          setError(productsError)
          setLoading(false)
          return
        }

        setTotal(productsTotal)
        if (productsData) {
          setProducts(productsData)
          if (categories) setProductCategories(categories)
        }
        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load products')
        setLoading(false)
      }
    }

    loadProducts()
  }, [currentSite?.id, currentPage])


  const handleDeleteProduct = async (productId: string) => {
    setPendingDeleteId(productId)
    setConfirmDialogOpen(true)
  }

  const confirmDeleteProduct = async () => {
    if (!pendingDeleteId) return

    const productIdToDelete = pendingDeleteId

    // Close dialog immediately and clear state
    setConfirmDialogOpen(false)
    setPendingDeleteId(null)

    try {
      setDeleteProductId(productIdToDelete)
      const { success, error: deleteError } = await deleteProductAction(productIdToDelete)

      if (deleteError) {
        setErrorMessage(deleteError)
        setErrorDialogOpen(true)
        return
      }

      if (success) {
        setProducts(prev => prev.filter(product => product.id !== productIdToDelete))
      }
    } catch (err) {
      setErrorMessage('Failed to delete product')
      setErrorDialogOpen(true)
    } finally {
      setDeleteProductId(null)
    }
  }

  const cancelDeleteProduct = () => {
    setConfirmDialogOpen(false)
    setPendingDeleteId(null)
  }

  const toggleSelectProduct = (productId: string) => {
    setSelectedProductIds(prev => {
      const next = new Set(prev)
      if (next.has(productId)) {
        next.delete(productId)
        setAllSelected(false)
      } else {
        next.add(productId)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedProductIds.size === filteredProducts.length) {
      setSelectedProductIds(new Set())
      setAllSelected(false)
    } else {
      setSelectedProductIds(new Set(filteredProducts.map(p => p.id)))
    }
  }

  // Select all items across all pages (lightweight ID-only fetch)
  const handleSelectAll = async () => {
    if (!currentSite?.id || total === 0) return
    const { ids } = await getProductIdsAction(currentSite.id)
    if (ids) {
      setSelectedProductIds(new Set(ids))
      setAllSelected(true)
    }
  }

  // Clear all selections
  const handleClearSelection = () => {
    setSelectedProductIds(new Set())
    setAllSelected(false)
  }

  const confirmMassDelete = async () => {
    setMassDeleteConfirmOpen(false)
    setMassDeleting(true)
    try {
      const ids = Array.from(selectedProductIds)
      const { success, error: deleteError } = await deleteProductsAction(ids)
      if (deleteError) {
        setErrorMessage(deleteError)
        setErrorDialogOpen(true)
        return
      }
      if (success) {
        setProducts(prev => prev.filter(p => !selectedProductIds.has(p.id)))
        setSelectedProductIds(new Set())
        setAllSelected(false)
      }
    } catch (err) {
      setErrorMessage('Failed to delete products')
      setErrorDialogOpen(true)
    } finally {
      setMassDeleting(false)
    }
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
    const isPrivate = isProductPrivate(product)
    
    if (product.is_published) {
      if (isPrivate) {
        return (
          <div className="flex gap-1">
            <Badge variant="default" className="bg-green-100 text-green-800">Published</Badge>
            <Badge variant="outline" className="border-amber-200 text-amber-700">Private</Badge>
          </div>
        )
      }
      return <Badge variant="default" className="bg-green-100 text-green-800">Published</Badge>
    }
    
    if (isPrivate) {
      return (
        <div className="flex gap-1">
          <Badge variant="secondary">Draft</Badge>
          <Badge variant="outline" className="border-amber-200 text-amber-700">Private</Badge>
        </div>
      )
    }
    
    return <Badge variant="secondary">Draft</Badge>
  }

  const isProductPrivate = (product: Product) => {
    return product.content_blocks?._settings?.is_private === true
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

  // Filter products based on status and privacy
  const filteredProducts = products.filter(product => {
    // Status filter
    let statusMatch = true
    if (filterStatus === 'published') statusMatch = product.is_published
    if (filterStatus === 'draft') statusMatch = !product.is_published
    
    // Privacy filter - only filter when "private" is selected
    let privacyMatch = true
    if (filterPrivacy === 'private') privacyMatch = isProductPrivate(product)
    
    return statusMatch && privacyMatch
  })

  const toggleSort = (column: 'title' | 'category' | 'status' | 'modified') => {
    if (sortColumn === column) {
      if (sortDirection === 'desc') {
        setSortColumn(null)
        setSortDirection('asc')
      } else {
        setSortDirection('desc')
      }
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const getSortIcon = (column: 'title' | 'category' | 'status' | 'modified') => {
    if (sortColumn !== column) return <ChevronsUpDown className="h-3 w-3 opacity-70" />
    if (sortDirection === 'asc') return <ArrowUp className="h-3 w-3" />
    return <ArrowDown className="h-3 w-3" />
  }

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (!sortColumn) return 0
    const dir = sortDirection === 'asc' ? 1 : -1
    if (sortColumn === 'title') return a.title.localeCompare(b.title) * dir
    if (sortColumn === 'category') {
      const catA = productCategories[a.id]?.[0]?.title
      const catB = productCategories[b.id]?.[0]?.title
      if (!catA && !catB) return 0
      if (!catA) return 1
      if (!catB) return -1
      return catA.localeCompare(catB) * dir
    }
    if (sortColumn === 'status') return (Number(a.is_published) - Number(b.is_published)) * dir
    if (sortColumn === 'modified') return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
    return 0
  })

  // Get counts for each status
  const statusCounts = {
    all: products.length,
    published: products.filter(p => p.is_published).length,
    draft: products.filter(p => !p.is_published).length
  }

  // Get counts for each privacy level
  const privacyCounts = {
    all: products.length,
    public: products.filter(p => !isProductPrivate(p)).length,
    private: products.filter(p => isProductPrivate(p)).length
  }


  return (
    <>
      <StickyHeader navLinks={getProductAdminTopNavLinks("products")} />
      <AdminLayout>
        <div className="w-full">
          {/* Breadcrumb navigation + action buttons */}
          <DashboardSubheader
            items={[{ label: "Products" }]}
            tabs={{
              value: filterStatus,
              onValueChange: (value) => { setFilterStatus(value as 'all' | 'published' | 'draft'); setSelectedProductIds(new Set()); setAllSelected(false); setCurrentPage(1) },
              items: [
                { value: "all", label: "All", icon: List, count: statusCounts.all },
                { value: "published", label: "Published", icon: Globe, count: statusCounts.published },
                { value: "draft", label: "Draft", icon: FileEdit, count: statusCounts.draft },
              ],
            }}
            preActions={
              selectedProductIds.size > 0 ? (
                <Button
                  variant="destructive"
                  onClick={() => setMassDeleteConfirmOpen(true)}
                  disabled={massDeleting}
                >
                  {massDeleting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span className="hidden sm:inline">Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Delete ({selectedProductIds.size})</span>
                    </>
                  )}
                </Button>
              ) : undefined
            }
            actions={
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4" /><span className="hidden sm:inline">Create Product</span>
              </Button>
            }
          />

          <Card className="shadow-sm">
            {/* Table Header */}
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-6 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-2 flex items-center space-x-4">
                  <Checkbox
                    checked={filteredProducts.length > 0 && selectedProductIds.size === filteredProducts.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all products"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSort('title')}
                    className={cn(
                      "flex items-center gap-1.5",
                      "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                      "cursor-pointer outline-none transition-colors"
                    )}
                  >
                    <span>Product</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('title')}</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => toggleSort('category')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Category</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('category')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort('status')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Status</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('status')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort('modified')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Modified</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('modified')}</span>
                </button>
                <div>Actions</div>
              </div>
            </div>

            {/* "Select all" banner — shown when all page items selected but more exist */}
            {filteredProducts.length > 0 && selectedProductIds.size === filteredProducts.length && total > filteredProducts.length && (
              <div className="px-6 py-2 bg-accent/50 border-b text-sm text-center">
                {allSelected ? (
                  <span>All {total} items selected. <button type="button" onClick={handleClearSelection} className="underline hover:text-foreground text-muted-foreground">Clear selection</button></span>
                ) : (
                  <span>{filteredProducts.length} items on this page are selected. <button type="button" onClick={handleSelectAll} className="underline font-medium">Select all {total}</button></span>
                )}
              </div>
            )}

            <div className="divide-y divide-muted/80">
              {loading ? (
                // Skeleton loading state for products
                <div className="space-y-0">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="p-6 border-b border-muted/80">
                      <div className="grid grid-cols-6 gap-4 items-center">
                        <div className="col-span-2">
                          <div className="flex items-center space-x-4">
                            <div className="w-4 h-4 bg-muted rounded animate-pulse"></div>
                            <div className="w-12 h-12 bg-muted rounded animate-pulse ml-2"></div>
                            <div>
                              <div className="h-4 bg-muted rounded animate-pulse mb-2 w-32"></div>
                              <div className="h-3 bg-muted/60 rounded animate-pulse w-24"></div>
                            </div>
                          </div>
                        </div>
                        <div>
                          <div className="h-5 bg-muted rounded-full animate-pulse w-16"></div>
                        </div>
                        <div>
                          <div className="h-6 bg-muted rounded-full animate-pulse w-20"></div>
                        </div>
                        <div>
                          <div className="h-3 bg-muted/60 rounded animate-pulse w-16"></div>
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <div className="h-8 w-8 bg-muted rounded animate-pulse"></div>
                            <div className="h-8 w-8 bg-muted rounded animate-pulse"></div>
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
                      : `No ${filterStatus === 'all' && filterPrivacy === 'all' ? '' : 
                          `${filterStatus === 'all' ? '' : filterStatus}${filterStatus !== 'all' && filterPrivacy === 'private' ? ', ' : ''}${filterPrivacy === 'private' ? 'private ' : ''}`
                        }products found`
                    }
                  </p>
                  <Button onClick={() => setShowCreateDialog(true)} variant="outline">
                    Create Your First Product
                  </Button>
                </div>
              ) : (
                sortedProducts.map((product) => (
                  <div key={product.id} className={`p-6 transition-colors ${selectedProductIds.has(product.id) ? 'bg-accent/50' : ''}`}>
                    <div className="grid grid-cols-6 gap-4 items-center">
                      <div className="col-span-2">
                        <div className="flex items-center space-x-4">
                          <Checkbox
                            checked={selectedProductIds.has(product.id)}
                            onCheckedChange={() => toggleSelectProduct(product.id)}
                            aria-label={`Select ${product.title}`}
                          />
                        <Link
                          href={`/admin/products/builder/${product.site_id}?product=${product.slug}`}
                          className="flex items-center space-x-4 hover:opacity-80 transition-opacity"
                        >
                          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center overflow-hidden ml-2">
                            {product.featured_image ? (
                              <img
                                src={product.featured_image}
                                alt={product.title}
                                className="w-full h-full object-contain"
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
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {productCategories[product.id]?.length ? (
                          productCategories[product.id].map((cat) => (
                            <Badge key={cat.id} variant="outline" className="text-xs">
                              {cat.title}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </div>
                      <div>
                        {getStatusBadge(product)}
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(product.updated_at)}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1">
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
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          asChild
                        >
                          <a href={currentSite ? `${getSiteUrl(currentSite)}/products/${product.slug}` : '#'} target="_blank" rel="noopener noreferrer" title="Preview">
                            <Eye className="h-4 w-4" />
                            <span className="sr-only">Preview</span>
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handleDuplicateProduct(product.id)}
                          disabled={duplicatingProductId === product.id}
                          title="Duplicate"
                        >
                          <Copy className="h-4 w-4" />
                          <span className="sr-only">Duplicate</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-600"
                          onClick={() => handleDeleteProduct(product.id)}
                          disabled={deleteProductId === product.id}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {!loading && total > 0 && (
              <div className="flex items-center justify-between px-6 py-4 border-t">
                <PaginationInfo currentPage={currentPage} pageSize={pageSize} total={total} />
                <Pagination currentPage={currentPage} totalPages={Math.ceil(total / pageSize)} onPageChange={setCurrentPage} showFirstLast={false} />
              </div>
            )}
          </Card>

        {/* Create Product Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <AdminModalContent>
            <AdminModalHeader>
              <AdminModalTitle>Create New Product</AdminModalTitle>
              <AdminModalDescription>
                Add a new product to your catalog. You can customize the content after creation.
              </AdminModalDescription>
            </AdminModalHeader>
            <CreateProductModal
              onSuccess={(product, continueToBuilder) => {
                setProducts(prev => [...prev, product])
                setShowCreateDialog(false)
                if (continueToBuilder && currentSite?.id) {
                  router.push(`/admin/products/builder/${currentSite.id}?product=${product.slug}`)
                }
              }}
              onCancel={() => setShowCreateDialog(false)}
            />
          </AdminModalContent>
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
        {confirmDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={cancelDeleteProduct}
            />
            <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
              <h2 className="text-lg font-semibold mb-2">Delete Product</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Are you sure you want to delete this product? This action cannot be undone.
              </p>
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
            </div>
          </div>
        )}

        {/* Mass Delete Confirmation Dialog */}
        {massDeleteConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={() => setMassDeleteConfirmOpen(false)}
            />
            <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
              <h2 className="text-lg font-semibold mb-2">Delete {selectedProductIds.size} Product{selectedProductIds.size !== 1 ? 's' : ''}</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Are you sure you want to delete {selectedProductIds.size} product{selectedProductIds.size !== 1 ? 's' : ''}? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => setMassDeleteConfirmOpen(false)}
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmMassDelete}
                  variant="destructive"
                >
                  Delete {selectedProductIds.size} Product{selectedProductIds.size !== 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Error Dialog */}
        {errorDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={() => setErrorDialogOpen(false)}
            />
            <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
              <h2 className="text-lg font-semibold mb-2">Error</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {errorMessage}
              </p>
              <div className="flex justify-end">
                <Button
                  onClick={() => setErrorDialogOpen(false)}
                  variant="default"
                >
                  OK
                </Button>
              </div>
            </div>
          </div>
        )}
        </div>
      </AdminLayout>
    </>
  )
}
