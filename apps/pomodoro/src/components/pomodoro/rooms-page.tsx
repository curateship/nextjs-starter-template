import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  CheckIcon,
  CopyIcon,
  Loader2Icon,
  LockKeyholeIcon,
  PlusIcon,
  UsersIcon,
  WifiOffIcon,
} from "lucide-react"
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
import { InlineError } from "@/components/ui/inline-error"
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
  applyRoomAction,
  banMember,
  cancelBookedRoom,
  createRoom,
  deleteMessage,
  getCurrentRoom,
  joinRoom,
  leaveActiveRoom,
  listRooms,
  listUpcoming,
  removeMember,
  scheduleRoom,
  toggleReaction,
} from "@/lib/api/pomodoro/rooms"
import {
  RoomChatPanel,
  RoomMemberList,
} from "@/components/pomodoro/room-chat"
import {
  UpcomingRooms,
  type UpcomingRoomRow,
} from "@/components/pomodoro/upcoming-rooms"
import {
  RoomCard,
  RoomCardAction,
  RoomCardDetail,
  RoomCardTitle,
  RoomGroupEmpty,
  RoomGroupHeading,
} from "@/components/pomodoro/room-card"
import { RhythmMinutesFields } from "@/components/pomodoro/rhythm-minutes-fields"
import {
  MAX_ROOM_INVITES,
  parseInviteEmails,
  scheduleProblem,
  scheduleProblemMessage,
} from "@/lib/pomodoro/scheduled-rooms"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import { usePageVisible } from "@/lib/pomodoro/use-page-visible"
import { PRO_PERKS } from "@/lib/pomodoro/pro"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

export type RoomSnapshotClient = NonNullable<
  Awaited<ReturnType<typeof getCurrentRoom>>
>
type RoomHostActionClient = "start_focus" | "start_break" | "next_phase" | "close"
type ConfirmRequest = {
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
}

