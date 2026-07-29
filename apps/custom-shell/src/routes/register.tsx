import * as React from "react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { AuthShell, authLinkClassName } from "@/components/auth-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FieldLabel } from "@/components/ui/field-label"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { getAuthErrorMessage, loadCurrentUser, register } from "@/lib/api/auth"

export const Route = createFileRoute("/register")({
  loader: async () => {
    const user = await loadCurrentUser()
    if (user) {
      throw redirect({ to: "/" })
    }
  },
  component: RegisterRoute,
})

function RegisterRoute() {
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [registered, setRegistered] = React.useState(false)

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setError(null)
      setLoading(true)

      try {
        await register({ name, email, password })
        setRegistered(true)
      } catch (registerError) {
        setError(getAuthErrorMessage(registerError))
      } finally {
        setLoading(false)
      }
    },
    [email, name, password]
  )

  if (registered) {
    return (
      <AuthShell
        title="Check your email"
        description={`We sent a verification link to ${email}. Open it to finish setting up your account.`}
        footer={
          <p>
            <Link to="/login" className={authLinkClassName}>
              Back to sign in
            </Link>
          </p>
        }
      >
        <p className="text-sm text-muted-foreground">
          The link expires in 24 hours. If it does not arrive, you can request a
          new one from the sign-in page.
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Create your account"
      description="It takes less than a minute."
      error={error}
      onSubmit={handleSubmit}
      footer={
        <p>
          Already have an account?{" "}
          <Link to="/login" className={authLinkClassName}>
            Sign in
          </Link>
        </p>
      }
    >
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          autoComplete="name"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </div>
      <div className="grid gap-2">
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
      <div className="grid gap-2">
        <FieldLabel htmlFor="password" hint="At least 8 characters.">
          Password
        </FieldLabel>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2Icon className="animate-spin" />
            Creating account...
          </>
        ) : (
          "Create account"
        )}
      </Button>
    </AuthShell>
  )
}
