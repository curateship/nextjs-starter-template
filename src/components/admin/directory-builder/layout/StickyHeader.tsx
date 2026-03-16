"use client"

import * as React from "react"
import { useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils/tailwind-class-merger"
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
import { useSidebar } from "@/components/admin/layout/sidebar/Sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/admin/layout/dashboard/breadcrumb"
import { Save, Plus, Settings, CheckCircle, Sparkles, ChevronDown, ExternalLink, PanelLeft, PanelRight, PanelRightClose, Home } from "lucide-react"
import { useSiteContext } from "@/contexts/site-context"
import { DirectorySettingsModal } from "@/components/admin/directory-builder/layout/DirectorySettingsModal"
import { CreateDirectoryModal } from "@/components/admin/directory-builder/layout/CreateDirectoryModal"
import type { Directory } from "@/lib/actions/directories/directory-actions"

interface BreadcrumbItem {
  href?: string
  label: string
  isPage?: boolean
}

interface StickyHeaderProps {
  className?: string
  breadcrumbItems?: BreadcrumbItem[]
  // Directory builder specific props
  directories?: Directory[]
  selectedDirectory?: string
  onDirectoryChange?: (directory: string) => void
  onDirectoryCreated?: (directory: Directory) => void
  onDirectoryUpdated?: (directory: Directory) => void
  saveMessage?: string
  isSaving?: boolean
  onSave?: () => void
  onPublish?: () => void
  isPublishing?: boolean
  blockListOpen?: boolean
  onToggleBlockList?: () => void
}

export function StickyHeader({
  className,
  breadcrumbItems = [],
  directories,
  selectedDirectory,
  onDirectoryChange,
  onDirectoryCreated,
  onDirectoryUpdated,
  saveMessage,
  isSaving = false,
  onSave,
  onPublish,
  isPublishing = false,
  blockListOpen,
  onToggleBlockList,
}: StickyHeaderProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const { currentSite } = useSiteContext()
  const { toggleSidebar } = useSidebar()

  // Directory builder mode - when directories prop is provided
  const isDirectoryBuilder = directories !== undefined
  const currentDirectory = directories?.find(d => d.slug === selectedDirectory)

  const handleCreateDirectory = () => {
    setDropdownOpen(false)
    setTimeout(() => {
      setShowCreateDialog(true)
    }, 100)
  }

  // Generate directory URL for frontend viewing
  const getDirectoryUrl = (directorySlug?: string) => {
    const slug = directorySlug || currentDirectory?.slug
    if (!slug || !currentSite?.subdomain) {
      return '#'
    }
    const url = `http://${currentSite.subdomain}.localhost:3000/directories/${slug}`
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
            <button
              onClick={toggleSidebar}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-muted text-sm font-medium transition-colors hover:bg-muted-foreground/10"
            >
              <PanelLeft className="h-3.5 w-3.5" />
            </button>
            {breadcrumbItems.length > 0 && (
              <Breadcrumb className="w-fit rounded-lg bg-muted px-3 py-2">
                <BreadcrumbList>
                  {breadcrumbItems.map((item, index) => {
                    // Last item in directory builder gets dropdown
                    const isLastItem = index === breadcrumbItems.length - 1
                    const shouldShowDropdown = isLastItem && isDirectoryBuilder

                    return (
                      <React.Fragment key={index}>
                        <BreadcrumbItem>
                          {index === 0 ? (
                            <BreadcrumbLink asChild>
                              <Link href={item.href || "#"}>
                                <Home className="size-4" />
                              </Link>
                            </BreadcrumbLink>
                          ) : shouldShowDropdown ? (
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
                                    {currentDirectory ? currentDirectory.title : item.label}
                                  </BreadcrumbPage>
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-[240px]">
                                {directories?.map((directory) => (
                                  <DropdownMenuItem
                                    key={directory.id}
                                    onSelect={(e) => e.preventDefault()}
                                    className={directory.slug === selectedDirectory ? "bg-accent" : ""}
                                  >
                                    <div className="flex items-center justify-between flex-1">
                                      <span
                                        onClick={() => {
                                          if (onDirectoryChange) {
                                            onDirectoryChange(directory.slug)
                                          }
                                          setDropdownOpen(false)
                                        }}
                                        className="flex-1 cursor-pointer"
                                      >
                                        {directory.title}
                                        {!directory.is_published && " (Draft)"}
                                      </span>
                                      <Link
                                        href={getDirectoryUrl(directory.slug)}
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
                                <DropdownMenuItem onClick={handleCreateDirectory}>
                                  <Plus className="mr-2 h-4 w-4" />
                                  Create Directory
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
                          <BreadcrumbSeparator />
                        )}
                      </React.Fragment>
                    )
                  })}
                </BreadcrumbList>
              </Breadcrumb>
            )}
          </div>

          {/* Directory Builder Actions */}
          {isDirectoryBuilder && (
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
                disabled={!currentDirectory}
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
                  {isPublishing ? 'Publishing...' : currentDirectory?.is_published ? 'Published' : 'Publish'}
                </Button>
              )}
              {onToggleBlockList && (
                <button
                  onClick={onToggleBlockList}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-muted text-sm font-medium transition-colors hover:bg-muted-foreground/10"
                >
                  {blockListOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRight className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Directory Builder Dialogs */}
      {isDirectoryBuilder && (
        <>
          {/* Create Directory Dialog */}
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogContent className="w-[840px] max-w-[95vw]" style={{ width: '840px', maxWidth: '95vw' }}>
              <DialogHeader>
                <DialogTitle>Create New Directory</DialogTitle>
                <DialogDescription>
                  Add a new directory to your site. You can customize the content after creation.
                </DialogDescription>
              </DialogHeader>
              <CreateDirectoryModal
                onSuccess={(directory) => {
                  if (onDirectoryCreated) {
                    onDirectoryCreated(directory)
                  }
                  setShowCreateDialog(false)
                  if (onDirectoryChange) {
                    onDirectoryChange(directory.slug)
                  }
                }}
                onCancel={() => setShowCreateDialog(false)}
              />
            </DialogContent>
          </Dialog>

          {/* Edit Directory Settings Modal */}
          <DirectorySettingsModal
            open={showEditDialog}
            onOpenChange={setShowEditDialog}
            directory={currentDirectory || null}
            site={currentSite}
            onSuccess={(updatedDirectory) => {
              if (onDirectoryUpdated) {
                onDirectoryUpdated(updatedDirectory)
              }
            }}
          />
        </>
      )}
    </>
  )
}
