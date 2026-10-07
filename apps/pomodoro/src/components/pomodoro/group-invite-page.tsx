import * as React from "react"
import { Link, useNavigate, useParams } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  joinFocusGroup,
  lookupFocusGroupInvite,
} from "@/lib/api/pomodoro/groups"
import {
  GROUP_JOIN_TOKEN_LENGTH,
  groupErrorMessage,
} from "@/lib/pomodoro/groups"
import { useProductAuth } from "@/lib/pomodoro/auth-state"

type Invite = Awaited<ReturnType<typeof lookupFocusGroupInvite>>

/**
 * The group invite page at `/groups/join/$token`.
 *
 * Joining a group needs an account, so a signed-out visitor is asked to sign in
 * and lands back here. Nothing about the group is shown before that: the link is
 * the only thing keeping strangers out, and a page that named the group to
 * anybody holding it would be a second, weaker door.
 */
export function GroupInvitePage() {
  const { known, authenticated } = useProductAuth()
  const { token } = useParams({ from: "/_pomodoro/groups_/join/$token" })
  const navigate = useNavigate()
  const [invite, setInvite] = React.useState<Invite | null>(null)
  const [failure, setFailure] = React.useState("")
  const [joining, setJoining] = React.useState(false)

  // An address of the wrong length is not a link this app ever made, so it is
  // refused without asking the server. Worked out from the address rather than
  // stored, so there is no state to get out of step with it.
  const badAddress = token.length !== GROUP_JOIN_TOKEN_LENGTH
  const problem = badAddress
    ? groupErrorMessage(new Error("GROUP_NOT_FOUND"))
    : failure

  React.useEffect(() => {
    if (!known || !authenticated || badAddress) return
    let cancelled = false
    void lookupFocusGroupInvite(token)
      .then((found) => {
        if (!cancelled) {
          setInvite(found)
          setFailure("")
        }
      })
      .catch((cause) => {
        if (!cancelled) setFailure(groupErrorMessage(cause))
      })
    return () => {
      cancelled = true
    }
  }, [known, authenticated, token, badAddress])

  const join = async () => {
    setJoining(true)
    setFailure("")
    try {
      await joinFocusGroup(token)
      void navigate({ to: "/leaderboard" })
    } catch (cause) {
      setFailure(groupErrorMessage(cause))
      setJoining(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col py-16">
      <Card>
        <CardContent
          className="flex flex-col items-start gap-3 py-8"
          aria-label="Group invite"
        >
          {!known ? (
            <p role="status" className="text-sm text-muted-foreground">
              Checking this invite…
            </p>
          ) : !authenticated ? (
            <>
              <h2 className="text-xl font-bold">Sign in to join</h2>
              <p className="text-sm text-muted-foreground">
                A focus group is a board of the people in it, so joining needs an
                account. Sign in and this link will still work.
              </p>
              <Button asChild>
                <Link to="/login" search={{ redirect: `/groups/join/${token}` }}>
                  Sign in
                </Link>
              </Button>
            </>
          ) : problem ? (
            <>
              <h2 className="text-xl font-bold">This invite did not work</h2>
              <p role="alert" className="text-sm text-muted-foreground">
                {problem}
              </p>
              <Button
                asChild
                variant="outline"
              >
                <Link to="/leaderboard">Back to the leaderboard</Link>
              </Button>
            </>
          ) : !invite ? (
            <p role="status" className="text-sm text-muted-foreground">
              Checking this invite…
            </p>
          ) : (
            <>
              <h2 className="text-xl font-bold">{invite.name}</h2>
              <p className="text-sm text-muted-foreground">
                {invite.memberCount === 1
                  ? "1 person is in this group."
                  : `${invite.memberCount} people are in this group.`}{" "}
                Joining shows your display name on its board and nowhere else.
              </p>
              <Button
                disabled={joining}
                onClick={() => void join()}
              >
                {joining ? "Joining…" : "Join this group"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
