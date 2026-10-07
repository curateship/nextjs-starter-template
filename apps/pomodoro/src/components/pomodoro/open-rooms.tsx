import * as React from "react"
import { Link } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { InlineError } from "@/components/ui/inline-error"
import { enterRoomFromSnapshot } from "@/components/pomodoro/active-room"
import { OpenRoomCard, RoomGroupEmpty } from "@/components/pomodoro/room-card"
import { joinRoom, listRooms } from "@/lib/api/pomodoro/rooms"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import { usePageVisible } from "@/lib/pomodoro/use-page-visible"
import { joinRefusalMessage } from "@/lib/pomodoro/room-join"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

export type OpenRoomRow = Awaited<ReturnType<typeof listRooms>>[number]
export type JoinProblem = { slug: string; message: string } | null

/**
 * "Open to join": the heading and a card per room that is waiting or on a
 * break. Drawn the same on `/rooms` and on the front page, which each bring
 * their own list and their own join.
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
  return (
    <section
      ref={sectionRef}
      aria-labelledby="open-to-join-heading"
      className={`flex scroll-mt-6 flex-col gap-5 ${className ?? ""}`}
    >
      <h3
        id="open-to-join-heading"
        className="text-3xl font-bold tracking-tight"
      >
        Open to join
      </h3>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map(({ room, hostName, memberCount }) => (
          <OpenRoomCard
            key={room.id}
            roomId={room.id}
            background={room.background}
            sound={room.sound}
            name={room.name}
            hostName={hostName}
            phase={room.phase}
            phaseEndsAt={room.phaseEndsAt}
            memberCount={memberCount}
            nextFocusMinutes={room.focusMinutes}
            joinButton={
              <Button
                className="h-11 rounded-full bg-black px-6 text-base text-white hover:bg-black/80 dark:hover:bg-black/80"
                disabled={joiningSlug !== ""}
                onClick={() => onJoin(room.slug)}
              >
                {joiningSlug === room.slug ? (
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
              joinProblem?.slug === room.slug ? (
                <InlineError className="text-xs">{joinProblem.message}</InlineError>
              ) : null
            }
          />
        ))}
        {!rooms.length ? (
          <RoomGroupEmpty>No rooms here yet.</RoomGroupEmpty>
        ) : null}
      </div>
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
