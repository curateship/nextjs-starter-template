import * as React from "react"
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  cancelBookedRoom,
  cancelRepeat,
  createRoom,
  joinRoom,
  leaveActiveRoom,
  listMyRepeats,
  listRooms,
  listUpcoming,
  repeatRoom,
  scheduleRoom,
  skipNextRepeat,
  loadHostingOptions,
} from "@/lib/api/pomodoro/rooms"
import {
  useActiveRoom,
  type ConfirmRequest,
  type RoomSnapshotClient,
} from "@/components/pomodoro/active-room"
import {
  UpcomingRooms,
  type MyRepeatRow,
  type SeriesTarget,
  type UpcomingRoomRow,
} from "@/components/pomodoro/upcoming-rooms"
import { RoomColumns } from "@/components/pomodoro/room-columns"
import {
  OpenRoomsSection,
  type JoinProblem,
} from "@/components/pomodoro/open-rooms"
import { joinRefusalMessage, roomRefusalSentence } from "@/lib/pomodoro/room-join"
import { RhythmMinutesFields } from "@/components/pomodoro/rhythm-minutes-fields"
import {
  roomPairProblem,
  roomPairProblemMessage,
  type RoomPairProblem,
} from "@/lib/pomodoro/media-pair"
import { useMediaCatalog } from "@/lib/pomodoro/room-media-store"
import { catalogTags } from "@/lib/pomodoro/media-pool"
import {
  formatRoomStart,
  MAX_ROOM_INVITES,
  parseInviteEmails,
  scheduleProblem,
  scheduleProblemMessage,
} from "@/lib/pomodoro/scheduled-rooms"
import {
  describeRoomRepeat,
  parseClockTime,
  ROOM_REPEAT_LEAD_HOURS,
  roomRepeatProblem,
  roomRepeatProblemMessage,
} from "@/lib/pomodoro/room-repeats"
import {
  toggleWeekdayInSet,
  weekdayInitials,
  weekdayNames,
  weekdaySetHas,
} from "@/lib/pomodoro/task-repeats"
import { browserTimezone } from "@/lib/pomodoro/timer"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import { usePageVisible } from "@/lib/pomodoro/use-page-visible"
import { PRO_PERKS } from "@/lib/pomodoro/pro"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { contentColumn } from "@/lib/pomodoro/content-column"
import { listTimerPresets } from "@/lib/api/pomodoro/timer-presets"
import {
  builtinTimerPresets,
  matchRoomPreset,
  roomPresetSummary,
  type CustomTimerPreset,
} from "@/lib/pomodoro/timer-presets"

/**
 * The rooms page: your three rooms side by side (personal, joined, hosted,
 * with the one you are in lit), then "Open to join" (waiting or on break) and
 * the rooms you booked. A room mid-focus is not listed, since nobody can join
 * it until its break. Public cards show member counts, never names — the old
 * privacy rule after a real leak.
 */
