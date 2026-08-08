import * as React from "react"
import type { Layout } from "react-resizable-panels"

import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"

/**
 * Where this browser last left the dividers of a resizable panel group.
 *
 * Spread the three values it returns onto the group: `key` so the group is
 * built once with the saved layout already in hand rather than rebuilt on
 * screen a beat later, `defaultLayout` as the starting point, and
 * `onLayoutChanged` to write every drag back.
 *
 * localStorage is only readable after hydration — the server has none, and
 * reading it during the first render would make the two renders disagree — so
 * the saved layout lands via state, before the paint.
 *
 * The layout is saved per browser, not per account. Every key belongs in
 * `panelLayoutKey` below so they cannot collide or drift.
 */
export function useRememberedPanelLayout(key: string) {
  const [defaultLayout, setDefaultLayout] = React.useState<Layout>()
  const [loaded, setLoaded] = React.useState(false)

  useEffectBeforePaint(() => {
    try {
      const saved = localStorage.getItem(key)
      setDefaultLayout(saved ? (JSON.parse(saved) as Layout) : undefined)
    } catch {
      setDefaultLayout(undefined)
    } finally {
      setLoaded(true)
    }
  }, [key])

  const onLayoutChanged = React.useCallback(
    (layout: Layout) => {
      if (!loaded) return
      try {
        localStorage.setItem(key, JSON.stringify(layout))
      } catch {
        // Storage may be blocked; resizing still works for this session.
      }
    },
    [key, loaded]
  )

  return {
    defaultLayout,
    onLayoutChanged,
    layoutKey: loaded ? JSON.stringify(defaultLayout ?? {}) : "loading",
  }
}

/**
 * Every panel layout this app remembers, in one place.
 *
 * A dashboard column takes the cards that are in it, because a layout saved for
 * three cards cannot be applied to two — the card that comes and goes would
 * leave the others sized for a divider that is no longer there — nor to three
 * different cards, which is what arranging the Overview's widgets produces.
 */
export const panelLayoutKey = {
  automationEditorHorizontal: "automation-editor-horizontal",
  automationEditorVertical: "automation-editor-vertical",
  broadcastEditorHorizontal: "broadcast-editor-horizontal",
  broadcastEditorVertical: "broadcast-editor-vertical",
  // Its own keys, not the newsletter's. The bottom panel holds a different
  // thing and wants a different height, and a newsletter's sizing should not
  // follow you into an email you cannot send.
  systemEmailEditorHorizontal: "system-email-editor-horizontal",
  systemEmailEditorVertical: "system-email-editor-vertical",
  dashboardColumns: (page: string) => `custom-shell-${page}-columns`,
  dashboardColumn: (page: string, side: "left" | "right", cards: string) =>
    `custom-shell-${page}-${side}-${cards}`,
}
