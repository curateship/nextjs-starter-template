import { useNavigate, useRouter } from "@tanstack/react-router"
import { Link2Icon, Loader2Icon } from "lucide-react"

import { CardTop, FeedCard } from "@/components/shared/feed-card"
import { Button } from "@/components/ui/button"
import { joinThroughLink, type JoinOffer } from "@/lib/api/project/team-running"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"

const BLOCKED: Record<NonNullable<JoinOffer["blocker"]>, string> = {
  expired: "This join link has expired. Ask the team for a new one.",
  "already-on-team":
    "You're already on a team, and an account can be on one team at a time. Leave it from the Team page first, then open this link again.",
}

/** Where a team's join link lands, once the person is signed in. */
export function JoinPage({ offer, token }: { offer: JoinOffer | null; token: string }) {
  const navigate = useNavigate()
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  async function join(target: JoinOffer) {
    const ok = await run(() => joinThroughLink(token), `You joined ${target.teamName}.`)
    if (!ok) return
    await router.invalidate()
    await navigate({ to: "/dashboard" })
  }

  return (
    <div className="max-w-xl">
      <FeedCard>
        <CardTop icon={Link2Icon} title={offer ? `Join ${offer.teamName}` : "Join link not found"} />
        <div className="grid gap-4 p-4 sm:p-5">
          {!offer ? (
            <p className="text-sm text-muted-foreground">
              This join link no longer works. It may have been reset or turned off. Ask the team for a
              new one.
            </p>
          ) : offer.blocker ? (
            <p className="text-sm text-muted-foreground">{BLOCKED[offer.blocker]}</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                You'll join {offer.teamName} as a member. Its owner and admins will see that you
                joined.
              </p>
              <div>
                <Button type="button" disabled={busy} onClick={() => void join(offer)}>
                  {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                  Join {offer.teamName}
                </Button>
              </div>
            </>
          )}
        </div>
      </FeedCard>
    </div>
  )
}
