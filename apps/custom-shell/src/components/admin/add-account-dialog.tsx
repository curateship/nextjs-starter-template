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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createAccountAsAdmin,
  getAdminUserErrorMessage,
} from "@/lib/api/admin-users"
import { showErrorToast } from "@/lib/error-toast"
import { useAsyncAction } from "@/lib/use-async-action"

/**
 * Adds a person directly: the account exists at once, and they get an email
 * with a link that sets their password. Until they use it, nobody can sign in
 * to the account.
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
  const [run, saving] = useAsyncAction(getAdminUserErrorMessage)
  const nameInputRef = React.useRef<HTMLInputElement>(null)

  const dirty = Boolean(name.trim() || email.trim() || role !== "member")

  const handleCreate = React.useCallback(async () => {
    if (!name.trim()) {
      showErrorToast("Account name is required.")
      return
    }
    if (!email.trim()) {
      showErrorToast("Email address is required.")
      return
    }
    await run(async () => {
      const { delivered } = await createAccountAsAdmin(
        email.trim(),
        name.trim(),
        role
      )
      toast.success(
        delivered
          ? "Account created. They have been emailed a link to set their password."
          : "Account created. Email is switched off here, so the set-password link was printed in the server log instead."
      )
      setName("")
      setEmail("")
      setRole("member")
      await onCreated()
    })
  }, [email, name, onCreated, role, run])

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
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
              They get an email with a link to set their password. Until they
              do, nobody can sign in to the account.
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
                        maxLength={255}
                        aria-invalid={!name.trim() || undefined}
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
                        maxLength={255}
                        aria-invalid={!email.trim() || undefined}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>Access</CardTitle>
                  <CardDescription>
                    Admins reach the whole back office.
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
                {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Create account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
