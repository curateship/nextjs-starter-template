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
import { Save, Plus, Settings, CheckCircle, ChevronDown, ExternalLink } from "lucide-react"
import { useSiteContext } from "@/contexts/site-context"
import { TaxonomySettingsModal } from "@/components/admin/taxonomies/TaxonomySettingsModal"
import { CreateTaxonomyModal } from "@/components/admin/taxonomies/CreateTaxonomyModal"
import type { Taxonomy } from "@/lib/actions/taxonomies/taxonomy-actions"
import type { TaxonomyType } from "@/lib/actions/taxonomies/taxonomy-type-actions"
import type { SiteWithTheme } from "@/lib/actions/sites/site-actions"

interface BreadcrumbItem {
  href?: string
  label: string
  isPage?: boolean
}

interface StickyHeaderProps {
  className?: string
  breadcrumbItems?: BreadcrumbItem[]
  // Taxonomy builder specific props
  taxonomies?: Taxonomy[]
  selectedTaxonomy?: string
  onTaxonomyChange?: (taxonomy: string) => void
  onTaxonomyCreated?: (taxonomy: Taxonomy) => void
  onTaxonomyUpdated?: (taxonomy: Taxonomy) => void
  saveMessage?: string
  isSaving?: boolean
  onSave?: () => void
  site?: SiteWithTheme | null
  taxonomyType?: TaxonomyType
}

export function StickyHeader({
  className,
  breadcrumbItems = [],
  taxonomies,
  selectedTaxonomy,
  onTaxonomyChange,
  onTaxonomyCreated,
  onTaxonomyUpdated,
  saveMessage,
  isSaving = false,
  onSave,
  site,
  taxonomyType
}: StickyHeaderProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const { currentSite } = useSiteContext()

  // Taxonomy builder mode - when taxonomies prop is provided
  const isTaxonomyBuilder = taxonomies !== undefined
  const currentTaxonomy = taxonomies?.find(t => t.slug === selectedTaxonomy)

  const handleCreateTaxonomy = () => {
    setDropdownOpen(false)
    setTimeout(() => {
      setShowCreateDialog(true)
    }, 100)
  }

  // Generate taxonomy URL for frontend viewing
  const getTaxonomyUrl = (taxonomySlug?: string) => {
    const slug = taxonomySlug || currentTaxonomy?.slug
    if (!slug || !taxonomyType?.slug) {
      return '#'
    }
    const url = `/taxonomies/${taxonomyType.slug}/${slug}`
    return url
  }

  return (
    <>
      <header className={cn(
        "sticky top-0 flex h-16 shrink-0 items-center gap-2 border-b bg-sidebar z-50",
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
                      // Last item in taxonomy builder gets dropdown
                      const isLastItem = index === breadcrumbItems.length - 1
                      const shouldShowDropdown = isLastItem && isTaxonomyBuilder

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
                                      {currentTaxonomy ? currentTaxonomy.title : item.label}
                                    </BreadcrumbPage>
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-[240px]">
                                  {taxonomies?.map((taxonomy) => (
                                    <DropdownMenuItem
                                      key={taxonomy.id}
                                      onSelect={(e) => e.preventDefault()}
                                      className={taxonomy.slug === selectedTaxonomy ? "bg-accent" : ""}
                                    >
                                      <div className="flex items-center justify-between flex-1">
                                        <span
                                          onClick={() => {
                                            if (onTaxonomyChange) {
                                              onTaxonomyChange(taxonomy.slug)
                                            }
                                            setDropdownOpen(false)
                                          }}
                                          className="flex-1 cursor-pointer"
                                        >
                                          {taxonomy.title}
                                        </span>
                                        <Link
                                          href={getTaxonomyUrl(taxonomy.slug)}
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
                                  <DropdownMenuItem onClick={handleCreateTaxonomy}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Create Taxonomy
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

          {/* Taxonomy Builder Actions */}
          {isTaxonomyBuilder && (
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
                disabled={!currentTaxonomy}
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

      {/* Taxonomy Builder Dialogs */}
      {isTaxonomyBuilder && (
        <>
          {/* Create Taxonomy Dialog */}
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogContent className="w-[840px] max-w-[95vw]" style={{ width: '840px', maxWidth: '95vw' }}>
              <DialogHeader>
                <DialogTitle>Create New Taxonomy</DialogTitle>
                <DialogDescription>
                  Add a new taxonomy term. You can customize the content after creation.
                </DialogDescription>
              </DialogHeader>
              {site && taxonomyType && (
                <CreateTaxonomyModal
                  siteId={site.id}
                  taxonomyTypeId={taxonomyType.id}
                  onSuccess={(taxonomy) => {
                    if (onTaxonomyCreated) {
                      onTaxonomyCreated(taxonomy)
                    }
                    setShowCreateDialog(false)
                    if (onTaxonomyChange) {
                      onTaxonomyChange(taxonomy.slug)
                    }
                  }}
                  onCancel={() => setShowCreateDialog(false)}
                />
              )}
            </DialogContent>
          </Dialog>

          {/* Edit Taxonomy Settings Modal */}
          <TaxonomySettingsModal
            open={showEditDialog}
            onOpenChange={setShowEditDialog}
            taxonomy={currentTaxonomy || null}
            site={site}
            onSuccess={(updatedTaxonomy) => {
              if (onTaxonomyUpdated) {
                onTaxonomyUpdated(updatedTaxonomy)
              }
            }}
          />
        </>
      )}
    </>
  )
}
