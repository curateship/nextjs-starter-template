import * as React from "react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { z } from "zod"

import { AuthShell, authLinkClassName } from "@/components/shell/auth-shell"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { PasswordInput } from "@/components/ui/password-input"
import {
  getAuthErrorMessage,
  loadCurrentUser,
  PASSWORD_RULE_HINT,
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

const MISMATCH_MESSAGE = "Those passwords do not match."

function ResetPasswordRoute() {
  const { token } = Route.useSearch()
  const [password, setPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [confirmTouched, setConfirmTouched] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [done, setDone] = React.useState(false)

  const confirmMismatches =
    confirmPassword.length > 0 && confirmPassword !== password
  // Only show the red ring once the confirm field has been visited, so it
  // appears as the user types the second password rather than the instant they
  // enter the first character.
  const mismatch = confirmTouched && confirmMismatches

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      dismissErrorToast()

      if (password !== confirmPassword) {
        setConfirmTouched(true)
        showErrorToast(MISMATCH_MESSAGE)
        return
      }
      if (!token) {
        showErrorToast("This link is missing its reset code.")
        return
      }

      setLoading(true)
      try {
        await resetPassword(token, password)
        setDone(true)
      } catch (resetError) {
        showErrorToast(getAuthErrorMessage(resetError))
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
        <FieldLabel htmlFor="password" hint={PASSWORD_RULE_HINT}>
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
          onBlur={() => {
            setConfirmTouched(true)
            // Report on leaving the field, never per keystroke — a toast on
            // every character typed would be unreadable.
            if (confirmMismatches) showErrorToast(MISMATCH_MESSAGE)
          }}
          aria-invalid={mismatch || undefined}
          required
        />
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
