"use client"

import dynamic from "next/dynamic"
import { Package } from "lucide-react"

import {
  AdminModalContent,
  AdminModalDescription,
  AdminModalHeader,
  AdminModalTitle,
} from "@/components/admin/layout/builder/AdminModalLayout"
import { ContentListPage } from "@/components/admin/layout/content/ContentListPage"
import type { CategoryInfo } from "@/lib/actions/categories/category-relationship-actions"
import {
  deleteProductAction,
  deleteProductsAction,
  duplicateProductAction,
  getProductIdsAction,
  getSiteProductsWithCategoriesAction,
  type Product,
} from "@/lib/actions/products/product-actions"

const CreateProductModal = dynamic(
  () =>
    import("@/components/admin/product-builder/layout/CreateProductModal").then((m) => ({
      default: m.CreateProductModal,
    })),
  { ssr: false }
)

const ProductSettingsModal = dynamic(
  () =>
    import("@/components/admin/product-builder/layout/ProductSettingsModal").then((m) => ({
      default: m.ProductSettingsModal,
    })),
  { ssr: false }
)

const EMPTY_PRODUCT_CATEGORIES: CategoryInfo[] = []

export default function ProductsPage() {
  return (
    <ContentListPage<Product>
      builderPath="/admin/products/builder"
      createButtonLabel="Create Product"
      deleteItem={deleteProductAction}
      deleteItems={deleteProductsAction}
      duplicateItem={duplicateProductAction}
      duplicateTitle={(product) => `${product.title || "Product"} Copy`}
      emptyButtonLabel="Create Your First Product"
      emptyTitle={(products, filterStatus) =>
        products.length === 0 || filterStatus === "all" ? "No products found" : `No ${filterStatus} products found`
      }
      getIds={getProductIdsAction}
      getItems={getSiteProductsWithCategoriesAction}
      icon={Package}
      itemLabel="Product"
      itemLabelPlural="Products"
      listLabel="Products"
      pathPrefix="products"
      renderCreateModal={({ onCancel, onSuccess }) => (
        <AdminModalContent>
          <AdminModalHeader>
            <AdminModalTitle>Create New Product</AdminModalTitle>
            <AdminModalDescription>
              Add a new product to your catalog. You can customize the content after creation.
            </AdminModalDescription>
          </AdminModalHeader>
          <CreateProductModal onSuccess={onSuccess} onCancel={onCancel} />
        </AdminModalContent>
      )}
      renderSettingsModal={({ categories, item, onOpenChange, onSuccess, open }) => (
        <ProductSettingsModal
          key={item?.id || "product-settings-modal"}
          open={open}
          onOpenChange={onOpenChange}
          product={item}
          site={null}
          initialCategories={item ? categories : EMPTY_PRODUCT_CATEGORIES}
          onSuccess={onSuccess}
        />
      )}
      searchPlaceholder="Search products"
      showPrivateBadge
    />
  )
}
