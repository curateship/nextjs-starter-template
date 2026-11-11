import { EllipsisVerticalIcon, EyeIcon, EyeOffIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { showErrorToast } from "@/lib/toast/error-toast"
import { TRADES_POPOVER_COLUMNS, type TradesPopoverKind } from "@/lib/trade/trades-popover-columns"

/**
 * The trades popover's ⋮, before its Pin (Tyler, 10 Nov 2026: "add a 3 dot
 * dropdown here with options to hide certain col"). Each column is a row with
 * an open eye while it shows and an eye with a slash while it is hidden, drawn
 * as the Trade blocks' column rows are; a press swaps it and the menu stays
 * open for the next.
 */
export function TradeColumnsMenu({
  kind,
  hidden,
  onChange,
}: {
  kind: TradesPopoverKind
  hidden: readonly string[]
  onChange: (hidden: string[]) => void
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Columns">
              <EllipsisVerticalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Columns</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Columns</DropdownMenuLabel>
        {TRADES_POPOVER_COLUMNS[kind].map((column) => {
          const isHidden = hidden.includes(column.key)
          const Icon = isHidden ? EyeOffIcon : EyeIcon
          return (
            <DropdownMenuItem
              key={column.key}
              aria-label={`${isHidden ? "Show" : "Hide"} ${column.label}`}
              onSelect={(event) => {
                event.preventDefault()
                // A backtest's table has no column that always shows, so the
                // last one showing stays and says why. (A bot's Closed always
                // shows, so it never gets here.)
                const showing = TRADES_POPOVER_COLUMNS[kind].filter((one) => !hidden.includes(one.key))
                if (!isHidden && kind === "backtest" && showing.length === 1) {
                  showErrorToast("Keep at least one column showing.")
                  return
                }
                onChange(isHidden ? hidden.filter((key) => key !== column.key) : [...hidden, column.key])
              }}
            >
              <span className={isHidden ? "min-w-0 flex-1 truncate text-muted-foreground" : "min-w-0 flex-1 truncate"}>
                {column.label}
              </span>
              <Icon className="ml-auto size-4 text-muted-foreground" />
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