export function useRoomCountdown(phaseEndsAt: Date | string | null) {
  const endsAtTime = phaseEndsAt ? new Date(phaseEndsAt).getTime() : null
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!endsAtTime) return
    setNow(Date.now())
    const interval = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(interval)
  }, [endsAtTime])
  if (!endsAtTime) return null
  const totalSeconds = Math.max(0, Math.ceil((endsAtTime - now) / 1000))
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`
}

const phaseLabels: Record<string, string> = {
  waiting: "Waiting to start",
  focus: "Focus",
  short: "Short break",
  long: "Long break",
}

/**
 * The rooms page, ported from the old app: your active room's live panel on
 * top, then "Open to join" (waiting or on break) and "In session" (joins
 * locked). Public cards show member counts, never names — the old privacy
 * rule after a real leak.
 */
export function RoomsPage() {
  const { authenticated } = useProductAuth()
  const navigate = useNavigate()
  const [roomRows, setRoomRows] = React.useState<
    Awaited<ReturnType<typeof listRooms>>
  >([])
  const [activeRoom, setActiveRoom] = React.useState<RoomSnapshotClient | null>(
    null
  )
  const [showHostForm, setShowHostForm] = React.useState(false)
  // Whether asking the server which room you are in failed. While it has, the
  // page does not know, so it draws no list that would imply "none".
  const [roomCheckFailed, setRoomCheckFailed] = React.useState(false)
  // The room a Join is in flight for. One join at a time, however many
  // presses: the ref answers at once, the state redraws the button.
  const [joiningSlug, setJoiningSlug] = React.useState("")
  const joiningRef = React.useRef("")
  // A refused join belongs to the card that was pressed, so it is drawn there
  // as well as in the toast. Cleared by the next join.
  const [joinProblem, setJoinProblem] = React.useState<{
    slug: string
    message: string
  } | null>(null)
  // The room whose ending has already been explained by the person's own
  // action, so a broadcast arriving afterwards does not explain it again in
  // vaguer words.
  const endExplainedRef = React.useRef("")
  const [reconnecting, setReconnecting] = React.useState(false)
  const [confirm, setConfirm] = React.useState<ConfirmRequest | null>(null)
  const [upcoming, setUpcoming] = React.useState<UpcomingRoomRow[]>([])
  const [cancellingSlug, setCancellingSlug] = React.useState("")
  const activeRoomSlug = activeRoom?.room.slug

  const refreshRooms = React.useCallback(() => {
    if (!authenticated) return
    void listRooms()
      .then(setRoomRows)
      .catch(() => showErrorToast("Rooms could not be loaded."))
    void listUpcoming()
      .then(setUpcoming)
      .catch(() => showErrorToast("Upcoming rooms could not be loaded."))
  }, [authenticated])
  React.useEffect(refreshRooms, [refreshRooms])

  // Which room you are in. A failure here is said out loud rather than read as
  // "no room": the browse list on its own would tell somebody sitting in a
  // room that they had left it.
  const checkCurrentRoom = React.useCallback(() => {
    if (!authenticated) return
    void getCurrentRoom().then(
      (snapshot) => {
        setRoomCheckFailed(false)
        if (snapshot) setActiveRoom((current) => current ?? snapshot)
      },
      () => setRoomCheckFailed(true)
    )
  }, [authenticated])
  React.useEffect(checkCurrentRoom, [checkCurrentRoom])

  /** Says how a room you were in came to an end, once per room. */
  const announceRoomEnd = React.useCallback(
    (slug: string, message: string, deliberate: boolean) => {
      if (!deliberate && endExplainedRef.current === slug) return
      if (deliberate) endExplainedRef.current = slug
      // One toast per room: a broadcast that beat the person's own answer is
      // replaced by it rather than stacked under it.
      toast.success(message, { id: `room-ended:${slug}` })
    },
    []
  )

  // The SSE broadcast and a mutation's own response race in either order,
  // so only a deliberate action (force) may replace the room-ended toast; the
  // broadcast speaks only when nothing has explained the close yet.
  const applySnapshot = React.useCallback(
    (
      snapshot: RoomSnapshotClient,
      closedNotice = "This room has ended.",
      forceClosedNotice = false
    ) => {
      if (snapshot.room.phase === "closed") {
        setActiveRoom(null)
        announceRoomEnd(snapshot.room.slug, closedNotice, forceClosedNotice)
        refreshRooms()
        return
      }
      setActiveRoom(snapshot)
    },
    [announceRoomEnd, refreshRooms]
  )

  // The live connection is held only while this tab is on screen. The server
  // counts an open connection as somebody looking at the room, and keeps the
  // bell quiet about chat, joins and reactions they can already see. A room in
  // a tab behind other tabs is not being looked at, so its connection closes
  // and the bell tells them what they missed. Coming back reconnects, and the
  // first message is a full snapshot, so nothing on screen is stale.
  const pageVisible = usePageVisible()

  React.useEffect(() => {
    if (!activeRoomSlug || !pageVisible) return
    const source = new EventSource(
      `/api/pomodoro/rooms/${activeRoomSlug}/events`
    )
    source.addEventListener("snapshot", (event) => {
      setReconnecting(false)
      applySnapshot(
        JSON.parse((event as MessageEvent<string>).data) as RoomSnapshotClient
      )
    })
    source.addEventListener("room_gone", () => {
      setActiveRoom(null)
      // A deliberate leave/close already explained itself; this only speaks
      // when the membership ended from the other side.
      announceRoomEnd(activeRoomSlug, "You are no longer in this room.", false)
      refreshRooms()
    })
    source.onerror = () => setReconnecting(true)
    return () => {
      setReconnecting(false)
      source.close()
    }
  }, [activeRoomSlug, announceRoomEnd, applySnapshot, pageVisible, refreshRooms])

  const performJoin = async (slug: string) => {
    if (joiningRef.current) return
    joiningRef.current = slug
    setJoiningSlug(slug)
    setJoinProblem(null)
    dismissErrorToast()
    try {
      const snapshot = await joinRoom(slug)
      endExplainedRef.current = ""
      applySnapshot(snapshot)
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : ""
      const message = text.includes("ROOM_LOCKED")
        ? "That room is mid-focus. Join again during its break."
        : text.includes("ROOM_CLOSED")
          ? "That room has ended."
          : text.includes("ROOM_BANNED")
            ? "You can't join that room."
            : "This room is not available to join."
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
    setCancellingSlug(room.slug)
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
      setCancellingSlug("")
      refreshRooms()
    }
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
  const liveRooms = roomRows.filter(({ room }) => room.phase === "focus")

  // 860px wide with a 36px gap between groups are the old app's own numbers
  // for this screen. Two room cards side by side need the width.
  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-9 py-8">
      <header>
        <h2 className="text-2xl font-bold tracking-tight">Focus rooms</h2>
        <p className="text-sm text-muted-foreground">
          Run one timer together. The host drives the phases; the server keeps
          the clock.
        </p>
      </header>
      <HostRoomDialog
        open={showHostForm && !activeRoom}
        onOpenChange={setShowHostForm}
        onCreated={(snapshot) => {
          setShowHostForm(false)
          applySnapshot(snapshot)
          refreshRooms()
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
      {activeRoom ? (
        <ActiveRoomPanel
          snapshot={activeRoom}
          reconnecting={reconnecting}
          onSnapshot={applySnapshot}
          onLeft={(message) => {
            announceRoomEnd(activeRoom.room.slug, message, true)
            setActiveRoom(null)
            refreshRooms()
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
              setRoomCheckFailed(false)
              checkCurrentRoom()
            }}
          />
        </Card>
      ) : (
        <>
          <UpcomingRooms
            rooms={upcoming}
            busySlug={cancellingSlug}
            onCancel={confirmCancelBooking}
            onReachedStart={refreshRooms}
          />
          <RoomGroup
            title="Open to join"
            subtitle="on break · waiting to start"
            rooms={openRooms}
            open
            onJoin={joinBySlug}
            joiningSlug={joiningSlug}
            joinProblem={joinProblem}
            onHost={!activeRoom ? () => setShowHostForm((value) => !value) : undefined}
          />
          <RoomGroup
            title="In session"
            subtitle="focused · joins locked until break"
            rooms={liveRooms}
            open={false}
            onJoin={async () => undefined}
            joiningSlug=""
            joinProblem={joinProblem}
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

function HostRoomDialog({
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
  const [startMode, setStartMode] = React.useState<"now" | "later">("now")
  const [startValue, setStartValue] = React.useState(defaultStartValue)
  const [invitesTyped, setInvitesTyped] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [error, setError] = React.useState("")
  const invites = parseInviteEmails(invitesTyped)
  // The dialog checks the same rules the endpoint does, so the problem is
  // named beside the field instead of arriving as a failed save. The server
  // checks them again against its own clock, which is the one that counts.
  const booking =
    startMode === "later"
      ? scheduleProblem(startValueAsDate(startValue), invites, new Date())
      : null

  const submit = async () => {
    setError("")
    if (startMode === "later" && booking) {
      setError(scheduleProblemMessage(booking))
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
    }
    try {
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
        message.includes("UPGRADE_REQUIRED")
          ? PRO_PERKS.hostRooms.lockedReason
          : message.includes("SCHEDULE_REJECTED")
            ? message.split("SCHEDULE_REJECTED: ")[1]
            : message.includes("RATE_LIMITED")
              ? "That is a lot of bookings in one hour. Wait a while and try again."
              : startMode === "later"
                ? "The room could not be booked."
                : "The room could not be created."
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
            Pick the timers, then start it now or book a time. You control the
            session once people join.
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
            <div className="grid gap-2">
              <Label htmlFor="room-start-mode">Starts at</Label>
              <Select
                value={startMode}
                onValueChange={(value) =>
                  setStartMode(value as "now" | "later")
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
                </SelectContent>
              </Select>
            </div>
            {startMode === "later" ? (
              <>
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="room-starts-at"
                    hint="That is your own clock, not the server's. Invitations say the time in your timezone."
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
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="room-invites"
                    hint={`Up to ${MAX_ROOM_INVITES} addresses, separated by commas, spaces or new lines. Each one gets the link and the time.`}
                  >
                    Invite by email
                  </FieldLabel>
                  <Textarea
                    id="room-invites"
                    rows={2}
                    placeholder="sam@example.com, alex@example.com"
                    value={invitesTyped}
                    aria-invalid={
                      booking === "bad_email" || booking === "too_many_invites"
                    }
                    onChange={(event) => setInvitesTyped(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {invites.length
                      ? `${invites.length} ${invites.length === 1 ? "person" : "people"} will be emailed when you book this room.`
                      : "Nobody is emailed unless you add an address. Anyone can still be sent the link by hand."}
                  </p>
                </div>
                {booking ? (
                  <p role="alert" className="text-sm text-destructive">
                    {scheduleProblemMessage(booking)}
                  </p>
                ) : null}
              </>
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
              ? startMode === "later"
                ? "Booking…"
                : "Creating…"
              : startMode === "later"
                ? "Book room"
                : "Create room"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ActiveRoomPanel({
  snapshot,
  reconnecting,
  onSnapshot,
  onLeft,
}: {
  snapshot: RoomSnapshotClient
  reconnecting: boolean
  onSnapshot: (
    snapshot: RoomSnapshotClient,
    closedNotice?: string,
    forceClosedNotice?: boolean
  ) => void
  onLeft: (message: string) => void
}) {
  const { room, you, members, messages } = snapshot
  const isHost = you.role === "host"
  const countdown = useRoomCountdown(room.phaseEndsAt)
  const [pending, setPending] = React.useState("")
  const [copied, setCopied] = React.useState(false)
  const [copyFailed, setCopyFailed] = React.useState(false)
  const [confirm, setConfirm] = React.useState<ConfirmRequest | null>(null)
  const [panelNotice, setPanelNotice] = React.useState("")
  const [reactionPending, setReactionPending] = React.useState<
    ReadonlySet<string>
  >(() => new Set())
  const inviteUrl = `${window.location.origin}/rooms/${room.slug}`
  const sessionLabel = `Session ${Math.min(room.cycleFocusCount + 1, 4)} of 4`

  const runAction = async (action: RoomHostActionClient) => {
    dismissErrorToast()
    setPending(action)
    try {
      onSnapshot(
        await applyRoomAction(room.slug, action),
        "You closed the room.",
        true
      )
    } catch (cause) {
      showErrorToast(
        cause instanceof Error && cause.message.includes("ROOM_HOST_REQUIRED")
          ? "Only the host can control the room."
          : "The room could not be updated."
      )
    } finally {
      setPending("")
    }
  }

  const leave = async () => {
    dismissErrorToast()
    setPending("leave")
    try {
      const result = await leaveActiveRoom(room.slug)
      onLeft(result.closed ? "You closed the room." : "You left the room.")
    } catch {
      showErrorToast("Leaving the room failed. Try again.")
    } finally {
      setPending("")
    }
  }

  const copyInvite = async () => {
    setCopyFailed(false)
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2_000)
    } catch {
      setCopyFailed(true)
    }
  }

  // Every moderation action answers with a fresh snapshot, so the panel
  // redraws from the server rather than guessing what changed.
  const moderate = async (
    key: string,
    action: () => Promise<RoomSnapshotClient>,
    successNotice: string,
    failureNotice: string
  ) => {
    dismissErrorToast()
    setPanelNotice("")
    setPending(key)
    try {
      onSnapshot(await action())
      setPanelNotice(successNotice)
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : ""
      showErrorToast(
        text.includes("RATE_LIMITED")
          ? "Too many moderation actions at once. Wait a moment and try again."
          : text.includes("ROOM_HOST_REQUIRED")
            ? "Only the host can do that."
            : failureNotice
      )
    } finally {
      setPending("")
    }
  }

  // Reaction counts reach everyone through the SSE snapshot, so the only
  // guard needed is against firing the same toggle twice while one is
  // in flight.
  const toggleMessageReaction = async (messageId: string, emoji: string) => {
    const key = `${messageId}:${emoji}`
    if (reactionPending.has(key)) return
    dismissErrorToast()
    setReactionPending((current) => new Set(current).add(key))
    try {
      await toggleReaction(room.slug, messageId, emoji)
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : ""
      showErrorToast(
        text.includes("RATE_LIMITED")
          ? "You're reacting a little fast. Wait a moment and try again."
          : "Your reaction didn't go through. Try again."
      )
    } finally {
      setReactionPending((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
    }
  }

  const confirmDeleteMessage = (message: { id: string }) =>
    setConfirm({
      title: "Delete message?",
      description:
        "The message disappears for everyone and members see that it was removed.",
      confirmLabel: "Delete message",
      onConfirm: () =>
        void moderate(
          `delete-message:${message.id}`,
          () => deleteMessage(room.slug, message.id),
          "The message was deleted.",
          "The message could not be deleted."
        ),
    })

  const confirmRemoveMember = (member: { id: string; name: string }) =>
    setConfirm({
      title: `Remove ${member.name}?`,
      description: "They leave this room immediately but can join again later.",
      confirmLabel: "Remove member",
      onConfirm: () =>
        void moderate(
          `remove-member:${member.id}`,
          () => removeMember(room.slug, member.id),
          `${member.name} was removed from the room.`,
          "The member could not be removed."
        ),
    })

  const confirmBanMember = (member: { id: string; name: string }) =>
    setConfirm({
      title: `Ban ${member.name}?`,
      description:
        "They are removed immediately and cannot rejoin this room. The ban ends when the room does.",
      confirmLabel: "Ban member",
      onConfirm: () =>
        void moderate(
          `ban-member:${member.id}`,
          () => banMember(room.slug, member.id),
          `${member.name} was banned from the room.`,
          "The member could not be banned."
        ),
    })

  // The one card outlined in the accent on purpose: it is the room you are in.
  return (
    <Card className="border-primary/35">
      <CardContent className="flex flex-col gap-4 py-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="size-2 rounded-full bg-[var(--p-success)]" aria-hidden="true" />
          <strong className="text-lg">{room.name}</strong>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {phaseLabels[room.phase] ?? room.phase} · {sessionLabel}
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <UsersIcon className="size-3.5" aria-hidden="true" />
            {members.length} {members.length === 1 ? "person" : "people"}
          </span>
          {reconnecting ? (
            <span
              role="status"
              className="flex items-center gap-1 text-xs text-muted-foreground"
            >
              <WifiOffIcon className="size-3" aria-hidden="true" />
              Reconnecting…
            </span>
          ) : null}
          <span className="ml-auto font-mono text-3xl tabular-nums">
            {countdown ?? "—:—"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isHost ? (
            <>
              {["waiting", "short", "long"].includes(room.phase) ? (
                <Button
                  size="sm"
                  disabled={pending !== ""}
                  onClick={() => void runAction("start_focus")}
                >
                  Start focus
                </Button>
              ) : null}
              {room.phase === "focus" ? (
                <Button
                  size="sm"
                  disabled={pending !== ""}
                  onClick={() => void runAction("start_break")}
                >
                  Start break
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                disabled={pending !== "" || room.phase === "waiting"}
                onClick={() => void runAction("next_phase")}
              >
                Next phase
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={pending !== ""}
                onClick={() =>
                  setConfirm({
                    title: "Close this room?",
                    description:
                      "This ends the session for everyone in the room and cannot be undone.",
                    confirmLabel: "Close room",
                    onConfirm: () => void runAction("close"),
                  })
                }
              >
                Close room
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={pending !== ""}
              onClick={() => void leave()}
            >
              Leave room
            </Button>
          )}
          {isHost ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending !== ""}
              onClick={() =>
                setConfirm({
                  title: "Leave and close this room?",
                  description: leaveAndCloseConsequence(members.length - 1),
                  confirmLabel: "Leave & close",
                  onConfirm: () => void leave(),
                })
              }
            >
              Leave &amp; close
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => void copyInvite()}
          >
            {copied ? (
              <CheckIcon aria-hidden="true" />
            ) : (
              <CopyIcon aria-hidden="true" />
            )}
            {copied ? "Copied" : "Copy invite link"}
          </Button>
        </div>
        {copyFailed ? (
          <p className="text-xs text-muted-foreground">
            Copying failed — the link is {inviteUrl}
          </p>
        ) : null}

        {panelNotice ? (
          <p role="status" className="text-xs text-muted-foreground">
            {panelNotice}
          </p>
        ) : null}

        <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
          {/* The chat is written first so a phone reads it first. The member
              list takes the left column back on desktop with `md:order-first`,
              so the two-column layout is unchanged. */}
          <RoomChatPanel
            slug={room.slug}
            messages={messages}
            timezone={you.timezone}
            isHost={isHost}
            busy={pending !== ""}
            reactionPending={reactionPending}
            onToggleReaction={(messageId, emoji) =>
              void toggleMessageReaction(messageId, emoji)
            }
            onDeleteMessage={confirmDeleteMessage}
            onError={showErrorToast}
            onNotice={setPanelNotice}
          />
          <RoomMemberList
            members={members}
            isHost={isHost}
            busy={pending !== ""}
            onRemove={confirmRemoveMember}
            onBan={confirmBanMember}
          />
        </div>
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
      </CardContent>
    </Card>
  )
}

/**
 * What the host is told before "Leave & close": a host leaving ends the room,
 * so the sentence says for whom. `others` is everybody in the room but the
 * host.
 */
function leaveAndCloseConsequence(others: number) {
  if (others <= 0)
    return "Nobody else is in the room, so nobody else is affected, but the room ends when you leave and cannot be reopened."
  return `When the host leaves, the room ends. The session stops for the ${others} ${others === 1 ? "other person" : "other people"} in it, and it cannot be undone.`
}

function RoomGroup({
  title,
  subtitle,
  rooms,
  open,
  onJoin,
  joiningSlug,
  joinProblem,
  onHost,
}: {
  title: string
  subtitle: string
  rooms: Awaited<ReturnType<typeof listRooms>>
  open: boolean
  onJoin: (slug: string) => Promise<void>
  /** The room a join is in flight for; every Join waits while one is. */
  joiningSlug: string
  /** Why the last join was refused, drawn on that room's own card. */
  joinProblem: { slug: string; message: string } | null
  onHost?: () => void
}) {
  const now = new Date()
  return (
    <section className="flex flex-col gap-3.5">
      <RoomGroupHeading title={title} subtitle={subtitle}>
        {/* Ghost rather than outline: outline paints its own background and
            border again in dark mode, which would cover the orange. */}
        {onHost ? (
          <Button
            variant="ghost"
            className="ml-auto border-primary/40 bg-primary/10 text-[var(--p-accent-2)] hover:bg-primary/20 hover:text-[var(--p-accent-2)] dark:hover:bg-primary/20"
            onClick={onHost}
          >
            <PlusIcon aria-hidden="true" /> Host a room
          </Button>
        ) : null}
      </RoomGroupHeading>
      <div className="grid gap-3.5 sm:grid-cols-2">
        {rooms.map(({ room, memberCount }) => {
          const end = room.phaseEndsAt ? new Date(room.phaseEndsAt).getTime() : 0
          const remaining = Math.max(0, Math.ceil((end - now.getTime()) / 60_000))
          return (
            <RoomCard key={room.id} roomId={room.id} dimmed={!open}>
              <RoomCardTitle
                name={room.name}
                tone={open ? "open" : "locked"}
                status={
                  room.phase === "waiting"
                    ? "waiting to start"
                    : `${remaining} min left`
                }
              />
              <RoomCardDetail>
                <UsersIcon className="size-3.5" aria-hidden="true" />
                {memberCount} focusing
              </RoomCardDetail>
              <RoomCardAction
                note={
                  room.phase === "focus"
                    ? `Session ${Math.min(room.cycleFocusCount + 1, 4)} of 4`
                    : `Next: ${room.focusMinutes} min focus`
                }
              >
                {open ? (
                  <Button
                    className="px-4"
                    disabled={joiningSlug !== ""}
                    onClick={() => void onJoin(room.slug)}
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
                ) : (
                  <Button
                    variant="outline"
                    className="px-4"
                    disabled
                  >
                    <LockKeyholeIcon aria-hidden="true" />
                    Locked
                  </Button>
                )}
              </RoomCardAction>
              {joinProblem?.slug === room.slug ? (
                <InlineError className="px-3 text-xs">
                  {joinProblem.message}
                </InlineError>
              ) : null}
            </RoomCard>
          )
        })}
        {!rooms.length ? (
          <RoomGroupEmpty>No rooms here yet.</RoomGroupEmpty>
        ) : null}
      </div>
    </section>
  )
}
