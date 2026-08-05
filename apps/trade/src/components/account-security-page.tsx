import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { FieldLabel } from "@/components/ui/field-label"
import { Label } from "@/components/ui/label"
import {
  changePassword,
  deleteAccount,
  getAuthErrorMessage,
  signOutOtherSessions,
} from "@/lib/api/auth"

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
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setError(null)

      if (newPassword !== confirmPassword) {
        setError("Those passwords do not match.")
        return
      }

      setSaving(true)
      try {
        await changePassword(currentPassword, newPassword)
        setCurrentPassword("")
        setNewPassword("")
        setConfirmPassword("")
        toast.success("Password updated. Other devices were signed out.")
      } catch (changeError) {
        setError(getAuthErrorMessage(changeError))
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
            <FieldLabel htmlFor="new-password" hint="At least 8 characters.">
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
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2Icon className="h-4 w-4 animate-spin" /> : null}
              {saving ? "Updating" : "Update password"}
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  )
}

function SessionsCard() {
  const [working, setWorking] = React.useState(false)

  const handleSignOutOthers = React.useCallback(async () => {
    setWorking(true)
    try {
      const { removed } = await signOutOtherSessions()
      toast.success(
        removed === 0
          ? "No other devices were signed in."
          : `Signed out ${removed} other ${removed === 1 ? "device" : "devices"}.`
      )
    } catch (sessionError) {
      toast.error(getAuthErrorMessage(sessionError))
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
      <CardContent>
        <Button variant="outline" onClick={handleSignOutOthers} disabled={working}>
          {working ? <Loader2Icon className="h-4 w-4 animate-spin" /> : null}
          Sign out other devices
        </Button>
      </CardContent>
    </Card>
  )
}

function DeleteAccountCard() {
  const [open, setOpen] = React.useState(false)
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const handleDelete = React.useCallback(async () => {
    setError(null)
    setDeleting(true)

    try {
      await deleteAccount(password)
      window.location.href = "/login"
    } catch (deleteError) {
      setError(getAuthErrorMessage(deleteError))
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              Everything you have here is deleted straight away, and any paid
              plan stops at the end of the period you already paid for.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-2">
              <Label htmlFor="delete-password">Confirm your password</Label>
              <Input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {error ? (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || !password}
            >
              {deleting ? <Loader2Icon className="h-4 w-4 animate-spin" /> : null}
              Delete account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
