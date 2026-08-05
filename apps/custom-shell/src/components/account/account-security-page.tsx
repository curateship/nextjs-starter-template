import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { startRegistration } from "@simplewebauthn/browser"
import { Loader2Icon, LogOutIcon, Trash2Icon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { ErrorBanner } from "@/components/ui/error-banner"
import { Input } from "@/components/ui/input"
import { FieldLabel } from "@/components/ui/field-label"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
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
import {
  beginPasskeyRegistration,
  finishPasskeyRegistration,
  loadPasskeys,
  removePasskey,
  type PasskeyListItem,
} from "@/lib/api/passkeys"
import { ACCOUNT_RESTORE_DAYS } from "@/lib/account-deletion"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { useAsyncAction } from "@/lib/use-async-action"
import { formatDateTime, formatTimeAgo } from "@/lib/format-time"
import { plural } from "@/lib/plural"
import { useLastValue } from "@/lib/use-last-value"
import { useBrowserSupportsWebAuthn } from "@/lib/use-webauthn-support"

const MISMATCH_MESSAGE = "Those passwords do not match."

export function AccountSecurityPage({
  user,
  isPaid,
}: {
  user: AuthUser
  /** Whether they are on a paid plan, which deleting cancels. */
  isPaid: boolean
}) {
  const router = useRouter()
  // Changing a password signs out every other device, so the list below it has
  // to be fetched again or it keeps showing devices that are already gone.
  const [devicesChanged, setDevicesChanged] = React.useState(0)

  return (
    <CardGroup className="w-full">
      <ChangePasswordCard
        hasPassword={user.hasPassword}
        onPasswordChanged={() => {
          setDevicesChanged((count) => count + 1)
          // Setting a first password changes what this tab offers, and the
          // answer comes from the shell's copy of the account.
          void router.invalidate()
        }}
      />
      <PasskeysCard />
      <SessionsCard devicesChanged={devicesChanged} />
      <DeleteAccountCard
        hasPassword={user.hasPassword}
        email={user.email}
        isPaid={isPaid}
      />
    </CardGroup>
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
  const [confirmTouched, setConfirmTouched] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [run, saving] = useAsyncAction(getAuthErrorMessage)

  const confirmMismatches =
    confirmPassword.length > 0 && confirmPassword !== newPassword
  // Only show the red ring once the confirm field has been visited, so it
  // appears as the user types the second password rather than the instant they
  // enter the first character.
  const mismatch = confirmTouched && confirmMismatches

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setSaved(false)

      if (newPassword !== confirmPassword) {
        setConfirmTouched(true)
        showErrorToast(MISMATCH_MESSAGE)
        return
      }

      setSaved(
        await run(async () => {
          await changePassword(
            hasPassword ? currentPassword : undefined,
            newPassword
          )
          setCurrentPassword("")
          setNewPassword("")
          setConfirmPassword("")
          setConfirmTouched(false)
          onPasswordChanged()
        })
      )
    },
    [
      confirmPassword,
      currentPassword,
      hasPassword,
      newPassword,
      onPasswordChanged,
      run,
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
              <PasswordInput
                id="current-password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => {
                  // Drop the "Password updated" note the moment a new change
                  // starts, so it cannot be read as the answer to this one.
                  setSaved(false)
                  setCurrentPassword(event.target.value)
                }}
                required
              />
            </div>
          ) : null}
          <div className="grid gap-2">
            <FieldLabel htmlFor="new-password" hint={PASSWORD_RULE_HINT}>
              {hasPassword ? "New password" : "Password"}
            </FieldLabel>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              minLength={8}
              value={newPassword}
              onChange={(event) => {
                setSaved(false)
                setNewPassword(event.target.value)
              }}
              required
            />
          </div>
          <div className="grid gap-2">
            <FieldLabel
              htmlFor="confirm-new-password"
              hint="Type the same password again."
            >
              {hasPassword ? "Confirm new password" : "Confirm password"}
            </FieldLabel>
            <PasswordInput
              id="confirm-new-password"
              autoComplete="new-password"
              minLength={8}
              value={confirmPassword}
              onChange={(event) => {
                setSaved(false)
                setConfirmPassword(event.target.value)
              }}
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

