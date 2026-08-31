import { Trash2Icon } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type ChartArrowMenuState = {
  x: number
  y: number
}

/** The one-click menu opened beside a fill arrow. */
export function ChartArrowMenu({
  menu,
  onClose,
  onPick,
}: {
  menu: ChartArrowMenuState
  onClose: () => void
  onPick: () => void
}) {
  return (
    <DropdownMenu
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Arrow actions"
          className="pointer-events-none fixed z-50 size-px opacity-0"
          style={{ left: menu.x, top: menu.y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuItem variant="destructive" onSelect={onPick}>
          <Trash2Icon />
          Remove trade
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
