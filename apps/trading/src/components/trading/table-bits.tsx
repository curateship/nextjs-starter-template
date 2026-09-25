import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  STICKY_SCROLL_OVERRIDES,
  STICKY_TABLE_HEADER,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

/** Sticky-header table inside a full-height scroll area (bottom panels). */
export function StickyTable({
  headers,
  children,
}: {
  headers: string[]
  children: React.ReactNode
}) {
  return (
    <ScrollArea className={cn("h-full", STICKY_SCROLL_OVERRIDES)}>
      <Table>
        <TableHeader className={STICKY_TABLE_HEADER}>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </ScrollArea>
  )
}

/**
 * Centered empty message for a terminal panel. The optional hint is a quieter
 * second line naming the next step — kept fainter than the message so an empty
 * panel never reads as an alert in a screen traders stare at all day.
 */
export function EmptyState({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center text-xs text-muted-foreground">
      <span>{text}</span>
      {hint ? <span className="text-muted-foreground/70">{hint}</span> : null}
    </div>
  )
}

/** Monospace numeric cell. */
export function MonoCell({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <TableCell className={cn("font-mono tabular-nums", className)}>
      {children}
    </TableCell>
  )
}

/** Compact timestamp cell; time-only for intraday tables, full for histories. */
export function TimeCell({
  time,
  full,
}: {
  time: number | string
  full?: boolean
}) {
  const date = new Date(time)
  return (
    <TableCell className="font-mono text-[11px] tabular-nums">
      {full
        ? date.toLocaleString("en-US", { hour12: false })
        : date.toLocaleTimeString("en-US", { hour12: false })}
    </TableCell>
  )
}

/** Green/red cell keyed on buy vs sell. */
export function SideCell({
  isBuy,
  children,
}: {
  isBuy: boolean
  children: React.ReactNode
}) {
  return (
    <TableCell className={cn(isBuy ? "text-emerald-600" : "text-red-500")}>
      {children}
    </TableCell>
  )
}

/** Realized-PnL cell: green when positive, red when negative, "—" when zero. */
export function ClosedPnlCell({ value }: { value: number }) {
  return (
    <MonoCell
      className={
        value > 0 ? "text-emerald-600" : value < 0 ? "text-red-500" : undefined
      }
    >
      {value !== 0 ? value.toFixed(2) : "—"}
    </MonoCell>
  )
}

/** Compact row-action button with a spinner while its action is running. */
export function RowActionButton({
  busy,
  disabled,
  onClick,
  children,
}: {
  busy?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-6 px-2 text-[11px]"
      disabled={disabled}
      onClick={onClick}
    >
      {busy ? <Loader2Icon className="size-3 animate-spin" /> : null}
      {children}
    </Button>
  )
}
