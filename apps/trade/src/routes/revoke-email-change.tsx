import * as React from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { z } from "zod"

import { AuthShell, authLinkClassName } from "@/components/shell/auth-shell"
import { getAuthErrorMessage, revokePendingEmailChange } from "@/lib/api/auth"
import { showErrorToast } from "@/lib/error-toast"

/**
 * The landing for the "this wasn't me" link in the warning sent to the old
 * address.
 *
 * It never asks anybody to sign in, and never sends a signed-in browser
 * anywhere. The whole reason this page exists is that the person opening it
 * may be in the middle of losing the account, so the link in their inbox has
 * to be enough on its own.
 *
 * The refusals are told apart on purpose. "The link has been used" and "the
 * change already went through" look the same from here and mean completely
 * different things — the second one is the case where somebody has to do
 * something next.
 */
export const Route = createFileRoute("/revoke-email-change")({
  validateSearch: z.object({ token: z.string().optional() }),
  component: RevokeEmailChangeRoute,
})

type Stopped = { cancelledEmail: string; accountEmail: string }

function RevokeEmailChangeRoute() {
  const { token } = Route.useSearch()
  const [stopped, setStopped] = React.useState<Stopped | null>(null)
  const [failure, setFailure] = React.useState<string | null>(
    token ? null : "MISSING_TOKEN"
  )
  // The link a browser has already tried. It is single-use, so a second
  // attempt would spend nothing and report failure over a change it stopped.
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
    revokePendingEmailChange(token)
      .then((result) => {
        if (!cancelled) setStopped(result)
      })
      .catch((revokeError) => {
        if (cancelled) return
        // The page says which way it failed; the toast carries the sentence.
        showErrorToast(getAuthErrorMessage(revokeError))
        setFailure(
          revokeError instanceof Error ? revokeError.message : "UNKNOWN"
        )
      })

    return () => {
      cancelled = true
    }
  }, [token])

  if (stopped) {
    return (
      <AuthShell
        title="We stopped that change"
        description={`Your account is still ${stopped.accountEmail}.`}
        footer={
          <p>
            <Link to="/forgot-password" className={authLinkClassName}>
              Set a new password
            </Link>{" "}
            before you sign in again.
          </p>
        }
      >
        <p className="text-sm text-muted-foreground">
          The move to {stopped.cancelledEmail} has been cancelled, and every
          browser signed in to this account has been signed out — including
          whoever asked for it.
        </p>
        <p className="text-sm text-muted-foreground">
          If that was not you, somebody has been able to use your account. Set a
          new password now, and turn on a passkey under Account &rarr; Security
          once you are back in.
        </p>
      </AuthShell>
    )
  }

  // Matched the way `messageForAuthCode` matches, because a server function
  // can hand the code back wrapped in a longer sentence.
  if (failure?.includes("EMAIL_CHANGE_ALREADY_DONE")) {
    return (
      <AuthShell
        title="That change already went through"
        description="This link can no longer stop it."
        footer={
          <p>
            <Link to="/login" className={authLinkClassName}>
              Sign in
            </Link>{" "}
            if you still can, and change the address back from Account &rarr;
            Profile.
          </p>
        }
      >
        <p className="text-sm text-muted-foreground">
          The account has already moved to the new address, so signing in with
          this one will not work any more.
        </p>
        <p className="text-sm text-muted-foreground">
          If you did not ask for that, contact support from this address
          straight away. They can see which address it moved to and move it
          back.
        </p>
      </AuthShell>
    )
  }

  if (failure) {
    return (
      <AuthShell
        title="There was nothing to stop"
        footer={
          <p>
            <Link to="/login" className={authLinkClassName}>
              Sign in
            </Link>{" "}
            and check Account &rarr; Profile for anything still waiting.
          </p>
        }
      >
        <p className="text-sm text-muted-foreground">
          This link works once and lasts as long as the change it stops. It has
          either been used already, run out of time, or the change was cancelled
          another way.
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Stopping that change" description="One moment…">
      <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
        <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden />
        <span>We are checking your link.</span>
      </div>
    </AuthShell>
  )
}
