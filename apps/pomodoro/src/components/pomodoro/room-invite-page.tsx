import * as React from "react"
import { Link, useNavigate, useParams } from "@tanstack/react-router"
import { LockKeyholeIcon, UsersIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { lookupRoom, joinRoom } from "@/lib/api/pomodoro/rooms"
import { useProductAuth } from "@/lib/pomodoro/auth-state"

/**
 * The invite page at /rooms/$slug, with the old app's seven states:
 * checking, failed, not found, closed, banned, already a member, locked
 * mid-focus, and joinable (signed in or prompted to sign in).
 */
export function RoomInvitePage() {
  const { authenticated } = useProductAuth()
  const { slug } = useParams({ from: "/_pomodoro/rooms_/$slug" })
  const navigate = useNavigate()
  const [lookup, setLookup] = React.useState<Awaited<
    ReturnType<typeof lookupRoom>
  > | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [joining, setJoining] = React.useState(false)
  const [error, setError] = React.useState("")

  const refresh = React.useCallback(() => {
    setFailed(false)
    if (slug.length < 12 || slug.length > 80) {
      setLookup({ status: "not_found" })
      return
    }
    lookupRoom(slug)
      .then(setLookup)
      .catch(() => setFailed(true))
  }, [slug])
  React.useEffect(() => {
    refresh()
  }, [refresh])

  const join = async () => {
    setJoining(true)
    setError("")
    try {
      await joinRoom(slug)
      void navigate({ to: "/rooms" })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : ""
      setError(
        message.includes("ROOM_LOCKED")
          ? "The room just started a focus session. Try again during the break."
          : message.includes("ROOM_CLOSED")
            ? "This room has ended."
            : message.includes("ROOM_BANNED")
              ? "You can't join this room."
              : "Joining failed. Try again."
      )
      refresh()
      setJoining(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col py-16">
      <Card>
        <CardContent
          className="flex flex-col items-start gap-3 py-8"
          aria-label="Room invite"
        >
          {failed ? (
            <>
              <h2 className="text-xl font-bold">Something went wrong</h2>
              <p className="text-sm text-muted-foreground">
                The invite could not be checked.
              </p>
              <Button className="rounded-full font-bold" onClick={refresh}>
                Try again
              </Button>
            </>
          ) : !lookup ? (
            <p role="status" className="text-sm text-muted-foreground">
              Checking this invite…
            </p>
          ) : lookup.status === "not_found" ? (
            <>
              <h2 className="text-xl font-bold">Invite not found</h2>
              <p className="text-sm text-muted-foreground">
                This invite link isn’t valid. Check that it was copied
                completely.
              </p>
              <Button asChild variant="outline" className="rounded-full">
                <Link to="/rooms">Browse rooms</Link>
              </Button>
            </>
          ) : lookup.status === "closed" ? (
            <>
              <h2 className="text-xl font-bold">{lookup.name}</h2>
              <p className="text-sm text-muted-foreground">
                This room has ended.
              </p>
              <Button asChild variant="outline" className="rounded-full">
                <Link to="/rooms">Browse rooms</Link>
              </Button>
            </>
          ) : lookup.status === "banned" ? (
            <>
              <h2 className="text-xl font-bold">{lookup.name}</h2>
              <p className="text-sm text-muted-foreground">
                You can’t join this room.
              </p>
              <Button asChild variant="outline" className="rounded-full">
                <Link to="/rooms">Browse rooms</Link>
              </Button>
            </>
          ) : lookup.status === "member" ? (
            <>
              <h2 className="text-xl font-bold">{lookup.name}</h2>
              <p className="text-sm text-muted-foreground">
                You’re already in this room.
              </p>
              <Button asChild className="rounded-full font-bold">
                <Link to="/rooms">Go to your room</Link>
              </Button>
            </>
          ) : lookup.status === "locked" ? (
            <>
              <h2 className="text-xl font-bold">{lookup.name}</h2>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LockKeyholeIcon className="size-4" aria-hidden="true" />
                {lookup.memberCount} focusing right now — joins unlock at the
                next break.
              </p>
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <div className="flex gap-2">
                <Button className="rounded-full font-bold" onClick={refresh}>
                  Check again
                </Button>
                <Button asChild variant="outline" className="rounded-full">
                  <Link to="/rooms">Browse rooms</Link>
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--p-accent-2)]">
                You’re invited
              </p>
              <h2 className="text-xl font-bold">{lookup.name}</h2>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <UsersIcon className="size-4" aria-hidden="true" />
                {lookup.memberCount} in the room · {lookup.focusMinutes} min
                focus sessions
              </p>
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              {authenticated ? (
                <Button
                  className="rounded-full font-bold"
                  disabled={joining}
                  onClick={() => void join()}
                >
                  {joining ? "Joining…" : "Join room"}
                </Button>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Sign in to join, then open this invite again.
                  </p>
                  <div className="flex gap-2">
                    <Button asChild className="rounded-full font-bold">
                      <Link to="/login">Sign in to join</Link>
                    </Button>
                    <Button asChild variant="outline" className="rounded-full">
                      <Link to="/register">Create free account</Link>
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
