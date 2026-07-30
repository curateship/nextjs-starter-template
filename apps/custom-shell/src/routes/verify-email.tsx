import * as React from "react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { z } from "zod"

import { AuthShell, authLinkClassName } from "@/components/auth-shell"
import { InlineError } from "@/components/ui/inline-error"
import { getAuthErrorMessage, loadCurrentUser, verifyEmail } from "@/lib/api/auth"

export const Route = createFileRoute("/verify-email")({
  validateSearch: z.object({ token: z.string().optional() }),
  loader: async () => {
    const user = await loadCurrentUser()
    if (user) {
      throw redirect({ to: "/" })
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
  const [error, setError] = React.useState<string | null>(
    token ? null : "This link is missing its verification code."
  )

  React.useEffect(() => {
    if (!token) return

    let cancelled = false
    verifyEmail(token)
      .then(() => {
        if (!cancelled) setState("verified")
      })
      .catch((verifyError) => {
        if (cancelled) return
        setError(getAuthErrorMessage(verifyError))
        setState("failed")
      })

    return () => {
      cancelled = true
    }
  }, [token])

  if (state === "verifying") {
    return (
      <AuthShell title="Verifying your email" description="One moment...">
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

  return (
    <AuthShell
      title="We could not verify that link"
      footer={
        <p>
          <Link to="/login" className={authLinkClassName}>
            Back to sign in
          </Link>{" "}
          to request a new link.
        </p>
      }
    >
      {error ? <InlineError>{error}</InlineError> : null}
      <p className="text-sm text-muted-foreground">
        Verification links expire after 24 hours and can only be used once.
      </p>
    </AuthShell>
  )
}