/**
 * The passkeys this account can sign in with: add one, see when each was last
 * used, take one away. Removing the last one is fine — the password stays.
 */
function PasskeysCard() {
  const [list, setList] = React.useState<PasskeyListItem[] | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const supported = useBrowserSupportsWebAuthn()
  const [name, setName] = React.useState("")
  const [runAdd, adding] = useAsyncAction(describeAddPasskeyError)
  const [runRemove, removing] = useAsyncAction(getAuthErrorMessage)
  // The passkey the confirmation is asking about, or null when it is closed.
  const [pendingRemove, setPendingRemove] =
    React.useState<PasskeyListItem | null>(null)
  const shownRemove = useLastValue(pendingRemove)
  const [result, setResult] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    loadPasskeys()
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
  }, [reloads])

  const handleAdd = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setResult(null)

      await runAdd(async () => {
        const { options, challengeId } = await beginPasskeyRegistration()
        // The browser takes over here: fingerprint, face, or device PIN.
        const response = await startRegistration({ optionsJSON: options })
        await finishPasskeyRegistration({
          challengeId,
          response,
          name: name.trim(),
        })
        setName("")
        setResult("Passkey added.")
        setReloads((count) => count + 1)
      })
    },
    [name, runAdd]
  )

  const handleRemove = React.useCallback(async () => {
    if (!pendingRemove) return
    setResult(null)

    await runRemove(async () => {
      await removePasskey(pendingRemove.id)
      setPendingRemove(null)
      setResult("Passkey removed. You can still sign in with your password.")
      setReloads((count) => count + 1)
    })
  }, [pendingRemove, runRemove])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passkeys</CardTitle>
        <CardDescription>
          Sign in with your fingerprint, face, or device PIN instead of typing
          your password. Your password keeps working either way.
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
          ) : list.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No passkeys yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {/* Same treatment as the Devices table below: the modal is
                      only as wide as a phone, so no 320px floor. */}
                  <TableHead column="main" className="min-w-0">
                    Name
                  </TableHead>
                  <TableHead column="meta" className="hidden sm:table-cell">
                    Added
                  </TableHead>
                  <TableHead column="meta">Last used</TableHead>
                  <TableHead column="meta" className="text-right">
                    <span className="sr-only">Remove</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((passkey) => (
                  <TableRow key={passkey.id}>
                    <TableCell className="whitespace-normal">
                      {passkey.name}
                    </TableCell>
                    <TableCell
                      column="mutedMeta"
                      className="hidden sm:table-cell"
                      title={formatDateTime(passkey.createdAt)}
                    >
                      {formatTimeAgo(passkey.createdAt)}
                    </TableCell>
                    <TableCell
                      column="mutedMeta"
                      title={
                        passkey.lastUsedAt
                          ? formatDateTime(passkey.lastUsedAt)
                          : undefined
                      }
                    >
                      {passkey.lastUsedAt
                        ? formatTimeAgo(passkey.lastUsedAt)
                        : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      <DisabledReason
                        disabled={adding || removing}
                        reason="Wait for the current passkey action to finish."
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={adding || removing}
                          aria-label={`Remove ${passkey.name}`}
                          onClick={() => setPendingRemove(passkey)}
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      </DisabledReason>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TableSurface>

        {supported ? (
          <form onSubmit={handleAdd} className="flex flex-col gap-4">
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="new-passkey-name"
                hint="A name to tell your passkeys apart — usually the device it lives on, like “Work laptop”. Left empty, it is saved as “Passkey”."
              >
                Name
              </FieldLabel>
              <Input
                id="new-passkey-name"
                maxLength={80}
                value={name}
                onChange={(event) => {
                  setResult(null)
                  setName(event.target.value)
                }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={adding || removing}>
                {adding ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : null}
                Add a passkey
              </Button>
              {result ? (
                <span role="status" className="text-sm text-muted-foreground">
                  {result}
                </span>
              ) : null}
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            This browser cannot create passkeys, so there is nothing to add
            from here. Your existing passkeys still work on the devices that
            hold them.
          </p>
        )}
      </CardContent>

      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null)
        }}
        title={`Remove “${shownRemove?.name ?? ""}”?`}
        description="This passkey stops working for signing in here. It stays on the device itself until you delete it there, and you can always sign in with your password."
        confirmLabel="Remove passkey"
        loading={removing}
        onConfirm={() => void handleRemove()}
      />
    </Card>
  )
}

