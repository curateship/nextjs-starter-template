"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { AdminLayout } from "@/components/admin/admin-layout"
import { useProductData } from "@/hooks/useProductData"
import { Button } from "@/components/ui/button"
import { Package } from "lucide-react"
import Link from "next/link"

export default function ProductBuilderRootPage() {
  const router = useRouter()
  const { products, productsLoading, productsError } = useProductData()

  // Redirect to first product if products are available
  useEffect(() => {
    if (products.length > 0) {
      router.push(`/admin/products/builder/${products[0].site_id}?product=${products[0].slug}`)
    }
  }, [products, router])

  // Show loading state
  if (productsLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Loading products...</p>
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
            <Button asChild variant="outline">
              <Link href="/admin/products">Back to Products</Link>
            </Button>
          </div>
        </div>
      </AdminLayout>
    )
  }

  // Show no products state
  if (products.length === 0) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Products Found</h3>
            <p className="text-muted-foreground mb-4">
              You need to create a product before you can use the builder.
            </p>
            <Button asChild>
              <Link href="/admin/products">Go to Products</Link>
            </Button>
          </div>
        </div>
      </AdminLayout>
    )
  }

  // This should not be reached due to the redirect effect above
  return null
}