import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

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
import { Textarea } from "@/components/ui/textarea"
import {
  inviteManyToTeam,
  inviteToTeam,
  type InviteOutcome,
  type SentInvite,
} from "@/lib/api/project/teams"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { INVITE_BATCH, inviteAddresses } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Invites one person, or up to 20 pasted at once, by email. Each becomes an
 * employee on the team at once and gets the "Set your password" email, whose
 * link works once and signs them in. One address says plainly whether the
 * email went out; several show what happened to each address.
 */
export function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [text, setText] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [sent, setSent] = React.useState<{ email: string; invite: SentInvite } | null>(null)
  const [outcomes, setOutcomes] = React.useState<InviteOutcome[] | null>(null)
  const [run, saving] = useAsyncAction(getProjectErrorMessage)
  const done = Boolean(sent || outcomes)

  function close() {
    setText("")
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
      if (emails.length === 1) setSent({ email: emails[0], invite: await inviteToTeam({ email: emails[0] }) })
      else setOutcomes(await inviteManyToTeam({ emails }))
    })
    if (ok) await router.invalidate()
  }

  return (
    <FormDialog open={open} dirty={Boolean(text.trim()) && !done} busy={saving} onClose={close}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{outcomes ? inviteResultTitle(outcomes) : sent ? "Invite sent" : "Invite people"}</DialogTitle>
            <DialogDescription>
              Each person joins the team as an employee straight away. Their email has a link to set
              their password, which signs them in on My dashboard.
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
  on_team: "Already on a team",
  not_an_employee: "That email belongs to an account that isn't an employee",
  not_an_email: "Not an email address",
  too_many: "Not sent, because too many invites went out. Try this one again later.",
  not_sent: "The email couldn't be sent. Try again.",
}

/** What happened to each address of a send with several. */
function InviteOutcomesCard({ outcomes }: { outcomes: InviteOutcome[] }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Each address</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3">
          {outcomes.map((outcome) => (
            <li key={outcome.email} className="grid min-w-0 gap-0.5">
              <span className="text-sm font-medium break-all">{outcome.email}</span>
              <span
                className={
                  outcome.result === "sent" || outcome.result === "on_team"
                    ? "text-xs text-muted-foreground"
                    : "text-xs text-destructive"
                }
              >
                {outcome.result === "sent"
                  ? outcome.sent.emailed
                    ? "On the team, and emailed"
                    : "On the team. Email is switched off here, so the link went to the server log."
                  : OUTCOME_TEXT[outcome.result]}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

/**
 * Whether the "Set your password" email went out. Shared with Resend. There is
 * no link to copy: it signs whoever opens it into the account, so it only ever
 * travels by email.
 */
export function SentInviteCard({ sent, email }: { sent: SentInvite; email: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{sent.emailed ? `Emailed to ${email}` : "Email is switched off here"}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {sent.emailed
            ? "They're on the team now. The link in the email sets their password and works once. If it runs out, send it again from Members."
            : "They're on the team now, but no email went out, so the link to set their password is in the server log. Set up email in Settings → Email."}
        </p>
      </CardContent>
    </Card>
  )
}
