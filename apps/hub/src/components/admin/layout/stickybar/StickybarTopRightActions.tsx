"use client"

import { useState } from "react"
import { Save, Settings, PanelRight, PanelRightClose, CheckCircle, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils/tailwind"

interface SaveStatusBadgeProps {
  message: string | null | undefined
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
  rightActions?: React.ReactNode
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
  rightActions,
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
        {rightActions}

        {saveMessage ? (
          <div className="hidden sm:block">
            <SaveStatusBadge message={saveMessage} />
          </div>
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
