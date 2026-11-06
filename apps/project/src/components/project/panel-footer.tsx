import * as React from "react"

import { ScrollArea } from "@/components/ui/scroll-area"

/**
 * A side panel's footer of folding cards, as the site admin's My dashboard
 * and the project page draw it (Tyler, 6 Nov 2026; the skill
 * `.agents/skills/Design/admin-3-panel-design`). It sits under the panel's
 * body, which takes `PANEL_BODY_ABOVE_FOOTER`: the footer takes what its cards
 * need and only scrolls once the panel is full. Each child is one card,
 * drawn in its own rounded light grey box, 10px apart and from the panel's
 * edges ("the gutter needs to be the same size", then "reduce the gutter a
 * bit"). A card that draws nothing leaves no empty box. Light inner boxes,
 * such as the Daily card's sections, turn white inside ("bg white").
 */
export function PanelFooter({ children }: { children: React.ReactNode }) {
  return (
    <footer className="relative flex min-h-0 flex-col">
      <ScrollArea className="min-h-0">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 p-2.5">
          {React.Children.map(children, (card) =>
            card ? (
              <div className="grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-2xl bg-muted/50 empty:hidden [&_[data-daily-section]]:bg-background">
                {card}
              </div>
            ) : null
          )}
        </div>
      </ScrollArea>
    </footer>
  )
}
