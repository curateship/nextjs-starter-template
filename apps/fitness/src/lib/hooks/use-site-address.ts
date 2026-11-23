import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"

import { workspacePublicOrigin } from "@/lib/workspaces/addresses"

const authenticatedRoute = getRouteApi("/_authenticated")

const subscribeToBrowserOrigin = () => () => {}

/**
 * Turns a public path into the address of that page on the site the admin is
 * working on, for every "open in a new tab" button on a signed-in screen.
 *
 * A bare `/about` opens on whatever address the admin is signed in on. On a
 * deployment serving several sites that is often the deployment's own
 * address, whose public pages belong to its oldest site, so the button opened
 * a different site's page from the one being edited. The site picked in the
 * left menu decides instead, by the same rule the left menu's own open button
 * uses.
 *
 * Anything that is not a path, such as `https://…` or `mailto:`, comes back
 * as it was.
 */
export function useSiteAddress(): (path: string) => string {
  const { workspaces } = authenticatedRoute.useLoaderData()
  const browserOrigin = React.useSyncExternalStore(
    subscribeToBrowserOrigin,
    () => window.location.origin,
    () => ""
  )
  const active =
    workspaces.workspaces.find((workspace) => workspace.active) ??
    workspaces.workspaces[0]
  const origin = active
    ? workspacePublicOrigin(active, workspaces.baseDomain, browserOrigin)
    : ""

  return React.useCallback(
    (path: string) => (path.startsWith("/") ? `${origin}${path}` : path),
    [origin]
  )
}
