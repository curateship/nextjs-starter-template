import * as React from "react"
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router"
import { Loader2Icon, RotateCcwIcon } from "lucide-react"

import { AuthShell, authLinkClassName } from "@/components/shell/auth-shell"
import { GoogleSignIn } from "@/components/shell/google-sign-in"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import {
  getAuthErrorMessage,
  loadCurrentUser,
  loadSignInOptions,
  login,
  messageForAuthCode,
  resendVerification,
  SIGN_IN_ERROR_CODES,
} from "@/lib/api/auth"
import { useAppName } from "@/lib/app-name"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { safeRedirectPath } from "@/lib/redirect-path"

/**
 * A Google sign-in that failed comes back here as `?error=<code>`, and only a
 * code on the list is kept — the address bar must not be able to put arbitrary
 * text on the screen.
 */
function signInError(value: unknown) {
  return SIGN_IN_ERROR_CODES.find((code) => code === value)
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => {
    const redirectTo = safeRedirectPath(search.redirect)
    const error = signInError(search.error)
    return {
      ...(redirectTo ? { redirect: redirectTo } : {}),
      ...(error ? { error } : {}),
    }
  },
  loader: async () => {
    const [user, options] = await Promise.all([
      loadCurrentUser(),
      loadSignInOptions(),
    ])
    if (user) {
      throw redirect({ to: "/" })
    }
    return options
  },
  component: LoginRoute,
})

function LoginRoute() {
  const navigate = useNavigate()
  const appName = useAppName()
  const { google } = Route.useLoaderData()
  const { redirect: redirectTo, error: signInFailure } = Route.useSearch()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [notice, setNotice] = React.useState<string | null>(null)
  const [unverified, setUnverified] = React.useState(false)
  // Set when the password was right but the account is on its way out. It turns
  // the form into a restore: same email, same password, one deliberate click.
  const [deleted, setDeleted] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [resending, setResending] = React.useState(false)

  // Why a Google sign-in did not finish. It arrives as a redirect from the
  // callback rather than a thrown error, so the toast is fired here.
  //
  // Checked against the list again rather than trusting the search param: a
  // value `validateSearch` dropped can still reach this component, which is why
  // the redirect below is re-checked at the navigation too.
  React.useEffect(() => {
    const code = signInError(signInFailure)
    if (code) {
      showErrorToast(messageForAuthCode(code))
    }
  }, [signInFailure])

  // One path for both buttons. Signing in and restoring are the same call with
  // the same credentials; `restore` is the person saying they meant it.
  const submit = React.useCallback(
    async (restore: boolean) => {
      dismissErrorToast()
      setNotice(null)
      setUnverified(false)
      // `deleted` is deliberately not cleared here. This is the handler the
      // restore button itself calls, so clearing it would take that button off
      // the screen the moment it was pressed. Every outcome below sets it.
      setLoading(true)

      try {
        await login(email, password, restore)
        // Re-check at the navigation itself so an unsafe value can never be
        // followed, regardless of how it reached the search param.
        await navigate({ to: safeRedirectPath(redirectTo) ?? "/" })
      } catch (loginError) {
        const message =
          loginError instanceof Error ? loginError.message : ""
        setUnverified(message.includes("EMAIL_NOT_VERIFIED"))
        // Only the account's own owner may bring it back. An account an admin
        // deleted offers nothing here, so the restore button stays away.
        setDeleted(message.includes("ACCOUNT_PENDING_DELETION"))
        showErrorToast(getAuthErrorMessage(loginError))
      } finally {
        setLoading(false)
      }
    },
    [email, navigate, password, redirectTo]
  )

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      await submit(false)
    },
    [submit]
  )

  const handleResend = React.useCallback(async () => {
    if (resending) return
    dismissErrorToast()
    setResending(true)
    try {
      await resendVerification(email)
      setUnverified(false)
      setNotice("We sent a new verification link to your email.")
    } catch (resendError) {
      showErrorToast(getAuthErrorMessage(resendError))
    } finally {
      setResending(false)
    }
  }, [email, resending])

  return (
    <AuthShell
      title="Sign in"
      description={`Use your ${appName} account.`}
      notice={notice}
      onSubmit={handleSubmit}
      footer={
        <>
          <p>
            <Link to="/sign-in-link" className={authLinkClassName}>
              Email me a sign-in link
            </Link>
          </p>
          <p>
            <Link to="/forgot-password" className={authLinkClassName}>
              Forgot your password?
            </Link>
          </p>
          <p>
            New here?{" "}
            <Link to="/register" className={authLinkClassName}>
              Create an account
            </Link>
          </p>
        </>
      }
    >
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
      <div className="grid gap-2">
        <FieldLabel htmlFor="password" hint="At least 8 characters.">
          Password
        </FieldLabel>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>
      {unverified ? (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleResend}
          disabled={resending}
        >
          {resending ? (
            <>
              <Loader2Icon className="animate-spin" />
              Sending link...
            </>
          ) : (
            "Send a new verification link"
          )}
        </Button>
      ) : null}
      {deleted ? (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => void submit(true)}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2Icon className="animate-spin" />
              Restoring...
            </>
          ) : (
            <>
              <RotateCcwIcon />
              Restore my account and sign in
            </>
          )}
        </Button>
      ) : null}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2Icon className="animate-spin" />
            Signing in...
          </>
        ) : (
          "Sign in"
        )}
      </Button>
      {google ? (
        <GoogleSignIn
          label="Continue with Google"
          redirectTo={safeRedirectPath(redirectTo)}
        />
      ) : null}
    </AuthShell>
  )
}
