import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Loader2Icon, MailIcon, UsersIcon } from "lucide-react"

import { CardTop, FeedCard } from "@/components/shared/feed-card"
import { Button } from "@/components/ui/button"
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
  acceptTeamInvite,
  createProjectTeam,
  declineTeamInvite,
  type InviteForMe,
} from "@/lib/api/project/teams"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS, TEAM_ROLE_LABEL } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * What someone sees before they are on a team: a way to start one, and any
 * invites waiting for their email address. Every Project screen shows this in
 * place of its own content until there is a team.
 */
export function TeamStart({ invites }: { invites: InviteForMe[] }) {
  return (
    <div className="grid max-w-2xl" style={{ gap: pageGutter }}>
      {invites.length ? <InvitesForMe invites={invites} /> : null}
      <CreateTeamCard />
    </div>
  )
}

/** Every time zone this browser knows, with the reader's own first. */
function timeZones(own: string) {
  const all =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : ["UTC"]
  return [own, ...all.filter((zone) => zone !== own)]
}

function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
}

function CreateTeamCard() {
  const router = useRouter()
  const [name, setName] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const own = React.useMemo(() => browserTimeZone(), [])
  const [timeZone, setTimeZone] = React.useState(own)
  const zones = React.useMemo(() => timeZones(own), [own])
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("Give the team a name.")
      return
    }
    const ok = await run(() => createProjectTeam({ name, timeZone }), "Team created.")
    if (ok) await router.invalidate()
  }

  return (
    <FeedCard>
      <CardTop icon={UsersIcon} title="Start a team" />
      <form className="grid gap-4 p-4 sm:p-5" onSubmit={create}>
        <p className="text-sm text-muted-foreground">
          You'll be the team's owner. Invite your teammates once it's made.
        </p>
        <div className="grid gap-2">
          <Label htmlFor="team-name">Team name</Label>
          <Input
            id="team-name"
            value={name}
            maxLength={LIMITS.teamName}
            aria-invalid={invalid || undefined}
            placeholder="Acme"
            onChange={(event) => {
              setName(event.target.value)
              setInvalid(false)
            }}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="team-time-zone">Time zone</Label>
          <Select value={timeZone} onValueChange={setTimeZone}>
            <SelectTrigger id="team-time-zone" className="w-full sm:w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {zones.map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone.replaceAll("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Create team
          </Button>
        </div>
      </form>
    </FeedCard>
  )
}

const BLOCKER_TEXT: Record<NonNullable<InviteForMe["blocker"]>, string> = {
  expired: "This invite has expired. Ask for a new one.",
  "wrong-email": "Sent to a different email address.",
  "already-on-team": "Leave your current team to join this one.",
}

export function InvitesForMe({ invites }: { invites: InviteForMe[] }) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  async function answer(invite: InviteForMe, join: boolean) {
    const ok = await run(
      () => (join ? acceptTeamInvite(invite.id) : declineTeamInvite(invite.id)),
      join ? `You joined ${invite.teamName}.` : "Invite declined."
    )
    if (ok) await router.invalidate()
  }

  return (
    <FeedCard>
      <CardTop icon={MailIcon} title="Invites for you" meta={String(invites.length)} />
      <ul className="divide-y">
        {invites.map((invite) => (
          <li
            key={invite.id}
            className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{invite.teamName}</p>
              <p className="text-sm text-muted-foreground">
                {invite.invitedByName ? `${invite.invitedByName} invited you` : "You're invited"} as{" "}
                {TEAM_ROLE_LABEL[invite.role].toLowerCase()}.
                {invite.blocker ? ` ${BLOCKER_TEXT[invite.blocker]}` : null}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void answer(invite, false)}
              >
                Decline
              </Button>
              {invite.blocker ? null : (
                <Button type="button" disabled={busy} onClick={() => void answer(invite, true)}>
                  Join {invite.teamName}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </FeedCard>
  )
}
