import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  CheckIcon,
  CopyIcon,
  LockKeyholeIcon,
  PlusIcon,
  UsersIcon,
  WifiOffIcon,
} from "lucide-react"

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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  applyRoomAction,
  banMember,
  createRoom,
  deleteMessage,
  getCurrentRoom,
  joinRoom,
  leaveActiveRoom,
  listRooms,
  removeMember,
  toggleReaction,
} from "@/lib/api/pomodoro/rooms"
import {
  RoomChatPanel,
  RoomMemberList,
} from "@/components/pomodoro/room-chat"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import { PRO_PERKS } from "@/lib/pomodoro/pro"

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
  const [error, setError] = React.useState("")
  const [notice, setNotice] = React.useState("")
  const [reconnecting, setReconnecting] = React.useState(false)
  const [confirm, setConfirm] = React.useState<ConfirmRequest | null>(null)
  const activeRoomSlug = activeRoom?.room.slug

  const refreshRooms = React.useCallback(() => {
    if (!authenticated) return
    void listRooms()
      .then(setRoomRows)
      .catch(() => setError("Rooms could not be loaded."))
  }, [authenticated])
  React.useEffect(refreshRooms, [refreshRooms])
  React.useEffect(() => {
    if (!authenticated) return
    void getCurrentRoom()
      .then((snapshot) => {
        if (snapshot) setActiveRoom((current) => current ?? snapshot)
      })
      .catch(() => undefined)
  }, [authenticated])

  // The SSE broadcast and a mutation's own response race in either order,
  // so only a deliberate action (force) may overwrite an existing closed
  // notice; the broadcast just fills the notice in when nothing explained
  // the close.
  const applySnapshot = React.useCallback(
    (
      snapshot: RoomSnapshotClient,
      closedNotice = "This room has ended.",
      forceClosedNotice = false
    ) => {
      if (snapshot.room.phase === "closed") {
        setActiveRoom(null)
        setNotice((current) =>
          forceClosedNotice ? closedNotice : current || closedNotice
        )
        refreshRooms()
        return
      }
      setNotice("")
      setActiveRoom(snapshot)
    },
    [refreshRooms]
  )

  React.useEffect(() => {
    if (!activeRoomSlug) return
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
      // A deliberate leave/close already explained itself; only fill the
      // notice when the membership ended from the other side.
      setNotice((current) => current || "You are no longer in this room.")
      refreshRooms()
    })
    source.onerror = () => setReconnecting(true)
    return () => {
      setReconnecting(false)
      source.close()
    }
  }, [activeRoomSlug, applySnapshot, refreshRooms])

  const performJoin = async (slug: string) => {
    setError("")
    try {
      applySnapshot(await joinRoom(slug))
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : ""
      setError(
        message.includes("ROOM_LOCKED")
          ? "That room is mid-focus. Join again during its break."
          : message.includes("ROOM_CLOSED")
            ? "That room has ended."
            : message.includes("ROOM_BANNED")
              ? "You can't join that room."
              : "This room is not available to join."
      )
      refreshRooms()
    }
  }

  const joinBySlug = async (slug: string) => {
    if (!authenticated) {
      void navigate({ to: "/login" })
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

  const openRooms = roomRows.filter(({ room }) => room.phase !== "focus")
  const liveRooms = roomRows.filter(({ room }) => room.phase === "focus")

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-8">
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
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {activeRoom ? (
        <ActiveRoomPanel
          snapshot={activeRoom}
          reconnecting={reconnecting}
          onSnapshot={applySnapshot}
          onLeft={(message) => {
            setActiveRoom(null)
            setNotice(message)
            refreshRooms()
          }}
          onActionError={setError}
        />
      ) : null}
      {!authenticated ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-2 py-6">
            <p className="text-sm text-muted-foreground">
              Rooms are where people focus together on one clock. Sign in to
              browse the open rooms and join one.
            </p>
            <Button asChild size="sm" className="rounded-full font-bold">
              <a href="/login">Sign in</a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <RoomGroup
            title="Open to join"
            subtitle="on break · waiting to start"
            rooms={openRooms}
            open
            onJoin={joinBySlug}
            onHost={!activeRoom ? () => setShowHostForm((value) => !value) : undefined}
          />
          <RoomGroup
            title="In session"
            subtitle="focused · joins locked until break"
            rooms={liveRooms}
            open={false}
            onJoin={async () => undefined}
          />
        </>
      )}
    </div>
  )
}

function HostRoomDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (snapshot: RoomSnapshotClient) => void
}) {
  const [roomName, setRoomName] = React.useState("")
  const [visibility, setVisibility] = React.useState<"public" | "unlisted">(
    "public"
  )
  const [focusMinutes, setFocusMinutes] = React.useState(25)
  const [shortBreakMinutes, setShortBreakMinutes] = React.useState(5)
  const [longBreakMinutes, setLongBreakMinutes] = React.useState(15)
  const [autoStart, setAutoStart] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [error, setError] = React.useState("")
  const validDurations = [focusMinutes, shortBreakMinutes, longBreakMinutes].every(
    (value) => Number.isInteger(value) && value >= 1 && value <= 90
  )

  const submit = async () => {
    setError("")
    setCreating(true)
    try {
      const created = await createRoom({
        name: roomName,
        visibility,
        focusMinutes,
        shortBreakMinutes,
        longBreakMinutes,
        autoStart,
      })
      setRoomName("")
      onCreated(created)
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message.includes("UPGRADE_REQUIRED")
          ? PRO_PERKS.hostRooms.lockedReason
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
            Pick the vibe and timers — you control the session once people
            join.
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
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["Focus minutes", focusMinutes, setFocusMinutes],
                  ["Short break", shortBreakMinutes, setShortBreakMinutes],
                  ["Long break", longBreakMinutes, setLongBreakMinutes],
                ] as const
              ).map(([label, value, setValue]) => (
                <div key={label} className="grid gap-2">
                  <Label htmlFor={`room-${label}`}>{label}</Label>
                  <Input
                    id={`room-${label}`}
                    type="number"
                    min={1}
                    max={90}
                    value={value}
                    onChange={(event) => setValue(event.target.valueAsNumber)}
                  />
                </div>
              ))}
            </div>
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
          <Button
            type="submit"
            form="host-room-form"
            disabled={creating || !validDurations}
          >
            {creating ? "Creating…" : "Create room"}
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
  onActionError,
}: {
  snapshot: RoomSnapshotClient
  reconnecting: boolean
  onSnapshot: (
    snapshot: RoomSnapshotClient,
    closedNotice?: string,
    forceClosedNotice?: boolean
  ) => void
  onLeft: (message: string) => void
  onActionError: (message: string) => void
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
    onActionError("")
    setPending(action)
    try {
      onSnapshot(
        await applyRoomAction(room.slug, action),
        "You closed the room.",
        true
      )
    } catch (cause) {
      onActionError(
        cause instanceof Error && cause.message.includes("ROOM_HOST_REQUIRED")
          ? "Only the host can control the room."
          : "The room could not be updated."
      )
    } finally {
      setPending("")
    }
  }

  const leave = async () => {
    onActionError("")
    setPending("leave")
    try {
      const result = await leaveActiveRoom(room.slug)
      onLeft(result.closed ? "You closed the room." : "You left the room.")
    } catch {
      onActionError("Leaving the room failed. Try again.")
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
    onActionError("")
    setPanelNotice("")
    setPending(key)
    try {
      onSnapshot(await action())
      setPanelNotice(successNotice)
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : ""
      onActionError(
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
    onActionError("")
    setReactionPending((current) => new Set(current).add(key))
    try {
      await toggleReaction(room.slug, messageId, emoji)
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : ""
      onActionError(
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

  return (
    <Card className="border-[rgba(255,90,60,0.35)]">
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
              onClick={() => void leave()}
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
          <RoomMemberList
            members={members}
            isHost={isHost}
            busy={pending !== ""}
            onRemove={confirmRemoveMember}
            onBan={confirmBanMember}
          />
          <RoomChatPanel
            slug={room.slug}
            messages={messages}
            isHost={isHost}
            busy={pending !== ""}
            reactionPending={reactionPending}
            onToggleReaction={(messageId, emoji) =>
              void toggleMessageReaction(messageId, emoji)
            }
            onDeleteMessage={confirmDeleteMessage}
            onError={onActionError}
            onNotice={setPanelNotice}
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

function RoomGroup({
  title,
  subtitle,
  rooms,
  open,
  onJoin,
  onHost,
}: {
  title: string
  subtitle: string
  rooms: Awaited<ReturnType<typeof listRooms>>
  open: boolean
  onJoin: (slug: string) => Promise<void>
  onHost?: () => void
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <h3 className="text-lg font-bold">{title}</h3>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
        {onHost ? (
          <Button size="sm" variant="outline" className="ml-auto" onClick={onHost}>
            <PlusIcon aria-hidden="true" /> Host a room
          </Button>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {rooms.map(({ room, memberCount }) => {
          const end = room.phaseEndsAt ? new Date(room.phaseEndsAt).getTime() : 0
          const remaining = Math.max(0, Math.ceil((end - Date.now()) / 60_000))
          return (
            <Card key={room.id} className={cn(!open && "opacity-70")}>
              <CardContent className="flex flex-col gap-2 py-4">
                <div className="flex items-baseline justify-between gap-2">
                  <strong className="truncate text-sm">{room.name}</strong>
                  <time className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {room.phase === "waiting"
                      ? "waiting to start"
                      : `${remaining} min left`}
                  </time>
                </div>
                <span className="text-xs text-muted-foreground">
                  {room.phase === "focus"
                    ? `Session ${Math.min(room.cycleFocusCount + 1, 4)} of 4`
                    : `Next: ${room.focusMinutes} min focus`}{" "}
                  · {memberCount} focusing
                </span>
                <div>
                  {open ? (
                    <Button size="sm" onClick={() => void onJoin(room.slug)}>
                      Join
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled>
                      <LockKeyholeIcon aria-hidden="true" /> Locked
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
        {!rooms.length ? (
          <p className="text-sm text-muted-foreground">No rooms here yet.</p>
        ) : null}
      </div>
    </section>
  )
}
