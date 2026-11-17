import * as React from "react"
import { getRouteApi, redirect } from "@tanstack/react-router"

import { readClientFilter } from "@/lib/project/clients"
import { readId } from "@/lib/project/team-route"

const authenticatedRoute = getRouteApi("/_authenticated")

/**
 * The Projects table's Filter (Tyler, 16 Nov 2026: "can you make it remember
 * my filter?"). Team, Client, Category and Group live in the address, so a
 * reload or a pasted link keeps them, and this browser remembers the last
 * ones per person and per site. Arriving at a bare `/projects`, from the left
 * menu or a bookmark, goes back to them. An address that already sets one
 * wins and is left as it is. Clear empties the memory too.
 *
 * The same shape as the shell's `dashboard-place.ts`, which does this for the
 * three-panel dashboards but also opens a first record, which a table has
 * none of.
 */
export type ProjectsFilter = {
  /** The site admin's team; an unknown one is every team, on the server. */
  team?: string
  /** A client's name, or `NO_CLIENT_FILTER` for projects with none. */
  client?: string
  /** A category's name, or `NO_CLIENT_FILTER` for projects with none. */
  category?: string
  group?: "client"
}

/** The filter in an address, each value checked. */
export function readProjectsFilter(search: Record<string, unknown>): ProjectsFilter {
  const team = readId(search.team)
  const client = readClientFilter(search.client)
  const category = readClientFilter(search.category)
  return {
    ...(team ? { team } : {}),
    ...(client ? { client } : {}),
    ...(category ? { category } : {}),
    ...(search.group === "client" ? { group: "client" as const } : {}),
  }
}

function isEmpty(filter: ProjectsFilter) {
  return Object.keys(readProjectsFilter(filter)).length === 0
}

function storageKey(userId: string, siteId: string | undefined) {
  return `project-projects-filter:${userId}:${siteId ?? "app"}`
}

type ShellData = {
  user?: { id: string }
  workspaces?: { workspaces: Array<{ id: string; active?: boolean }> }
}

function keyFor(shell: ShellData | undefined) {
  if (!shell?.user || !shell.workspaces) return null
  const site = shell.workspaces.workspaces.find((workspace) => workspace.active) ?? shell.workspaces.workspaces[0]
  return storageKey(shell.user.id, site?.id)
}

function readRemembered(key: string): ProjectsFilter | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "null")
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null
    const filter = readProjectsFilter(saved as Record<string, unknown>)
    return isEmpty(filter) ? null : filter
  } catch {
    return null
  }
}

function remember(key: string, filter: ProjectsFilter) {
  try {
    localStorage.setItem(key, JSON.stringify(readProjectsFilter(filter)))
  } catch {
    // Storage may be blocked; the table still works, it just forgets.
  }
}

/** Whether the Projects table is showing, so a move inside it is never an arrival. */
let showing = false

/**
 * The route's `beforeLoad`: a bare arrival goes straight to the remembered
 * filter, before anything loads. It needs the signed-in area's data to know
 * whose memory to read; on a first page load that is not in hand yet, and
 * the hook below does the job instead.
 */
export function restoreProjectsFilter({
  search,
  cause,
  location,
  matches,
}: {
  search: Record<string, unknown>
  cause: "enter" | "stay" | "preload"
  location: { pathname: string }
  matches: ReadonlyArray<{ routeId: string; loaderData?: unknown }>
}) {
  if (typeof window === "undefined" || cause === "preload" || showing) return
  if (!isEmpty(readProjectsFilter(search))) return
  const key = keyFor(matches.find((match) => match.routeId === "/_authenticated")?.loaderData as ShellData)
  const saved = key ? readRemembered(key) : null
  if (!saved) return
  const options = { to: location.pathname, search: { ...search, ...saved }, replace: true }
  throw redirect(options as unknown as Parameters<typeof redirect>[0])
}

/**
 * The table's half: remembers each filter as it changes, and on a bare
 * arrival the route could not restore, asks for the remembered one.
 */
export function useRememberedProjectsFilter(filter: ProjectsFilter, onRestore: (saved: ProjectsFilter) => void) {
  const shell = authenticatedRoute.useLoaderData() as ShellData
  const key = keyFor(shell)
  const filterJson = JSON.stringify(readProjectsFilter(filter))
  // "start" before the first look, then the remembered filter's text while it
  // loads, then "done". A ref, so React's second run of a first effect in
  // development finds the step already taken.
  const stepRef = React.useRef<string>("start")
  const onRestoreRef = React.useRef(onRestore)
  React.useEffect(() => {
    onRestoreRef.current = onRestore
  })

  React.useEffect(() => {
    showing = true
    return () => {
      showing = false
    }
  }, [])

  React.useEffect(() => {
    if (!key) return
    if (stepRef.current === "start") {
      const saved = filterJson === "{}" ? readRemembered(key) : null
      if (saved) {
        stepRef.current = JSON.stringify(readProjectsFilter(saved))
        onRestoreRef.current(saved)
        return
      }
      stepRef.current = "done"
    } else if (stepRef.current !== "done") {
      // Still on the way to the remembered filter: nothing to write yet.
      if (filterJson !== stepRef.current) return
      stepRef.current = "done"
    }
    remember(key, JSON.parse(filterJson) as ProjectsFilter)
  }, [filterJson, key])
}
