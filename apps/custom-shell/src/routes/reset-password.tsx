import * as React from "react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { z } from "zod"

import { AuthShell, authLinkClassName } from "@/components/auth-shell"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { PasswordInput } from "@/components/ui/password-input"
import {
  getAuthErrorMessage,
  loadCurrentUser,
  resetPassword,
} from "@/lib/api/auth"

export const Route = createFileRoute("/reset-password")({
  validateSearch: z.object({ token: z.string().optional() }),
  loader: async () => {
    const user = await loadCurrentUser()
    if (user) {
      throw redirect({ to: "/" })
    }
  },
  component: ResetPasswordRoute,
})

function ResetPasswordRoute() {
  const { token } = Route.useSearch()
  const [password, setPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [confirmTouched, setConfirmTouched] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [done, setDone] = React.useState(false)

  // Only flag a mismatch once the confirm field has content and has been
  // visited, so the hint appears as the user types the second password rather
  // than the instant they enter the first character.
  const mismatch =
    confirmTouched &&
    confirmPassword.length > 0 &&
    confirmPassword !== password

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setError(null)

      if (password !== confirmPassword) {
        // Surface the mismatch inline on the confirm field rather than as a
        // generic top-of-form alert.
        setConfirmTouched(true)
        return
      }
      if (!token) {
        setError("This link is missing its reset code.")
        return
      }

      setLoading(true)
      try {
        await resetPassword(token, password)
        setDone(true)
      } catch (resetError) {
        setError(getAuthErrorMessage(resetError))
      } finally {
        setLoading(false)
      }
    },
    [confirmPassword, password, token]
  )

  if (done) {
    return (
      <AuthShell
        title="Password updated"
        description="You have been signed out everywhere else."
        footer={
          <p>
            <Link to="/login" className={authLinkClassName}>
              Sign in
            </Link>
          </p>
        }
      >
        <p className="text-sm text-muted-foreground">
          Use your new password to sign in.
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Choose a new password"
      error={error}
      onSubmit={handleSubmit}
      footer={
        <p>
          <Link to="/forgot-password" className={authLinkClassName}>
            Request a new link
          </Link>
        </p>
      }
    >
      <div className="grid gap-2">
        <FieldLabel htmlFor="password" hint="At least 8 characters.">
          New password
        </FieldLabel>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          autoFocus
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>
      <div className="grid gap-2">
        <FieldLabel
          htmlFor="confirm-password"
          hint="Type the same password again."
        >
          Confirm new password
        </FieldLabel>
        <PasswordInput
          id="confirm-password"
          autoComplete="new-password"
          minLength={8}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          onBlur={() => setConfirmTouched(true)}
          aria-invalid={mismatch || undefined}
          aria-describedby={mismatch ? "confirm-password-error" : undefined}
          required
        />
        {mismatch ? (
          <p
            id="confirm-password-error"
            role="alert"
            className="text-sm text-destructive"
          >
            Those passwords do not match.
          </p>
        ) : null}
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2Icon className="animate-spin" />
            Saving...
          </>
        ) : (
          "Save new password"
        )}
      </Button>
    </AuthShell>
  )
}
