import * as React from "react"
import { Loader2Icon } from "lucide-react"

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
import { ErrorBanner } from "@/components/ui/error-banner"
import { ImageUpload } from "@/components/shared/image-upload"
import { Input } from "@/components/ui/input"
import { FieldLabel } from "@/components/ui/field-label"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import {
  cancelPendingEmailChange,
  getAuthErrorMessage,
  loadEmailChange,
  requestEmailChange,
  updateProfile,
  type EmailChangeState,
} from "@/lib/api/auth"
import { EMAIL_CHANGE_HOURS } from "@/lib/email-change"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { useAsyncAction } from "@/lib/use-async-action"
import { formatDateTime } from "@/lib/format-time"
import type { AuthUser } from "@/lib/api/auth"

export function AccountProfilePage({
  user,
  planName,
  isPaid,
  formId,
  onSaved,
  onManageBilling,
  onStatusChange,
}: {
  user: AuthUser
  planName: string
  isPaid: boolean
  // The Save button lives in the modal footer, so it submits this form by id
  // and mirrors the status reported back through onStatusChange.
  formId: string
  onSaved: () => void
  onManageBilling: () => void
  onStatusChange: (status: {
    saving: boolean
    saved: boolean
    dirty: boolean
  }) => void
}) {
  const [name, setName] = React.useState(user.name)
  const [avatarUrl, setAvatarUrl] = React.useState(user.avatarUrl)
  const [saved, setSaved] = React.useState(false)
  const [run, saving] = useAsyncAction(getAuthErrorMessage)
  // Nothing to write when both fields match what's already stored, so the
  // footer's Save button switches off rather than sending a pointless request.
  const dirty = name.trim() !== user.name || avatarUrl !== user.avatarUrl

  React.useEffect(() => {
    onStatusChange({ saving, saved, dirty })
  }, [saving, saved, dirty, onStatusChange])

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setSaved(false)
      setSaved(
        await run(async () => {
          await updateProfile(name, avatarUrl)
          onSaved()
        })
      )
    },
    [avatarUrl, name, onSaved, run]
  )

  return (
    <CardGroup className="w-full">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your profile and current plan.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Badge variant={isPaid ? "default" : "secondary"}>{planName}</Badge>
          <Badge variant="outline">
            {user.role === "admin" ? "Admin" : "Member"}
          </Badge>
          {user.emailVerified ? null : (
            <Badge variant="outline">Email not verified</Badge>
          )}
          <Button
            type="button"
            variant="outline"
            className="ml-auto"
            onClick={onManageBilling}
          >
            Manage billing
          </Button>
        </CardContent>
      </Card>

      <Card>
        <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              This photo and name are how you show up around the app.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <ImageUpload
              label="Photo"
              value={avatarUrl}
              onChange={(url) => {
                setSaved(false)
                setAvatarUrl(url)
              }}
              aspect="square"
              emptyLabel="Add photo"
              className="max-w-20"
            />
            <div className="grid gap-2 sm:flex-1">
              <Label htmlFor="account-name">Name</Label>
              <Input
                id="account-name"
                value={name}
                onChange={(event) => {
                  // Drop the footer's "Saved" the moment the field no longer
                  // matches what was saved.
                  setSaved(false)
                  setName(event.target.value)
                }}
                maxLength={255}
                required
              />
            </div>
          </CardContent>
        </form>
      </Card>

      <EmailCard email={user.email} hasPassword={user.hasPassword} />
    </CardGroup>
  )
}

/**
 * Which field a refusal is about, matched on the server's own codes the same
 * way `getAuthErrorMessage` matches them. The toast says what went wrong; this
 * is what still points at the field afterwards.
 */
function refusedField(error: unknown): "email" | "password" | null {
  const code = error instanceof Error ? error.message : ""
  if (code.includes("INVALID_CREDENTIALS")) return "password"
  if (code.includes("EMAIL_TAKEN") || code.includes("EMAIL_UNCHANGED")) {
    return "email"
  }
  return null
}

