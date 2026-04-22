"use client"

import { createContext, useContext, useState } from "react"
import { type LucideIcon, Save, Settings, PanelRight, PanelRightClose, CheckCircle, AlertCircle, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils/tailwind"

interface DashboardHeaderActionsSlotContextValue {
  slot: HTMLDivElement | null
  setSlot: (slot: HTMLDivElement | null) => void
}

interface SaveStatusBadgeProps {
  message: string | null | undefined
}

const DashboardHeaderActionsSlotContext = createContext<DashboardHeaderActionsSlotContextValue | null>(null)

export interface StickybarTab {
  value: string
  label: string
  icon?: LucideIcon
  count?: number
}

export interface StickybarTabsConfig {
  value: string
  onValueChange: (value: string) => void
  items: StickybarTab[]
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
  preActions?: React.ReactNode
  tabs?: StickybarTabsConfig
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
  preActions,
  tabs,
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

  return (
    <>
      <div className={cn("flex items-center gap-2", className)}>
        {preActions}

        {tabs ? (
          <Tabs value={tabs.value} onValueChange={tabs.onValueChange}>
            <TabsList>
              {tabs.items.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.icon ? <tab.icon className="mr-1.5 h-3.5 w-3.5" /> : null}
                  {tab.label}
                  {tab.count !== undefined ? ` (${tab.count})` : ""}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : null}

        {rightActions}

        {saveMessage ? (
          <div className="hidden sm:block">
            <SaveStatusBadge message={saveMessage} />
          </div>
        ) : null}

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
