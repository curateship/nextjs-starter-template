import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Loader2Icon, LogOutIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorBanner } from "@/components/ui/error-banner"
import { Input } from "@/components/ui/input"
import { FieldLabel } from "@/components/ui/field-label"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSurface,
} from "@/components/ui/table"
import {
  changePassword,
  deleteAccount,
  getAuthErrorMessage,
  loadSessions,
  PASSWORD_RULE_HINT,
  revokeSession,
  signOutOtherSessions,
  type AuthUser,
  type SessionList,
} from "@/lib/api/auth"
import { ACCOUNT_RESTORE_DAYS } from "@/lib/account-deletion"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { formatDateTime, formatTimeAgo } from "@/lib/format-time"

export function AccountSecurityPage({ user }: { user: AuthUser }) {
  const router = useRouter()
  // Changing a password signs out every other device, so the list below it has
  // to be fetched again or it keeps showing devices that are already gone.
  const [devicesChanged, setDevicesChanged] = React.useState(0)

  return (
    <div
      className="flex w-full flex-col"
      style={{ gap: "var(--shell-gutter, 1.5rem)" }}
    >
      <ChangePasswordCard
        hasPassword={user.hasPassword}
        onPasswordChanged={() => {
          setDevicesChanged((count) => count + 1)
          // Setting a first password changes what this tab offers, and the
          // answer comes from the shell's copy of the account.
          void router.invalidate()
        }}
      />
      <SessionsCard devicesChanged={devicesChanged} />
      <DeleteAccountCard hasPassword={user.hasPassword} email={user.email} />
    </div>
  )
}

/**
 * An account created by signing in with Google has no password. It is offered
 * one here — the signed-in session is proof enough of who they are — instead of
 * being asked for a current password that does not exist.
 */
function ChangePasswordCard({
  hasPassword,
  onPasswordChanged,
}: {
  hasPassword: boolean
  onPasswordChanged: () => void
}) {
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
        await changePassword(
          hasPassword ? currentPassword : undefined,
          newPassword
        )
        setCurrentPassword("")
        setNewPassword("")
        setConfirmPassword("")
        setSaved(true)
        onPasswordChanged()
      } catch (changeError) {
        showErrorToast(getAuthErrorMessage(changeError))
      } finally {
        setSaving(false)
      }
    },
    [
      confirmPassword,
      currentPassword,
      hasPassword,
      newPassword,
      onPasswordChanged,
    ]
  )

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <CardHeader>
          <CardTitle>{hasPassword ? "Password" : "Set a password"}</CardTitle>
          <CardDescription>
            {hasPassword
              ? "Changing your password signs out every other device."
              : "You sign in with Google and have no password. Adding one lets you sign in either way."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {hasPassword ? (
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
          ) : null}
          <div className="grid gap-2">
            <FieldLabel htmlFor="new-password" hint={PASSWORD_RULE_HINT}>
              {hasPassword ? "New password" : "Password"}
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
            <Label htmlFor="confirm-new-password">
              {hasPassword ? "Confirm new password" : "Confirm password"}
            </Label>
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
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {hasPassword ? "Update password" : "Set password"}
            </Button>
            {saved ? (
              <span role="status" className="text-sm text-muted-foreground">
                {hasPassword
                  ? "Password updated. Other devices were signed out."
                  : "Password set. Other devices were signed out."}
              </span>
            ) : null}
          </div>
        </CardContent>
      </form>
    </Card>
  )
}

