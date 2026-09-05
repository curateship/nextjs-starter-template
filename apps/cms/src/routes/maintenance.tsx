import * as React from "react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { AuthShell, authLinkClassName } from "@/components/shell/auth-shell"
import {
  getVisitorPageErrorMessage,
  visitorRouteErrorComponent,
} from "@/components/shell/route-error"
import { Button } from "@/components/ui/button"
import { getAuthErrorMessage, logout } from "@/lib/api/auth/auth"
import { loadMaintenance } from "@/lib/api/maintenance"
import { getViewAsErrorMessage, stopViewingAsMember } from "@/lib/api/people/view-as"
import { usePublicSystemCopy } from "@/lib/branding"
import { resolveMaintenanceCopy } from "@/lib/pages/public-metadata"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Where everyone but an admin lands while maintenance mode is on. It is a
 * public route on purpose: signing in still works so an admin can get in, and a
 * member who signs in is sent straight back here.
 *
 * So the page has to carry every way onward itself, because the app behind it
 * is shut: the sign-in link for a visitor, sign out for somebody signed in as
 * the wrong person, and "stop viewing" for an admin the view-as feature has
 * turned into a member — the one case where the app locks its own admin out.
 */
export const Route = createFileRoute("/maintenance")({
  loader: async () => {
    const { maintenance, signedIn, viewingAs } = await loadMaintenance()
    // Nothing to say once the app is open again — send them to it. The check
    // runs on the server every time this page loads, so switching maintenance
    // off can never leave somebody stuck here.
    if (!maintenance.enabled) {
      throw redirect({ to: "/home", replace: true })
    }

    return {
      signedIn,
      viewingAs,
    }
  },
  errorComponent: visitorRouteErrorComponent(getVisitorPageErrorMessage),
  component: MaintenanceRoute,
})

function MaintenanceRoute() {
  const { signedIn, viewingAs } = Route.useLoaderData()
  const copy = resolveMaintenanceCopy(usePublicSystemCopy())
  // One flag for both actions: they are never on screen together, because an
  // admin mid view-as gets the way out and everybody else gets the way in.
  const [busy, setBusy] = React.useState(false)

  async function stopViewing() {
    setBusy(true)
    try {
      await stopViewingAsMember()
      // A full load, not a client-side navigation: this page was fetched as the
      // member. Back to the list they started from, as themselves.
      window.location.href = "/admin/users"
    } catch (error) {
      setBusy(false)
      showErrorToast(getViewAsErrorMessage(error))
    }
  }

  async function signOut() {
    setBusy(true)
    try {
      await logout()
      window.location.href = "/login"
    } catch (error) {
      setBusy(false)
      showErrorToast(getAuthErrorMessage(error))
    }
  }

  // Somebody already signed in is not offered the sign-in page: it would send
  // them straight back here. Signing out is what actually helps them, and an
  // admin mid view-as has the button above instead.
  const canSignOut = signedIn && !viewingAs
  const footer = !signedIn ? (
    <p>
      Have an admin account?{" "}
      <Link to="/login" className={authLinkClassName}>
        Sign in
      </Link>
    </p>
  ) : canSignOut ? (
    <p>Sign out if you need to get in as an admin.</p>
  ) : null

  return (
    <AuthShell title={copy.heading} footer={footer}>
      <p className="text-sm text-muted-foreground">{copy.body}</p>
      {viewingAs ? (
        <>
          <p className="text-sm text-muted-foreground">
            You are looking at the app as {viewingAs}, which is why you are
            seeing this. Stop and you are an admin again.
          </p>
          <Button
            type="button"
            className="w-full"
            disabled={busy}
            onClick={() => void stopViewing()}
          >
            {busy ? <Loader2Icon className="animate-spin" /> : null}
            Stop viewing
          </Button>
        </>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        // A full load, not a client-side navigation: it asks the server again
        // instead of trusting anything this tab already had. `replace`, so a
        // notice they have left behind cannot be reached again with Back.
        onClick={() => window.location.replace("/home")}
      >
        Try again
      </Button>
      {canSignOut ? (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={() => void signOut()}
        >
          {busy ? <Loader2Icon className="animate-spin" /> : null}
          Sign out
        </Button>
      ) : null}
    </AuthShell>
  )
}
