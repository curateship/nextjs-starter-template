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
import { PageSettingsModal } from "@/components/admin/page-builder/PageSettingsModal"
import { CreatePageModal } from "@/components/admin/page-builder/CreatePageModal"
import type { Page } from "@/lib/actions/pages/page-actions"
import type { SiteWithTheme } from "@/lib/actions/sites/site-actions"

interface BreadcrumbItem {
  href?: string
  label: string
  isPage?: boolean
}

interface StickyHeaderProps {
  className?: string
  breadcrumbItems?: BreadcrumbItem[]
  pages?: Page[]
  selectedPage?: string
  onPageChange?: (page: string) => void
  onPageCreated?: (page: Page) => void
  onPageUpdated?: (page: Page) => void
  saveMessage?: string
  isSaving?: boolean
  onSave?: () => void
  onPreviewPage?: () => void
  site?: SiteWithTheme | null
}

export function StickyHeader({
  className,
  breadcrumbItems = [],
  pages,
  selectedPage,
  onPageChange,
  onPageCreated,
  onPageUpdated,
  saveMessage,
  isSaving = false,
  onSave,
  onPreviewPage,
  site
}: StickyHeaderProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const { currentSite } = useSiteContext()

  // Page builder mode - when pages prop is provided
  const isPageBuilder = pages !== undefined
  const currentPage = pages?.find(p => p.slug === selectedPage)

  const handleCreatePage = () => {
    setDropdownOpen(false)
    setTimeout(() => {
      setShowCreateDialog(true)
    }, 100)
  }

  // Generate page URL for user pages
  const getPageUrl = (pageSlug?: string) => {
    const slug = pageSlug || currentPage?.slug
    if (!slug) {
      return '#'
    }
    return `/user-dashboard${slug === 'home' ? '' : `/${slug}`}`
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
                      // Last item in page builder gets dropdown
                      const isLastItem = index === breadcrumbItems.length - 1
                      const shouldShowDropdown = isLastItem && isPageBuilder

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
                                      {currentPage ? currentPage.title : item.label}
                                    </BreadcrumbPage>
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-[240px]">
                                  {pages?.map((page) => (
                                    <DropdownMenuItem
                                      key={page.id}
                                      onSelect={(e) => e.preventDefault()}
                                      className={page.slug === selectedPage ? "bg-accent" : ""}
                                    >
                                      <div className="flex items-center justify-between flex-1">
                                        <span
                                          onClick={() => {
                                            if (onPageChange) {
                                              onPageChange(page.slug)
                                            }
                                            setDropdownOpen(false)
                                          }}
                                          className="flex-1 cursor-pointer"
                                        >
                                          {page.is_homepage && "🏠 "}
                                          {page.title}
                                          {!page.is_published && " (Draft)"}
                                        </span>
                                        <Link
                                          href={getPageUrl(page.slug)}
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
                                  <DropdownMenuItem onClick={handleCreatePage}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Create Page
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              )
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

          {/* Page Builder Actions */}
          {isPageBuilder && (
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
                disabled={!currentPage}
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

      {/* Page Builder Dialogs */}
      {isPageBuilder && (
        <>
          {/* Create Page Dialog */}
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogContent className="w-[840px] max-w-[95vw]" style={{ width: '840px', maxWidth: '95vw' }}>
              <DialogHeader>
                <DialogTitle>Create New User Page</DialogTitle>
                <DialogDescription>
                  Add a new user page. You can customize the content after creation.
                </DialogDescription>
              </DialogHeader>
              {site && (
                <CreatePageModal
                  siteId={site.id}
                  onSuccess={(page) => {
                    if (onPageCreated) {
                      onPageCreated(page)
                    }
                    setShowCreateDialog(false)
                    if (onPageChange) {
                      onPageChange(page.slug)
                    }
                  }}
                  onCancel={() => setShowCreateDialog(false)}
                />
              )}
            </DialogContent>
          </Dialog>

          {/* Edit Page Settings Modal */}
          <PageSettingsModal
            open={showEditDialog}
            onOpenChange={setShowEditDialog}
            page={currentPage || null}
            site={site || null}
            onSuccess={(updatedPage) => {
              if (onPageUpdated) {
                onPageUpdated(updatedPage)
              }
            }}
          />
        </>
      )}
    </>
  )
}
