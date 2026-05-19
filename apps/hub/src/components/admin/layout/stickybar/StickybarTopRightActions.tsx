"use client"

import { createContext, useContext, useState } from "react"
import { type LucideIcon, Save, Settings, PanelRight, PanelRightClose, CheckCircle, AlertCircle, ExternalLink, ChevronDown, Search, ListFilter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils/tailwind"

interface DashboardHeaderActionsSlotContextValue {
  slot: HTMLDivElement | null
  setSlot: (slot: HTMLDivElement | null) => void
}

interface SaveStatusBadgeProps {
  message: string | null | undefined
}

const DashboardHeaderActionsSlotContext = createContext<DashboardHeaderActionsSlotContextValue | null>(null)

export interface StickybarFilterMenuItem {
  value: string
  label: string
  icon?: LucideIcon
  count?: number
}

export interface StickybarFilterMenuConfig {
  value: string
  onValueChange: (value: string) => void
  items: StickybarFilterMenuItem[]
}

export interface StickybarSearchConfig {
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
}

export function DashboardHeaderActionsSlotProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)

  return (
    <DashboardHeaderActionsSlotContext.Provider value={{ slot, setSlot }}>
      {children}
    </DashboardHeaderActionsSlotContext.Provider>
  )
}

export function useDashboardHeaderActionsSlot() {
  const context = useContext(DashboardHeaderActionsSlotContext)

  if (!context) {
    throw new Error("useDashboardHeaderActionsSlot must be used within DashboardHeaderActionsSlotProvider")
  }

  return context
}

function SaveStatusBadge({ message }: SaveStatusBadgeProps) {
  if (!message) return null

  const isError = message.includes("Error") || message.includes("Failed")
  const Icon = isError ? AlertCircle : CheckCircle

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-1.5",
        isError ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"
      )}
    >
      <Icon className={cn("h-4 w-4", isError ? "text-red-600" : "text-green-600")} />
      <span className={cn("text-sm font-medium", isError ? "text-red-800" : "text-green-700")}>
        {message}
      </span>
    </div>
  )
}

interface StickybarTopRightActionsProps {
  className?: string
  search?: StickybarSearchConfig
  preActions?: React.ReactNode
  filterMenu?: StickybarFilterMenuConfig
  rightActions?: React.ReactNode
  viewPageHref?: string | null
  saveMessage?: string | null
  isSaving?: boolean
  onSave?: () => void
  saveLabel?: string
  savingLabel?: string
  saveVariant?: "outline" | "default"
  renderSettingsModal?: (show: boolean, setShow: (show: boolean) => void) => React.ReactNode
  settingsLabel?: string
  settingsDisabled?: boolean
  onPublish?: () => void
  isPublishing?: boolean
  publishLabel?: string
  publishingLabel?: string
  publishedLabel?: string
  isPublished?: boolean
  blockListOpen?: boolean
  onToggleBlockList?: () => void
}

export function StickybarTopRightActions({
  className,
  search,
  preActions,
  filterMenu,
  rightActions,
  viewPageHref,
  saveMessage,
  isSaving = false,
  onSave,
  saveLabel = "Save",
  savingLabel = "Saving...",
  saveVariant = "outline",
  renderSettingsModal,
  settingsLabel = "Edit Settings",
  settingsDisabled = false,
  onPublish,
  isPublishing = false,
  publishLabel = "Publish",
  publishingLabel = "Publishing...",
  publishedLabel = "Published",
  isPublished = false,
  blockListOpen,
  onToggleBlockList,
}: StickybarTopRightActionsProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const activeItem = filterMenu?.items.find((item) => item.value === filterMenu.value) ?? filterMenu?.items[0]

  return (
    <>
      <div className={cn("flex items-center gap-2 [&_[data-slot=button]]:h-8", className)}>
        {saveMessage ? (
          <div className="hidden sm:block">
            <SaveStatusBadge message={saveMessage} />
          </div>
        ) : null}

        {preActions}

        {search ? (
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="sm:hidden" aria-label="Search" title="Search">
                  <Search className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search.value}
                    onChange={(event) => search.onValueChange(event.target.value)}
                    placeholder={search.placeholder ?? "Search"}
                    className="h-9 pl-8"
                  />
                </div>
              </PopoverContent>
            </Popover>
            <div className="relative hidden sm:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search.value}
                onChange={(event) => search.onValueChange(event.target.value)}
                placeholder={search.placeholder ?? "Search"}
                className="h-9 w-44 pl-8 sm:w-56"
              />
            </div>
          </>
        ) : null}

        {filterMenu && activeItem ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label="Change dashboard view" title={activeItem.label}>
                {activeItem.icon ? (
                  <activeItem.icon className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ListFilter className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="hidden sm:inline">{activeItem.label}</span>
                <ChevronDown className="hidden h-4 w-4 opacity-60 sm:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40 space-y-1">
              {filterMenu.items.map((item) => (
                <DropdownMenuItem
                  key={item.value}
                  onSelect={() => filterMenu.onValueChange(item.value)}
                  className={cn(item.value === filterMenu.value && "bg-accent text-accent-foreground")}
                >
                  {item.icon ? <item.icon className="h-4 w-4 text-muted-foreground" /> : null}
                  <span>{item.label}</span>
                  {item.count !== undefined ? (
                    <span className="ml-auto text-muted-foreground">{item.count}</span>
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {rightActions}

        {viewPageHref ? (
          <Button variant="outline" size="sm" asChild>
            <a href={viewPageHref} target="_blank" rel="noopener noreferrer" aria-label="View Page" title="View Page">
              <ExternalLink className="h-4 w-4" />
              <span className="hidden sm:inline">View Page</span>
            </a>
          </Button>
        ) : null}

        {renderSettingsModal ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSettingsOpen(true)}
            disabled={settingsDisabled}
            aria-label={settingsLabel}
            title={settingsLabel}
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">{settingsLabel}</span>
          </Button>
        ) : null}

        {onSave ? (
          <Button
            size="sm"
            variant={saveVariant}
            onClick={onSave}
            disabled={isSaving}
            aria-label={saveLabel}
            title={saveLabel}
          >
            <Save className="h-4 w-4" />
            <span className="hidden sm:inline">{isSaving ? savingLabel : saveLabel}</span>
          </Button>
        ) : null}

        {onPublish ? (
          <Button
            size="sm"
            onClick={onPublish}
            disabled={isPublishing || isSaving}
            aria-label={publishLabel}
            title={publishLabel}
          >
            <span className="hidden sm:inline">
              {isPublishing ? publishingLabel : isPublished ? publishedLabel : publishLabel}
            </span>
            <span className="sm:hidden">
              {isPublishing ? "..." : isPublished ? "On" : "Go"}
            </span>
          </Button>
        ) : null}

        {onToggleBlockList ? (
          <button
            type="button"
            onClick={onToggleBlockList}
            aria-label={blockListOpen ? "Hide block list" : "Show block list"}
            title={blockListOpen ? "Hide block list" : "Show block list"}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md bg-muted text-sm font-medium transition-colors hover:bg-muted-foreground/10"
          >
            {blockListOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRight className="h-3.5 w-3.5" />}
          </button>
        ) : null}
      </div>

      {renderSettingsModal?.(settingsOpen, setSettingsOpen)}
    </>
  )
}
