import * as React from "react"
import { Link } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { InlineError } from "@/components/ui/inline-error"
import { enterRoomFromSnapshot } from "@/components/pomodoro/active-room"
import { OpenRoomCard, RoomGroupEmpty } from "@/components/pomodoro/room-card"
import { joinRoom, listRooms } from "@/lib/api/pomodoro/rooms"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import { STARTING_SOON_SHOWN, isStartingSoon } from "@/lib/pomodoro/room-countdown"
import { usePageVisible } from "@/lib/pomodoro/use-page-visible"
import { joinRefusalMessage } from "@/lib/pomodoro/room-join"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

export type OpenRoomRow = Awaited<ReturnType<typeof listRooms>>[number]
export type JoinProblem = { slug: string; message: string } | null

/** Cards Open to join shows at first, and how many more each Load more adds. */
const OPEN_PAGE = 6

/**
 * "Starting soon" and "Open to join": a card per room that is waiting or on a
 * break. Drawn the same on `/rooms` and on the front page, which each bring
 * their own list and their own join.
 *
 * Tyler, 9 Oct 2026: "Show the 'Starting in ***' first and then 'Open to
 * join' follows it", and "Show 6 with a load more". The three soonest rooms
 * counting down a minute or more go under Starting soon; a 5-second
 * countdown is over before anybody could see it, so it stays where it was.
 */
