"use client"

import { createPortal } from "react-dom"
import { StickybarTopRightActions, type StickybarFilterMenuConfig, type StickybarSearchConfig, useDashboardHeaderActionsSlot } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { cn } from "@/lib/utils/tailwind"

interface DashboardSubheaderProps {
  /** Deprecated breadcrumb trail kept for existing call sites. */
  items: Array<{ label: React.ReactNode; href?: string }>
  /** Filter dropdown rendered in the sticky header actions */
  filterMenu?: StickybarFilterMenuConfig
  /** Search input rendered before other dashboard controls */
  search?: StickybarSearchConfig
  /** Optional content rendered before the filter menu (e.g. search inputs) */
  preActions?: React.ReactNode
  /** Optional right-side content (buttons, etc.) */
  actions?: React.ReactNode
  saveMessage?: string | null
  isSaving?: boolean
  onSave?: () => void
  saveDisabled?: boolean
  saveLabel?: string
  savingLabel?: string
  saveVariant?: "outline" | "default"
  /** Optional content rendered below the StickyHeader */
  rightContent?: React.ReactNode
  className?: string
}

/**
 * Dashboard controls are rendered into the StickyHeader top-right slot.
 */
export function DashboardSubheader({
  filterMenu,
  search,
  preActions,
  actions,
  saveMessage,
  isSaving,
  onSave,
  saveDisabled,
  saveLabel,
  savingLabel,
  saveVariant,
  rightContent,
  className
}: DashboardSubheaderProps) {
  const { slot } = useDashboardHeaderActionsSlot()
  const topRightActions = (search || filterMenu || preActions || actions || onSave || saveMessage) ? (
    <StickybarTopRightActions
      className="gap-1"
      search={search}
      preActions={preActions}
      filterMenu={filterMenu}
      rightActions={actions}
      saveMessage={saveMessage}
      isSaving={isSaving}
      onSave={onSave}
      saveDisabled={saveDisabled}
      saveLabel={saveLabel}
      savingLabel={savingLabel}
      saveVariant={saveVariant}
    />
  ) : null

  return (
    <>
      {slot && topRightActions ? createPortal(topRightActions, slot) : null}

      {rightContent ? (
        <div className={cn("flex max-w-full overflow-x-auto", className)}>
          {rightContent}
        </div>
      ) : null}
    </>
  )
}
