import * as React from "react"

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

/**
 * The card every chart sits in: a hairline header row with a bordered icon
 * chip, the title in the shared heading font, and whatever belongs on the
 * right — so a chart card matches every other admin card rather than being a
 * second look.
 */

export function ChartCard({
  icon: Icon,
  title,
  meta,
  legend,
  control,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  /** A quiet line of context on the right — a date range, a running total. */
  meta?: React.ReactNode
  legend?: React.ReactNode
  control?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn("flex min-w-0 flex-col gap-0 py-0", className)}>
      <CardHeader className="min-h-14 items-center gap-2 border-b pt-4 has-data-[slot=card-action]:grid-cols-1 sm:px-5 sm:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
        <CardTitle className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/40"
            aria-hidden
          >
            <Icon className="size-4 text-muted-foreground" />
          </span>
          <span className="truncate">{title}</span>
        </CardTitle>
        {meta || legend || control ? (
          <CardAction className="col-start-1 row-start-2 flex min-w-0 items-center gap-3 self-center justify-self-start sm:col-start-2 sm:row-start-1 sm:justify-self-end sm:gap-4">
            {meta ? (
              <span className="min-w-0 truncate text-xs font-normal text-muted-foreground">
                {meta}
              </span>
            ) : null}
            {legend}
            {control}
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 py-4 sm:px-5 sm:py-5">
        {children}
      </CardContent>
    </Card>
  )
}

export function LegendDot({
  colour,
  label,
}: {
  colour: string
  label: string
}) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span
        className="size-2 shrink-0 rounded-full sm:size-2.5"
        style={{ backgroundColor: colour }}
        aria-hidden
      />
      <span className="text-[10px] text-muted-foreground sm:text-xs">
        {label}
      </span>
    </span>
  )
}

export function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[144px] items-center justify-center">
      <p className="text-center text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
