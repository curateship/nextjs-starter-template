import * as React from "react"
import { getRouteApi, redirect, useNavigate } from "@tanstack/react-router"

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
 * - **A new section is an arrival.** On a dashboard of sections that keeps
 *   one frame while the section changes (the Admin dashboard, the CRM), each
 *   `section` picked opens its own first row too, as it did while each
 *   section had a frame of its own.
 *
 * The open record is `?open=<id>` on every dashboard (`readOpenSearch`). The
 * place is kept in this browser, once per person and per site, so one site's
 * segment never opens on another's. Both moves replace the address rather than
 * adding to the history, so Back still leaves the page.
 *
 * The way back is taken before the dashboard loads anything, by
 * `restoreDashboardPlace` in the route's `beforeLoad`, so a left-menu
 * click never draws the Overview first and then swaps (Tyler, 16 Nov 2026:
 * "it loads the overview first and it takes 1 sec to redirect me"). The
 * server cannot read this browser's memory, so it leaves a bare address to
 * the browser (`ssrUnlessBare`). The effect below still covers a dashboard
 * whose route does not ask early.
 *
 * `onQuietOpen` hears each id this opens by itself, so a narrow screen stays on
 * the list instead of jumping to the record nobody pressed.
 */
export function useDashboardPlace({
  placeKey,
  search,
  ids,
  ready = true,
  section,
  onQuietOpen,
}: {
  /** One of `panelLayoutKey`'s `…Place` keys. */
  placeKey: string
  /** The dashboard route's own `useSearch()`. */
  search: Record<string, unknown>
  /** The ids of the list's rows as shown, first row first. */
  ids: string[]
  /**
   * False while `ids` still belong to the address before the last change,
   * as on a screen that loads its own list. The first row waits for it, so
   * a remembered folder never opens a row from the folder it replaced.
   */
  ready?: boolean
  /** The section showing, on a dashboard of sections; a new one is an arrival. */
  section?: string
  onQuietOpen: (id: string) => void
}) {
  const navigate = useNavigate()
  const { user, workspaces } = authenticatedRoute.useLoaderData()
  const site =
    workspaces.workspaces.find((workspace) => workspace.active) ??
    workspaces.workspaces[0]
  const storageKey = placeStorageKey(placeKey, user.id, site?.id)
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
  const sectionRef = React.useRef(section)
  // Counts the remembered addresses that have finished loading, so the
  // effect runs again with the list they brought.
  const [restores, setRestores] = React.useState(0)
  // While this dashboard shows, its route leaves in-page moves alone.
  React.useEffect(() => {
    shownPlaces.add(placeKey)
    return () => {
      shownPlaces.delete(placeKey)
    }
  }, [placeKey])
  // Fresh every render; keeping it in a ref leaves the effect keyed on what
  // actually changes.
  const onQuietOpenRef = React.useRef(onQuietOpen)
  React.useEffect(() => {
    onQuietOpenRef.current = onQuietOpen
  })

  React.useEffect(() => {
    const place = JSON.parse(placeJson) as Record<string, unknown>
    if (section !== sectionRef.current) {
      sectionRef.current = section
      // Only a section picked after arrival is a new arrival. One that
      // changes while a remembered address loads is that address, whose open
      // record still has to be checked against the list.
      if (stepRef.current === "done") {
        restoredRef.current = false
        stepRef.current = "opening"
      }
    }
    if (stepRef.current === "start") {
      stepRef.current = "opening"
      // Already taken back by the route, before anything loaded: still a
      // remembered place, so its open record is checked against the list.
      if (takeEarlyRestore(storageKey, placeJson)) restoredRef.current = true
      const saved =
        !restoredRef.current && Object.keys(place).length === 0 ? readPlace(storageKey) : null
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
      if (!ready) return
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
  }, [placeJson, storageKey, idsJson, ready, navigate, restores, section])
}

/**
 * The route's half of coming back: called in a dashboard route's
 * `beforeLoad`, it sends a bare address straight to the remembered one, so
 * only that section loads. In the browser only, since the place is kept in
 * this browser. It needs the signed-in area's data to know whose place to
 * read; when that is not in hand yet, the hook's own effect does the job.
 */
export function restoreDashboardPlace(
  placeKey: string,
  {
    search,
    location,
    matches,
    cause,
  }: {
    search: Record<string, unknown>
    /** A hover's preload never goes back; only a real arrival does. */
    cause: "enter" | "stay" | "preload"
    location: { pathname: string }
    matches: ReadonlyArray<{ routeId: string; loaderData?: unknown }>
  }
) {
  if (typeof window === "undefined") return
  // Only on arrival. A move inside a dashboard already showing, such as
  // closing its record, leaves the address as it is. The first load in the
  // browser counts as "stay", so whether the dashboard is showing decides.
  if (cause === "preload" || shownPlaces.has(placeKey)) return
  if (Object.keys(placeOf(search)).length > 0) return
  const shell = matches.find((match) => match.routeId === "/_authenticated")?.loaderData as
    | {
        user?: { id: string }
        workspaces?: { workspaces: Array<{ id: string; active?: boolean }> }
      }
    | undefined
  if (!shell?.user || !shell.workspaces) return
  const site =
    shell.workspaces.workspaces.find((workspace) => workspace.active) ??
    shell.workspaces.workspaces[0]
  const storageKey = placeStorageKey(placeKey, shell.user.id, site?.id)
  const saved = readPlace(storageKey)
  if (!saved) return
  const next = { ...search, ...saved }
  earlyRestore = { storageKey, placeJson: sortedJson(placeOf(next)) }
  const options = { to: location.pathname, search: next, replace: true }
  throw redirect(options as unknown as Parameters<typeof redirect>[0])
}

/**
 * A route's `ssr`: a bare address is drawn in the browser, which knows where
 * the dashboard was, rather than by the server, which would draw the Overview
 * only for the browser to leave it at once.
 */
export function ssrUnlessBare({
  search,
}: {
  search: { status: "success"; value: unknown } | { status: "error" }
}) {
  if (search.status !== "success") return true
  return Object.keys(placeOf(search.value as Record<string, unknown>)).length > 0
}

/** The `…Place` keys of the dashboards showing now. */
const shownPlaces = new Set<string>()

/** The last place a route restored early, for the hook to recognise. */
let earlyRestore: { storageKey: string; placeJson: string } | null = null

function takeEarlyRestore(storageKey: string, placeJson: string) {
  const taken =
    earlyRestore !== null &&
    earlyRestore.storageKey === storageKey &&
    // Key order aside: the route's search reader may list them differently.
    earlyRestore.placeJson === sortedJson(JSON.parse(placeJson) as Record<string, unknown>)
  if (taken) earlyRestore = null
  return taken
}

function sortedJson(place: Record<string, unknown>) {
  const entries = Object.entries(place).sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify(Object.fromEntries(entries))
}

function placeStorageKey(placeKey: string, userId: string, siteId: string | undefined) {
  return `${placeKey}:${userId}:${siteId ?? "app"}`
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
