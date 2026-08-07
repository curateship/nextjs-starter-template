import * as React from "react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { z } from "zod"

import { AuthShell, authLinkClassName } from "@/components/shell/auth-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  getAuthErrorMessage,
  loadCurrentUser,
  resendVerification,
  verifyEmail,
} from "@/lib/api/auth/auth"
import { showErrorToast } from "@/lib/toast/error-toast"
import { useAsyncAction } from "@/lib/hooks/use-async-action"

export const Route = createFileRoute("/verify-email")({
  validateSearch: z.object({ token: z.string().optional() }),
  loader: async () => {
    const user = await loadCurrentUser()
    if (user) {
      throw redirect({ to: "/home", replace: true })
    }
  },
  component: VerifyEmailRoute,
})

type VerifyState = "verifying" | "verified" | "failed"

function VerifyEmailRoute() {
  const { token } = Route.useSearch()
  const [state, setState] = React.useState<VerifyState>(
    token ? "verifying" : "failed"
  )
  // The page title says the link failed; the toast carries why. It stays until
  // dismissed, and clears itself when the user leaves for the sign-in page.
  React.useEffect(() => {
    if (!token) {
      showErrorToast("This link is missing its verification code.")
      return
    }

    let cancelled = false
    verifyEmail(token)
      .then(() => {
        if (!cancelled) setState("verified")
      })
      .catch((verifyError) => {
        if (cancelled) return
        showErrorToast(getAuthErrorMessage(verifyError))
        setState("failed")
      })

    return () => {
      cancelled = true
    }
  }, [token])

  if (state === "verifying") {
    return (
      <AuthShell title="Verifying your email" description="One moment…">
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden />
          <span>We are confirming your link.</span>
        </div>
      </AuthShell>
    )
  }

  if (state === "verified") {
    return (
      <AuthShell
        title="Email verified"
        description="Your account is ready."
        footer={
          <p>
            <Link to="/login" className={authLinkClassName}>
              Sign in
            </Link>
          </p>
        }
      >
        <p className="text-sm text-muted-foreground">
          Thanks for confirming. You can sign in now.
        </p>
      </AuthShell>
    )
  }

  return <RequestNewLink />
}

/**
 * The dead-link page asks for the email itself rather than sending anyone to
 * hunt for a resend elsewhere — the link carries no address, so this form is
 * where it gets one.
 */
function RequestNewLink() {
  const [email, setEmail] = React.useState("")
  const [sent, setSent] = React.useState(false)
  const [run, sending] = useAsyncAction(getAuthErrorMessage)

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setSent(await run(() => resendVerification(email)))
    },
    [email, run]
  )

  return (
    <AuthShell
      title="We could not verify that link"
      notice={
        sent
          ? "If that email has an account waiting on verification, a new link is on its way."
          : null
      }
      onSubmit={handleSubmit}
      footer={
        <p>
          <Link to="/login" className={authLinkClassName}>
            Back to sign in
          </Link>
        </p>
      }
    >
      <p className="text-sm text-muted-foreground">
        Verification links expire after 24 hours and can only be used once.
        Enter your email and we will send you a fresh one.
      </p>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={sending}>
        {sending ? (
          <>
            <Loader2Icon className="animate-spin" />
            Sending...
          </>
        ) : sent ? (
          // A link can go missing or be left too long, so the button stays
          // usable and says what pressing it now would do.
          "Send again"
        ) : (
          "Send a new verification link"
        )}
      </Button>
    </AuthShell>
  )
}
