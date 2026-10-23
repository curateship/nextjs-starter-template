"use client"

import dynamic from "@/lib/dynamic"
import Package from "lucide-react/dist/esm/icons/package.js"


import { ContentListPage } from "@/components/admin/layout/content/ContentListPage"
import type { CategoryInfo } from "@/lib/actions/categories/category-relationship-actions"
import {
  deleteProductAction,
  deleteProductsAction,
  duplicateProductAction,
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
      deletionImpactTarget="product"
      deleteItem={((a0) => deleteProductAction({ data: { productId: a0 } }))}
      deleteItems={((a0) => deleteProductsAction({ data: { productIds: a0 } }))}
      destructiveAction="delete-product"
      duplicateItem={((a0, a1) => duplicateProductAction({ data: { productId: a0, newTitle: a1 } }))}
      duplicateTitle={(product) => `${product.title || "Product"} Copy`}
      emptyButtonLabel="Create Your First Product"
      emptyTitle={(products, filterStatus) =>
        products.length === 0 || filterStatus === "all" ? "No products found" : `No ${filterStatus} products found`
      }
      getItems={((a0, a1) => getSiteProductsWithCategoriesAction({ data: { siteId: a0, options: a1 } }))}
      icon={Package}
      itemLabel="Product"
      itemLabelPlural="Products"
      listLabel="Products"
      pathPrefix="products"
      renderCreateModal={({ onCancel, onSuccess }) => (
        <CreateProductModal onSuccess={onSuccess} onCancel={onCancel} />
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
