import * as React from "react"
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { AuthShell, authLinkClassName } from "@/components/shell/auth-shell"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import {
  getAuthErrorMessage,
  loadCurrentUser,
  login,
  resendVerification,
} from "@/lib/api/auth"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"

/**
 * Only same-origin, root-relative paths are honored after login. A
 * protocol-relative ("//evil.com") or absolute ("https://evil.com") value would
 * be an open redirect, so anything that is not a plain "/path" is dropped.
 */
function safeRedirectPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  if (!value.startsWith("/")) return undefined
  if (value.startsWith("//") || value.startsWith("/\\")) return undefined
  return value
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => {
    const redirectTo = safeRedirectPath(search.redirect)
    return redirectTo ? { redirect: redirectTo } : {}
  },
  loader: async () => {
    const user = await loadCurrentUser()
    if (user) {
      throw redirect({ to: "/" })
    }
  },
  component: LoginRoute,
})

function LoginRoute() {
  const navigate = useNavigate()
  const { redirect: redirectTo } = Route.useSearch()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [notice, setNotice] = React.useState<string | null>(null)
  const [unverified, setUnverified] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [resending, setResending] = React.useState(false)

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      dismissErrorToast()
      setNotice(null)
      setUnverified(false)
      setLoading(true)

      try {
        await login(email, password)
        // Re-check at the navigation itself so an unsafe value can never be
        // followed, regardless of how it reached the search param.
        await navigate({ to: safeRedirectPath(redirectTo) ?? "/" })
      } catch (loginError) {
        const message =
          loginError instanceof Error ? loginError.message : ""
        setUnverified(message.includes("EMAIL_NOT_VERIFIED"))
        showErrorToast(getAuthErrorMessage(loginError))
      } finally {
        setLoading(false)
      }
    },
    [email, navigate, password, redirectTo]
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
      description="Use your Custom Shell account."
      notice={notice}
      onSubmit={handleSubmit}
      footer={
        <>
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
    </AuthShell>
  )
}
