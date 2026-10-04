import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * One icon button in a social panel's header row.
 *
 * Icon-only, so the label is both the accessible name and the tooltip — the
 * UI standard for an icon button outside a repeated table row. `busy` swaps
 * the icon for the shared spinner and stops a second press, which is what a
 * header button that asks the server again needs.
 */
export function PanelHeaderButton({
  label,
  icon,
  pressed,
  busy,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  pressed?: boolean
  busy?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={label}
          aria-pressed={pressed}
          disabled={busy}
          onClick={onClick}
        >
          {busy ? <Loader2Icon className="animate-spin" /> : icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
