import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  MaximizeIcon,
  MinimizeIcon,
  WifiOffIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  applyRoomAction,
  banMember,
  deleteMessage,
  leaveActiveRoom,
  removeMember,
  setRoomPeopleLimitFor,
  setRoomStartCountdown,
  toggleReaction,
} from "@/lib/api/pomodoro/rooms"
import {
  RoomChatPanel,
  RoomMemberList,
} from "@/components/pomodoro/room-chat"
import { BreakCard } from "@/components/pomodoro/break-card"
import { TasksSection } from "@/components/pomodoro/today-task-list"
import { SoundPlayerRow } from "@/components/pomodoro/sound-player-row"
import { usePomodoro } from "@/lib/pomodoro/use-pomodoro"
import { cn } from "@/lib/utils"
import { contentColumn } from "@/lib/pomodoro/content-column"
import type { StartDelay } from "@/lib/pomodoro/room-countdown"
import {
  applyRoomSnapshot,
  checkCurrentRoom,
  leftRoom,
  useRoomClock,
  type RoomSnapshotClient,
} from "@/lib/pomodoro/room-clock-store"
import {
  clockText,
  ringIconButtonClass,
  roomActionErrorMessage,
  RoomHostButtons,
  useRoomClockReading,
  type RoomHostActionClient,
} from "@/components/pomodoro/room-clock-controls"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { PersonAvatar } from "@/components/pomodoro/initials-avatar"
import { RoomSettingsCog } from "@/components/pomodoro/room-settings-cog"

/**
 * The room you are in, drawn: its ring, its card, its chat. The front page
 * draws it, because Tyler, 7 Oct 2026: "the index page will be replaced with
 * the joined room". See `workspace/docs/rooms.md`.
 *
 * The live snapshot and the connection that keeps it current are the room
 * clock store's (`src/lib/pomodoro/room-clock-store.ts`), which the header
 * reads on every page too.
 */

export type ConfirmRequest = {
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
}

/** The same ring as the timer: 300 units across, an 8-unit stroke. */
const ringRadius = 144
const circumference = 2 * Math.PI * ringRadius

const eyebrowClass =
  "font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/75"

const phaseLabels: Record<string, string> = {
  waiting: "Waiting to start",
  focus: "Focus",
  short: "Short break",
  long: "Long break",
}


