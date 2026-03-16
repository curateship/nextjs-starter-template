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
import { useSidebar } from "@/components/admin/layout/sidebar/Sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/admin/layout/dashboard/breadcrumb"
import { Save, Plus, Settings, CheckCircle, Sparkles, ChevronDown, ExternalLink, PanelLeft } from "lucide-react"
import { useSiteContext } from "@/contexts/site-context"
import { EventSettingsModal } from "@/components/admin/event-builder/layout/EventSettingsModal"
import { CreateEventModal } from "@/components/admin/event-builder/layout/CreateEventModal"
import type { Event } from "@/lib/actions/events/event-actions"

interface BreadcrumbItem {
  href?: string
  label: string
  isPage?: boolean
}

interface StickyHeaderProps {
  className?: string
  breadcrumbItems?: BreadcrumbItem[]
  // Event builder specific props
  events?: Event[]
  selectedEvent?: string
  onEventChange?: (event: string) => void
  onEventCreated?: (event: Event) => void
  onEventUpdated?: (event: Event) => void
  saveMessage?: string
  isSaving?: boolean
  onSave?: () => void
  onPublish?: () => void
  isPublishing?: boolean
}

export function StickyHeader({
  className,
  breadcrumbItems = [],
  events,
  selectedEvent,
  onEventChange,
  onEventCreated,
  onEventUpdated,
  saveMessage,
  isSaving = false,
  onSave,
  onPublish,
  isPublishing = false,
}: StickyHeaderProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const { currentSite } = useSiteContext()
  const { toggleSidebar } = useSidebar()

  // Event builder mode - when events prop is provided
  const isEventBuilder = events !== undefined
  const currentEvent = events?.find(p => p.slug === selectedEvent)

  const handleCreateEvent = () => {
    setDropdownOpen(false)
    setTimeout(() => {
      setShowCreateDialog(true)
    }, 100)
  }

  // Generate event URL for frontend viewing
  const getEventUrl = (eventSlug?: string) => {
    const slug = eventSlug || currentEvent?.slug
    if (!slug || !currentSite?.subdomain) {
      return '#'
    }
    const url = `http://${currentSite.subdomain}.localhost:3000/events/${slug}`
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
              <>
                <Separator
                  orientation="vertical"
                  className="mr-2 h-4"
                />
                <Breadcrumb>
                  <BreadcrumbList>
                    {breadcrumbItems.map((item, index) => {
                      // Last item in event builder gets dropdown
                      const isLastItem = index === breadcrumbItems.length - 1
                      const shouldShowDropdown = isLastItem && isEventBuilder

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
                                    className="h-auto font-normal hover:bg-transparent hover:text-foreground inline-flex items-center"
                                  >
                                    <BreadcrumbPage className="cursor-pointer" style={{ paddingBottom: '1px' }}>
                                      {currentEvent ? currentEvent.title : item.label}
                                    </BreadcrumbPage>
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-[240px]">
                                  {events?.map((event) => (
                                    <DropdownMenuItem
                                      key={event.id}
                                      onSelect={(e) => e.preventDefault()}
                                      className={event.slug === selectedEvent ? "bg-accent" : ""}
                                    >
                                      <div className="flex items-center justify-between flex-1">
                                        <span
                                          onClick={() => {
                                            if (onEventChange) {
                                              onEventChange(event.slug)
                                            }
                                            setDropdownOpen(false)
                                          }}
                                          className="flex-1 cursor-pointer"
                                        >
                                          {event.title}
                                          {!event.is_published && " (Draft)"}
                                        </span>
                                        <Link
                                          href={getEventUrl(event.slug)}
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
                                  <DropdownMenuItem onClick={handleCreateEvent}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Create Event
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

          {/* Event Builder Actions */}
          {isEventBuilder && (
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
                disabled={!currentEvent}
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
                  {isPublishing ? 'Publishing...' : currentEvent?.is_published ? 'Published' : 'Publish'}
                </Button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Event Builder Dialogs */}
      {isEventBuilder && (
        <>
          {/* Create Event Dialog */}
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogContent className="w-[840px] max-w-[95vw]" style={{ width: '840px', maxWidth: '95vw' }}>
              <DialogHeader>
                <DialogTitle>Create New Event</DialogTitle>
                <DialogDescription>
                  Add a new event to your blog. You can customize the content after creation.
                </DialogDescription>
              </DialogHeader>
              <CreateEventModal
                onSuccess={(event) => {
                  if (onEventCreated) {
                    onEventCreated(event)
                  }
                  setShowCreateDialog(false)
                  if (onEventChange) {
                    onEventChange(event.slug)
                  }
                }}
                onCancel={() => setShowCreateDialog(false)}
              />
            </DialogContent>
          </Dialog>

          {/* Edit Event Settings Modal */}
          <EventSettingsModal
            open={showEditDialog}
            onOpenChange={setShowEditDialog}
            event={currentEvent || null}
            site={currentSite}
            onSuccess={(updatedEvent) => {
              if (onEventUpdated) {
                onEventUpdated(updatedEvent)
              }
            }}
          />
        </>
      )}
    </>
  )
}
