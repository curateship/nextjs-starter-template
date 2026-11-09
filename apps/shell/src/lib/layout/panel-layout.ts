import * as React from "react"
import { useGroupCallbackRef, type Layout } from "react-resizable-panels"

import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"

/**
 * Where this browser last left the dividers of a resizable panel group.
 *
 * Put `groupRef` and `onLayoutChanged` on the group. The group draws its
 * panels at their default sizes, and the saved layout is set on it before the
 * first paint, so nothing is seen moving. The group is never rebuilt to take
 * it: rebuilding meant building every panel and all it holds a second time on
 * arrival, which read each panel's data twice (found by the Admin dashboard's
 * audit, 8 Nov 2026).
 *
 * localStorage is only readable after hydration — the server has none, and
 * reading it during the first render would make the two renders disagree — so
 * the saved layout is set once the group is on screen. A group that shows
 * later, a narrow screen widening say, gets it when it appears.
 *
 * The layout is saved per browser, not per account. Every key belongs in
 * `panelLayoutKey` below so they cannot collide or drift.
 */
export function useRememberedPanelLayout(key: string, defaults?: Layout) {
  const [group, groupRef] = useGroupCallbackRef()
  // The key whose saved layout is on the group now. Nothing is saved for a
  // key until then: a group that adds or drops a panel (Admin's Overview has
  // two, its other sections three) reports its default layout while it
  // settles, and saving that wiped the widths kept for the key it moved to
  // (found by the audit, 8 Nov 2026).
  const [appliedKey, setAppliedKey] = React.useState<string | null>(null)
  // Set once each time the group appears, and once per key: setting it again
  // on a later render would undo a drag.
  const appliedFor = React.useRef<string | null>(null)

  useEffectBeforePaint(() => {
    if (!group) {
      appliedFor.current = null
      return
    }
    if (appliedFor.current === key) return
    appliedFor.current = key
    let saved: Layout | null = null
    try {
      const text = localStorage.getItem(key)
      saved = text ? (JSON.parse(text) as Layout) : null
    } catch {
      // Storage that cannot be read leaves the defaults standing.
    }
    let frame = 0
    let tries = 0
    const apply = () => {
      if (!saved) {
        // A new key with defaults handed in (the side panels' widths from
        // Settings → Styling) moves a group already on screen to them, so a
        // changed width shows at once rather than on the next visit.
        if (defaults) {
          try {
            group.setLayout(defaults)
          } catch {
            // A group still settling keeps the widths it was drawn with.
          }
        }
        setAppliedKey(key)
        return
      }
      try {
        group.setLayout(saved)
        setAppliedKey(key)
      } catch {
        // The group is still registering a panel added or taken away: try
        // again next frame. A layout that never fits (the panels changed for
        // good) leaves the defaults standing after a few tries.
        tries += 1
        if (tries < 20) frame = requestAnimationFrame(apply)
        else setAppliedKey(key)
      }
    }
    apply()
    return () => cancelAnimationFrame(frame)
  }, [key, group])

  const onLayoutChanged = React.useCallback(
    (layout: Layout) => {
      if (appliedKey !== key) return
      try {
        localStorage.setItem(key, JSON.stringify(layout))
      } catch {
        // Storage may be blocked; resizing still works for this session.
      }
    },
    [key, appliedKey]
  )

  return { groupRef, onLayoutChanged }
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
  // `ThreePanels` screen has one, named `…Place`. All the CRM's sections share
  // it, so a bare `/admin/crm` goes back to the section last open.
  crmPlace: "crm-workspace-place",
  // The CRM's Overview, two panels: the left page and the widgets, which take
  // the right panel's room, as Admin's Overview has its own key.
  crmOverview: "crm-overview-horizontal-1",
  // The Admin dashboard (8 Nov 2026): Users, Feedback and Media library as
  // three panels, each side at its narrowest 16%.
  admin: "admin-horizontal-1",
  // Admin's Overview, two panels: the left page and the widgets, which take
  // the right panel's room. Its own key, because a layout kept for three
  // panels does not fit two.
  adminOverview: "admin-overview-horizontal-1",
  // Not a layout: where Admin was, for `useDashboardPlace`: the section, the
  // range, and on the other sections the list and the record open.
  adminPlace: "admin-place",
  // One key: the front page editor has no bottom panel, so there is no second
  // group whose height needs remembering.
  frontPageEditor: "front-page-editor-horizontal-2",
  dashboardColumns: (page: string) => `custom-shell-${page}-columns`,
  dashboardColumn: (page: string, side: "left" | "right", cards: string) =>
    `custom-shell-${page}-${side}-${cards}`,
}

/**
 * The key a three-panel dashboard keeps its dragged widths under: its own
 * layout key, then the opening widths from Settings → Styling → Side panels,
 * so a changed default starts every browser from the new widths
 * (`ThreePanels`).
 */
export function sidePanelWidthsKey(layoutKey: string, left: number, right: number) {
  return `${layoutKey}:${left}-${right}`
}

/** What `sidePanelWidthsKey` makes, whichever app's dashboard made it. */
const SIDE_PANEL_WIDTHS_KEY = /:\d+-\d+$/

/**
 * Forgets every panel width this browser kept, so each three-panel dashboard
 * opens at the widths set in Settings → Styling → Side panels again, and each
 * editor at its own defaults (Tyler, 9 Nov 2026: "Add a reset panel button
 * here to reset all the panels to its default size", then "Not default 10 and
 * 16 but to the default I set it as"). The site's widths are not touched.
 * Where a dashboard was (`…Place`) and how its widget columns are split are
 * not widths, and stay.
 */
export function forgetPanelWidths() {
  const fixed = new Set<string>(
    Object.entries(panelLayoutKey)
      .filter(([name, key]) => typeof key === "string" && !name.endsWith("Place"))
      .map(([, key]) => key as string)
  )
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    for (const key of keys) {
      if (key && (fixed.has(key) || SIDE_PANEL_WIDTHS_KEY.test(key))) localStorage.removeItem(key)
    }
  } catch {
    // Storage that cannot be read holds no widths to forget.
  }
}