export function OpenRoomsSection({
  sectionRef,
  rooms,
  joiningSlug,
  joinProblem,
  onJoin,
  className,
}: {
  /** Browse open rooms on `/rooms` scrolls here. */
  sectionRef?: React.Ref<HTMLElement>
  rooms: readonly OpenRoomRow[]
  /** The room a join is in flight for; every Join waits while one is. */
  joiningSlug: string
  /** Why the last join was refused, drawn on that room's own card. */
  joinProblem: JoinProblem
  onJoin: (slug: string) => void
  className?: string
}) {
  const [shown, setShown] = React.useState(OPEN_PAGE)
  // The clock is read after the first paint, never during render, so the
  // server and the browser draw the same; nothing is drawn until then, so no
  // card jumps between the groups. It is read again the moment the soonest
  // countdown ends, so a finished one leaves Starting soon on time.
  const [now, setNow] = React.useState<number | null>(null)
  React.useEffect(() => {
    const ends =
      now === null
        ? []
        : rooms.flatMap(({ room }) =>
            isStartingSoon(room, now) && room.startingAt ? [new Date(room.startingAt).getTime()] : []
          )
    const wait = now === null ? 0 : ends.length ? Math.max(0, Math.min(...ends) - Date.now()) + 100 : null
    if (wait === null) return
    const timer = window.setTimeout(() => setNow(Date.now()), wait)
    return () => window.clearTimeout(timer)
  }, [rooms, now])
  // The three soonest only. Tyler, 9 Oct 2026: "Only 3 starting in.. shows".
  // Any other room counting down stays under Open to join, its card saying
  // "starting in".
  const soon = rooms
    .filter(({ room }) => now !== null && isStartingSoon(room, now))
    .sort((a, b) => new Date(a.room.startingAt ?? 0).getTime() - new Date(b.room.startingAt ?? 0).getTime())
    .slice(0, STARTING_SOON_SHOWN)
  const open = rooms.filter((row) => !soon.includes(row))
  const card = (row: OpenRoomRow) => (
    <OpenRoomCard
      key={row.room.id}
      roomId={row.room.id}
      background={row.room.background}
      sound={row.room.sound}
      name={row.room.name}
      hostName={row.hostName}
      hostAvatarUrl={row.hostAvatarUrl}
      people={row.people}
      phase={row.room.phase}
      phaseEndsAt={row.room.phaseEndsAt}
      startingAt={row.room.startingAt}
      memberCount={row.memberCount}
      nextFocusMinutes={row.room.focusMinutes}
      featured={row.featured}
      joinButton={
        <Button
          className="h-11 rounded-full bg-black px-6 text-base text-white hover:bg-black/80 dark:hover:bg-black/80"
          disabled={joiningSlug !== ""}
          onClick={() => onJoin(row.room.slug)}
        >
          {joiningSlug === row.room.slug ? (
            <>
              <Loader2Icon className="animate-spin" aria-hidden="true" />
              Joining…
            </>
          ) : (
            "Join"
          )}
        </Button>
      }
      problem={
        joinProblem?.slug === row.room.slug ? (
          <InlineError className="text-xs">{joinProblem.message}</InlineError>
        ) : null
      }
    />
  )

  return (
    <section
      ref={sectionRef}
      aria-label="Rooms to join"
      className={`flex scroll-mt-6 flex-col gap-10 ${className ?? ""}`}
    >
      {now === null ? null : soon.length ? (
        <div className="flex flex-col gap-5">
          <h3 className="text-3xl font-bold tracking-tight">Starting soon</h3>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{soon.map(card)}</div>
        </div>
      ) : null}
      {/* Every room under Starting soon leaves nothing to say here. */}
      {now === null || (!open.length && soon.length) ? null : (
        <div className="flex flex-col gap-5">
          <h3 className="text-3xl font-bold tracking-tight">Open to join</h3>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {open.slice(0, shown).map(card)}
            {!rooms.length ? <RoomGroupEmpty>No rooms here yet.</RoomGroupEmpty> : null}
          </div>
          {open.length > shown ? (
            <div className="flex justify-center">
              <Button
                variant="outline"
                className="rounded-full px-6"
                onClick={() => setShown((count) => count + OPEN_PAGE)}
              >
                Load more
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}

/**
 * Open to join under the Tasks card on the front page. Tyler, 7 Oct 2026: "add
 * the open to join on the index under the task. If user is not logged in, that
 * should link to the login page."
 *
 * The front page is your personal room, so a join here simply moves you into
 * the room: the room store learns the room, and the front page draws it.
 *
 * A guest gets the heading and a card that leads to the login page instead of
 * the list. Listing rooms needs an account, because a host who has not picked
 * a public display name is listed by their account name.
 */
export function HomeOpenRooms({ className }: { className?: string }) {
  const { known, authenticated } = useProductAuth()
  const [rooms, setRooms] = React.useState<OpenRoomRow[] | null>(null)
  const [joiningSlug, setJoiningSlug] = React.useState("")
  const [joinProblem, setJoinProblem] = React.useState<JoinProblem>(null)
  const joiningRef = React.useRef("")
  const pageVisible = usePageVisible()

  // Read on arrival and every minute while the tab is on screen, quietly: a
  // failed read keeps the cards already showing.
  React.useEffect(() => {
    if (!authenticated || !pageVisible) return
    const read = () =>
      void listRooms().then(
        (rows) => setRooms(rows.filter(({ room }) => room.phase !== "focus")),
        () => setRooms((current) => current ?? [])
      )
    read()
    const interval = window.setInterval(read, 60_000)
    return () => window.clearInterval(interval)
  }, [authenticated, pageVisible])

  const join = async (slug: string) => {
    if (joiningRef.current) return
    joiningRef.current = slug
    setJoiningSlug(slug)
    setJoinProblem(null)
    dismissErrorToast()
    try {
      enterRoomFromSnapshot(await joinRoom(slug))
    } catch (cause) {
      const message = joinRefusalMessage(cause)
      setJoinProblem({ slug, message })
      showErrorToast(message)
    } finally {
      joiningRef.current = ""
      setJoiningSlug("")
    }
  }

  if (!known) return null
  if (!authenticated)
    return (
      <section
        aria-labelledby="open-to-join-heading"
        className={`flex flex-col gap-5 ${className ?? ""}`}
      >
        <h3
          id="open-to-join-heading"
          className="text-3xl font-bold tracking-tight"
        >
          Open to join
        </h3>
        <Link
          to="/login"
          search={{ redirect: "/" }}
          className="flex flex-col items-center gap-3 rounded-[24px] border-2 border-dashed border-[rgba(var(--p-fg-rgb),0.16)] p-10 text-center text-muted-foreground transition-colors hover:bg-[rgba(var(--p-fg-rgb),0.03)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span>Log in to see the rooms open right now and focus with others.</span>
          <span className="rounded-full bg-[var(--p-accent)] px-5 py-2 font-semibold text-[var(--p-on-accent)]">
            Log in
          </span>
        </Link>
      </section>
    )
  if (rooms === null) return null
  return (
    <OpenRoomsSection
      className={className}
      rooms={rooms}
      joiningSlug={joiningSlug}
      joinProblem={joinProblem}
      onJoin={(slug) => void join(slug)}
    />
  )
}
