"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { Card } from "@/components/ui/card"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog } from "@/components/ui/dialog"
import {
  AdminModalContent,
  AdminModalDescription,
  AdminModalHeader,
  AdminModalTitle,
} from "@/components/admin/layout/builder/AdminModalLayout"
import {
  AdminBulkDeleteButton,
  AdminConfirmDialog,
  AdminErrorDialog,
  AdminListFooter,
  AdminListSkeleton,
  AdminSelectionBanner,
  AdminSortButton,
  formatRelativeDate,
  useAdminBulkSelection,
  useAdminSort,
} from "@/components/admin/layout/list"

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
import { Eye, Copy, Trash2, Settings, Package, Plus, List, Globe, FileEdit } from "lucide-react"
import { getSiteProductsWithCategoriesAction, deleteProductAction, deleteProductsAction, duplicateProductAction, getProductIdsAction } from "@/lib/actions/products/product-actions"
import type { CategoryInfo } from "@/lib/actions/categories/category-relationship-actions"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { getSiteUrl } from "@/lib/utils/site-url-generator"
import type { Product } from "@/lib/actions/products/product-actions"

const EMPTY_PRODUCT_CATEGORIES: CategoryInfo[] = []
type ProductSortColumn = 'title' | 'category' | 'status' | 'modified'

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
  const [filterPrivacy] = useState<'all' | 'public' | 'private'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [productCategories, setProductCategories] = useState<Record<string, CategoryInfo[]>>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const productSelection = useAdminBulkSelection()
  const productSort = useAdminSort<ProductSortColumn>()
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = contextPageSize

  // Load products
  useEffect(() => {
    async function loadProducts() {
      if (!currentSite?.id) {
        setLoading(true)
        setProducts([])
        setProductCategories({})
        setTotal(0)
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
  }, [currentSite?.id, currentPage, pageSize])

  const handleDeleteProduct = async (productId: string) => {
    setPendingDeleteId(productId)
  }

  const confirmDeleteProduct = async () => {
    if (!pendingDeleteId) return

    const productIdToDelete = pendingDeleteId

    // Close dialog immediately and clear state
    setPendingDeleteId(null)

    try {
      setDeleteProductId(productIdToDelete)
      const { success, error: deleteError } = await deleteProductAction(productIdToDelete)

      if (deleteError) {
        setErrorMessage(deleteError)
        return
      }

      if (success) {
        setProducts(prev => prev.filter(product => product.id !== productIdToDelete))
      }
    } catch (err) {
      setErrorMessage('Failed to delete product')
    } finally {
      setDeleteProductId(null)
    }
  }

  const cancelDeleteProduct = () => {
    setPendingDeleteId(null)
  }

  // Select all items across all pages (lightweight ID-only fetch)
  const handleSelectAll = async () => {
    if (!currentSite?.id || total === 0) return
    const { ids } = await getProductIdsAction(currentSite.id)
    if (ids) {
      productSelection.selectAll(ids)
    }
  }

  const confirmMassDelete = async () => {
    setMassDeleteConfirmOpen(false)
    setMassDeleting(true)
    try {
      const ids = Array.from(productSelection.selectedIds)
      const idsToDelete = new Set(ids)
      const { success, error: deleteError } = await deleteProductsAction(ids)
      if (deleteError) {
        setErrorMessage(deleteError)
        return
      }
      if (success) {
        setProducts(prev => prev.filter(p => !idsToDelete.has(p.id)))
        productSelection.clearSelection()
      }
    } catch (err) {
      setErrorMessage('Failed to delete products')
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
        return
      }
      
      if (data) {
        setProducts(prev => [...prev, data])
      }
    } catch (err) {
      setErrorMessage('Failed to duplicate product')
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

  const handleProductUpdated = (updatedProduct: Product) => {
    setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p))
  }

  // Filter products based on status and privacy
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredProducts = products.filter(product => {
    // Status filter
    let statusMatch = true
    if (filterStatus === 'published') statusMatch = product.is_published
    if (filterStatus === 'draft') statusMatch = !product.is_published
    
    // Privacy filter - only filter when "private" is selected
    let privacyMatch = true
    if (filterPrivacy === 'private') privacyMatch = isProductPrivate(product)

    const categoryText = productCategories[product.id]?.map(category => category.title).join(" ") ?? ""
    const searchText = `${product.title} ${product.slug} ${product.meta_description ?? ""} ${categoryText}`.toLowerCase()
    const searchMatch = !normalizedSearchQuery || searchText.includes(normalizedSearchQuery)
    
    return statusMatch && privacyMatch && searchMatch
  })

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (!productSort.sortColumn) return 0
    const dir = productSort.sortDirection === 'asc' ? 1 : -1
    if (productSort.sortColumn === 'title') return a.title.localeCompare(b.title) * dir
    if (productSort.sortColumn === 'category') {
      const catA = productCategories[a.id]?.[0]?.title
      const catB = productCategories[b.id]?.[0]?.title
      if (!catA && !catB) return 0
      if (!catA) return 1
      if (!catB) return -1
      return catA.localeCompare(catB) * dir
    }
    if (productSort.sortColumn === 'status') return (Number(a.is_published) - Number(b.is_published)) * dir
    if (productSort.sortColumn === 'modified') return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
    return 0
  })
  const filteredProductIds = filteredProducts.map((product) => product.id)

  // Get counts for each status
  const statusCounts = {
    all: products.length,
    published: products.filter(p => p.is_published).length,
    draft: products.filter(p => !p.is_published).length
  }

  // Get counts for each privacy level
  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          {/* Breadcrumb navigation + action buttons */}
          <DashboardSubheader
            items={[{ label: "Products" }]}
            search={{
              value: searchQuery,
              onValueChange: setSearchQuery,
              placeholder: "Search products",
            }}
            filterMenu={{
              value: filterStatus,
              onValueChange: (value) => { setFilterStatus(value as 'all' | 'published' | 'draft'); productSelection.clearSelection(); setCurrentPage(1) },
              items: [
                { value: "all", label: "All", icon: List, count: statusCounts.all },
                { value: "published", label: "Published", icon: Globe, count: statusCounts.published },
                { value: "draft", label: "Draft", icon: FileEdit, count: statusCounts.draft },
              ],
            }}
            preActions={
              <AdminBulkDeleteButton
                deleting={massDeleting}
                onClick={() => setMassDeleteConfirmOpen(true)}
                selectedCount={productSelection.selectedCount}
              />
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
                    checked={productSelection.isPageSelected(filteredProductIds)}
                    onCheckedChange={() => productSelection.togglePage(filteredProductIds)}
                    aria-label="Select all products"
                  />
                  <AdminSortButton active={productSort.sortColumn === 'title'} direction={productSort.sortDirection} onClick={() => productSort.toggleSort('title')}>
                    Product
                  </AdminSortButton>
                </div>
                <AdminSortButton active={productSort.sortColumn === 'category'} direction={productSort.sortDirection} onClick={() => productSort.toggleSort('category')}>
                  Category
                </AdminSortButton>
                <AdminSortButton active={productSort.sortColumn === 'status'} direction={productSort.sortDirection} onClick={() => productSort.toggleSort('status')}>
                  Status
                </AdminSortButton>
                <AdminSortButton active={productSort.sortColumn === 'modified'} direction={productSort.sortDirection} onClick={() => productSort.toggleSort('modified')}>
                  Modified
                </AdminSortButton>
                <div>Actions</div>
              </div>
            </div>

            {/* "Select all" banner — shown when all page items selected but more exist */}
            <AdminSelectionBanner
              allSelected={productSelection.allSelected}
              onClearSelection={productSelection.clearSelection}
              onSelectAll={handleSelectAll}
              selectedCount={productSelection.selectedCount}
              total={total}
              visibleCount={filteredProducts.length}
            />

            <div className="divide-y divide-muted/80">
              {loading ? (
                // Skeleton loading state for products
                <AdminListSkeleton />
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
                  <div key={product.id} className={`p-6 transition-colors ${productSelection.selectedIds.has(product.id) ? 'bg-accent/50' : ''}`}>
                    <div className="grid grid-cols-6 gap-4 items-center">
                      <div className="col-span-2">
                        <div className="flex items-center space-x-4">
                          <Checkbox
                            checked={productSelection.selectedIds.has(product.id)}
                            onCheckedChange={() => productSelection.toggleOne(product.id)}
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
                          {formatRelativeDate(product.updated_at)}
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
            {!loading && <AdminListFooter currentPage={currentPage} pageSize={pageSize} total={total} onPageChange={setCurrentPage} />}
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
          key={settingsProductId || "product-settings-modal"}
          open={settingsProductId !== null}
          onOpenChange={(open) => setSettingsProductId(open ? settingsProductId : null)}
          product={products.find(p => p.id === settingsProductId) || null}
          site={null}
          initialCategories={settingsProductId ? productCategories[settingsProductId] || EMPTY_PRODUCT_CATEGORIES : EMPTY_PRODUCT_CATEGORIES}
          onSuccess={handleProductUpdated}
        />

        <AdminConfirmDialog
          open={pendingDeleteId !== null}
          title="Delete Product"
          description="Are you sure you want to delete this product? This action cannot be undone."
          onCancel={cancelDeleteProduct}
          onConfirm={confirmDeleteProduct}
        />

        <AdminConfirmDialog
          open={massDeleteConfirmOpen}
          title={`Delete ${productSelection.selectedCount} Product${productSelection.selectedCount !== 1 ? 's' : ''}`}
          description={`Are you sure you want to delete ${productSelection.selectedCount} product${productSelection.selectedCount !== 1 ? 's' : ''}? This action cannot be undone.`}
          confirmLabel={`Delete ${productSelection.selectedCount} Product${productSelection.selectedCount !== 1 ? 's' : ''}`}
          onCancel={() => setMassDeleteConfirmOpen(false)}
          onConfirm={confirmMassDelete}
        />

        <AdminErrorDialog
          open={errorMessage !== null}
          message={errorMessage ?? ""}
          onOpenChange={(open) => {
            if (!open) setErrorMessage(null)
          }}
        />
        </div>
      </AdminLayout>
    </>
  )
}
