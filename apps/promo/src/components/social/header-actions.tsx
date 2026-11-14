import * as React from "react"
import { createPortal } from "react-dom"

/**
 * Where a list's own buttons go: the right end of the middle header above it,
 * beside the tabs, rather than a row of their own under it (Tyler, 14 Nov
 * 2026, with a picture of Post ideas and New post on a row under a network's
 * Posts tabs, an arrow pointing at the header). The module that draws the
 * header provides the element; null until the header has mounted.
 */
const HeaderActionsContext = React.createContext<{ element: HTMLElement | null } | null>(null)

/** Gives the lists under it the header's element to draw their buttons into. */
export function HeaderActionsProvider({ value, children }: { value: { element: HTMLElement | null }; children: React.ReactNode }) {
  return <HeaderActionsContext.Provider value={value}>{children}</HeaderActionsContext.Provider>
}

/** Draws its buttons in the header above; with no header to draw into, as a row of their own. */
export function HeaderActions({ children }: { children: React.ReactNode }) {
  const slot = React.useContext(HeaderActionsContext)
  if (!slot) return <div className="flex h-11 shrink-0 items-center justify-end gap-2 border-b px-3">{children}</div>
  if (!slot.element) return null
  return createPortal(children, slot.element)
}
