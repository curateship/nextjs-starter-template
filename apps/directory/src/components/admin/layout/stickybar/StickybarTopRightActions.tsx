"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { LucideIcon } from "lucide-react"
import Save from "lucide-react/dist/esm/icons/save.js"
import Settings from "lucide-react/dist/esm/icons/settings.js"
import PanelRight from "lucide-react/dist/esm/icons/panel-right.js"
import PanelRightClose from "lucide-react/dist/esm/icons/panel-right-close.js"
import CheckCircle from "lucide-react/dist/esm/icons/circle-check-big.js"
import AlertCircle from "lucide-react/dist/esm/icons/circle-alert.js"
import LoaderCircle from "lucide-react/dist/esm/icons/loader-circle.js"
import ExternalLink from "lucide-react/dist/esm/icons/external-link.js"
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down.js"
import Search from "lucide-react/dist/esm/icons/search.js"
import ListFilter from "lucide-react/dist/esm/icons/list-filter.js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { getSaveStatusLabel, isSaveStatusVisible, type SaveStatus, type VisibleSaveStatusState } from "@/components/admin/layout/builder/save-status"
import { cn } from "@/lib/utils/tailwind"

interface DashboardHeaderActionsSlotContextValue {
  slot: HTMLDivElement | null
  setSlot: (slot: HTMLDivElement | null) => void
  mobileOverflowSlot: HTMLDivElement | null
  setMobileOverflowSlot: (slot: HTMLDivElement | null) => void
}

interface SaveStatusBadgeProps {
  status: SaveStatus | null | undefined
  compact?: boolean
}

const DashboardHeaderActionsSlotContext = createContext<DashboardHeaderActionsSlotContextValue | null>(null)

const SAVE_STATUS_BADGE_STYLES: Record<VisibleSaveStatusState, {
  icon: LucideIcon
  container: string
  iconClassName: string
  textClassName: string
}> = {
  dirty: {
    icon: AlertCircle,
    container: "border-amber-200 bg-amber-50",
    iconClassName: "text-amber-600",
    textClassName: "text-amber-800",
  },
  saving: {
    icon: LoaderCircle,
    container: "border-blue-200 bg-blue-50",
    iconClassName: "animate-spin text-blue-600",
    textClassName: "text-blue-800",
  },
  saved: {
    icon: CheckCircle,
    container: "border-green-200 bg-green-50",
    iconClassName: "text-green-600",
    textClassName: "text-green-700",
  },
  error: {
    icon: AlertCircle,
    container: "border-red-200 bg-red-50",
    iconClassName: "text-red-600",
    textClassName: "text-red-800",
  },
}

interface StickybarFilterMenuItem {
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
  const [mobileOverflowSlot, setMobileOverflowSlot] = useState<HTMLDivElement | null>(null)

