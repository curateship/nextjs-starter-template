import * as React from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { z } from "zod"

import { AuthShell, authLinkClassName } from "@/components/shell/auth-shell"
import { reportUnwantedSignIn } from "@/lib/api/auth/auth"
import { showErrorToast } from "@/lib/toast/error-toast"

const reportPurposeSchema = z.enum(["reset_password", "login"])

export const Route = createFileRoute("/report-unwanted-sign-in")({
  validateSearch: z.object({
    token: z.string().optional(),
    purpose: reportPurposeSchema.optional(),
  }),
  component: ReportUnwantedSignInRoute,
})

function ReportUnwantedSignInRoute() {
  const { token, purpose } = Route.useSearch()
  const [finished, setFinished] = React.useState(false)
  const [failed, setFailed] = React.useState(!token || !purpose)
  const attemptedRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!token || !purpose) return
    const attempt = `${purpose}:${token}`
    if (attemptedRef.current === attempt) return
    attemptedRef.current = attempt

    let cancelled = false
    reportUnwantedSignIn(token, purpose)
      .then(() => {
        if (!cancelled) setFinished(true)
      })
      .catch(() => {
        if (cancelled) return
        showErrorToast("We could not check that email link. Please try again.")
        setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [purpose, token])

  if (finished) {
    return (
      <AuthShell
        title="That link cannot be used"
        description="If it was still active, it has been stopped."
        footer={
          <p>
            <Link to="/forgot-password" className={authLinkClassName}>
              Reset your password
            </Link>{" "}
            if you are worried somebody knows it.
          </p>
        }
      >
        <p className="text-sm text-muted-foreground">
          When a live link is reported, the account stays open and trusted
          browsers stay signed in.
        </p>
        <p className="text-sm text-muted-foreground">
          This page gives the same answer for used, expired and unknown links,
          so it never confirms whether an account exists.
        </p>
      </AuthShell>
    )
  }

  if (failed) {
    return (
      <AuthShell
        title="We could not check that link"
        description="The report link is incomplete or could not be checked."
        footer={
          <p>
            Try the link in the original email again, or{" "}
            <Link to="/forgot-password" className={authLinkClassName}>
              request a fresh password reset
            </Link>
            .
          </p>
        }
      >
        <p className="text-sm text-muted-foreground">
          Nothing on this page confirms whether an account or sign-in request
          exists.
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Stopping that link" description="One moment…">
      <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
        <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden />
        <span>We are checking your report.</span>
      </div>
    </AuthShell>
  )
}