/**
 * Moving the account to another address.
 *
 * Nothing here changes the account. Asking mails a confirmation link to the new
 * address, and opening that link is what moves it — so the card sits in one of
 * two states: the form, or the address it is waiting on.
 */
function EmailCard({
  email,
  hasPassword,
}: {
  email: string
  hasPassword: boolean
}) {
  const [change, setChange] = React.useState<EmailChangeState | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const [newEmail, setNewEmail] = React.useState("")
  const [currentPassword, setCurrentPassword] = React.useState("")
  const [working, setWorking] = React.useState(false)
  // Which field the last refusal belongs to, so the red ring still marks it
  // once the toast carrying the reason has been dismissed.
  const [invalid, setInvalid] = React.useState<"email" | "password" | null>(null)

  React.useEffect(() => {
    let cancelled = false
    loadEmailChange()
      .then((next) => {
        if (cancelled) return
        setChange(next)
        setLoadError(null)
      })
      .catch((changeError) => {
        if (!cancelled) setLoadError(getAuthErrorMessage(changeError))
      })
    return () => {
      cancelled = true
    }
  }, [reloads])

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      dismissErrorToast()
      setInvalid(null)
      setWorking(true)

      try {
        setChange(
          await requestEmailChange(
            newEmail,
            hasPassword ? currentPassword : undefined
          )
        )
        // Cleared on success only: a refused attempt keeps what was typed so
        // the address does not have to go in again.
        setNewEmail("")
        setCurrentPassword("")
      } catch (requestError) {
        showErrorToast(getAuthErrorMessage(requestError))
        setInvalid(refusedField(requestError))
      } finally {
        setWorking(false)
      }
    },
    [currentPassword, hasPassword, newEmail]
  )

  const handleCancel = React.useCallback(async () => {
    dismissErrorToast()
    setWorking(true)

    try {
      await cancelPendingEmailChange()
      setChange({ pendingEmail: null, expiresAt: null })
    } catch (cancelError) {
      showErrorToast(getAuthErrorMessage(cancelError))
    } finally {
      setWorking(false)
    }
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email</CardTitle>
        <CardDescription>
          The address you sign in with and where account email goes.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-2">
          <Label htmlFor="account-email">Current email</Label>
          <Input id="account-email" value={email} readOnly disabled />
        </div>

        {loadError ? (
          <ErrorBanner
            message={loadError}
            onRetry={() => setReloads((count) => count + 1)}
          />
        ) : !change ? (
          <div className="flex justify-center py-2">
            <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : change.pendingEmail ? (
          <div className="flex flex-col gap-4">
            <span role="status" className="text-sm text-muted-foreground">
              We sent a confirmation link to{" "}
              <span className="font-medium text-foreground">
                {change.pendingEmail}
              </span>
              . Your email changes when you open it, and the link stops working
              on {formatDateTime(change.expiresAt)}.
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={working}
                onClick={() => void handleCancel()}
              >
                Cancel change
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className={hasPassword ? "grid gap-4 sm:grid-cols-2" : "grid gap-4"}>
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="new-email"
                  hint={`We email a confirmation link to the new address. Nothing changes until you open it, and the link expires after ${EMAIL_CHANGE_HOURS} hours.`}
                >
                  New email
                </FieldLabel>
                <Input
                  id="new-email"
                  type="email"
                  autoComplete="email"
                  maxLength={255}
                  aria-invalid={invalid === "email" || undefined}
                  value={newEmail}
                  onChange={(event) => {
                    setInvalid(null)
                    setNewEmail(event.target.value)
                  }}
                  required
                />
              </div>
              {hasPassword ? (
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="email-change-password"
                    hint="Asked for because changing this address changes how the account is reached, including password resets."
                  >
                    Current password
                  </FieldLabel>
                  <PasswordInput
                    id="email-change-password"
                    autoComplete="current-password"
                    aria-invalid={invalid === "password" || undefined}
                    value={currentPassword}
                    onChange={(event) => {
                      setInvalid(null)
                      setCurrentPassword(event.target.value)
                    }}
                    required
                  />
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={working}>
                {working ? (
                  <>
                    <Loader2Icon className="animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send confirmation link"
                )}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