function SessionsCard({ devicesChanged }: { devicesChanged: number }) {
  const [list, setList] = React.useState<SessionList | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  // Which action is running, so only the button that was clicked spins while
  // all of them grey out. Null means nothing is running.
  const [runningId, setRunningId] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<string | null>(null)

  // Bumped to ask for the list again — by the retry button, and after anything
  // that ends a session. One counter keeps the fetch in a single place.
  const [reloads, setReloads] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    loadSessions()
      .then((next) => {
        if (cancelled) return
        setList(next)
        setLoadError(null)
      })
      .catch((listError) => {
        if (!cancelled) setLoadError(getAuthErrorMessage(listError))
      })
    return () => {
      cancelled = true
    }
  }, [devicesChanged, reloads])

  // Every sign-out goes through here, so a second click cannot start while the
  // first is still running. `id` is what the running button spins by.
  const run = React.useCallback(
    async (id: string, action: () => Promise<string>) => {
      setRunningId(id)
      setResult(null)
      try {
        setResult(await action())
        setReloads((count) => count + 1)
      } catch (sessionError) {
        showErrorToast(getAuthErrorMessage(sessionError))
      } finally {
        setRunningId(null)
      }
    },
    []
  )

  const working = runningId !== null
  const hidden = list ? list.total - list.sessions.length : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Devices</CardTitle>
        <CardDescription>
          Where you are signed in. Sign out anything you do not recognise.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <TableSurface>
          {loadError ? (
            <ErrorBanner
              message={loadError}
              onRetry={() => setReloads((count) => count + 1)}
            />
          ) : !list ? (
            <div className="flex justify-center p-6">
              <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {/* The flexible column, but without the dashboard `main`
                      column's 320px floor — this table lives in a modal that is
                      only as wide as a phone. */}
                  <TableHead className="w-full">Device</TableHead>
                  {/* The address is the first thing to go on a phone: the
                      browser name and when it was last used are what somebody
                      spots a stranger by. */}
                  <TableHead className="hidden sm:table-cell">
                    Signed in from
                  </TableHead>
                  <TableHead>Last active</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Sign out</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.sessions.map((session) => (
                  <TableRow key={session.id}>
                    {/* Wraps rather than staying on one line, so the badge can
                        drop below the name on a phone instead of pushing the
                        rest of the row off the screen. */}
                    <TableCell className="whitespace-normal">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {session.device}
                        {session.isCurrent ? (
                          <Badge variant="secondary">This device</Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell
                      column="mutedMeta"
                      className="hidden sm:table-cell"
                    >
                      {session.ipAddress ?? "Unknown"}
                    </TableCell>
                    <TableCell
                      column="mutedMeta"
                      title={formatDateTime(session.lastSeenAt)}
                    >
                      {formatTimeAgo(session.lastSeenAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {session.isCurrent ? null : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={working}
                          title="Sign out this device"
                          aria-label={`Sign out ${session.device}`}
                          onClick={() =>
                            void run(session.id, async () => {
                              await revokeSession(session.id)
                              return `Signed out ${session.device}.`
                            })
                          }
                        >
                          {runningId === session.id ? (
                            <Loader2Icon className="size-4 animate-spin" />
                          ) : (
                            <LogOutIcon className="size-4" />
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TableSurface>

        {list && list.total > 1 ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              disabled={working}
              onClick={() =>
                void run("all-others", async () => {
                  const { removed } = await signOutOtherSessions()
                  return `Signed out ${removed} other ${removed === 1 ? "device" : "devices"}.`
                })
              }
            >
              {runningId === "all-others" ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : null}
              Sign out all other devices
            </Button>
            {hidden > 0 ? (
              <span className="text-sm text-muted-foreground">
                {hidden} older {hidden === 1 ? "device is" : "devices are"} not
                shown. Signing out all other devices clears{" "}
                {hidden === 1 ? "it" : "them"} too.
              </span>
            ) : null}
          </div>
        ) : null}

        {result ? (
          <span role="status" className="text-sm text-muted-foreground">
            {result}
          </span>
        ) : null}
      </CardContent>
    </Card>
  )
}

/**
 * Deleting asks for something only the owner could type. Normally that is the
 * password; an account that signs in with Google has none, so it is asked for
 * its own email address instead.
 */
function DeleteAccountCard({
  hasPassword,
  email,
}: {
  hasPassword: boolean
  email: string
}) {
  const [open, setOpen] = React.useState(false)
  const [confirmation, setConfirmation] = React.useState("")
  const [deleting, setDeleting] = React.useState(false)

  const handleDelete = React.useCallback(async () => {
    dismissErrorToast()
    setDeleting(true)

    try {
      await deleteAccount(confirmation)
      window.location.href = "/login"
    } catch (deleteError) {
      showErrorToast(getAuthErrorMessage(deleteError))
      setDeleting(false)
    }
  }, [confirmation])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Delete account</CardTitle>
        <CardDescription>
          This closes your account. You have {ACCOUNT_RESTORE_DAYS} days to
          change your mind before it and everything in it are gone for good.
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
        description={
          hasPassword
            ? `You are signed out everywhere and cannot sign in again. Signing in with your password within ${ACCOUNT_RESTORE_DAYS} days brings the account back; after that it is deleted for good, and any paid plan stops at the end of the period you already paid for.`
            : `You are signed out everywhere and cannot sign in again. You sign in with Google and have no password, so only an admin can bring the account back — ask within ${ACCOUNT_RESTORE_DAYS} days. After that it is deleted for good, and any paid plan stops at the end of the period you already paid for.`
        }
        confirmLabel="Delete account"
        loading={deleting}
        disabled={!confirmation}
        onConfirm={() => void handleDelete()}
      >
        <Card size="sm">
          <CardHeader>
            <CardTitle>Confirm it is you</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              {hasPassword ? (
                <Label htmlFor="delete-confirmation">Password</Label>
              ) : (
                <FieldLabel
                  htmlFor="delete-confirmation"
                  hint={`Type ${email} to confirm. You sign in with Google, so there is no password to ask for.`}
                >
                  Email address
                </FieldLabel>
              )}
              <Input
                id="delete-confirmation"
                type={hasPassword ? "password" : "email"}
                autoComplete={hasPassword ? "current-password" : "email"}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      </ConfirmDialog>
    </Card>
  )
}
