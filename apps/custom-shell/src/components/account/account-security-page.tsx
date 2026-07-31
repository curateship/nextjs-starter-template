import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { FieldLabel } from "@/components/ui/field-label"
import { Label } from "@/components/ui/label"
import {
  changePassword,
  deleteAccount,
  getAuthErrorMessage,
  PASSWORD_RULE_HINT,
  signOutOtherSessions,
} from "@/lib/api/auth"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"

export function AccountSecurityPage() {
  return (
    <div
      className="flex w-full flex-col"
      style={{ gap: "var(--shell-gutter, 1.5rem)" }}
    >
      <ChangePasswordCard />
      <SessionsCard />
      <DeleteAccountCard />
    </div>
  )
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = React.useState("")
  const [newPassword, setNewPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [saved, setSaved] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      dismissErrorToast()
      setSaved(false)

      if (newPassword !== confirmPassword) {
        showErrorToast("Those passwords do not match.")
        return
      }

      setSaving(true)
      try {
        await changePassword(currentPassword, newPassword)
        setCurrentPassword("")
        setNewPassword("")
        setConfirmPassword("")
        setSaved(true)
      } catch (changeError) {
        showErrorToast(getAuthErrorMessage(changeError))
      } finally {
        setSaving(false)
      }
    },
    [confirmPassword, currentPassword, newPassword]
  )

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Changing your password signs out every other device.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="new-password" hint={PASSWORD_RULE_HINT}>
              New password
            </FieldLabel>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm-new-password">Confirm new password</Label>
            <Input
              id="confirm-new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={saving}>
              Update password
            </Button>
            {saved ? (
              <span role="status" className="text-sm text-muted-foreground">
                Password updated. Other devices were signed out.
              </span>
            ) : null}
          </div>
        </CardContent>
      </form>
    </Card>
  )
}

function SessionsCard() {
  const [working, setWorking] = React.useState(false)
  const [result, setResult] = React.useState<string | null>(null)

  const handleSignOutOthers = React.useCallback(async () => {
    setWorking(true)
    setResult(null)
    try {
      const { removed } = await signOutOtherSessions()
      setResult(
        removed === 0
          ? "No other devices were signed in."
          : `Signed out ${removed} other ${removed === 1 ? "device" : "devices"}.`
      )
    } catch (sessionError) {
      showErrorToast(getAuthErrorMessage(sessionError))
    } finally {
      setWorking(false)
    }
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Devices</CardTitle>
        <CardDescription>
          Signed in somewhere you do not recognise? Sign those sessions out.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={handleSignOutOthers} disabled={working}>
          Sign out other devices
        </Button>
        {result ? (
          <span role="status" className="text-sm text-muted-foreground">
            {result}
          </span>
        ) : null}
      </CardContent>
    </Card>
  )
}

function DeleteAccountCard() {
  const [open, setOpen] = React.useState(false)
  const [password, setPassword] = React.useState("")
  const [deleting, setDeleting] = React.useState(false)

  const handleDelete = React.useCallback(async () => {
    dismissErrorToast()
    setDeleting(true)

    try {
      await deleteAccount(password)
      window.location.href = "/login"
    } catch (deleteError) {
      showErrorToast(getAuthErrorMessage(deleteError))
      setDeleting(false)
    }
  }, [password])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Delete account</CardTitle>
        <CardDescription>
          This removes your account and everything in it. It cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete my account
        </Button>
      </CardContent>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete your account?"
        description="Everything you have here is deleted straight away, and any paid plan stops at the end of the period you already paid for."
        confirmLabel="Delete account"
        loading={deleting}
        disabled={!password}
        onConfirm={() => void handleDelete()}
      >
        <Card size="sm">
          <CardHeader>
            <CardTitle>Confirm it is you</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              <Label htmlFor="delete-password">Password</Label>
              <Input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      </ConfirmDialog>
    </Card>
  )
}
