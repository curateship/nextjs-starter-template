import * as React from "react"

import { PanelCard } from "@/components/shared/panel-card"
import { cn } from "@/lib/utils"

/** True inside a dropdown, where a group is a heading and its rows, never a grey card. */
const Flat = React.createContext(false)

/**
 * Draws the phone sections inside it as flat groups: the phone's Settings
 * in its ⋮ (Tyler, 12 Nov 2026: "unacceptable Ui", of grey cards inside the
 * dropdown, then "some can stay in the 3 dot and some can move into blocks").
 */
export function FlatSections({ children }: { children: React.ReactNode }) {
  return <Flat.Provider value>{children}</Flat.Provider>
}

/**
 * One group of a phone's sections (Settings, Setup, Health, Actions,
 * History): the side panel's grey `PanelCard` on the right panel, or, inside
 * a `FlatSections`, the ⋮'s settings look.
 */
export function PhoneSectionCard({
  storageId,
  title,
  meta,
  className,
  children,
}: {
  storageId: string
  title: string
  meta?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  const flat = React.useContext(Flat)
  if (!flat) {
    return (
      <PanelCard storageId={storageId} title={title} meta={meta} className={className}>
        {children}
      </PanelCard>
    )
  }
  // The ⋮'s settings look (Tyler, 12 Nov 2026: "the settings should use this ui", then "not just settings,
  // all toggles"): `PickGroup`'s small heading over a light grey rounded box. A list that runs to the card's
  // edges (`-mx-4 -mb-4 border-t`) runs to the box's, its first row at the top.
  return (
    <section className="grid min-w-0 gap-2" aria-label={title}>
      <h3 className={cn("px-0.5 text-sm font-medium text-muted-foreground", className?.includes("destructive") && "text-destructive")}>
        {title}
        {meta ? <span className="font-normal"> · {meta}</span> : null}
      </h3>
      <div
        className={cn(
          "grid min-w-0 gap-3 overflow-hidden rounded-xl border bg-muted/50 p-4 text-sm",
          "[&>.border-t:first-child]:-mt-4 [&>.border-t:first-child]:border-t-0",
          className?.includes("destructive") && "border-destructive/50"
        )}
      >
        {children}
      </div>
    </section>
  )
}
