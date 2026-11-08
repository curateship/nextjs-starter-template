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
 * Every three-panel screen opens its side panels at the narrowest they can
 * be dragged to (Tyler, 31 Oct 2026: "The default width needs to be the
 * narrowest width the panel have"). A remembered layout outranks the default,
 * so the three-panel keys below carry a number, bumped that day so browsers
 * holding the old widths start from the new ones. Bump it again whenever a
 * default moves.
 *
 * A dashboard column takes the cards that are in it, because a layout saved for
 * three cards cannot be applied to two — the card that comes and goes would
 * leave the others sized for a divider that is no longer there — nor to three
 * different cards, which is what arranging the Overview's widgets produces.
 */
export const panelLayoutKey = {
  automationEditorHorizontal: "automation-editor-horizontal-2",
  automationEditorVertical: "automation-editor-vertical",
  // One key, not two: the CRM has no bottom panel, so there is no second
  // group whose height needs remembering.
  //
  // The number is deliberate. A remembered layout outranks the default, so a
  // browser that had already drawn the old proportions would keep them and
  // the new ones would appear to do nothing. Changing the key abandons the
  // old widths, which is right: they were measured against a layout that no
  // longer exists. Bump it again the next time the defaults move.
  // 4 from 7 Nov 2026: the CRM moved onto `ThreePanels` (the Admin 3 panel
  // design), the left a page, the inbox in the middle, the conversation on
  // the right, each side at its narrowest 16%.
  crmWorkspace: "crm-workspace-horizontal-4",
  // Not a layout: where the CRM dashboard was, for `useDashboardPlace`. Every
  // `ThreePanels` screen has one, named `…Place`. All three CRM tabs share it,
  // so a bare `/admin/crm` goes back to the tab last open.
  crmPlace: "crm-workspace-place",
  // One key: the front page editor has no bottom panel, so there is no second
  // group whose height needs remembering.
  frontPageEditor: "front-page-editor-horizontal-2",
  dashboardColumns: (page: string) => `custom-shell-${page}-columns`,
  dashboardColumn: (page: string, side: "left" | "right", cards: string) =>
    `custom-shell-${page}-${side}-${cards}`,
}
