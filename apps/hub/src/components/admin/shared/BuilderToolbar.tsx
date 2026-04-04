"use client"

import * as React from "react"
import { useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils/tailwind"
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
} from "@/components/ui/breadcrumb"
import { Save, Plus, Settings, ChevronDown, ExternalLink, PanelLeft, PanelRight, PanelRightClose } from "lucide-react"
import { SaveStatusBadge } from "@/components/admin/shared/SaveStatusBadge"

/** Generic item interface — all builders have items with at least these fields */
export interface BuilderItem {
  id: string
  slug: string
  title: string
  is_published?: boolean
  is_homepage?: boolean
  is_default?: boolean
}

interface BreadcrumbItemType {
  href?: string
  label: string
  isPage?: boolean
}

interface NavLink {
  label: string
  href: string
  active?: boolean
}

interface BuilderToolbarProps {
  className?: string
  breadcrumbItems?: BreadcrumbItemType[]
  navLinks?: NavLink[]
  rightActions?: React.ReactNode
  /** All items of this content type */
  items?: BuilderItem[]
  /** Currently selected item slug */
  selectedItemSlug?: string
  /** Callback when user selects a different item from the dropdown */
  onItemChange?: (slug: string) => void
  /** Entity type display name, e.g. "Product" */
  entityName?: string
  /** URL path segment, e.g. "products". Used to build preview URLs. */
  urlSegment?: string
  /** Custom URL builder. If not provided, defaults to http://{subdomain}.localhost:3000/{urlSegment}/{slug} */
  getItemUrl?: (item: BuilderItem) => string
  saveMessage?: string
  isSaving?: boolean
  onSave?: () => void
  onPublish?: () => void
  isPublishing?: boolean
  blockListOpen?: boolean
  onToggleBlockList?: () => void
  /** Render the create modal/dialog. Receives show state and setter. */
  renderCreateModal?: (show: boolean, setShow: (show: boolean) => void) => React.ReactNode
  /** Render the settings modal/dialog. Receives show state and setter, plus the current item. */
  renderSettingsModal?: (show: boolean, setShow: (show: boolean) => void, currentItem: BuilderItem | undefined) => React.ReactNode
  /** Custom label renderer for dropdown items (e.g. to add emoji prefix) */
  renderItemLabel?: (item: BuilderItem) => React.ReactNode
  /** Whether to show the Save button with "outline" variant (default) or "default" variant */
  saveVariant?: "outline" | "default"
  showSidebarToggle?: boolean
}

/**
 * Shared builder toolbar used by admin builder and editor pages.
 * Provides: sidebar toggle, breadcrumbs, optional item-selector dropdown, built-in builder actions,
 * custom right-side actions, block list toggle, and render props for create/settings modals.
 */
