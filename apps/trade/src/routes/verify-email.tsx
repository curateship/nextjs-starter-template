import * as React from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { z } from "zod"

import { AuthShell, authLinkClassName } from "@/components/auth-shell"
import { getAuthErrorMessage, verifyEmail } from "@/lib/api/auth"

export const Route = createFileRoute("/verify-email")({
  validateSearch: z.object({ token: z.string().optional() }),
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
        <p className="text-sm text-muted-foreground">
          We are confirming your link.
        </p>
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
      error={error}
      footer={
        <p>
          <Link to="/login" className={authLinkClassName}>
            Back to sign in
          </Link>{" "}
          to request a new link.
        </p>
      }
    >
      <p className="text-sm text-muted-foreground">
        Verification links expire after 24 hours and can only be used once.
      </p>
    </AuthShell>
  )
}
