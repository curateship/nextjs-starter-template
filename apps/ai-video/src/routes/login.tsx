import * as React from "react"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getAuthErrorMessage, loadCurrentUser, login } from "@/lib/api/auth"

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
  const [loading, setLoading] = React.useState(false)
  const [attempted, setAttempted] = React.useState(false)

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setError(null)
      setAttempted(true)

      if (!email.trim() || !password) {
        setError("Enter your email and password.")
        return
      }

      setLoading(true)

      try {
        await login(email.trim(), password)
        await navigate({ to: "/" })
      } catch (loginError) {
        setError(getAuthErrorMessage(loginError))
      } finally {
        setLoading(false)
      }
    },
    [email, navigate, password]
  )

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="w-full max-w-sm p-6"
      >
        <div className="mb-6">
          <h1 className="text-xl font-semibold">Sign in to AI Video</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Use your AI Video account.
          </p>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={attempted && !email.trim()}
              aria-describedby={error ? "login-error" : undefined}
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
              aria-invalid={attempted && !password}
              aria-describedby={error ? "login-error" : undefined}
            />
          </div>
          {error ? (
            <p
              id="login-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </div>
      </form>
    </main>
  )
}