export function ActiveRoomPanel({
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
  const [pending, setPending] = React.useState("")
  const [copied, setCopied] = React.useState(false)
  const [copyFailed, setCopyFailed] = React.useState(false)
  const [confirm, setConfirm] = React.useState<ConfirmRequest | null>(null)
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
      showErrorToast(roomActionErrorMessage(cause))
    } finally {
      setPending("")
    }
  }

  const setDelay = async (seconds: StartDelay) => {
    dismissErrorToast()
    setPending("delay")
    try {
      onSnapshot(await setRoomStartCountdown(room.slug, seconds), "You closed the room.", true)
    } catch {
      showErrorToast("The countdown could not be changed.")
    } finally {
      setPending("")
    }
  }

  const setPeopleLimit = async (limit: number | null) => {
    dismissErrorToast()
    setPending("limit")
    try {
      onSnapshot(await setRoomPeopleLimitFor(room.slug, limit), "You closed the room.", true)
    } catch {
      showErrorToast("The people limit could not be changed.")
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
    setPending(key)
    try {
      onSnapshot(await action())
      // A toast that clears itself, never a line left under the header for
      // the rest of the session.
      toast.success(successNotice)
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

  const host = members.find((member) => member.role === "host")
  const hostName = host?.name.split(/\s+/)[0] ?? "the host"
  const pillButton = "rounded-full"
  // While the room is in a focus, the chat sits under a blur that says
  // chatting is not allowed, and clears by itself when the break starts.
  // Tyler, 10 Oct 2026, in place of folding the chat away. The arrow still
  // folds it by hand.
  const [chatOpen, setChatOpen] = React.useState(true)
  const focusing = room.phase === "focus"
  const chatId = React.useId()

  return (
    <div className="flex flex-col gap-7">
      <RoomRing
        snapshot={snapshot}
        hostName={hostName}
        pending={pending}
        onAction={(action) => void runAction(action)}
      />

      {/* The same break card as the timer, while the room is on a break. */}
      {room.phase === "short" || room.phase === "long" ? (
        <BreakCard
          key={`${room.phase}-${String(room.phaseStartedAt)}`}
          kind={room.phase}
          minutes={
            room.phase === "short" ? room.shortBreakMinutes : room.longBreakMinutes
          }
          sessions={4}
        />
      ) : null}

      {/* One card: the room's name and buttons, then the chat beside the
          people in the room, then the message box. Tyler's design of
          8 Oct 2026. */}
      <section
        aria-label={room.name}
        className="overflow-hidden rounded-[24px] border bg-[var(--p-surface)]"
      >
        <header
          className={cn(
            "flex flex-wrap items-center gap-x-6 gap-y-4 px-6 py-5",
            chatOpen && "border-b"
          )}
        >
          {/* The whole width on a phone, so the buttons wrap under it
              instead of squeezing the name. */}
          <div className="flex min-w-0 basis-full items-center gap-4 md:basis-0 md:flex-1">
          {/* The host's picture beside the room's name (Tyler, 10 Oct 2026:
              "put user avatar here", "I meant host avatar"). */}
          {host ? (
            <PersonAvatar
              name={host.name}
              avatarUrl={host.avatarUrl}
              className="size-12 text-base"
            />
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h2 className="flex items-center gap-3 text-2xl font-bold tracking-tight">
              <span
                className="size-2.5 shrink-0 rounded-full bg-[var(--p-success)]"
                aria-hidden="true"
              />
              <span className="truncate">{room.name}</span>
            </h2>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span className="text-[var(--p-success)]">
                {room.phase === "waiting" && room.startingAt
                  ? "Starting soon"
                  : (phaseLabels[room.phase] ?? room.phase)}
              </span>
              <span aria-hidden="true">·</span>
              <span>{sessionLabel}</span>
              {/* The breaks, short, beside the session (Tyler, 10 Oct 2026). */}
              <span aria-hidden="true">·</span>
              <span>
                {room.shortBreakMinutes}m short, {room.longBreakMinutes}m long breaks
              </span>
              {reconnecting ? (
                <span role="status" className="flex items-center gap-1">
                  <WifiOffIcon className="size-3" aria-hidden="true" />
                  Reconnecting…
                </span>
              ) : null}
            </p>
          </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* The countdown before a focus starts, beside the room's other
                buttons rather than inside the clock (Tyler, 10 Oct 2026). */}
            <Button
              variant="outline"
              size="lg"
              className={pillButton}
              onClick={() => void copyInvite()}
            >
              {copied ? (
                <CheckIcon aria-hidden="true" />
              ) : (
                <CopyIcon aria-hidden="true" />
              )}
              {copied ? "Copied" : "Copy invite link"}
            </Button>
            {isHost ? (
              <>
                <Button
                  variant="outline"
                  size="lg"
                  className={pillButton}
                  disabled={pending !== ""}
                  onClick={() =>
                    setConfirm({
                      title: "Close this room?",
                      // One button for a host, Tyler's choice on 10 Oct 2026
                      // over a second "Leave & close" that did the same.
                      description: closeConsequence(members.length - 1),
                      confirmLabel: "Close room",
                      onConfirm: () => void runAction("close"),
                    })
                  }
                >
                  Close room
                </Button>
                <RoomSettingsCog
                  startDelaySeconds={room.startDelaySeconds}
                  maxPeople={room.maxPeople}
                  disabled={pending !== ""}
                  onDelay={(seconds) => void setDelay(seconds)}
                  onPeopleLimit={(limit) => void setPeopleLimit(limit)}
                />
              </>
            ) : (
              <Button
                variant="outline"
                size="lg"
                className={pillButton}
                disabled={pending !== ""}
                onClick={() => void leave()}
              >
                Leave room
              </Button>
            )}
            <Button
              variant="outline"
              size="icon-lg"
              className={pillButton}
              aria-expanded={chatOpen}
              aria-controls={chatId}
              aria-label={chatOpen ? "Collapse the chat" : "Open the chat"}
              onClick={() => setChatOpen((open) => !open)}
            >
              <ChevronDownIcon
                className={cn(
                  "transition-transform motion-reduce:transition-none",
                  chatOpen && "rotate-180"
                )}
                aria-hidden="true"
              />
            </Button>
          </div>
          {copyFailed ? (
            <p className="basis-full text-xs text-muted-foreground">
              Copying failed - the link is {inviteUrl}
            </p>
          ) : null}
        </header>

        {/* Folded, the chat stays mounted so a half-typed message and the
            scroll position survive; it is only hidden. Under the focus blur
            it is inert, so nothing in it can be pressed or typed into. */}
        <div id={chatId} hidden={!chatOpen} className="relative">
        <div inert={focusing}>
        <RoomChatPanel
          slug={room.slug}
          messages={messages}
          pinned={snapshot.pinned ?? []}
          chatPaused={snapshot.chatPaused ?? false}
          timezone={you.timezone}
          isHost={isHost}
          busy={pending !== ""}
          reactionPending={reactionPending}
          onToggleReaction={(messageId, emoji) =>
            void toggleMessageReaction(messageId, emoji)
          }
          onDeleteMessage={confirmDeleteMessage}
          onError={showErrorToast}
          onNotice={(notice) => toast(notice)}
          aside={
            <RoomMemberList
              members={members}
              isHost={isHost}
              busy={pending !== ""}
              onRemove={confirmRemoveMember}
              onBan={confirmBanMember}
            />
          }
        />
        </div>
        {focusing ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--p-surface)]/40 p-6 text-center backdrop-blur-md">
            <p className="text-base font-semibold">
              Chatting is not allowed while focusing
            </p>
          </div>
        ) : null}
        </div>
      </section>
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
    </div>
  )
}

