import { getRouteApi, Link, useRouterState } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { publicContentAlignmentRowClassName } from "@/components/shell/public-content-alignment"
import { PublicPageFrame } from "@/components/shell/public-page-frame"
import { useAppName, usePublicSystemCopy } from "@/lib/branding"
import { resolveNotFoundCopy } from "@/lib/pages/public-metadata"

/**
 * What any address the app does not have shows, and what a switched-off page
 * answers with — so a hidden page is indistinguishable from one that never
 * existed.
 *
 * It draws with no server call of its own, on purpose. This is the page people
 * reach at the worst moment, so anything it had to ask for would be one more
 * thing that can be broken exactly when it is needed. The app name it shows
 * rides along on the root route, which falls back to the default name rather
 * than failing when the database cannot be reached.
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

  // An unknown address inside the admin area keeps its way back in there. This
  // is the common case for a signed-in admin: an address that matches no route
  // never reaches the app shell, so this page — not the signed-in one below —
  // is what they see.
  const inAdminArea = pathname === "/admin" || pathname.startsWith("/admin/")

  return (
    <PublicPageFrame>
      <NotFoundCard
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
  home,
  other,
}: {
  appName?: string
  home: WayOn
  other: WayOn
}) {
  const copy = resolveNotFoundCopy(usePublicSystemCopy(), appName)

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{copy.heading}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">{copy.body}</p>
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
