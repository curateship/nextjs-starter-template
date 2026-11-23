import {
  ChevronsDownIcon,
  ChevronsUpIcon,
  PanelLeftDashedIcon,
  PanelLeftIcon,
  PanelRightDashedIcon,
  PanelRightIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import type { PanelSide } from "@/lib/panel-collapse"

/**
 * The glyph for a panel toggle, shared by every workspace so they can't drift.
 * Plain panel outlines instead of arrow-in-a-box icons: a solid edge means the
 * panel is showing, a dashed edge means it is hidden, so the shape carries the
 * state rather than colour alone.
 */
function PanelToggleIcon({
  side,
  collapsed,
}: {
  side: PanelSide
  collapsed: boolean
}) {
  if (side === "left") {
    return collapsed ? (
      <PanelLeftDashedIcon className="size-4" />
    ) : (
      <PanelLeftIcon className="size-4" />
    )
  }
  if (side === "right") {
    return collapsed ? (
      <PanelRightDashedIcon className="size-4" />
    ) : (
      <PanelRightIcon className="size-4" />
    )
  }
  return collapsed ? (
    <ChevronsUpIcon className="size-4" />
  ) : (
    <ChevronsDownIcon className="size-4" />
  )
}

/**
 * Ghost icon button that hides or shows one workspace panel. 24px and in the
 * normal text colour, the automation activity log's anatomy; group them in a
 * `flex items-center gap-1` row.
 */
export function PanelToggle({
  side,
  collapsed,
  label,
  onClick,
}: {
  side: PanelSide
  collapsed: boolean
  label: string
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      aria-pressed={collapsed}
      title={label}
      onClick={onClick}
    >
      <PanelToggleIcon side={side} collapsed={collapsed} />
    </Button>
  )
}
