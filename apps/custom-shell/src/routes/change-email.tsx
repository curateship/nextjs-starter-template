import * as React from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { z } from "zod"

import { AuthShell, authLinkClassName } from "@/components/shell/auth-shell"
import {
  confirmEmailChange,
  getAuthErrorMessage,
  loadSignInOptions,
  loadCurrentUser,
} from "@/lib/api/auth/auth"
import { authTokenExpiryText } from "@/lib/email/auth-token-expiry"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The landing for the link that confirms a new email address.
 *
 * Unlike the other link pages it does not send a signed-in browser away: the
 * person asking for the change is normally signed in already, and the link may
 * equally be opened in a browser that has never been. The single-use token is
 * the proof either way. The loader only notes which case this is, so the way
 * out points into the app for a signed-in browser and at sign-in otherwise.
 */
export const Route = createFileRoute("/change-email")({
  validateSearch: z.object({ token: z.string().optional() }),
  loader: async () => ({
    signedIn: Boolean(await loadCurrentUser()),
    linkExpiry: (await loadSignInOptions()).linkExpiry,
  }),
  component: ChangeEmailRoute,
})

function ChangeEmailRoute() {
  const { token } = Route.useSearch()
  const { signedIn, linkExpiry } = Route.useLoaderData()
  const [email, setEmail] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState(!token)
  // The link a browser has already tried. It is single-use, so a second attempt
  // would spend nothing and report failure over a change that worked.
  const attemptedRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!token) {
      showErrorToast("This link is missing its confirmation code.")
      return
    }
    if (attemptedRef.current === token) {
      return
    }
    attemptedRef.current = token

    let cancelled = false
    confirmEmailChange(token)
      .then((result) => {
        if (!cancelled) setEmail(result.email)
      })
      .catch((confirmError) => {
        if (cancelled) return
        // The page says the link failed; the toast carries why. It stays until
        // dismissed and clears itself when the user navigates away.
        showErrorToast(getAuthErrorMessage(confirmError))
        setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [token])

  if (email) {
    return (
      <AuthShell
        title="Email address changed"
        description="Your account is now under the new address."
        footer={
          <p>
            {signedIn ? (
              <Link to="/home" className={authLinkClassName}>
                Back to the app
              </Link>
            ) : (
              <Link to="/login" className={authLinkClassName}>
                Sign in
              </Link>
            )}
          </p>
        }
      >
        <p className="text-sm text-muted-foreground">
          Sign in with {email} from now on. Your password has not changed, and
          you are still signed in everywhere you were.
        </p>
      </AuthShell>
    )
  }

  if (failed) {
    return (
      <AuthShell
        title="We could not confirm that address"
        footer={
          signedIn ? (
            <p>
              <Link to="/home" className={authLinkClassName}>
                Back to the app
              </Link>{" "}
              to ask for a new link from Account &rarr; Profile.
            </p>
          ) : (
            <p>
              <Link to="/login" className={authLinkClassName}>
                Sign in
              </Link>{" "}
              and ask for a new link from Account &rarr; Profile.
            </p>
          )
        }
      >
        <p className="text-sm text-muted-foreground">
          Confirmation links work once and expire after{" "}
          {authTokenExpiryText("change_email", linkExpiry)}. The address may
          also have been taken by someone else in the meantime.
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Confirming your new email" description="One moment…">
      <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
        <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden />
        <span>We are checking your link.</span>
      </div>
    </AuthShell>
  )
}
