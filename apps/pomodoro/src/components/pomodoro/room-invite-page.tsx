import * as React from "react"
import { Link, useNavigate, useParams } from "@tanstack/react-router"
import {
  CalendarClockIcon,
  Loader2Icon,
  LockKeyholeIcon,
  MusicIcon,
  UsersIcon,
} from "lucide-react"
import { joinRefusalMessage } from "@/lib/pomodoro/room-join"
import { useSwitchRoomConfirm } from "@/components/pomodoro/switch-room-confirm"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { lookupRoom, joinRoom } from "@/lib/api/pomodoro/rooms"
import { applyRoomSnapshot } from "@/lib/pomodoro/room-clock-store"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import { sceneFor, soundLabelFor } from "@/lib/pomodoro/media-pair"
import { useMediaCatalog } from "@/lib/pomodoro/room-media-store"
import {
  describeWaitUntil,
  formatRoomStart,
} from "@/lib/pomodoro/scheduled-rooms"

/** How long a pressed Check again shows "Checking…" at the least. */
const CHECK_AGAIN_HOLD_MS = 800

/**
 * The invite page at /rooms/$slug, with the old app's seven states: checking,
 * failed, not found, closed, banned, already a member, locked mid-focus, and
 * joinable. Booked rooms add an eighth, because an invitation email arrives
 * before its room exists to join.
 */