export function BuilderToolbar({
  className,
  breadcrumbItems = [],
  navLinks,
  rightActions,
  items,
  selectedItemSlug,
  onItemChange,
  entityName,
  urlSegment,
  getItemUrl,
  saveMessage,
  isSaving = false,
  onSave,
  onPublish,
  isPublishing = false,
  blockListOpen,
  onToggleBlockList,
  renderCreateModal,
  renderSettingsModal,
  renderItemLabel,
  saveVariant = "outline",
  showSidebarToggle = true,
}: BuilderToolbarProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const { toggleSidebar } = useSidebar()

  const isBuilderMode = items !== undefined
  const currentItem = items?.find(item => item.slug === selectedItemSlug)
  const visibleBreadcrumbItems = breadcrumbItems.filter((item, index) => !(index === 0 && item.label === "Dashboard"))

  const handleCreate = () => {
    setDropdownOpen(false)
    setTimeout(() => setShowCreateDialog(true), 100)
  }

  /** Default item label: title + draft indicator */
  const defaultItemLabel = (item: BuilderItem) => (
    <>
      {item.is_homepage && "\u{1F3E0} "}
      {item.is_default && "\u{1F3E0} "}
      {item.title}
      {item.is_published === false && " (Draft)"}
    </>
  )

  return (
    <>
      <header className={cn(
        "sticky top-0 flex h-16 shrink-0 items-center gap-2 border-b bg-sidebar z-50",
        className
      )}>
        <div className="flex items-center justify-between flex-1 px-4 h-full">
          <div className="flex items-center gap-2">
            {/* Sidebar toggle */}
            {showSidebarToggle && (
              <button
                onClick={toggleSidebar}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-muted text-sm font-medium transition-colors hover:bg-muted-foreground/10"
              >
                <PanelLeft className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Breadcrumbs with item-selector dropdown on the last item */}
            {visibleBreadcrumbItems.length > 0 && (
              <Breadcrumb>
                <BreadcrumbList>
                  {visibleBreadcrumbItems.map((item, index) => {
                    const isLastItem = index === visibleBreadcrumbItems.length - 1
                    const shouldShowDropdown = isLastItem && isBuilderMode

                    return (
                      <React.Fragment key={index}>
                        <BreadcrumbItem>
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
                                    {currentItem ? currentItem.title : item.label}
                                  </BreadcrumbPage>
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-[240px]">
                                {items?.map((listItem) => (
                                  <DropdownMenuItem
                                    key={listItem.id}
                                    onSelect={(e) => e.preventDefault()}
                                    className={listItem.slug === selectedItemSlug ? "bg-accent" : ""}
                                  >
                                    <div className="flex items-center justify-between flex-1">
                                      <span
                                        onClick={() => {
                                          onItemChange?.(listItem.slug)
                                          setDropdownOpen(false)
                                        }}
                                        className="flex-1 cursor-pointer"
                                      >
                                        {renderItemLabel ? renderItemLabel(listItem) : defaultItemLabel(listItem)}
                                      </span>
                                      {(getItemUrl || urlSegment) && (
                                        <Link
                                          href={getItemUrl ? getItemUrl(listItem) : `#`}
                                          target="_blank"
                                          onClick={(e) => e.stopPropagation()}
                                          className="ml-2"
                                        >
                                          <ExternalLink className="w-3 h-3" />
                                        </Link>
                                      )}
                                    </div>
                                  </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={handleCreate}>
                                  <Plus className="mr-2 h-4 w-4" />
                                  Create {entityName || "Item"}
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
                        {index < visibleBreadcrumbItems.length - 1 && (
                          <BreadcrumbSeparator />
                        )}
                      </React.Fragment>
                    )
                  })}
                </BreadcrumbList>
              </Breadcrumb>
            )}
          </div>

          {/* Nav links */}
          {navLinks && navLinks.length > 0 && (
            <div className="flex items-center gap-8 h-full pr-14">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "text-sm font-medium h-full flex items-center border-b-[3px] transition-colors",
                    link.active
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          )}

          {/* Right-side actions */}
          {(rightActions || isBuilderMode || onToggleBlockList) && (
            <div className="flex items-center space-x-2">
              {rightActions}
              {isBuilderMode && (
                <>
                  <SaveStatusBadge message={saveMessage} />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowEditDialog(true)}
                    disabled={!currentItem}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Edit Settings
                  </Button>
                  <Button
                    size="sm"
                    variant={saveVariant}
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
                      {isPublishing ? 'Publishing...' : currentItem?.is_published ? 'Published' : 'Publish'}
                    </Button>
                  )}
                </>
              )}
              {onToggleBlockList && (
                <button
                  onClick={onToggleBlockList}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-muted text-sm font-medium transition-colors hover:bg-muted-foreground/10"
                >
                  {blockListOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRight className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Modals — provided by the consumer via render props */}
      {isBuilderMode && (
        <>
          {renderCreateModal?.(showCreateDialog, setShowCreateDialog)}
          {renderSettingsModal?.(showEditDialog, setShowEditDialog, currentItem)}
        </>
      )}
    </>
  )
}
