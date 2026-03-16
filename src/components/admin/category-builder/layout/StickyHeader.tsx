"use client"

import * as React from "react"
import { useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils/tailwind-class-merger"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useSidebar } from "@/components/admin/layout/sidebar/Sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/admin/layout/dashboard/breadcrumb"
import { Save, Plus, Settings, CheckCircle, ChevronDown, ExternalLink, PanelLeft } from "lucide-react"
import { useSiteContext } from "@/contexts/site-context"
import { CategorySettingsModal } from "@/components/admin/category-builder/layout/CategorySettingsModal"
import { CreateCategoryModal } from "@/components/admin/category-builder/layout/CreateCategoryModal"
import type { Category } from "@/lib/actions/categories/category-actions"
import type { SiteWithTheme } from "@/lib/actions/sites/site-actions"

interface BreadcrumbItemType {
  href?: string
  label: string
  isPage?: boolean
}

interface StickyHeaderProps {
  className?: string
  breadcrumbItems?: BreadcrumbItemType[]
  categories?: Category[]
  selectedCategory?: string
  onCategoryChange?: (category: string) => void
  onCategoryCreated?: (category: Category) => void
  onCategoryUpdated?: (category: Category) => void
  saveMessage?: string
  isSaving?: boolean
  onSave?: () => void
  onPublish?: () => void
  isPublishing?: boolean
  site?: SiteWithTheme | null
}

export function StickyHeader({
  className,
  breadcrumbItems = [],
  categories,
  selectedCategory,
  onCategoryChange,
  onCategoryCreated,
  onCategoryUpdated,
  saveMessage,
  isSaving = false,
  onSave,
  onPublish,
  isPublishing = false,
  site,
}: StickyHeaderProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const { currentSite } = useSiteContext()
  const { toggleSidebar } = useSidebar()

  const isCategoryBuilder = categories !== undefined
  const currentCategory = categories?.find(c => c.slug === selectedCategory)

  const handleCreateCategory = () => {
    setDropdownOpen(false)
    setTimeout(() => {
      setShowCreateDialog(true)
    }, 100)
  }

  const getCategoryUrl = (categorySlug?: string) => {
    const slug = categorySlug || currentCategory?.slug
    if (!slug || !currentSite?.subdomain) return '#'
    return `http://${currentSite.subdomain}.localhost:3000/categories/${slug}`
  }

  return (
    <>
      <header className={cn(
        "sticky top-0 flex h-16 shrink-0 items-center gap-2 border-b bg-sidebar z-50",
        className
      )}>
        <div className="flex items-center justify-between flex-1 px-4">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSidebar}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-muted text-sm font-medium transition-colors hover:bg-muted-foreground/10"
            >
              <PanelLeft className="h-3.5 w-3.5" />
            </button>
            {breadcrumbItems.length > 0 && (
              <>
                <Separator orientation="vertical" className="mr-2 h-4" />
                <Breadcrumb>
                  <BreadcrumbList>
                    {breadcrumbItems.map((item, index) => {
                      const isLastItem = index === breadcrumbItems.length - 1
                      const shouldShowDropdown = isLastItem && isCategoryBuilder

                      return (
                        <React.Fragment key={index}>
                          <BreadcrumbItem className={index === 0 ? "hidden md:block" : ""}>
                            {shouldShowDropdown ? (
                              !item.label ? (
                                <div className="h-5 w-32 bg-muted rounded animate-pulse" />
                              ) : (
                              <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    className="h-auto p-0 font-normal hover:bg-transparent hover:text-foreground inline-flex items-center"
                                  >
                                    <BreadcrumbPage className="cursor-pointer" style={{ paddingBottom: '1px' }}>
                                      {currentCategory ? currentCategory.title : item.label}
                                    </BreadcrumbPage>
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-[240px]">
                                  {categories?.map((category) => (
                                    <DropdownMenuItem
                                      key={category.id}
                                      onSelect={(e) => e.preventDefault()}
                                      className={category.slug === selectedCategory ? "bg-accent" : ""}
                                    >
                                      <div className="flex items-center justify-between flex-1">
                                        <span
                                          onClick={() => {
                                            if (onCategoryChange) {
                                              onCategoryChange(category.slug)
                                            }
                                            setDropdownOpen(false)
                                          }}
                                          className="flex-1 cursor-pointer"
                                        >
                                          {category.title}
                                        </span>
                                        <Link
                                          href={getCategoryUrl(category.slug)}
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
                                  <DropdownMenuItem onClick={handleCreateCategory}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Create Category
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              )
                            ) : item.isPage ? (
                              !item.label ? (
                                <div className="h-5 w-32 bg-muted rounded animate-pulse" />
                              ) : (
                                <BreadcrumbPage>{item.label}</BreadcrumbPage>
                              )
                            ) : !item.label ? (
                              <div className="h-5 w-24 bg-muted rounded animate-pulse" />
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

          {isCategoryBuilder && (
            <div className="flex items-center space-x-2">
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
                disabled={!currentCategory}
              >
                <Settings className="w-4 h-4 mr-2" />
                Edit Settings
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onSave}
                disabled={isSaving}
              >
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
              {onPublish && (
                <Button
                  size="sm"
                  onClick={onPublish}
                  disabled={isPublishing || isSaving}
                >
                  {isPublishing ? 'Publishing...' : currentCategory?.is_published ? 'Published' : 'Publish'}
                </Button>
              )}
            </div>
          )}
        </div>
      </header>

      {isCategoryBuilder && (
        <>
          {showCreateDialog && site && (
            <CreateCategoryModal
              siteId={site.id}
              existingCategories={categories || []}
              onCreated={(category: Category) => {
                if (onCategoryCreated) {
                  onCategoryCreated(category)
                }
                setShowCreateDialog(false)
                if (onCategoryChange) {
                  onCategoryChange(category.slug)
                }
              }}
              onClose={() => setShowCreateDialog(false)}
            />
          )}

          <CategorySettingsModal
            open={showEditDialog}
            onOpenChange={setShowEditDialog}
            category={currentCategory || null}
            existingCategories={categories || []}
            onSuccess={(updatedCategory: Category) => {
              if (onCategoryUpdated) {
                onCategoryUpdated(updatedCategory)
              }
            }}
          />
        </>
      )}
    </>
  )
}
