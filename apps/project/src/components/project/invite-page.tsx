import { useNavigate, useRouter } from "@tanstack/react-router"
import { Loader2Icon, MailIcon } from "lucide-react"

import { CardTop, FeedCard } from "@/components/shared/feed-card"
import { Button } from "@/components/ui/button"
import { acceptTeamInvite, type InviteForMe } from "@/lib/api/project/teams"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { TEAM_ROLE_LABEL } from "@/lib/project/rules"

const BLOCKED: Record<NonNullable<InviteForMe["blocker"]>, (invite: InviteForMe) => string> = {
  expired: () => "This invite has expired. Ask whoever sent it for a new one.",
  "wrong-email": (invite) =>
    `This invite was sent to ${invite.email}. Sign out and sign in with that address to accept it.`,
  "already-on-team": () =>
    "You're already on a team. Leave it from the Team page first, then open this link again.",
}

/** Where an invite link lands, once the person is signed in. */
export function InvitePage({ invite }: { invite: InviteForMe | null }) {
  const navigate = useNavigate()
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  async function join(target: InviteForMe) {
    const ok = await run(() => acceptTeamInvite(target.id), `You joined ${target.teamName}.`)
    if (!ok) return
    await router.invalidate()
    await navigate({ to: "/projects" })
  }

  return (
    <div className="max-w-xl">
      <FeedCard>
        <CardTop icon={MailIcon} title={invite ? `Join ${invite.teamName}` : "Invite not found"} />
        <div className="grid gap-4 p-4 sm:p-5">
          {!invite ? (
            <p className="text-sm text-muted-foreground">
              This invite no longer exists. It may have been cancelled, sent again with a new link,
              or already accepted. Ask whoever sent it for a new one.
            </p>
          ) : invite.blocker ? (
            <p className="text-sm text-muted-foreground">{BLOCKED[invite.blocker](invite)}</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {invite.invitedByName ? `${invite.invitedByName} invited you` : "You're invited"} to
                join {invite.teamName} as {TEAM_ROLE_LABEL[invite.role].toLowerCase()}.
              </p>
              <div>
                <Button type="button" disabled={busy} onClick={() => void join(invite)}>
                  {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                  Join {invite.teamName}
                </Button>
              </div>
            </>
          )}
        </div>
      </FeedCard>
    </div>
  )
}
