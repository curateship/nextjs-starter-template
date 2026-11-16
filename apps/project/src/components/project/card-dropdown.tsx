import type * as React from "react"

/**
 * A small dropdown's heading, 15px, as the cards' own: New milestone's. The
 * icon that opened such a dropdown from a card (`CardDropdown`) went with the
 * milestone rows' cogs when Milestones became a dashboard (16 Nov 2026).
 */
export function CardDropdownTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[15px] font-semibold">{children}</h3>
}
