import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  CheckIcon,
  CopyIcon,
  ImageIcon,
  MusicIcon,
  UsersIcon,
  WifiOffIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  applyRoomAction,
  banMember,
  deleteMessage,
  getCurrentRoom,
  leaveActiveRoom,
  removeMember,
  toggleReaction,
} from "@/lib/api/pomodoro/rooms"
import {
  RoomChatPanel,
  RoomMemberList,
} from "@/components/pomodoro/room-chat"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import { contentColumn } from "@/lib/pomodoro/content-column"
import { sceneFor, soundLabelFor } from "@/lib/pomodoro/media-pair"
import {
  enterHostedRoom,
  leaveHostedRoom,
} from "@/lib/pomodoro/room-media-store"
import { followRoomRunning } from "@/lib/pomodoro/sound-engine"
import { usePageVisible } from "@/lib/pomodoro/use-page-visible"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * The room you are in: its live snapshot, the connection that keeps it
 * current, and the panel that draws it. See `workspace/docs/rooms.md`.
 *
 * Two pages use it. The front page draws the whole panel, because Tyler,
 * 7 Oct 2026: "the index page will be replaced with the joined room". The
 * Rooms page only says which room you are in and links back to it.
 *
 * Every snapshot also tells the room media store which room this is and
 * which sound and theme it carries, so every screen draws the room's pair;
 * and it tells the sound engine when the room's clock is running, which
 * starts and stops the room's sound the way your own timer does.
 */

export type RoomSnapshotClient = NonNullable<
  Awaited<ReturnType<typeof getCurrentRoom>>
>
type RoomHostActionClient = "start_focus" | "start_break" | "next_phase" | "close"
export type ConfirmRequest = {
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
 * Hands a room's snapshot to the store that decides the sound and theme on
 * screen. Called for every snapshot, and straight after a join or a create,
 * so the page you land on already draws the room.
 */
export function enterRoomFromSnapshot(snapshot: RoomSnapshotClient) {
  if (snapshot.room.phase === "closed") {
    leaveHostedRoom()
    return
  }
  enterHostedRoom({
    slug: snapshot.room.slug,
    name: snapshot.room.name,
    role: snapshot.you.role,
    sound: snapshot.room.sound,
    background: snapshot.room.background,
  })
}

/**
 * The room you are in, kept live. `onEnded` runs when it closes, when you
 * are removed, and when you leave it from here.
 */
export function useActiveRoom({ onEnded }: { onEnded?: () => void } = {}) {
  const { authenticated } = useProductAuth()
  const [activeRoom, setActiveRoom] = React.useState<RoomSnapshotClient | null>(
    null
  )
  // Whether asking the server which room you are in failed. While it has, the
  // page does not know, so it draws nothing that would imply "none".
  const [checkFailed, setCheckFailed] = React.useState(false)
  const [reconnecting, setReconnecting] = React.useState(false)
  // The room whose ending has already been explained by the person's own
  // action, so a broadcast arriving afterwards does not explain it again in
  // vaguer words.
  const endExplainedRef = React.useRef("")
  const onEndedRef = React.useRef(onEnded)
  React.useEffect(() => {
    onEndedRef.current = onEnded
  }, [onEnded])
  // Whether this page has seen the room's clock yet. The first snapshot only
  // records it, so arriving mid-focus never starts the sound by itself.
  const clockSeenRef = React.useRef(false)
  const activeRoomSlug = activeRoom?.room.slug

  const checkCurrentRoom = React.useCallback(() => {
    if (!authenticated) return
    void getCurrentRoom().then(
      (snapshot) => {
        setCheckFailed(false)
        if (snapshot) {
          enterRoomFromSnapshot(snapshot)
          setActiveRoom((current) => current ?? snapshot)
        } else {
          // The room ended while nobody was looking. Back to your own pair.
          leaveHostedRoom()
        }
      },
      () => setCheckFailed(true)
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

  // `tellPage` is false when the page itself ended the room, because the page
  // already refreshes after its own action and a second refresh is wasted.
  const endRoom = React.useCallback((tellPage = true) => {
    setActiveRoom(null)
    leaveHostedRoom()
    followRoomRunning(false)
    clockSeenRef.current = false
    if (tellPage) onEndedRef.current?.()
  }, [])

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
        announceRoomEnd(snapshot.room.slug, closedNotice, forceClosedNotice)
        endRoom()
        return
      }
      endExplainedRef.current = ""
      enterRoomFromSnapshot(snapshot)
      followRoomRunning(snapshot.room.phase !== "waiting", !clockSeenRef.current)
      clockSeenRef.current = true
      setActiveRoom(snapshot)
    },
    [announceRoomEnd, endRoom]
  )

  /** You left or closed it yourself, and `message` says which. */
  const leftRoom = React.useCallback(
    (slug: string, message: string) => {
      announceRoomEnd(slug, message, true)
      endRoom(false)
    },
    [announceRoomEnd, endRoom]
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
      // A deliberate leave/close already explained itself; this only speaks
      // when the membership ended from the other side.
      announceRoomEnd(activeRoomSlug, "You are no longer in this room.", false)
      endRoom()
    })
    source.onerror = () => setReconnecting(true)
    return () => {
      setReconnecting(false)
      source.close()
    }
  }, [activeRoomSlug, announceRoomEnd, applySnapshot, endRoom, pageVisible])

  return {
    activeRoom,
    checkFailed,
    reconnecting,
    checkCurrentRoom: () => {
      setCheckFailed(false)
      checkCurrentRoom()
    },
    applySnapshot,
    leftRoom,
  }
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
        <RoomPairLine
          sound={room.sound}
          background={room.background}
          isHost={isHost}
        />

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