  return (
    <DashboardHeaderActionsSlotContext.Provider value={{ slot, setSlot, mobileOverflowSlot, setMobileOverflowSlot }}>
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

function SaveStatusBadge({ status, compact = false }: SaveStatusBadgeProps) {
  if (!isSaveStatusVisible(status)) return null

  const label = getSaveStatusLabel(status)
  const style = SAVE_STATUS_BADGE_STYLES[status.state]
  const Icon = style.icon

  return (
    <div
      role={status.state === "error" ? "alert" : "status"}
      aria-live={status.state === "error" ? "assertive" : "polite"}
      title={status.message || label}
      className={cn(
        "flex items-center gap-2 rounded-md border",
        compact ? "max-w-40 px-2 py-1" : "px-3 py-1.5",
        style.container
      )}
    >
      <Icon className={cn(
        "h-4 w-4 shrink-0",
        style.iconClassName
      )} />
      <span className={cn(
        "truncate text-sm font-medium",
        style.textClassName
      )}>
        {label}
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
  saveStatus?: SaveStatus | null
  isSaving?: boolean
  onSave?: () => void
  saveDisabled?: boolean
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
  saveStatus,
  isSaving = false,
  onSave,
  saveDisabled = false,
  saveLabel = "Save",
  savingLabel = "Saving...",
  saveVariant = "default",
  renderSettingsModal,
  settingsLabel = "Edit Settings",
  settingsDisabled = false,
  onPublish,
  isPublishing = false,
  publishLabel = "Publish",
  publishingLabel = "Publishing...",
  isPublished = false,
  blockListOpen,
  onToggleBlockList,
}: StickybarTopRightActionsProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openedDesktopBlockList = useRef(false)
  const activeItem = filterMenu?.items.find((item) => item.value === filterMenu.value) ?? filterMenu?.items[0]
  const { mobileOverflowSlot } = useDashboardHeaderActionsSlot()
  const hasMobileOverflow = Boolean(search || preActions || filterMenu || rightActions || viewPageHref || renderSettingsModal || (onPublish && !isPublished) || onToggleBlockList)
  const mobileMenuItemClassName = "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"

  useEffect(() => {
    if (!onToggleBlockList || blockListOpen || openedDesktopBlockList.current) return
    if (!window.matchMedia("(min-width: 1024px)").matches) return

    openedDesktopBlockList.current = true
    onToggleBlockList()
  }, [blockListOpen, onToggleBlockList])

  const renderSaveButton = (showLabel: boolean) => (
    <Button
      size="sm"
      variant={saveVariant}
      onClick={onSave}
      disabled={isSaving || saveDisabled}
      aria-label={saveLabel}
      title={saveLabel}
      className={!showLabel ? "inline-flex" : undefined}
    >
      <Save className="h-4 w-4" />
      {showLabel ? <span>{isSaving ? savingLabel : saveLabel}</span> : null}
    </Button>
  )

  return (
    <>
      <div className={cn("hidden items-center gap-2 **:data-[slot=button]:h-8 sm:flex", className)}>
        {isSaveStatusVisible(saveStatus) ? (
          <div className="hidden sm:block">
            <SaveStatusBadge status={saveStatus} />
          </div>
        ) : null}

        {preActions}

        {search ? (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search.value}
              onChange={(event) => search.onValueChange(event.target.value)}
              placeholder={search.placeholder ?? "Search"}
              className="h-8 w-44 pl-8 sm:w-56"
            />
          </div>
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
          renderSaveButton(true)
        ) : null}

        {onPublish && !isPublished ? (
          <Button
            size="sm"
            onClick={onPublish}
            disabled={isPublishing || isSaving}
            aria-label={publishLabel}
            title={publishLabel}
          >
            {isPublishing ? publishingLabel : publishLabel}
          </Button>
        ) : null}

        {onToggleBlockList ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onToggleBlockList}
            aria-label={blockListOpen ? "Hide block list" : "Show block list"}
            title={blockListOpen ? "Hide block list" : "Show block list"}
          >
            {blockListOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
          </Button>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:hidden">
        <SaveStatusBadge status={saveStatus} compact />

        {onSave ? (
          renderSaveButton(false)
        ) : null}
      </div>

      {mobileOverflowSlot && hasMobileOverflow ? createPortal(
        <div className="space-y-1">
          {preActions ? <div className="px-1 py-1 **:data-[slot=button]:h-8">{preActions}</div> : null}

          {search ? (
            <div className="px-1 py-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-start" aria-label="Search" title="Search">
                    <Search className="h-4 w-4" />
                    Search
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
            </div>
          ) : null}

          {filterMenu && activeItem ? (
            <div className="px-1 py-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-start" aria-label="Change dashboard view" title={activeItem.label}>
                    {activeItem.icon ? (
                      <activeItem.icon className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ListFilter className="h-4 w-4 text-muted-foreground" />
                    )}
                    {activeItem.label}
                    <ChevronDown className="ml-auto h-4 w-4 opacity-60" />
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
            </div>
          ) : null}

          {rightActions ? <div className="px-1 py-1 **:data-[slot=button]:h-8">{rightActions}</div> : null}

          {viewPageHref ? (
            <a
              href={viewPageHref}
              target="_blank"
              rel="noopener noreferrer"
              className={mobileMenuItemClassName}
            >
              <ExternalLink className="h-4 w-4" />
              View Page
            </a>
          ) : null}

          {renderSettingsModal ? (
            <button
              type="button"
              className={mobileMenuItemClassName}
              disabled={settingsDisabled}
              onClick={() => {
                setSettingsOpen(true)
              }}
            >
              <Settings className="h-4 w-4" />
              {settingsLabel}
            </button>
          ) : null}

          {onPublish && !isPublished ? (
            <button
              type="button"
              className={mobileMenuItemClassName}
              disabled={isPublishing || isSaving}
              onClick={() => {
                void onPublish()
              }}
            >
              {isPublishing ? publishingLabel : publishLabel}
            </button>
          ) : null}

          {onToggleBlockList ? (
            <button
              type="button"
              className={mobileMenuItemClassName}
              onClick={() => {
                onToggleBlockList()
              }}
            >
              {blockListOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
              {blockListOpen ? "Hide block list" : "Show block list"}
            </button>
          ) : null}

          <div className="-mx-1 my-1 h-px bg-muted" />
        </div>,
        mobileOverflowSlot
      ) : null}

      {renderSettingsModal?.(settingsOpen, setSettingsOpen)}
    </>
  )
}
