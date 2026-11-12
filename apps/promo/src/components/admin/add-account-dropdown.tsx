import * as React from "react"

import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PASSWORD_RULE_HINT } from "@/lib/api/auth/auth"
import { createAccountAsAdmin, getAdminUserErrorMessage } from "@/lib/api/people/admin-users"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import type { Role } from "@/lib/role-id"
import { allRoles } from "@/lib/roles"
import { showErrorToast } from "@/lib/toast/error-toast"

/** The rule the sign-up and reset forms enforce, so all three agree. */
const PASSWORD_MIN_LENGTH = 8

/**
 * The add-account form: name, email, role and an optional password, with
 * what Create does. Used by Users' Add account dropdown and by the Admin
 * page's + → New user, so both ask the same things the same way.
 *
 * The account exists at once, and they get an email with a link that sets
 * their password; until they use it, nobody can sign in to it. An admin who
 * would rather hand a password over types one here instead, and then no email
 * is sent. Closing keeps what was typed for the next opening, except the
 * password, which is never kept (`forgetPassword`).
 */
export function useAccountForm(onCreated: () => Promise<void>) {
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [role, setRole] = React.useState<Role>("member")
  const [password, setPassword] = React.useState("")
  const [nameTouched, setNameTouched] = React.useState(false)
  const [emailTouched, setEmailTouched] = React.useState(false)
  const [attempted, setAttempted] = React.useState(false)
  const [run, saving] = useAsyncAction(getAdminUserErrorMessage)
  const settingPassword = password.length > 0

  const forgetPassword = () => {
    setPassword("")
    setAttempted(false)
  }

  /** Creates the account; true once it exists. */
  const submit = async (): Promise<boolean> => {
    setAttempted(true)
    if (!name.trim()) {
      showErrorToast("Account name is required.")
      return false
    }
    if (!email.trim()) {
      showErrorToast("Email address is required.")
      return false
    }
    if (settingPassword && password.length < PASSWORD_MIN_LENGTH) {
      showErrorToast(`A password needs at least ${PASSWORD_MIN_LENGTH} characters.`)
      return false
    }
    let created = false
    await run(async () => {
      const { delivered } = await createAccountAsAdmin(
        email.trim(),
        name.trim(),
        role,
        settingPassword ? password : undefined
      )
      // Only partly done: the person was never emailed, so the admin has to
      // know where the link went.
      if (!settingPassword && !delivered) {
        showErrorToast("Account created. Email is switched off here, so the set-password link was printed in the server log instead.")
      }
      setName("")
      setEmail("")
      setRole("member")
      setNameTouched(false)
      setEmailTouched(false)
      forgetPassword()
      created = true
      await onCreated()
    })
    return created
  }

  const fields = (
    <>
      <div className="grid gap-2">
        <Label htmlFor="add-account-name">Name</Label>
        <Input
          id="add-account-name"
          autoFocus
          value={name}
          maxLength={255}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => setNameTouched(true)}
          aria-invalid={(!name.trim() && (nameTouched || attempted)) || undefined}
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
          maxLength={255}
          onChange={(event) => setEmail(event.target.value)}
          onBlur={() => setEmailTouched(true)}
          aria-invalid={(!email.trim() && (emailTouched || attempted)) || undefined}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="add-account-role">Role</Label>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger id="add-account-role" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allRoles().map((one) => (
              <SelectItem key={one.id} value={one.id}>
                {one.label}
              </SelectItem>
            ))}
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
          // No minLength: the browser's own bubble would block the press
          // before the form could say the same thing its other fields say.
          maxLength={128}
          aria-invalid={(settingPassword && password.length < PASSWORD_MIN_LENGTH && attempted) || undefined}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {settingPassword
          ? "No email is sent. They can sign in once you pass the password on."
          : "They get an email with a link to set their password."}
      </p>
    </>
  )

  return { fields, submit, saving, forgetPassword }
}

/**
 * Add account, a dropdown under the Users header's button rather than a
 * window (Tyler, 9 Nov 2026: "In users add account button, make it a dropdown
 * instead of modal"), drawn in the shared "New …" frame as New lead is.
 */
export function AddAccountDropdown({
  trigger,
  onCreated,
}: {
  /** The header's button that opens it. */
  trigger: React.ReactNode
  onCreated: () => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const form = useAccountForm(onCreated)
  const changeOpen = (next: boolean) => {
    if (!next) form.forgetPassword()
    setOpen(next)
  }
  return (
    <NewRecordDropdown
      label="Add account"
      open={open}
      onOpenChange={changeOpen}
      submitLabel="Create account"
      busy={form.saving}
      onSubmit={() =>
        void form.submit().then((created) => {
          if (created) setOpen(false)
        })
      }
      trigger={trigger}
    >
      {form.fields}
    </NewRecordDropdown>
  )
}
