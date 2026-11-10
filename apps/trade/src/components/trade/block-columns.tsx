import * as React from "react"
import { EyeIcon, EyeOffIcon } from "lucide-react"

import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import {
  HIDEABLE_COLUMNS,
  HIDEABLE_COLUMN_LABEL,
  type HiddenBlockColumns,
  type HideableColumn,
  type TradeTableBlock,
} from "@/lib/trade/block-columns"

/**
 * Hiding columns in the Manual, Grid and DCA trades blocks from each block's
 * ⋮ (Tyler, 10 Nov 2026). The dashboard holds every block's choice and saves
 * it; each block hands its own list to the table inside it, so the table and
 * its totals row drop the same columns.
 */

type BlockColumns = {
  hidden: HiddenBlockColumns
  change: (block: TradeTableBlock, columns: HideableColumn[]) => void
}

const BlockColumnsContext = React.createContext<BlockColumns | null>(null)

export function BlockColumnsProvider({
  value,
  children,
}: {
  value: BlockColumns
  children: React.ReactNode
}) {
  return <BlockColumnsContext.Provider value={value}>{children}</BlockColumnsContext.Provider>
}

const NONE: readonly HideableColumn[] = []
const BlockHiddenColumnsContext = React.createContext<readonly HideableColumn[]>(NONE)

/** Hands the block's own hidden columns to the table drawn inside it. */
export function BlockHiddenColumns({
  block,
  children,
}: {
  block: TradeTableBlock
  children: React.ReactNode
}) {
  const columns = React.useContext(BlockColumnsContext)?.hidden[block] ?? NONE
  return (
    <BlockHiddenColumnsContext.Provider value={columns}>{children}</BlockHiddenColumnsContext.Provider>
  )
}

/** Whether a column shows in the table's block. Outside a block, every column shows. */
export function useShownColumns() {
  const hidden = React.useContext(BlockHiddenColumnsContext)
  return React.useCallback((column: HideableColumn) => !hidden.includes(column), [hidden])
}

/**
 * The block's ⋮ rows, as the Protocols block's: each column with an open eye
 * while it shows and an eye with a slash while it is hidden. One press swaps
 * it and the menu stays open for the next.
 */
export function BlockColumnsMenuRows({ block }: { block: TradeTableBlock }) {
  const columns = React.useContext(BlockColumnsContext)
  if (!columns) return null
  const hidden = columns.hidden[block] ?? NONE
  return (
    <>
      {HIDEABLE_COLUMNS.map((column) => {
        const isHidden = hidden.includes(column)
        const Icon = isHidden ? EyeOffIcon : EyeIcon
        const label = HIDEABLE_COLUMN_LABEL[column]
        return (
          <DropdownMenuItem
            key={column}
            aria-label={`${isHidden ? "Show" : "Hide"} ${label}`}
            onSelect={(event) => {
              event.preventDefault()
              columns.change(
                block,
                isHidden ? hidden.filter((id) => id !== column) : [...hidden, column]
              )
            }}
          >
            <span className={isHidden ? "min-w-0 flex-1 truncate text-muted-foreground" : "min-w-0 flex-1 truncate"}>
              {label}
            </span>
            <Icon className="ml-auto size-4 text-muted-foreground" />
          </DropdownMenuItem>
        )
      })}
    </>
  )
}
