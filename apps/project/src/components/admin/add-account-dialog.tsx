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
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PASSWORD_RULE_HINT } from "@/lib/api/auth/auth"
import {
  createAccountAsAdmin,
  getAdminUserErrorMessage,
} from "@/lib/api/people/admin-users"
import { showErrorToast } from "@/lib/toast/error-toast"
import { useAsyncAction } from "@/lib/hooks/use-async-action"

/** The rule the sign-up and reset forms enforce, so all three agree. */
const PASSWORD_MIN_LENGTH = 8

/**
 * Adds a person directly: the account exists at once, and they get an email
 * with a link that sets their password. Until they use it, nobody can sign in
 * to the account.
 *
 * An admin who would rather hand the password over themselves can type one
 * here instead. Then no email is sent and the person can sign in at once.
 */
export function AddAccountDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => Promise<void>
}) {
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [role, setRole] = React.useState<"admin" | "member">("member")
  const [password, setPassword] = React.useState("")
  const [nameTouched, setNameTouched] = React.useState(false)
  const [emailTouched, setEmailTouched] = React.useState(false)
  const [attempted, setAttempted] = React.useState(false)
  const [run, saving] = useAsyncAction(getAdminUserErrorMessage)
  const nameInputRef = React.useRef<HTMLInputElement>(null)

  const dirty = Boolean(
    name.trim() || email.trim() || password || role !== "member"
  )
  // A password typed here replaces the emailed link, so the dialog says which
  // of the two is about to happen rather than promising an email either way.
  const settingPassword = password.length > 0

  const handleCreate = React.useCallback(async () => {
    setAttempted(true)
    if (!name.trim()) {
      showErrorToast("Account name is required.")
      return
    }
    if (!email.trim()) {
      showErrorToast("Email address is required.")
      return
    }
    if (settingPassword && password.length < PASSWORD_MIN_LENGTH) {
      showErrorToast(
        `A password needs at least ${PASSWORD_MIN_LENGTH} characters.`
      )
      return
    }
    await run(async () => {
      const { delivered } = await createAccountAsAdmin(
        email.trim(),
        name.trim(),
        role,
        settingPassword ? password : undefined
      )
      toast.success(
        settingPassword
          ? "Account created. They can sign in with the password you set."
          : delivered
            ? "Account created. They have been emailed a link to set their password."
            : "Account created. Email is switched off here, so the set-password link was printed in the server log instead."
      )
      setName("")
      setEmail("")
      setPassword("")
      setRole("member")
      setNameTouched(false)
      setEmailTouched(false)
      setAttempted(false)
      await onCreated()
    })
  }, [email, name, onCreated, password, role, run, settingPassword])

  const close = () => {
    // Name and email stay, so reopening resumes a half-typed account. A
    // password does not: it draws as dots, so a leftover one would silently
    // become the next person's password.
    setPassword("")
    setNameTouched(false)
    setEmailTouched(false)
    setAttempted(false)
    onClose()
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={close}>
      {(requestClose) => (
        <DialogContent
          variant="admin"
          className="sm:max-w-lg"
          // A new account opens with the cursor in Name so you can just type.
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            nameInputRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>Add account</DialogTitle>
            <DialogDescription>
              {settingPassword
                ? "You are setting the password yourself, so no email is sent and they can sign in as soon as you pass it on."
                : "They get an email with a link to set their password. Until they do, nobody can sign in to the account."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void handleCreate()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Who they are</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="add-account-name">Name</Label>
                      <Input
                        id="add-account-name"
                        ref={nameInputRef}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        onBlur={() => setNameTouched(true)}
                        maxLength={255}
                        aria-invalid={
                          (!name.trim() && (nameTouched || attempted)) ||
                          undefined
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <FieldLabel
                        htmlFor="add-account-email"
                        hint="The set-password link goes to this address, so it has to be one they can read."
                      >
                        Email
                      </FieldLabel>
                      <Input
                        id="add-account-email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        onBlur={() => setEmailTouched(true)}
                        maxLength={255}
                        aria-invalid={
                          (!email.trim() && (emailTouched || attempted)) ||
                          undefined
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>Access</CardTitle>
                  <CardDescription>
                    Admins reach the whole back office. A password set here is
                    yours to pass on; the shell never shows it again.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="add-account-role">Role</Label>
                    <Select
                      value={role}
                      onValueChange={(value) =>
                        setRole(value as "admin" | "member")
                      }
                    >
                      <SelectTrigger
                        id="add-account-role"
                        className="w-full sm:w-fit"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor="add-account-password"
                      hint={`Leave it empty to email them a link to set their own. ${PASSWORD_RULE_HINT}`}
                    >
                      Password (optional)
                    </FieldLabel>
                    <PasswordInput
                      id="add-account-password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      // No minLength: the browser's own bubble would block
                      // submit before the dialog could say the same thing the
                      // way its other fields say it.
                      maxLength={128}
                      aria-invalid={
                        (settingPassword &&
                          password.length < PASSWORD_MIN_LENGTH &&
                          attempted) ||
                        undefined
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={requestClose}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : null}
                Create account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