/**
 * The two refusals the browser itself raises get their own words — the shared
 * error map has never heard of them.
 */
function describeAddPasskeyError(error: unknown) {
  if (error instanceof Error) {
    if (error.name === "NotAllowedError") {
      return "The passkey prompt was closed before it finished. Nothing was saved."
    }
    if (error.name === "InvalidStateError") {
      return "This device already holds a passkey for your account."
    }
  }
  return getAuthErrorMessage(error)
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
                      only as wide as a phone. Same treatment the Invoices table
                      in this window uses, so the two match. */}
                  <TableHead column="main" className="min-w-0">
                    Device
                  </TableHead>
                  {/* The address is the first thing to go on a phone: the
                      browser name and when it was last used are what somebody
                      spots a stranger by. */}
                  <TableHead column="meta" className="hidden sm:table-cell">
                    Signed in from
                  </TableHead>
                  <TableHead column="meta">Last active</TableHead>
                  <TableHead column="meta" className="text-right">
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
                        <DisabledReason
                          disabled={working}
                          reason="Wait for the current session action to finish."
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={working}
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
                        </DisabledReason>
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
                  return `Signed out ${removed} other ${plural(removed, "device", "devices")}.`
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
                {hidden} older {plural(hidden, "device is", "devices are")} not
                shown. Signing out all other devices clears{" "}
                {plural(hidden, "it", "them")} too.
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
 * What deleting your own account costs you, in the order you need to hear it:
 * you are locked out now, your paid plan stops now, and here is the one way
 * back — which does not include the plan.
 */
function describeSelfDeletion(hasPassword: boolean, isPaid: boolean) {
  const locked = "You are signed out everywhere and cannot sign in again."
  const plan = isPaid
    ? " Your paid plan is cancelled straight away, so you are not charged again. The rest of the period you have already paid for is not refunded."
    : ""
  const planGone = isPaid ? ", though not the plan" : ""

  const back = hasPassword
    ? ` Signing in with your password within ${ACCOUNT_RESTORE_DAYS} days brings the account back${planGone}; after that it is deleted for good.`
    : ` You sign in with Google and have no password, so only an admin can bring the account back${planGone} — ask within ${ACCOUNT_RESTORE_DAYS} days. After that it is deleted for good.`

  return `${locked}${plan}${back}`
}

/**
 * Deleting asks for something only the owner could type. Normally that is the
 * password; an account that signs in with Google has none, so it is asked for
 * its own email address instead.
 */
function DeleteAccountCard({
  hasPassword,
  email,
  isPaid,
}: {
  hasPassword: boolean
  email: string
  isPaid: boolean
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
        description={describeSelfDeletion(hasPassword, isPaid)}
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
                <>
                  <Label htmlFor="delete-confirmation">Password</Label>
                  {/* Revealed the same way as every other password box: this is
                      the one box you cannot undo getting wrong. */}
                  <PasswordInput
                    id="delete-confirmation"
                    autoComplete="current-password"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                </>
              ) : (
                <>
                  <FieldLabel
                    htmlFor="delete-confirmation"
                    hint={`Type ${email} to confirm. You sign in with Google, so there is no password to ask for.`}
                  >
                    Email address
                  </FieldLabel>
                  <Input
                    id="delete-confirmation"
                    type="email"
                    autoComplete="email"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </ConfirmDialog>
    </Card>
  )
}
