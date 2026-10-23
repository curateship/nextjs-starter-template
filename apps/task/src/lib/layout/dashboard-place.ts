import * as React from "react"
import { getRouteApi, useNavigate } from "@tanstack/react-router"

const authenticatedRoute = getRouteApi("/_authenticated")

/**
 * Where a three-column dashboard was, and what it opens first (Tyler,
 * 19 Oct 2026: "Make the first load on contact to load the first contact on
 * the load so that the right sidebar has something to load. And then the
 * dashboard remembers where it was before and make this mandatory for all 3
 * col dashboards").
 *
 * - **Coming back.** Opened at its bare address, from the left menu or a
 *   bookmark, the dashboard goes back to the address it last had: its search,
 *   filters, picked group, sort, page and open record. An address that already
 *   says something, such as a shared link, wins and is left as it is.
 * - **Something open.** Once that is settled, a dashboard with no record open
 *   opens the first row of its list, so the right panel is never empty on
 *   arrival. A remembered record that is no longer in the list gives way to the
 *   first row too, rather than opening on an error. It happens on arrival only:
 *   closing the record afterwards leaves the panel empty, as asked.
 *
 * The open record is `?open=<id>` on every dashboard (`readOpenSearch`). The
 * place is kept in this browser, once per person and per site, so one site's
 * segment never opens on another's. Both moves replace the address rather than
 * adding to the history, so Back still leaves the page.
 *
 * `onQuietOpen` hears each id this opens by itself, so a narrow screen stays on
 * the list instead of jumping to the record nobody pressed.
 */
export function useDashboardPlace({
  placeKey,
  search,
  ids,
  onQuietOpen,
}: {
  /** One of `panelLayoutKey`'s `…Place` keys. */
  placeKey: string
  /** The dashboard route's own `useSearch()`. */
  search: Record<string, unknown>
  /** The ids of the list's rows as shown, first row first. */
  ids: string[]
  onQuietOpen: (id: string) => void
}) {
  const navigate = useNavigate()
  const { user, workspaces } = authenticatedRoute.useLoaderData()
  const site =
    workspaces.workspaces.find((workspace) => workspace.active) ??
    workspaces.workspaces[0]
  const storageKey = `${placeKey}:${user.id}:${site?.id ?? "app"}`
  // Compared as text: the route hands over a fresh object and the screen a
  // fresh list on every render, and neither means anything moved.
  const placeJson = JSON.stringify(placeOf(search))
  const idsJson = JSON.stringify(ids)
  // "start" until the first effect, "restoring" while a remembered address
  // loads, "opening" once the address is settled, "done" after that. A ref,
  // so React's second run of a first effect in development finds the step
  // already taken rather than taking it twice.
  const stepRef = React.useRef<"start" | "restoring" | "opening" | "done">("start")
  const restoredRef = React.useRef(false)
  // Counts the remembered addresses that have finished loading, so the
  // effect runs again with the list they brought.
  const [restores, setRestores] = React.useState(0)
  // Fresh every render; keeping it in a ref leaves the effect keyed on what
  // actually changes.
  const onQuietOpenRef = React.useRef(onQuietOpen)
  React.useEffect(() => {
    onQuietOpenRef.current = onQuietOpen
  })

  React.useEffect(() => {
    const place = JSON.parse(placeJson) as Record<string, unknown>
    if (stepRef.current === "start") {
      const saved = Object.keys(place).length === 0 ? readPlace(storageKey) : null
      stepRef.current = "opening"
      if (saved) {
        stepRef.current = "restoring"
        restoredRef.current = true
        if (typeof saved.open === "string") onQuietOpenRef.current(saved.open)
        // Whatever the address says now beyond the place, such as the account
        // window, stays. The route's own search reader checks every value.
        void navigate({
          to: ".",
          search: (previous: Record<string, unknown>) => ({ ...previous, ...saved }),
          replace: true,
        }).finally(() => {
          stepRef.current = "opening"
          setRestores((count) => count + 1)
        })
      }
    }
    if (stepRef.current === "restoring") return
    if (stepRef.current === "opening") {
      stepRef.current = "done"
      const open = typeof place.open === "string" ? place.open : undefined
      // A link's own record opens even when it is not on this page of the
      // list; a remembered one is checked, because it may have been deleted.
      const rows = JSON.parse(idsJson) as string[]
      const keep = open && (!restoredRef.current || rows.includes(open))
      const first = rows[0]
      if (!keep && first) {
        onQuietOpenRef.current(first)
        void navigate({
          to: ".",
          search: (previous: Record<string, unknown>) => ({ ...previous, open: first }),
          replace: true,
        })
        return
      }
    }
    writePlace(storageKey, placeJson)
  }, [placeJson, storageKey, idsJson, navigate, restores])
}

/**
 * Search keys that belong to the whole signed-in area rather than to the
 * dashboard: `?account=` opens the account window over any page.
 */
const NOT_THE_PLACE = new Set(["account"])

/** The address's own values, without the empty ones. */
function placeOf(search: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(search).filter(
      ([key, value]) => value !== undefined && !NOT_THE_PLACE.has(key)
    )
  )
}

function readPlace(storageKey: string): Record<string, unknown> | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "null")
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null
    const place = placeOf(saved as Record<string, unknown>)
    return Object.keys(place).length > 0 ? place : null
  } catch {
    return null
  }
}

function writePlace(storageKey: string, placeJson: string) {
  try {
    localStorage.setItem(storageKey, placeJson)
  } catch {
    // Storage may be blocked; the dashboard still works, it just forgets.
  }
}
