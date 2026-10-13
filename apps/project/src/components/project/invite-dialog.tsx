import * as React from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
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
import { Textarea } from "@/components/ui/textarea"
import {
  inviteManyToTeam,
  inviteToTeam,
  type InviteOutcome,
  type SentInvite,
} from "@/lib/api/project/teams"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import {
  INVITE_BATCH,
  INVITE_LIFETIME_DAYS,
  TEAM_INVITE_ROLES,
  inviteAddresses,
  TEAM_ROLE_LABEL,
  type TeamInviteRole,
} from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Invites one person, or up to 20 pasted at once, by email. One address
 * shows its link to copy and says plainly when no email went out; several
 * show what happened to each address.
 */
export function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [text, setText] = React.useState("")
  const [role, setRole] = React.useState<TeamInviteRole>("member")
  const [invalid, setInvalid] = React.useState(false)
  const [sent, setSent] = React.useState<{ email: string; invite: SentInvite } | null>(null)
  const [outcomes, setOutcomes] = React.useState<InviteOutcome[] | null>(null)
  const [run, saving] = useAsyncAction(getProjectErrorMessage)
  const done = Boolean(sent || outcomes)

  function close() {
    setText("")
    setRole("member")
    setInvalid(false)
    setSent(null)
    setOutcomes(null)
    onClose()
  }

  async function send() {
    const emails = inviteAddresses(text)
    if (emails.length === 0 || (emails.length === 1 && !/^\S+@\S+\.\S+$/.test(emails[0]))) {
      setInvalid(true)
      showErrorToast("That doesn't look like an email address.")
      return
    }
    if (emails.length > INVITE_BATCH) {
      setInvalid(true)
      showErrorToast(`That's ${emails.length} addresses. One send takes at most ${INVITE_BATCH}.`)
      return
    }
    const ok = await run(async () => {
      if (emails.length === 1) setSent({ email: emails[0], invite: await inviteToTeam({ email: emails[0], role }) })
      else setOutcomes(await inviteManyToTeam({ emails, role }))
    })
    if (ok) await router.invalidate()
  }

  return (
    <FormDialog open={open} dirty={Boolean(text.trim()) && !done} busy={saving} onClose={close}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{outcomes ? inviteResultTitle(outcomes) : sent ? "Invite sent" : "Invite teammates"}</DialogTitle>
            <DialogDescription>
              Each invite works for {INVITE_LIFETIME_DAYS} days, and only for its own email address.
            </DialogDescription>
          </DialogHeader>
          {done ? (
            <>
              <DialogBody>
                {sent ? <SentInviteCard sent={sent.invite} email={sent.email} /> : null}
                {outcomes ? <InviteOutcomesCard outcomes={outcomes} /> : null}
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
                      <FieldLabel
                        htmlFor="invite-email"
                        hint={`One address, or up to ${INVITE_BATCH} on separate lines or with commas between them.`}
                      >
                        Email addresses
                      </FieldLabel>
                      <Textarea
                        id="invite-email"
                        rows={1}
                        value={text}
                        autoComplete="off"
                        aria-invalid={invalid || undefined}
                        onChange={(event) => {
                          setText(event.target.value)
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
                  {sendLabel(inviteAddresses(text).length)}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      )}
    </FormDialog>
  )
}

function sendLabel(count: number) {
  return count > 1 ? `Send ${count} invites` : "Send invite"
}

function inviteResultTitle(outcomes: InviteOutcome[]) {
  const sent = outcomes.filter((outcome) => outcome.result === "sent").length
  return sent === outcomes.length
    ? `${sent} invites sent`
    : `${sent} of ${outcomes.length} invites sent`
}

const OUTCOME_TEXT: Record<Exclude<InviteOutcome["result"], "sent">, string> = {
  on_team: "Already on the team",
  invited: "Already invited. Resend it from Members for a new link.",
  not_an_email: "Not an email address",
  too_many: "Not sent, because too many invites went out. Try this one again later.",
}

/** What happened to each address of a send with several, with each sent invite's link. */
function InviteOutcomesCard({ outcomes }: { outcomes: InviteOutcome[] }) {
  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      toast.success("Link copied.")
    } catch {
      showErrorToast("The link couldn't be copied. Resend it from Members to see it again.")
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Each address</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3">
          {outcomes.map((outcome) => (
            <li key={outcome.email} className="flex items-start gap-3">
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="text-sm font-medium break-all">{outcome.email}</span>
                <span
                  className={
                    outcome.result === "sent" || outcome.result === "on_team" || outcome.result === "invited"
                      ? "text-xs text-muted-foreground"
                      : "text-xs text-destructive"
                  }
                >
                  {outcome.result === "sent"
                    ? outcome.sent.emailed
                      ? "Emailed"
                      : outcome.sent.emailError
                        ? `The email was refused: ${outcome.sent.emailError}. Send the link yourself.`
                        : "Not emailed, because email isn't set up. Send the link yourself."
                    : OUTCOME_TEXT[outcome.result]}
                </span>
              </div>
              {outcome.result === "sent" ? (
                <Button type="button" variant="outline" size="sm" onClick={() => void copy(outcome.sent.link)}>
                  <CopyIcon className="size-4" />
                  Copy link
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

const authenticatedRoute = getRouteApi("/_authenticated")

/**
 * The link, and whether an email really went out: emailed, refused, or no
 * email set up. Shared with Resend. Settings → Email is named only to an app
 * admin, the one person who can open it.
 */
export function SentInviteCard({ sent, email }: { sent: SentInvite; email: string }) {
  const appAdmin = authenticatedRoute.useLoaderData().user.role === "admin"
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
        <CardTitle>
          {sent.emailed
            ? `Emailed to ${email}`
            : sent.emailError
              ? "The email didn't go out"
              : "Email isn't set up"}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          {sent.emailed
            ? "You can also send them this link yourself."
            : sent.emailError
              ? `It was refused: ${sent.emailError}. Send them this link yourself.`
              : appAdmin
                ? "Send them this link yourself. You can set up email in Settings → Email."
                : "Send them this link yourself."}
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