export function RoomsPage() {
  const { authenticated } = useProductAuth()
  const { user } = getRouteApi("/_pomodoro").useLoaderData()
  const openRoomsRef = React.useRef<HTMLElement>(null)
  const [leavingRoom, setLeavingRoom] = React.useState(false)
  const navigate = useNavigate()
  const [roomRows, setRoomRows] = React.useState<
    Awaited<ReturnType<typeof listRooms>>
  >([])
  const [showHostForm, setShowHostForm] = React.useState(false)
  // The room a Join is in flight for. One join at a time, however many
  // presses: the ref answers at once, the state redraws the button.
  const [joiningSlug, setJoiningSlug] = React.useState("")
  const joiningRef = React.useRef("")
  // A refused join belongs to the card that was pressed, so it is drawn there
  // as well as in the toast. Cleared by the next join.
  const [joinProblem, setJoinProblem] = React.useState<JoinProblem>(null)
  const [confirm, setConfirm] = React.useState<ConfirmRequest | null>(null)
  const [upcoming, setUpcoming] = React.useState<UpcomingRoomRow[]>([])
  const [series, setSeries] = React.useState<MyRepeatRow[]>([])
  // The slug or weekly rule a cancel is running for.
  const [cancellingKey, setCancellingKey] = React.useState("")

  const refreshRooms = React.useCallback(() => {
    if (!authenticated) return
    void listRooms()
      .then(setRoomRows)
      .catch(() => showErrorToast("Rooms could not be loaded."))
    void listUpcoming()
      .then(setUpcoming)
      .catch(() => showErrorToast("Upcoming rooms could not be loaded."))
    void listMyRepeats()
      .then(setSeries)
      .catch(() => showErrorToast("Your weekly rooms could not be loaded."))
  }, [authenticated])
  React.useEffect(refreshRooms, [refreshRooms])

  // Which room you are in, kept live by the same hook the front page uses.
  // A failure is said out loud rather than read as "no room": the browse
  // list on its own would tell somebody sitting in a room that they had left
  // it. The room itself is drawn on the front page; this page links to it.
  const live = useActiveRoom({ onEnded: refreshRooms })
  const activeRoom = live.activeRoom
  const roomCheckFailed = live.checkFailed

  /** You are now in this room: the front page is where it is drawn. */
  const goToRoom = (snapshot: RoomSnapshotClient) => {
    live.applySnapshot(snapshot)
    void navigate({ to: "/" })
  }

  const pageVisible = usePageVisible()

  // The open and booked lists are of live things, so they are read again
  // every minute while this tab is on screen, and once on coming back to it.
  // These reads are quiet: a failure keeps the rows already showing instead
  // of putting up a toast every minute.
  const refreshListsQuietly = React.useCallback(() => {
    if (!authenticated) return
    void listRooms().then(setRoomRows, () => {})
    void listUpcoming().then(setUpcoming, () => {})
  }, [authenticated])
  const wasVisibleRef = React.useRef(pageVisible)
  React.useEffect(() => {
    const cameBack = pageVisible && !wasVisibleRef.current
    wasVisibleRef.current = pageVisible
    if (!pageVisible) return
    if (cameBack) refreshListsQuietly()
    const interval = window.setInterval(refreshListsQuietly, 60_000)
    return () => window.clearInterval(interval)
  }, [pageVisible, refreshListsQuietly])

  const performJoin = async (slug: string) => {
    if (joiningRef.current) return
    joiningRef.current = slug
    setJoiningSlug(slug)
    setJoinProblem(null)
    dismissErrorToast()
    try {
      const snapshot = await joinRoom(slug)
      refreshRooms()
      goToRoom(snapshot)
    } catch (cause) {
      const message = joinRefusalMessage(cause)
      setJoinProblem({ slug, message })
      showErrorToast(message)
      refreshRooms()
    } finally {
      joiningRef.current = ""
      setJoiningSlug("")
    }
  }

  const joinBySlug = async (slug: string) => {
    if (!authenticated) {
      void navigate({ to: "/login", search: { redirect: "/rooms" } })
      return
    }
    if (activeRoom?.you.role === "host") {
      setConfirm({
        title: "Join another room?",
        description:
          "Joining another room closes the room you currently host and ends it for its members.",
        confirmLabel: "Join room",
        onConfirm: () => void performJoin(slug),
      })
      return
    }
    await performJoin(slug)
  }

  const cancelBooking = async (room: UpcomingRoomRow) => {
    dismissErrorToast()
    setCancellingKey(room.slug)
    try {
      const { cancelledInvites } = await cancelBookedRoom(room.slug)
      toast.success(
        cancelledInvites
          ? `${room.name} is cancelled. ${cancelledInvites} ${cancelledInvites === 1 ? "invitation that had not gone out was" : "invitations that had not gone out were"} stopped.`
          : `${room.name} is cancelled.`
      )
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : ""
      showErrorToast(
        message.includes("ROOM_ALREADY_OPEN")
          ? "That room already opened, so it has to be closed from inside instead."
          : message.includes("ROOM_HOST_REQUIRED")
            ? "Only the host can cancel that booking."
            : "The booking could not be cancelled."
      )
    } finally {
      setCancellingKey("")
      refreshRooms()
    }
  }

  const readerTimezone = browserTimezone()
  const seriesRefusal = (cause: unknown, fallback: string) => {
    const text = cause instanceof Error ? cause.message : ""
    return text.includes("ROOM_REPEAT_CANCELLED")
      ? "That series was already cancelled."
      : text.includes("ROOM_REPEAT_NOT_FOUND")
        ? "That weekly room no longer exists."
        : fallback
  }

  const skipWeek = async (target: SeriesTarget) => {
    dismissErrorToast()
    setCancellingKey(target.repeatId)
    try {
      const { skippedStartsAt, cancelledInvites } = await skipNextRepeat(
        target.repeatId
      )
      const when = formatRoomStart(new Date(skippedStartsAt), readerTimezone)
      toast.success(
        cancelledInvites
          ? `${target.name} on ${when} is cancelled, and ${cancelledInvites} ${cancelledInvites === 1 ? "invitation that had not gone out was" : "invitations that had not gone out were"} stopped. The series carries on.`
          : `${target.name} on ${when} is cancelled. The series carries on.`
      )
    } catch (cause) {
      showErrorToast(seriesRefusal(cause, "That week could not be cancelled."))
    } finally {
      setCancellingKey("")
      refreshRooms()
    }
  }

  const cancelSeries = async (target: SeriesTarget) => {
    dismissErrorToast()
    setCancellingKey(target.repeatId)
    try {
      const { cancelledRooms } = await cancelRepeat(target.repeatId)
      toast.success(
        cancelledRooms
          ? `The ${target.name} series is cancelled, along with the room already booked for it.`
          : `The ${target.name} series is cancelled. No more rooms will be booked.`
      )
    } catch (cause) {
      showErrorToast(seriesRefusal(cause, "The series could not be cancelled."))
    } finally {
      setCancellingKey("")
      refreshRooms()
    }
  }

  const confirmSkipWeek = (target: SeriesTarget) =>
    setConfirm({
      title: target.startsAt
        ? `Cancel ${target.name} on ${formatRoomStart(target.startsAt, readerTimezone)}?`
        : `Cancel the next ${target.name}?`,
      description: target.invited
        ? "Only this one is called off and the series books the next one as usual. Invitations that have not gone out are stopped, but anyone already emailed will not be told."
        : "Only this one is called off. The series books the next one as usual.",
      confirmLabel: "Cancel this week",
      onConfirm: () => void skipWeek(target),
    })

  const confirmCancelSeries = (target: SeriesTarget) =>
    setConfirm({
      title: `Cancel the ${target.name} series?`,
      description:
        "No more weekly rooms are booked. A room already booked and not yet open is cancelled too, and anyone already emailed about it will not be told. Rooms that already ran are kept.",
      confirmLabel: "Cancel the series",
      onConfirm: () => void cancelSeries(target),
    })

  // Going back to your personal room is leaving the room you are in. A host
  // leaving ends the room for everyone, so that is asked first.
  const backToPersonal = async () => {
    if (!activeRoom) return
    dismissErrorToast()
    setLeavingRoom(true)
    try {
      const { closed } = await leaveActiveRoom(activeRoom.room.slug)
      live.leftRoom(
        activeRoom.room.slug,
        closed ? "You closed the room." : "You left the room."
      )
      refreshRooms()
    } catch {
      showErrorToast("Leaving the room failed. Try again.")
    } finally {
      setLeavingRoom(false)
    }
  }

  const confirmBackToPersonal = () => {
    if (!activeRoom) return
    const others = activeRoom.members.length - 1
    setConfirm(
      activeRoom.you.role === "host"
        ? {
            title: "Close your room and go back?",
            description:
              others > 0
                ? `You host ${activeRoom.room.name}, so leaving ends it. The session stops for the ${others} ${others === 1 ? "other person" : "other people"} in it.`
                : `You host ${activeRoom.room.name}, so leaving ends it. Nobody else is in it.`,
            confirmLabel: "Leave & close",
            onConfirm: () => void backToPersonal(),
          }
        : {
            title: `Leave ${activeRoom.room.name}?`,
            description:
              "You go back to your personal room, with your own sound and theme. You can join again while the room is open.",
            confirmLabel: "Leave room",
            onConfirm: () => void backToPersonal(),
          }
    )
  }

  const confirmCancelBooking = (room: UpcomingRoomRow) =>
    setConfirm({
      title: `Cancel ${room.name}?`,
      description: room.invitedCount
        ? "The room never opens. Invitations that have not gone out yet are stopped, but anyone already emailed will not be told."
        : "The room never opens and its invite link stops working.",
      confirmLabel: "Cancel booking",
      onConfirm: () => void cancelBooking(room),
    })

  const openRooms = roomRows.filter(({ room }) => room.phase !== "focus")

  const hostFromHere =
    authenticated && !activeRoom ? () => setShowHostForm(true) : undefined

  return (
    <div className={`${contentColumn} flex flex-col gap-9 py-8`}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-xl flex-col gap-2">
          <h2 className="text-4xl font-bold tracking-tight">Focus rooms</h2>
          <p className="text-muted-foreground">
            Run one timer together. The host drives the phases; the server
            keeps the clock.
          </p>
        </div>
        {hostFromHere ? (
          <Button size="lg" className="rounded-full" onClick={hostFromHere}>
            <PlusIcon aria-hidden="true" /> Host a room
          </Button>
        ) : null}
      </header>
      <HostRoomDialog
        open={showHostForm && !activeRoom}
        onOpenChange={setShowHostForm}
        onCreated={(snapshot) => {
          setShowHostForm(false)
          refreshRooms()
          goToRoom(snapshot)
        }}
        onBooked={(message) => {
          setShowHostForm(false)
          toast.success(message)
          refreshRooms()
        }}
      />
      {confirm ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirm(null)
          }}
          title={confirm.title}
          description={confirm.description}
          confirmLabel={confirm.confirmLabel}
          onConfirm={() => {
            confirm.onConfirm()
            setConfirm(null)
          }}
        />
      ) : null}
      {!authenticated ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-2 py-6">
            <p className="text-sm text-muted-foreground">
              Rooms are where people focus together on one clock. Sign in to
              browse the open rooms and join one.
            </p>
            <Button asChild size="sm">
              <Link to="/login" search={{ redirect: "/rooms" }}>
                Sign in
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : roomCheckFailed && !activeRoom ? (
        <Card>
          <ErrorRow
            message="We could not check whether you are already in a room, so the list of rooms is hidden rather than shown as if you were in none."
            onRetry={() => {
              dismissErrorToast()
              live.checkCurrentRoom()
            }}
          />
        </Card>
      ) : (
        <>
          <RoomColumns
            activeRoom={activeRoom}
            ownerName={user?.name ?? ""}
            leaving={leavingRoom}
            onBackToPersonal={confirmBackToPersonal}
            onBrowse={() =>
              openRoomsRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
            onHost={hostFromHere}
          />
          <OpenRoomsSection
            sectionRef={openRoomsRef}
            rooms={openRooms}
            joiningSlug={joiningSlug}
            joinProblem={joinProblem}
            onJoin={(slug) => void joinBySlug(slug)}
          />
          <UpcomingRooms
            rooms={upcoming}
            series={series}
            busyKey={cancellingKey}
            onCancel={confirmCancelBooking}
            onSkipWeek={confirmSkipWeek}
            onCancelSeries={confirmCancelSeries}
            onReachedStart={refreshRooms}
          />
        </>
      )}
    </div>
  )
}