/**
 * The room's sound and theme, under its name. The host is pointed at the two
 * pages where the pair is changed for everybody; a member is only told what
 * the host picked.
 */
function RoomPairLine({
  sound,
  background,
  isHost,
}: {
  sound: string | null
  background: string | null
  isHost: boolean
}) {
  const soundName = soundLabelFor(sound) ?? "No sound"
  const sceneName = sceneFor(background)?.label ?? "Lofi girl"
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <MusicIcon className="size-3.5" aria-hidden="true" />
        {soundName}
      </span>
      <span className="flex items-center gap-1">
        <ImageIcon className="size-3.5" aria-hidden="true" />
        {sceneName}
      </span>
      {isHost ? (
        <span>
          Change them on{" "}
          <Link to="/sounds" className="underline underline-offset-2">
            Sounds
          </Link>{" "}
          and{" "}
          <Link to="/backgrounds" className="underline underline-offset-2">
            Backgrounds
          </Link>
          .
        </span>
      ) : (
        <span>Picked by the host.</span>
      )}
    </p>
  )
}

/**
 * The front page while you are in somebody's room, or your own hosted one:
 * the room's panel in place of the timer. The store already said there is a
 * room, so until the snapshot arrives the page keeps a frame with a loading
 * row rather than drawing the timer and swapping it out.
 */
export function JoinedRoom() {
  const live = useActiveRoom()
  const snapshot = live.activeRoom
  return (
    <div className={`${contentColumn} flex flex-col gap-6 py-8`}>
      {snapshot ? (
        <ActiveRoomPanel
          snapshot={snapshot}
          reconnecting={live.reconnecting}
          onSnapshot={live.applySnapshot}
          onLeft={(message) => live.leftRoom(snapshot.room.slug, message)}
        />
      ) : live.checkFailed ? (
        <Card>
          <ErrorRow
            message="We could not load the room you are in."
            onRetry={() => {
              dismissErrorToast()
              live.checkCurrentRoom()
            }}
          />
        </Card>
      ) : (
        <Card>
          <LoadingRow label="Opening your room…" />
        </Card>
      )}
      <p className="text-sm text-muted-foreground">
        Looking for another room? <Link to="/rooms" className="underline underline-offset-2">Browse rooms</Link>.
      </p>
    </div>
  )
}