export function RoomInvitePage() {
  const { authenticated } = useProductAuth()
  const { slug } = useParams({ from: "/_pomodoro/rooms_/$slug" })
  const navigate = useNavigate()
  const [lookup, setLookup] = React.useState<Awaited<
    ReturnType<typeof lookupRoom>
  > | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [checking, setChecking] = React.useState(false)
  const [joining, setJoining] = React.useState(false)
  const [error, setError] = React.useState("")
  const switchRoom = useSwitchRoomConfirm()
  // When a pressed Check again last answered, so the card can say what it
  // found. Null until one has, and again while the next one runs.
  const [checkedAt, setCheckedAt] = React.useState<Date | null>(null)

  /** Reads the invite again. Answers whether the read worked. */
  const refresh = React.useCallback(
    async (holdMs = 0) => {
      setFailed(false)
      if (slug.length < 12 || slug.length > 80) {
        setLookup({ status: "not_found" })
        return true
      }
      setChecking(true)
      try {
        const [found] = await Promise.all([
          lookupRoom(slug),
          new Promise((resolve) => window.setTimeout(resolve, holdMs)),
        ])
        setLookup(found)
        return true
      } catch {
        setFailed(true)
        return false
      } finally {
        setChecking(false)
      }
    },
    [slug]
  )
  React.useEffect(() => {
    void refresh()
  }, [refresh])

  // A refused join's sentence belongs to that try, so asking again clears it.
  // The answer usually comes back in a tenth of a second, which only flashed
  // "Checking…" (Tyler, 11 Oct 2026), so a press holds it long enough to read.
  // The card then says what was found, even when nothing changed, or a
  // press that changes nothing looks like it did nothing (Tyler, same day).
  const checkAgain = () => {
    setError("")
    setCheckedAt(null)
    void refresh(CHECK_AGAIN_HOLD_MS).then((worked) => {
      if (worked) setCheckedAt(new Date())
    })
  }
  const checkedLine = checkedAt ? (
    <p role="status" className="text-sm text-muted-foreground">
      Checked at{" "}
      {checkedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}.{" "}
      {lookup?.status === "locked"
        ? "Still in a focus session, so joins open at the next break."
        : lookup?.status === "scheduled"
          ? "The room has not opened yet."
          : lookup?.status === "joinable"
            ? "The room is open to join now."
            : null}
    </p>
  ) : null

  const join = async () => {
    setJoining(true)
    setError("")
    try {
      // The room is drawn on the front page, in its own sound and theme.
      applyRoomSnapshot(await joinRoom(slug))
      void navigate({ to: "/" })
    } catch (cause) {
      // The same sentence Rooms shows for the same refusal.
      setError(joinRefusalMessage(cause))
      setCheckedAt(null)
      void refresh()
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
              <CheckAgainButton checking={checking} onCheck={checkAgain}>
                Try again
              </CheckAgainButton>
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
              <Button asChild variant="outline">
                <Link to="/rooms">Browse rooms</Link>
              </Button>
            </>
          ) : lookup.status === "closed" ? (
            <>
              <h2 className="text-xl font-bold">{lookup.name}</h2>
              <p className="text-sm text-muted-foreground">
                This room has ended.
              </p>
              <Button asChild variant="outline">
                <Link to="/rooms">Browse rooms</Link>
              </Button>
            </>
          ) : lookup.status === "scheduled" ? (
            <>
              <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--p-accent-2)]">
                You’re invited
              </p>
              <h2 className="text-xl font-bold">{lookup.name}</h2>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarClockIcon className="size-4" aria-hidden="true" />
                {formatRoomStart(
                  new Date(lookup.startsAt),
                  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                That is{" "}
                {describeWaitUntil(new Date(lookup.startsAt), new Date())}, in
                your own clock. The room opens itself then, with{" "}
                {lookup.focusMinutes} minute focus sessions. Come back to this
                link at the time and you are in.
              </p>
              <InvitePair sound={lookup.sound} background={lookup.background} />
              {checkedLine}
              <div className="flex gap-2">
                <CheckAgainButton checking={checking} onCheck={checkAgain}>
                  Check again
                </CheckAgainButton>
                {authenticated ? (
                  <Button asChild variant="outline">
                    <Link to="/rooms">Browse rooms</Link>
                  </Button>
                ) : (
                  <Button asChild variant="outline">
                    <Link to="/register">Sign up</Link>
                  </Button>
                )}
              </div>
            </>
          ) : lookup.status === "banned" ? (
            <>
              <h2 className="text-xl font-bold">{lookup.name}</h2>
              <p className="text-sm text-muted-foreground">
                You can’t join this room.
              </p>
              <Button asChild variant="outline">
                <Link to="/rooms">Browse rooms</Link>
              </Button>
            </>
          ) : lookup.status === "member" ? (
            <>
              <h2 className="text-xl font-bold">{lookup.name}</h2>
              <p className="text-sm text-muted-foreground">
                You’re already in this room.
              </p>
              <Button asChild>
                <Link to="/">Go to your room</Link>
              </Button>
            </>
          ) : lookup.status === "locked" ? (
            <>
              <h2 className="text-xl font-bold">{lookup.name}</h2>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LockKeyholeIcon className="size-4" aria-hidden="true" />
                {lookup.memberCount} focusing right now - joins unlock at the
                next break.
              </p>
              <InvitePair sound={lookup.sound} background={lookup.background} />
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              {checkedLine}
              <div className="flex gap-2">
                <CheckAgainButton checking={checking} onCheck={checkAgain}>
                  Check again
                </CheckAgainButton>
                <Button asChild variant="outline">
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
              <InvitePair sound={lookup.sound} background={lookup.background} />
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              {checkedLine}
              {authenticated ? (
                <Button
                  disabled={joining}
                  // Asks first when you are in another room.
                  onClick={() =>
                    switchRoom.confirmJoin(
                      { slug, name: lookup.name, background: lookup.background, sound: lookup.sound },
                      () => void join()
                    )
                  }
                >
                  {joining ? "Joining…" : "Join room"}
                </Button>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Log in and you come straight back to this invite to join.
                  </p>
                  <div className="flex gap-2">
                    <Button asChild>
                      {/* The login page re-checks this is a path inside the
                          app before following it (`safeRedirectPath`). */}
                      <Link to="/login" search={{ redirect: `/rooms/${slug}` }}>
                        Log in to join
                      </Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link to="/register">Sign up</Link>
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
      {switchRoom.dialog}
    </div>
  )
}

/** Reads the invite again, and shows it is doing so until the answer comes. */
function CheckAgainButton({
  checking,
  onCheck,
  children,
}: {
  checking: boolean
  onCheck: () => void
  children: React.ReactNode
}) {
  return (
    <Button disabled={checking} onClick={onCheck}>
      {checking ? (
        <>
          <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
          Checking…
        </>
      ) : (
        children
      )}
    </Button>
  )
}

/**
 * What the room sounds and looks like, so an invitation says what you are
 * joining: the scene's picture and the sound's name. Nothing for a room from
 * before rooms carried a pair.
 */
function InvitePair({
  sound,
  background,
}: {
  sound: string | null
  background: string | null
}) {
  const catalog = useMediaCatalog()
  const scene = sceneFor(catalog, background)
  const soundName = soundLabelFor(catalog, sound)
  if (!scene && !soundName) return null
  return (
    <div className="flex items-center gap-3">
      {scene ? (
        <img
          src={scene.stillUrl}
          alt=""
          className="h-10 w-16 rounded-md object-cover"
        />
      ) : null}
      <p className="flex flex-col text-sm text-muted-foreground">
        {scene ? <span>{scene.label}</span> : null}
        {soundName ? (
          <span className="flex items-center gap-1">
            <MusicIcon className="size-3.5" aria-hidden="true" />
            {soundName}
          </span>
        ) : null}
      </p>
    </div>
  )
}