/** What the browser's own clock makes of the typed date and time. */
function startValueAsDate(value: string) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** The datetime-local value for "in about an hour", on the host's own clock. */
function defaultStartValue() {
  const date = new Date(Date.now() + 60 * 60 * 1000)
  date.setMinutes(0, 0, 0)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** A house preset as the Rhythm picker holds it, with the room's pair too. */
type HousePreset = CustomTimerPreset & {
  sound: string | null
  background: string | null
}

export function HostRoomDialog({
  open,
  onOpenChange,
  onCreated,
  onBooked,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (snapshot: RoomSnapshotClient) => void
  onBooked: (message: string) => void
}) {
  const [roomName, setRoomName] = React.useState("")
  const [visibility, setVisibility] = React.useState<"public" | "unlisted">(
    "public"
  )
  const [focusMinutes, setFocusMinutes] = React.useState(25)
  const [shortBreakMinutes, setShortBreakMinutes] = React.useState(5)
  const [longBreakMinutes, setLongBreakMinutes] = React.useState(15)
  const [autoStart, setAutoStart] = React.useState(false)
  // The pair everyone in the room gets. Nothing is picked to start with:
  // Tyler, 7 Oct 2026, "User must select sound and theme."
  const catalog = useMediaCatalog()
  const [roomSound, setRoomSound] = React.useState("")
  const [roomBackground, setRoomBackground] = React.useState("")
  const [pairProblem, setPairProblem] = React.useState<RoomPairProblem | null>(
    null
  )
  // The member's own rhythm presets, read when the dialog opens. A failed
  // read still offers the built-ins and says the rest could not be loaded.
  const [ownPresets, setOwnPresets] = React.useState<CustomTimerPreset[]>([])
  const [presetsFailed, setPresetsFailed] = React.useState(false)
  // The house presets an admin keeps (admin task 04), offered above the
  // host's own, and the admin's invite limit, read with them.
  const [housePresets, setHousePresets] = React.useState<HousePreset[]>([])
  const [maxInvites, setMaxInvites] = React.useState(MAX_ROOM_INVITES)
  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    listTimerPresets().then(
      (rows) => {
        if (cancelled) return
        setPresetsFailed(false)
        setOwnPresets(rows)
      },
      () => {
        if (!cancelled) setPresetsFailed(true)
      }
    )
    loadHostingOptions().then(
      (options) => {
        if (cancelled) return
        setHousePresets(
          options.presets.map((preset) => ({
            ...preset,
            id: `house:${preset.id}`,
            sessionsBeforeLongBreak: 4,
          }))
        )
        setMaxInvites(options.maxInvitesPerRoom)
      },
      // Without them the window still works with the host's own presets and
      // the usual invite limit; the server checks the real one.
      () => undefined
    )
    return () => {
      cancelled = true
    }
  }, [open])
  const matchedPreset = matchRoomPreset(
    { focusMinutes, shortBreakMinutes, longBreakMinutes, autoStart },
    [...housePresets, ...ownPresets]
  )
  const pickPreset = (id: string) => {
    const preset = [...housePresets, ...builtinTimerPresets, ...ownPresets].find(
      (candidate) => candidate.id === id
    )
    if (!preset) return
    setFocusMinutes(preset.focusMinutes)
    setShortBreakMinutes(preset.shortBreakMinutes)
    setLongBreakMinutes(preset.longBreakMinutes)
    setAutoStart(preset.autoStart)
    // A house preset can carry the room's sound and theme too.
    const house = housePresets.find((candidate) => candidate.id === id)
    if (house?.sound) setRoomSound(house.sound)
    if (house?.background) setRoomBackground(house.background)
  }
  const [startMode, setStartMode] = React.useState<"now" | "later" | "weekly">(
    "now"
  )
  const [startValue, setStartValue] = React.useState(defaultStartValue)
  // A weekly room starts on today's weekday at nine, which is the commonest
  // shape and is one press away from any other.
  const [repeatDays, setRepeatDays] = React.useState(
    () => 1 << new Date().getDay()
  )
  const [repeatTime, setRepeatTime] = React.useState("09:00")
  const [invitesTyped, setInvitesTyped] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [error, setError] = React.useState("")
  const invites = parseInviteEmails(invitesTyped)
  // The dialog checks the same rules the endpoint does, so the problem is
  // named beside the field instead of arriving as a failed save. The server
  // checks them again against its own clock, which is the one that counts.
  const booking =
    startMode === "later"
      ? scheduleProblem(startValueAsDate(startValue), invites, new Date(), maxInvites)
      : null
  const repeatProblem =
    startMode === "weekly"
      ? roomRepeatProblem(repeatDays, parseClockTime(repeatTime), invites, maxInvites)
      : null

  const submit = async () => {
    setError("")
    const missing = roomPairProblem(
      catalog,
      roomSound || null,
      roomBackground || null
    )
    setPairProblem(missing)
    if (missing) {
      setError(roomPairProblemMessage(missing))
      return
    }
    if (startMode === "later" && booking) {
      setError(scheduleProblemMessage(booking, maxInvites))
      return
    }
    if (startMode === "weekly" && repeatProblem) {
      setError(roomRepeatProblemMessage(repeatProblem, maxInvites))
      return
    }
    setCreating(true)
    const settings = {
      name: roomName,
      visibility,
      focusMinutes,
      shortBreakMinutes,
      longBreakMinutes,
      autoStart,
      sound: roomSound,
      background: roomBackground,
    }
    try {
      if (startMode === "weekly") {
        const repeating = await repeatRoom({
          ...settings,
          weekdays: repeatDays,
          startMinute: parseClockTime(repeatTime)!,
          timezone: browserTimezone(),
          invitesTyped,
        })
        setRoomName("")
        setInvitesTyped("")
        onBooked(
          `${repeating.name} repeats ${describeRoomRepeat(repeatDays, parseClockTime(repeatTime)!)}. The first one is ${formatRoomStart(new Date(repeating.nextStartsAt), browserTimezone())}.`
        )
        return
      }
      if (startMode === "later") {
        const startsAt = startValueAsDate(startValue)
        const booked = await scheduleRoom({
          ...settings,
          startsAt: startsAt!.toISOString(),
          invitesTyped,
        })
        setRoomName("")
        setInvitesTyped("")
        onBooked(
          invites.length
            ? `${booked.name} is booked. ${invites.length} ${invites.length === 1 ? "invitation goes" : "invitations go"} out in a moment.`
            : `${booked.name} is booked. It opens on its own at the time you picked.`
        )
        return
      }
      const created = await createRoom(settings)
      setRoomName("")
      onCreated(created)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : ""
      setError(
        roomRefusalSentence(cause) ??
        (message.includes("UPGRADE_REQUIRED")
          ? PRO_PERKS.hostRooms.lockedReason
          : message.includes("SCHEDULE_REJECTED")
            ? message.split("SCHEDULE_REJECTED: ")[1]
            : message.includes("ROOM_PAIR_REJECTED")
              ? message.split("ROOM_PAIR_REJECTED: ")[1]
            : message.includes("RATE_LIMITED")
              ? "That is a lot of bookings in one hour. Wait a while and try again."
              : startMode === "now"
                ? "The room could not be created."
                : "The room could not be booked.")
      )
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!creating) {
          setError("")
          onOpenChange(next)
        }
      }}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Host a room</DialogTitle>
          <DialogDescription>
            Pick the timers, the sound and the theme, then start it now, book a
            time, or book the same time every week. You control the session
            once people join.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="host-room-form"
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="room-name">Room name</Label>
              <Input
                id="room-name"
                required
                minLength={2}
                maxLength={80}
                value={roomName}
                onChange={(event) => setRoomName(event.target.value)}
                placeholder="Morning deep work"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="room-visibility">Visibility</Label>
              <Select
                value={visibility}
                onValueChange={(value) =>
                  setVisibility(value as "public" | "unlisted")
                }
              >
                <SelectTrigger id="room-visibility" aria-label="Visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">
                    Public — listed for everyone
                  </SelectItem>
                  <SelectItem value="unlisted">
                    Unlisted — invite link only
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* A preset fills the three timers and auto-start; the fields stay
                editable, and any edit that matches no preset reads Custom,
                the same rule as the timer's own picker. The room keeps plain
                numbers, so nothing after this knows a preset was used. */}
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="room-preset"
                hint="Fills the timers below. A room always takes its long break after four focuses, whatever the preset says."
              >
                Rhythm
              </FieldLabel>
              <Select value={matchedPreset?.id ?? ""} onValueChange={pickPreset}>
                <SelectTrigger id="room-preset" aria-label="Rhythm preset">
                  <SelectValue placeholder="Custom" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {housePresets.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      Pomoder: {preset.name} · {roomPresetSummary(preset)}
                    </SelectItem>
                  ))}
                  {[...builtinTimerPresets, ...ownPresets].map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.name} · {roomPresetSummary(preset)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {presetsFailed ? (
                <span className="text-xs text-muted-foreground">
                  Your own presets could not be loaded. The built-in ones are
                  here.
                </span>
              ) : null}
            </div>
            {/* The ids used to be built from the label, which put spaces in
                them — `room-Focus minutes` — and a `htmlFor` with a space in
                it matches nothing. The shared field names its own. */}
            <RhythmMinutesFields
              idPrefix="room"
              className="grid grid-cols-3 gap-2"
              focusMinutes={focusMinutes}
              shortBreakMinutes={shortBreakMinutes}
              longBreakMinutes={longBreakMinutes}
              onFocusMinutes={setFocusMinutes}
              onShortBreakMinutes={setShortBreakMinutes}
              onLongBreakMinutes={setLongBreakMinutes}
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id="room-auto-start"
                checked={autoStart}
                onCheckedChange={(state) => setAutoStart(state === true)}
              />
              <Label htmlFor="room-auto-start">
                Auto-start the next focus after each break
              </Label>
            </div>
            {/* Each pick gets its own row: a theme's name is long enough that
                two side by side would truncate on a phone. */}
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="room-sound"
                hint="Everyone in the room hears it. It starts when the room's focus does."
              >
                Sound
              </FieldLabel>
              <Select
                value={roomSound}
                onValueChange={(value) => {
                  setRoomSound(value)
                  setPairProblem(null)
                }}
              >
                <SelectTrigger
                  id="room-sound"
                  aria-label="Sound"
                  aria-invalid={
                    pairProblem === "no_sound" || pairProblem === "bad_sound"
                  }
                >
                  <SelectValue placeholder="Pick a sound" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {/* Tyler, 8 Oct 2026: a host may shuffle the room, or keep
                      it to one tag. Each device then picks for itself. */}
                  <SelectItem value="shuffle">Shuffle every sound</SelectItem>
                  {catalogTags(catalog.sounds).map(({ tag }) => (
                    <SelectItem key={`tag-${tag}`} value={`tags:${tag}`}>
                      Only {tag} sounds
                    </SelectItem>
                  ))}
                  {catalog.sounds.map((sound) => (
                    <SelectItem key={sound.key} value={`curated:${sound.key}`}>
                      {sound.label}
                      {sound.locked ? " · Pro" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="room-theme"
                hint="Everyone in the room sees it behind the page while they are in the room."
              >
                Theme
              </FieldLabel>
              <Select
                value={roomBackground}
                onValueChange={(value) => {
                  setRoomBackground(value)
                  setPairProblem(null)
                }}
              >
                <SelectTrigger
                  id="room-theme"
                  aria-label="Theme"
                  aria-invalid={
                    pairProblem === "no_background" ||
                    pairProblem === "bad_background"
                  }
                >
                  <SelectValue placeholder="Pick a theme" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="shuffle">Shuffle every theme</SelectItem>
                  {catalogTags(catalog.themes).map(({ tag }) => (
                    <SelectItem key={`tag-${tag}`} value={`tags:${tag}`}>
                      Only {tag} themes
                    </SelectItem>
                  ))}
                  {catalog.themes.map((scene) => (
                    <SelectItem key={scene.key} value={`scene:${scene.key}`}>
                      <img
                        src={scene.stillUrl}
                        alt=""
                        className="h-4 w-7 rounded-sm object-cover"
                      />
                      {scene.label}
                      {scene.locked ? " · Pro" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="room-start-mode">Starts at</Label>
              <Select
                value={startMode}
                onValueChange={(value) =>
                  setStartMode(value as "now" | "later" | "weekly")
                }
              >
                <SelectTrigger id="room-start-mode" aria-label="Starts at">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="now">Now — open the room today</SelectItem>
                  <SelectItem value="later">
                    A set time — the room opens itself
                  </SelectItem>
                  <SelectItem value="weekly">
                    Every week — the same days and time
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {startMode === "weekly" ? (
              <>
                <div className="grid gap-2">
                  <Label id="room-repeat-days-label">Days</Label>
                  <div
                    role="group"
                    aria-labelledby="room-repeat-days-label"
                    aria-invalid={repeatProblem === "no_days"}
                    className="flex gap-1"
                  >
                    {weekdayInitials.map((initial, weekday) => {
                      const picked = weekdaySetHas(repeatDays, weekday)
                      return (
                        <Button
                          key={weekdayNames[weekday]}
                          type="button"
                          size="icon-sm"
                          variant={picked ? "default" : "outline"}
                          aria-pressed={picked}
                          aria-label={weekdayNames[weekday]}
                          onClick={() =>
                            setRepeatDays(toggleWeekdayInSet(repeatDays, weekday))
                          }
                        >
                          <span aria-hidden="true" className="text-[10px]">
                            {initial}
                          </span>
                        </Button>
                      )
                    })}
                  </div>
                </div>
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="room-repeat-time"
                    hint={`On this device's clock, ${browserTimezone()}. Each week's room is booked ${ROOM_REPEAT_LEAD_HOURS} hours before it starts, and that is when its invitations go out.`}
                  >
                    Time
                  </FieldLabel>
                  <Input
                    id="room-repeat-time"
                    type="time"
                    required
                    className="w-auto"
                    value={repeatTime}
                    aria-invalid={repeatProblem === "not_a_time"}
                    onChange={(event) => setRepeatTime(event.target.value)}
                  />
                </div>
              </>
            ) : null}
            {startMode === "later" ? (
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="room-starts-at"
                  hint="Use your own clock. Invitations show each guest the time in their own timezone."
                >
                  Date and time
                </FieldLabel>
                <Input
                  id="room-starts-at"
                  type="datetime-local"
                  required
                  value={startValue}
                  aria-invalid={
                    booking === "not_a_time" ||
                    booking === "too_soon" ||
                    booking === "too_far"
                  }
                  onChange={(event) => setStartValue(event.target.value)}
                />
              </div>
            ) : null}
            {startMode !== "now" ? (
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="room-invites"
                  hint={`Up to ${maxInvites} addresses, separated by commas, spaces or new lines. Each one gets the link and the time${startMode === "weekly" ? ", once for every week's room" : ""}.`}
                >
                  Invite by email
                </FieldLabel>
                <Textarea
                  id="room-invites"
                  rows={2}
                  placeholder="sam@example.com, alex@example.com"
                  value={invitesTyped}
                  aria-invalid={
                    booking === "bad_email" ||
                    booking === "too_many_invites" ||
                    repeatProblem === "bad_email" ||
                    repeatProblem === "too_many_invites"
                  }
                  onChange={(event) => setInvitesTyped(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {invites.length
                    ? `${invites.length} ${invites.length === 1 ? "person" : "people"} will be emailed ${startMode === "weekly" ? "a day before each week's room" : "when you book this room"}.`
                    : "Nobody is emailed unless you add an address. Anyone can still be sent the link by hand."}
                </p>
              </div>
            ) : null}
            {booking ? (
              <p role="alert" className="text-sm text-destructive">
                {scheduleProblemMessage(booking, maxInvites)}
              </p>
            ) : null}
            {repeatProblem ? (
              <p role="alert" className="text-sm text-destructive">
                {roomRepeatProblemMessage(repeatProblem, maxInvites)}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </form>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={creating}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" form="host-room-form" disabled={creating}>
            {creating
              ? startMode === "now"
                ? "Creating…"
                : "Booking…"
              : startMode === "now"
                ? "Create room"
                : startMode === "weekly"
                  ? "Book every week"
                  : "Book room"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
