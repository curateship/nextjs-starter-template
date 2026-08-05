import * as React from "react"
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router"

import { AuthShell, authLinkClassName } from "@/components/auth-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  getAuthErrorMessage,
  loadCurrentUser,
  login,
  resendVerification,
} from "@/lib/api/auth"

export const Route = createFileRoute("/login")({
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
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [unverified, setUnverified] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setError(null)
      setNotice(null)
      setUnverified(false)
      setLoading(true)

      try {
        await login(email, password)
        await navigate({ to: "/" })
      } catch (loginError) {
        const message =
          loginError instanceof Error ? loginError.message : ""
        setUnverified(message.includes("EMAIL_NOT_VERIFIED"))
        setError(getAuthErrorMessage(loginError))
      } finally {
        setLoading(false)
      }
    },
    [email, navigate, password]
  )

  const handleResend = React.useCallback(async () => {
    setError(null)
    try {
      await resendVerification(email)
      setUnverified(false)
      setNotice("We sent a new verification link to your email.")
    } catch (resendError) {
      setError(getAuthErrorMessage(resendError))
    }
  }, [email])

  return (
    <AuthShell
      title="Sign in"
      description="Use your Trade account."
      error={error}
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
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
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
        >
          Send a new verification link
        </Button>
      ) : null}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Signing in..." : "Sign in"}
      </Button>
    </AuthShell>
  )
}
