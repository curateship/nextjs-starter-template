"use client"

import * as React from "react"
import { useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils/tailwind-class-merger"
import { Separator } from "@/components/ui/separator"
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
import { SidebarTrigger } from "@/components/admin/layout/sidebar/Sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/admin/layout/dashboard/breadcrumb"
import { Save, Plus, Settings, CheckCircle, Sparkles, ChevronDown, ExternalLink } from "lucide-react"
import { useSiteContext } from "@/contexts/site-context"
import { ProductSettingsModal } from "@/components/admin/product-builder/ProductSettingsModal"
import { CreateProductModal } from "@/components/admin/product-builder/CreateProductModal"
import { AIGenerationDialog } from "@/components/admin/ai-generation/AIGenerationDialog"
import type { Product } from "@/lib/actions/products/product-actions"

interface BreadcrumbItem {
  href?: string
  label: string
  isPage?: boolean
}

interface StickyHeaderProps {
  className?: string
  breadcrumbItems?: BreadcrumbItem[]
  // Product builder specific props
  products?: Product[]
  selectedProduct?: string
  onProductChange?: (product: string) => void
  onProductCreated?: (product: Product) => void
  onProductUpdated?: (product: Product) => void
  saveMessage?: string
  isSaving?: boolean
  onSave?: () => void
  onAIComplete?: () => void
}

export function StickyHeader({
  className,
  breadcrumbItems = [],
  products,
  selectedProduct,
  onProductChange,
  onProductCreated,
  onProductUpdated,
  saveMessage,
  isSaving = false,
  onSave,
  onAIComplete
}: StickyHeaderProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showAIDialog, setShowAIDialog] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const { currentSite } = useSiteContext()

  // Product builder mode - when products prop is provided
  const isProductBuilder = products !== undefined
  const currentProduct = products?.find(p => p.slug === selectedProduct)

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
    const url = `http://localhost:3000/products/${slug}`
    return url
  }

  return (
    <>
      <header className={cn(
        "flex h-16 shrink-0 items-center gap-2 border-b bg-sidebar z-50",
        className
      )}>
        <div className="flex items-center justify-between flex-1 px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            {breadcrumbItems.length > 0 && (
              <>
                <Separator
                  orientation="vertical"
                  className="mr-2 h-4"
                />
                <Breadcrumb>
                  <BreadcrumbList>
                    {breadcrumbItems.map((item, index) => {
                      // Last item in product builder gets dropdown
                      const isLastItem = index === breadcrumbItems.length - 1
                      const shouldShowDropdown = isLastItem && isProductBuilder

                      return (
                        <React.Fragment key={index}>
                          <BreadcrumbItem className={index === 0 ? "hidden md:block" : ""}>
                            {shouldShowDropdown ? (
                              <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    className="h-auto p-0 font-normal hover:bg-transparent hover:text-foreground inline-flex items-center gap-1"
                                  >
                                    <BreadcrumbPage className="cursor-pointer">
                                      {currentProduct ? currentProduct.title : item.label}
                                    </BreadcrumbPage>
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-[240px]">
                                  {products?.map((product) => (
                                    <DropdownMenuItem
                                      key={product.id}
                                      onSelect={(e) => e.preventDefault()}
                                      className={product.slug === selectedProduct ? "bg-accent" : ""}
                                    >
                                      <div className="flex items-center justify-between flex-1">
                                        <span
                                          onClick={() => {
                                            if (onProductChange) {
                                              onProductChange(product.slug)
                                            }
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
                            ) : item.isPage ? (
                              <BreadcrumbPage>{item.label}</BreadcrumbPage>
                            ) : (
                              <BreadcrumbLink asChild>
                                <Link href={item.href || "#"}>
                                  {item.label}
                                </Link>
                              </BreadcrumbLink>
                            )}
                          </BreadcrumbItem>
                          {index < breadcrumbItems.length - 1 && (
                            <BreadcrumbSeparator className="hidden md:block" />
                          )}
                        </React.Fragment>
                      )
                    })}
                  </BreadcrumbList>
                </Breadcrumb>
              </>
            )}
          </div>

          {/* Product Builder Actions */}
          {isProductBuilder && (
            <div className="flex items-center space-x-2">
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
          )}
        </div>
      </header>

      {/* Product Builder Dialogs */}
      {isProductBuilder && (
        <>
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
                  if (onProductChange) {
                    onProductChange(product.slug)
                  }
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
                if (onAIComplete) {
                  onAIComplete()
                }
              }}
            />
          )}
        </>
      )}
    </>
  )
}
