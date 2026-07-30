import * as React from "react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { AuthShell, authLinkClassName } from "@/components/shell/auth-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  getAuthErrorMessage,
  loadCurrentUser,
  requestPasswordReset,
} from "@/lib/api/auth"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"

export const Route = createFileRoute("/forgot-password")({
  loader: async () => {
    const user = await loadCurrentUser()
    if (user) {
      throw redirect({ to: "/" })
    }
  },
  component: ForgotPasswordRoute,
})

function ForgotPasswordRoute() {
  const [email, setEmail] = React.useState("")
  const [sent, setSent] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      dismissErrorToast()
      setLoading(true)

      try {
        await requestPasswordReset(email)
        setSent(true)
      } catch (resetError) {
        showErrorToast(getAuthErrorMessage(resetError))
      } finally {
        setLoading(false)
      }
    },
    [email]
  )

  return (
    <AuthShell
      title="Reset your password"
      description="We will email you a link to set a new one."
      notice={
        sent
          ? "If that email has an account, a reset link is on its way. The link expires in one hour."
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
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2Icon className="animate-spin" />
            Sending...
          </>
        ) : (
          "Send reset link"
        )}
      </Button>
    </AuthShell>
  )
}