/**
 * The room's clock, drawn as the timer's ring: the phase in small capitals,
 * the time left, and under it what happens next. A member waiting is told
 * who starts the room; the host gets the buttons that move it on. Under the
 * ring, one short bar per session of the four.
 */
function RoomRing({
  snapshot,
  hostName,
  pending,
  onAction,
}: {
  snapshot: RoomSnapshotClient
  hostName: string
  pending: string
  onAction: (action: RoomHostActionClient) => void
}) {
  const { room, you } = snapshot
  const isHost = you.role === "host"
  const ringRef = React.useRef<HTMLDivElement>(null)
  // Follows the browser's own state, so Escape or the browser's exit flips the
  // button back as well as a press on it.
  const [fullScreen, setFullScreen] = React.useState(false)
  React.useEffect(() => {
    const follow = () =>
      setFullScreen(
        Boolean(ringRef.current) && document.fullscreenElement === ringRef.current
      )
    document.addEventListener("fullscreenchange", follow)
    return () => document.removeEventListener("fullscreenchange", follow)
  }, [])
  const fullScreenLabel = fullScreen ? "Exit full screen" : "Full screen"
  const { secondsLeft, counting, shownSeconds } = useRoomClockReading(room)
  const waiting = secondsLeft === null
  const phaseSeconds =
    room.phaseStartedAt && room.phaseEndsAt
      ? (new Date(room.phaseEndsAt).getTime() -
          new Date(room.phaseStartedAt).getTime()) /
        1000
      : 0
  // A room with no clock running shows a whole ring and the focus length.
  const fraction =
    waiting || phaseSeconds <= 0 ? 1 : Math.min(1, secondsLeft / phaseSeconds)
  const sessionIndex = Math.min(room.cycleFocusCount, 3)

  return (
    <section
      aria-label="Room timer"
      className="flex flex-col items-center gap-6"
    >
      <div
        ref={ringRef}
        // Full screen paints the page's own background behind the ring.
        className="relative grid aspect-square w-[min(300px,100%)] place-items-center [&:fullscreen]:w-full [&:fullscreen]:bg-background"
      >
        <svg
          className="absolute inset-0 m-auto size-full max-h-[min(300px,100%)] max-w-[min(300px,100%)]"
          viewBox="0 0 300 300"
          aria-hidden="true"
        >
          <circle
            cx="150"
            cy="150"
            r={ringRadius}
            fill="none"
            stroke="rgba(var(--p-fg-rgb), 0.07)"
            strokeWidth="8"
          />
          <circle
            cx="150"
            cy="150"
            r={ringRadius}
            fill="none"
            stroke={
              room.phase === "focus" ? "var(--p-success)" : "var(--p-accent)"
            }
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - fraction)}
            transform="rotate(-90 150 150)"
            style={{ transition: "stroke-dashoffset .9s linear, stroke .2s ease" }}
          />
        </svg>
        <div className="relative flex flex-col items-center">
          {/* Nothing over the clock while the room waits: the room card
              already says so (Tyler, 10 Oct 2026: "remove the 'Waiting to
              start' from the timer"). */}
          {counting || room.phase !== "waiting" ? (
            <span className={eyebrowClass}>
              {counting ? "Starting in" : (phaseLabels[room.phase] ?? room.phase)}
            </span>
          ) : null}
          <time className="mt-3 font-mono text-[64px] font-semibold leading-none tracking-tight tabular-nums">
            {clockText(shownSeconds)}
          </time>
          {isHost ? (
            <div className="mt-5 flex items-center gap-2">
              <RoomHostButtons
                room={room}
                counting={counting}
                pending={pending !== ""}
                onAction={onAction}
              />
            </div>
          ) : room.phase === "waiting" && !counting ? (
            <span className="mt-5 text-sm text-muted-foreground">
              Waiting for {hostName} to start
            </span>
          ) : null}
          {/* The tooltip draws outside the ring, so in full screen only the
              label and the shrink icon say it; the browser shows nothing
              above the full-screen ring. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon-lg"
                className={cn("mt-4 rounded-full", ringIconButtonClass)}
                aria-label={fullScreenLabel}
                onClick={() => {
                  if (document.fullscreenElement) void document.exitFullscreen()
                  else void ringRef.current?.requestFullscreen?.()
                }}
              >
                {fullScreen ? (
                  <MinimizeIcon className="size-4" aria-hidden="true" />
                ) : (
                  <MaximizeIcon className="size-4" aria-hidden="true" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{fullScreenLabel}</TooltipContent>
          </Tooltip>
          {/* Inside the ring, under Full screen. Tyler, 9 Oct 2026: "move the
              sessions text here". */}
          <p className="mt-3 font-mono text-sm text-muted-foreground">
            <strong className="font-semibold text-foreground">{room.cycleFocusCount}</strong> / 4 sessions
          </p>
        </div>
      </div>
      {/* The room's sound, just under the clock it follows. Tyler, 9 Oct
          2026: "move the sound control just under the timer". */}
      <SoundPlayerRow />
      {/* The room's rhythm as the host set it: a chip per focus with its
          length (done orange, the next one outlined, the rest grey), and the
          breaks. Tyler's design of 8 Oct 2026; the count moved into the ring
          on 9 Oct. */}
      <div className="flex w-full max-w-[480px] flex-col gap-3">
        <div
          role="img"
          aria-label={`${room.cycleFocusCount} of 4 sessions done, ${room.focusMinutes} minutes each`}
          className="grid grid-cols-4 gap-2"
        >
          {[0, 1, 2, 3].map((index) => (
            <span
              key={index}
              aria-hidden="true"
              className={cn(
                "grid h-[30px] place-items-center rounded-[8px] border font-mono text-sm",
                index < room.cycleFocusCount
                  ? "border-transparent bg-primary text-primary-foreground"
                  : index === sessionIndex
                    ? "border-primary/80 bg-primary/15 text-primary"
                    : "bg-foreground/5 text-muted-foreground"
              )}
            >
              {room.focusMinutes}m
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

/**
 * What the host is told before Close room: it ends the room for everyone in
 * it, and says how many that is.
 */
function closeConsequence(others: number) {
  if (others <= 0)
    return "Nobody else is in the room. It ends now and cannot be reopened."
  return `The session stops for the ${others} ${others === 1 ? "other person" : "other people"} in it, and it cannot be undone.`
}

/**
 * The front page while you are in somebody's room, or your own hosted one:
 * the room's panel in place of the timer. The store already said there is a
 * room, so until the snapshot arrives the page keeps a frame with a loading
 * row rather than drawing the timer and swapping it out.
 */
export function JoinedRoom() {
  const live = useRoomClock({ check: true })
  const pomodoro = usePomodoro()
  const snapshot = live.snapshot
  return (
    <div className={`${contentColumn} flex flex-col gap-7 py-8`}>
      {snapshot ? (
        <ActiveRoomPanel
          snapshot={snapshot}
          reconnecting={live.reconnecting}
          onSnapshot={applyRoomSnapshot}
          onLeft={(message) => leftRoom(snapshot.room.slug, message)}
        />
      ) : live.checkFailed ? (
        <Card>
          <ErrorRow
            message="We could not load the room you are in."
            onRetry={() => {
              dismissErrorToast()
              void checkCurrentRoom()
            }}
          />
        </Card>
      ) : (
        <Card>
          <LoadingRow label="Opening your room…" />
        </Card>
      )}
      {/* Your own tasks, the same list as the timer's, in a card of their own
          under the room. */}
      <div className="overflow-hidden rounded-[24px] border bg-[var(--p-surface)]">
        <TasksSection pomodoro={pomodoro} />
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Looking for another room?{" "}
        <Link
          to="/rooms"
          className="text-[var(--p-accent)] underline underline-offset-2"
        >
          Browse rooms
        </Link>
        .
      </p>
    </div>
  )
}
