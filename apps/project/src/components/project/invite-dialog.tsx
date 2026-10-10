import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { CopyIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { inviteToTeam, type SentInvite } from "@/lib/api/project/teams"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import {
  INVITE_LIFETIME_DAYS,
  TEAM_INVITE_ROLES,
  TEAM_ROLE_LABEL,
  type TeamInviteRole,
} from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Invites one person by email. Once sent, the window shows the link to copy,
 * and says plainly when no email went out because email isn't set up.
 */
export function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [email, setEmail] = React.useState("")
  const [role, setRole] = React.useState<TeamInviteRole>("member")
  const [invalid, setInvalid] = React.useState(false)
  const [sent, setSent] = React.useState<SentInvite | null>(null)
  const [run, saving] = useAsyncAction(getProjectErrorMessage)

  function close() {
    setEmail("")
    setRole("member")
    setInvalid(false)
    setSent(null)
    onClose()
  }

  async function send() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setInvalid(true)
      showErrorToast("That doesn't look like an email address.")
      return
    }
    const ok = await run(async () => {
      setSent(await inviteToTeam({ email, role }))
    })
    if (ok) await router.invalidate()
  }

  return (
    <FormDialog open={open} dirty={Boolean(email.trim()) && !sent} busy={saving} onClose={close}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{sent ? "Invite sent" : "Invite a teammate"}</DialogTitle>
            <DialogDescription>
              The invite works for {INVITE_LIFETIME_DAYS} days, and only for this email address.
            </DialogDescription>
          </DialogHeader>
          {sent ? (
            <>
              <DialogBody>
                <SentInviteCard sent={sent} email={email.trim().toLowerCase()} />
              </DialogBody>
              <DialogFooter>
                <Button type="button" onClick={close}>
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault()
                void send()
              }}
            >
              <DialogBody>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Who</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="invite-email">Email address</Label>
                      <Input
                        id="invite-email"
                        type="email"
                        value={email}
                        autoComplete="off"
                        aria-invalid={invalid || undefined}
                        onChange={(event) => {
                          setEmail(event.target.value)
                          setInvalid(false)
                        }}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="invite-role">Role</Label>
                      <Select value={role} onValueChange={(value) => setRole(value as TeamInviteRole)}>
                        <SelectTrigger id="invite-role" className="w-full sm:w-fit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TEAM_INVITE_ROLES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {TEAM_ROLE_LABEL[value]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Admins can invite and remove people and change the team's settings.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={requestClose} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
                  Send invite
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      )}
    </FormDialog>
  )
}

/** The link, and whether an email really went out. Shared with Resend. */
export function SentInviteCard({ sent, email }: { sent: SentInvite; email: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(sent.link)
      toast.success("Link copied.")
    } catch {
      showErrorToast("The link couldn't be copied. Select it and copy it by hand.")
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{sent.emailed ? `Emailed to ${email}` : "Email isn't set up, so nothing was sent"}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          {sent.emailed
            ? "You can also send them this link yourself."
            : sent.emailError
              ? `The email was refused: ${sent.emailError}. Send them this link yourself.`
              : "Send them this link yourself. An admin can set up email in Settings → Email."}
        </p>
        <div className="grid gap-2">
          <Label htmlFor="invite-link">Invite link</Label>
          <div className="flex gap-2">
            <Input id="invite-link" value={sent.link} readOnly onFocus={(event) => event.currentTarget.select()} />
            <Button type="button" variant="outline" onClick={() => void copy()}>
              <CopyIcon className="size-4" />
              Copy
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
