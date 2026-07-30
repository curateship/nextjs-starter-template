import * as React from "react"

import { cn } from "@/lib/utils"

// Directory carve-out (recorded in task 01): this file keeps directory's card
// GEOMETRY — padding lives in CardHeader/CardContent (not on the card), the
// header is a flex column, CardContent is a `grid gap-4`, and CardGroup has no
// display of its own. ~200 call sites (full-bleed dashboard cards, settings
// forms, modal bodies) are built against this contract; custom-shell's card
// anatomy (py-4/gap-4 card, grid header, bare px content) belongs to a
// screen-by-screen visual sweep, not a primitive swap. The adjustable border
// is drawn by the runtime styling rules in styles.css, not by the primitive.

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="card" className={cn("text-card-foreground rounded-md bg-card", className)} {...props} />
  )
)
Card.displayName = "Card"

// CardGroup — wraps a grid or flex of Card elements and applies consistent responsive gap between them
const CardGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, style, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card-group"
      className={cn(className)}
      // Gap between cards tracks the content-spacing setting via --shell-gutter.
      // Inside a modal the dialog surface sets --card-group-gap to the modal's
      // own Inner-spacing, so modal cards space by the modal setting instead.
      style={{ gap: "var(--card-group-gap, var(--shell-gutter, 0.75rem))", ...style }}
      {...props}
    />
  )
)
CardGroup.displayName = "CardGroup"

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="card-header" className={cn("flex flex-col space-y-1 p-4 pb-3", className)} {...props} />
  )
)
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="card-title" className={cn("font-semibold leading-none tracking-tight", className)} {...props} />
  )
)
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="card-description" className={cn("text-muted-foreground text-sm", className)} {...props} />
  )
)
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="card-content" className={cn("grid gap-4 p-4 not-first:pt-0", className)} {...props} />
  )
)
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} data-slot="card-footer" className={cn("flex items-center p-6 pt-0", className)} {...props} />
)
CardFooter.displayName = "CardFooter"

export { Card, CardGroup, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
