import * as React from "react"
import { getRouteApi, Link, useRouterState } from "@tanstack/react-router"

import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { SiteSearchForm } from "@/components/shared/site-search-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { publicContentAlignmentRowClassName } from "@/components/shell/public-content-alignment"
import {
  PublicLink,
  PublicPageFrame,
} from "@/components/shell/public-page-frame"
import { loadPublicNotFoundDiscovery } from "@/lib/api/content/pages"
import { useAppName, usePublicSystemCopy } from "@/lib/branding"
import type { PublicNotFoundDiscovery as PublicNotFoundDiscoveryData } from "@/lib/pages/not-found-discovery"
import { resolveNotFoundCopy } from "@/lib/pages/public-metadata"

/**
 * What any address the app does not have shows, and what a switched-off page
 * answers with — so a hidden page is indistinguishable from one that never
 * existed.
 *
 * The card itself needs no server call, so it still appears when discovery
 * cannot be loaded. Search and menu settings load after hydration because
 * TanStack Router does not guarantee root loader data inside a not-found
 * component.
 *
 * Two of them, because only one can know who is looking without asking: the
 * router serves the public one, and the app shell serves the signed-in one
 * (`_authenticated.tsx`), which already has the account in hand.
 */

/**
 * A way onward: where it goes and what the button says.
 *
 * The destination is one of the app's own addresses rather than a loose
 * string, so these are ordinary in-app links the router can follow without
 * fetching the whole page again.
 */
type WayOn = { to: "/" | "/login" | "/admin" | "/home"; label: string }

const authenticatedRoute = getRouteApi("/_authenticated")

export function PublicNotFound() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const [discovery, setDiscovery] = React.useState<
    PublicNotFoundDiscoveryData | undefined
  >()

  React.useEffect(() => {
    let active = true
    loadPublicNotFoundDiscovery()
      .then((next) => {
        if (active) setDiscovery(next)
      })
      .catch((error) => {
        console.error("404 discovery could not be loaded", error)
      })
    return () => {
      active = false
    }
  }, [])

  // An unknown address inside the admin area keeps its way back in there. This
  // is the common case for a signed-in admin: an address that matches no route
  // never reaches the app shell, so this page — not the signed-in one below —
  // is what they see.
  const inAdminArea = pathname === "/admin" || pathname.startsWith("/admin/")

  return (
    <PublicPageFrame
      publicSearchEnabled={discovery?.publicSearchEnabled ?? false}
    >
      <NotFoundCard
        showPublicDiscovery
        discovery={discovery}
        home={
          inAdminArea
            ? { to: "/admin", label: "Go to the dashboard" }
            : { to: "/", label: "Go to the front page" }
        }
        /*
         * Nothing here may ask the server who is looking, so the second way on
         * has to be true whether or not they are signed in.
         *
         * Off a normal address that is sign-in: right for a visitor, and it
         * takes somebody already signed in to their own home page rather than
         * asking them again. In the admin area it is the front page instead —
         * whoever is deep in /admin either is signed in, in which case offering
         * to sign in reads as nonsense, or is not, in which case the dashboard
         * link above already sends them to sign in.
         */
        other={
          inAdminArea
            ? { to: "/", label: "Go to the front page" }
            : { to: "/login", label: "Sign in" }
        }
      />
    </PublicPageFrame>
  )
}

export function AuthenticatedNotFound() {
  const appName = useAppName()
  const { user } = authenticatedRoute.useLoaderData()

  return (
    <NotFoundCard
      appName={appName}
      showPublicDiscovery={false}
      // An admin's landing place is the dashboard; a member's is whatever an
      // admin pointed their home at, which is not a dashboard and should not
      // claim to be one.
      home={
        user.role === "admin"
          ? { to: "/admin", label: "Go to the dashboard" }
          : { to: "/home", label: "Go to your home page" }
      }
      other={{ to: "/", label: "Go to the front page" }}
    />
  )
}

function NotFoundCard({
  appName,
  discovery,
  home,
  other,
  showPublicDiscovery,
}: {
  appName?: string
  discovery?: PublicNotFoundDiscoveryData
  home: WayOn
  other: WayOn
  showPublicDiscovery: boolean
}) {
  const copy = resolveNotFoundCopy(usePublicSystemCopy(), appName)

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{copy.heading}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">{copy.body}</p>
        {showPublicDiscovery ? (
          <PublicNotFoundDiscovery discovery={discovery} />
        ) : null}
        {/* Ordinary in-app links. Nothing here is broken — the router simply
            had no route for the address — so there is no state to escape by
            reloading, and a reload would only blank the screen on the way. */}
        <div
          className={`flex flex-wrap gap-2 ${publicContentAlignmentRowClassName}`}
        >
          <Button asChild>
            <Link to={home.to}>{home.label}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={other.to}>{other.label}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function PublicNotFoundDiscovery({
  discovery,
}: {
  discovery?: PublicNotFoundDiscoveryData
}) {
  const navigation = discovery?.publicNavigation ?? []
  const searchEnabled = discovery?.publicSearchEnabled ?? false
  const [query, setQuery] = React.useState("")

  if (!searchEnabled && !navigation.length) return null

  return (
    <div className="grid gap-4">
      {searchEnabled ? (
        <SiteSearchForm>
          <DashboardToolbarSearch
            className="w-full"
            inputClassName="w-full sm:w-full lg:w-full"
            name="q"
            type="search"
            aria-label="Search this site"
            placeholder="Search this site"
            maxLength={120}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </SiteSearchForm>
      ) : null}
      {navigation.length ? (
        <div className="grid gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            Main pages
          </p>
          <nav aria-label="Main pages">
            <ul className="flex flex-wrap gap-x-3 gap-y-2">
              {navigation.map((link, index) => (
                <li key={`${link.label}-${link.href}-${index}`}>
                  <PublicLink link={link} />
                </li>
              ))}
            </ul>
          </nav>
        </div>
      ) : null}
    </div>
  )
}
