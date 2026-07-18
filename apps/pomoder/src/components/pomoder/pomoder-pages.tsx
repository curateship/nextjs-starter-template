import * as React from "react"
import { Link, useNavigate, useParams, useRouteContext } from "@tanstack/react-router"
import {
  Check,
  Coffee,
  Copy,
  Flag,
  Loader2,
  LockKeyhole,
  LogOut,
  MoreVertical,
  Pause,
  Play,
  Plus,
  SkipForward,
  SmilePlus,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { usePomodoro } from "@/hooks/use-pomodoro"
import { ConfirmDialog, type ConfirmRequest } from "@/components/pomoder/confirm-dialog"
import { FocusRhythmPresets } from "@/components/pomoder/focus-rhythm-presets"
import { usePomoderBackground } from "@/components/pomoder/pomoder-background"
import { useSoundPlayer } from "@/components/pomoder/sound-player"
import { TodayTaskList } from "@/components/pomoder/task-plan-list"
import { ThemeToggle } from "@/components/pomoder/theme-toggle"
import { curatedBackgrounds, sameBackgroundReference } from "@/lib/background-catalog"
import { enableCompletionAlerts } from "@/lib/completion-alerts"
import { curatedSounds, sameSoundReference, type SoundReference } from "@/lib/sound-catalog"
import { deleteAccount, updateProfile } from "@/lib/api/auth"
import { createBillingPortal, createCheckout, loadEntitlements } from "@/lib/api/billing"
import { requestGeneration } from "@/lib/api/generation"
import { listMedia } from "@/lib/api/pomoder-media"
import { loadLeaderboard, loadProductivity } from "@/lib/api/productivity"
import { applyRoomAction, banMember, createRoom, deleteMessage, getCurrentRoom, joinRoom, leaveActiveRoom, listRooms, lookupRoom, removeMember, reportMessage, sendRoomMessage, toggleReaction } from "@/lib/api/rooms"
import { ROOM_REACTION_EMOJIS, roomReactionLabel } from "@/lib/room-reactions"

export function CatalogPage({ kind }: { kind: "themes" | "sounds" }) {
  const { user } = useRouteContext({ from: "__root__" })
  const { background, chooseBackground } = usePomoderBackground()
  const player = useSoundPlayer()
  const items = kind === "themes" ? curatedBackgrounds.map((scene) => [scene.label, scene.thumb, scene.locked] as const) : curatedSounds.map((sound) => [sound.label, sound.key, sound.locked] as const)
  const [media, setMedia] = React.useState<Awaited<ReturnType<typeof listMedia>>>([])
  const [mediaLoaded, setMediaLoaded] = React.useState(false)
  const [isPro, setIsPro] = React.useState(false)
  const [prompt, setPrompt] = React.useState("")
  const [notice, setNotice] = React.useState("")
  const fileInput = React.useRef<HTMLInputElement>(null)
  const descriptions = kind === "themes" ? curatedBackgrounds.map((scene) => scene.descriptor) : curatedSounds.map((sound) => sound.description)
  const visibleMedia = media.filter((asset) => kind === "themes" ? ["image", "video"].includes(asset.kind) : asset.kind === "audio")
  const reloadMedia = () => { if (user) void listMedia().then((assets) => { setMedia(assets); setMediaLoaded(true) }).catch(() => setNotice("Your media could not be loaded.")) }
  React.useEffect(reloadMedia, [user])
  // Pro members unlock the premium curated scenes and can upload their own; the
  // server still enforces this on every action.
  React.useEffect(() => { if (user) void loadEntitlements().then((entitlements) => setIsPro(entitlements.plan === "pro")).catch(() => setIsPro(false)); else setIsPro(false) }, [user])

  const playerSelected = player.state.selected
  const { markMediaUnavailable, resolveMediaLabel } = player
  React.useEffect(() => {
    if (kind !== "sounds" || !mediaLoaded || playerSelected?.type !== "media") return
    const asset = media.find((candidate) => candidate.id === playerSelected.mediaId)
    if (asset && asset.status === "ready") resolveMediaLabel(asset.id, asset.name)
    else markMediaUnavailable(playerSelected.mediaId)
  }, [kind, markMediaUnavailable, media, mediaLoaded, playerSelected, resolveMediaLabel])

  const soundCardState = (reference: SoundReference) => {
    const isSelected = sameSoundReference(playerSelected, reference)
    return { isSelected, isPlaying: isSelected && player.state.status === "playing", isLoading: isSelected && player.state.status === "loading" }
  }

  return (
    <div className="reference-view catalog-reference-view">
      <div className="catalog-reference-inner">
        <header className="catalog-reference-heading"><div><h2>{kind === "themes" ? "Backgrounds" : "Sounds"}</h2><p>{kind === "themes" ? "Set the scene for your focus sessions." : "Ambient audio to keep you in the zone."}</p></div>{!isPro ? <Link to="/pricing"><Sparkles aria-hidden="true" />Unlock all</Link> : null}</header>
        <div className="reference-catalog-grid">
          {items.map(([label, image, premium], index) => {
            const locked = premium && !isPro
            const sceneKey = image === "lofi_girl" ? "lofi" : image
            const { isSelected, isPlaying, isLoading } = kind === "sounds" ? soundCardState({ type: "curated", key: image }) : { isSelected: background.type === "scene" && background.key === sceneKey, isPlaying: false, isLoading: false }
            return (
              <button key={image} className={`reference-catalog-card ${isSelected ? "selected" : ""} ${locked ? "locked" : ""}`} aria-pressed={!locked ? isSelected : undefined} onClick={() => { if (locked) { window.location.assign("/pricing"); return }; if (kind === "themes") chooseBackground({ type: "scene", key: sceneKey }); else player.selectSound({ type: "curated", key: image }, label) }}>
                <span className="catalog-thumb"><img src={`/pomoder/${kind === "themes" ? "thumbs" : "sounds"}-${image}.png`} alt="" />{locked ? <><b>PRO</b><i><LockKeyhole aria-hidden="true" /></i></> : kind === "sounds" ? <i>{isLoading ? <Loader2 className="player-spinner" aria-hidden="true" /> : isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</i> : isSelected ? <i><Check aria-hidden="true" /></i> : null}</span>
                <strong>{label}</strong><small>{isPlaying ? "playing" : descriptions[index]}</small>
              </button>
            )
          })}
          {visibleMedia.map((asset) => {
            const { isSelected, isPlaying, isLoading } = kind === "sounds" ? soundCardState({ type: "media", mediaId: asset.id }) : { isSelected: sameBackgroundReference(background, { type: "media", mediaId: asset.id }), isPlaying: false, isLoading: false }
            return (
              <button key={asset.id} className={`reference-catalog-card ${isSelected ? "selected" : ""}`} disabled={asset.status !== "ready"} aria-pressed={asset.status === "ready" ? isSelected : undefined} onClick={() => { if (kind === "themes") chooseBackground({ type: "media", mediaId: asset.id, mediaKind: asset.kind === "video" ? "video" : "image" }); else player.selectSound({ type: "media", mediaId: asset.id }, asset.name) }}>
                <span className="catalog-thumb"><img src={asset.kind === "image" ? `/api/media/${asset.id}/file` : `/pomoder/${kind === "themes" ? "thumbs-ambient" : "sounds-lofi"}.png`} alt="" />{kind === "sounds" && asset.status === "ready" ? <i>{isLoading ? <Loader2 className="player-spinner" aria-hidden="true" /> : isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</i> : kind === "themes" && isSelected ? <i><Check aria-hidden="true" /></i> : null}</span>
                <strong>{asset.name}</strong><small>{isPlaying ? "playing" : asset.status}</small>
              </button>
            )
          })}
        </div>
        <input ref={fileInput} hidden type="file" accept={kind === "themes" ? "image/png,image/jpeg,image/webp,video/mp4,video/webm" : "audio/mpeg,audio/wav,audio/ogg"} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; if (!user) { window.location.assign("/login"); return }; const form = new FormData(); form.set("file", file); form.set("name", file.name); setNotice("Uploading…"); const response = await fetch("/api/media", { method: "POST", body: form }); setNotice(response.ok ? "Upload queued for processing." : "Upload could not be accepted."); if (response.ok) reloadMedia(); event.target.value = "" }} />
        <section className="reference-generator"><div className="generator-title"><i><Sparkles aria-hidden="true" /></i><div><h3>Generate your own</h3><p>Describe a {kind === "themes" ? "scene and AI will create an animated background" : "soundscape and AI will mix an ambient loop"} for you.</p></div><b>PRO</b></div>
          <form onSubmit={async (event) => { event.preventDefault(); if (!user) { window.location.assign("/pricing"); return }; setNotice(""); try { await requestGeneration(kind === "themes" ? "background" : "soundscape", prompt); setPrompt(""); setNotice("Generation queued. It will appear here when processing finishes."); reloadMedia() } catch (cause) { setNotice(cause instanceof Error && cause.message.includes("PRO_REQUIRED") ? "AI generation requires Pomoder Pro." : "Generation is currently unavailable.") } }}><input required minLength={5} maxLength={500} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={kind === "themes" ? "A cozy cabin desk at dawn, snow falling outside the window…" : "Distant thunder with a crackling fire and soft wind…"} aria-label="Generation prompt" /><button><Sparkles aria-hidden="true" />Generate</button></form>
          <div className="generator-suggestions"><span>TRY</span>{(kind === "themes" ? ["Tokyo street in the rain at night", "Sunlit library with dust motes", "Spaceship window over Earth"] : ["Rain on a tent in the mountains", "Quiet café with jazz in the background", "Ocean waves at midnight"]).map((suggestion) => <button key={suggestion} onClick={() => setPrompt(suggestion)}>{suggestion}</button>)}</div>
          <button className="upload-own" onClick={() => user ? fileInput.current?.click() : window.location.assign("/login")}><Upload aria-hidden="true" /> Upload your own</button>
        </section>
        {notice ? <p role="status">{notice}</p> : null}
      </div>
    </div>
  )
}

type RoomSnapshotClient = Awaited<ReturnType<typeof joinRoom>>
type RoomHostActionClient = Parameters<typeof applyRoomAction>[1]

const ROOM_AVATARS = ["maya", "tomas", "ana", "devon"] as const
const ROOM_PHASE_LABELS: Record<string, string> = { waiting: "Waiting to start", focus: "Focus", short: "Short break", long: "Long break", closed: "Closed" }

// Countdowns derive from the server's phaseEndsAt on every tick, so they stay
// correct after tab backgrounding or an SSE reconnect.
function useRoomCountdown(phaseEndsAt: Date | string | null) {
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

export function RoomsPage() {
  const { user } = useRouteContext({ from: "__root__" })
  const [roomRows, setRoomRows] = React.useState<Awaited<ReturnType<typeof listRooms>>>([])
  const [activeRoom, setActiveRoom] = React.useState<RoomSnapshotClient | null>(null)
  const [showHostForm, setShowHostForm] = React.useState(false)
  const [error, setError] = React.useState("")
  const [notice, setNotice] = React.useState("")
  const [reconnecting, setReconnecting] = React.useState(false)
  const [confirm, setConfirm] = React.useState<ConfirmRequest | null>(null)
  const activeRoomSlug = activeRoom?.room.slug

  const refreshRooms = React.useCallback(() => { void listRooms().then(setRoomRows).catch(() => setError("Rooms could not be loaded.")) }, [])
  React.useEffect(refreshRooms, [refreshRooms])
  React.useEffect(() => { if (user) void getCurrentRoom().then((snapshot) => { if (snapshot) setActiveRoom((current) => current ?? snapshot) }).catch(() => undefined) }, [user])

  // The SSE broadcast and a mutation's own response race in either order, so
  // only a deliberate action (force) may overwrite an existing closed notice;
  // the broadcast just fills the notice in when nothing explained the close.
  const applySnapshot = React.useCallback((snapshot: RoomSnapshotClient, closedNotice = "This room has ended.", forceClosedNotice = false) => {
    if (snapshot.room.phase === "closed") {
      setActiveRoom(null)
      setNotice((current) => (forceClosedNotice ? closedNotice : current || closedNotice))
      refreshRooms()
      return
    }
    setNotice("")
    setActiveRoom(snapshot)
  }, [refreshRooms])

  React.useEffect(() => {
    if (!activeRoomSlug) return
    const source = new EventSource(`/api/rooms/${activeRoomSlug}/events`)
    source.addEventListener("snapshot", (event) => {
      setReconnecting(false)
      applySnapshot(JSON.parse((event as MessageEvent<string>).data) as RoomSnapshotClient)
    })
    source.addEventListener("room_gone", () => {
      setActiveRoom(null)
      // A deliberate leave/close already explained itself; only fill the
      // notice when the membership ended from the other side.
      setNotice((current) => current || "You are no longer in this room.")
      refreshRooms()
    })
    source.onerror = () => setReconnecting(true)
    return () => { setReconnecting(false); source.close() }
  }, [activeRoomSlug, applySnapshot, refreshRooms])

  const performJoin = async (slug: string) => {
    setError("")
    try { applySnapshot(await joinRoom(slug)) } catch (cause) {
      const message = cause instanceof Error ? cause.message : ""
      setError(message.includes("ROOM_LOCKED") ? "That room is mid-focus. Join again during its break." : message.includes("ROOM_CLOSED") ? "That room has ended." : message.includes("ROOM_BANNED") ? "You can't join that room." : "This room is not available to join.")
      refreshRooms()
    }
  }

  const joinBySlug = async (slug: string, demo?: boolean) => {
    if (!user || demo) { window.location.assign("/login"); return }
    if (activeRoom?.you.role === "host") {
      setConfirm({
        title: "Join another room?",
        description: "Joining another room closes the room you currently host and ends it for its members.",
        confirmLabel: "Join room",
        onConfirm: () => void performJoin(slug),
      })
      return
    }
    await performJoin(slug)
  }

  const realOpenRooms = roomRows.filter(({ room }) => room.phase !== "focus").map((row, index) => roomCard(row, index))
  const realLiveRooms = roomRows.filter(({ room }) => room.phase === "focus").map((row, index) => roomCard(row, index + realOpenRooms.length))
  const openRooms = !user && !roomRows.length ? demoRooms.slice(0, 2) : realOpenRooms
  const liveRooms = !user && !roomRows.length ? demoRooms.slice(2) : realLiveRooms

  return (
    <div className="reference-view rooms-view">
      <HostRoomDialog
        open={showHostForm && !activeRoom}
        onOpenChange={setShowHostForm}
        onCreated={(snapshot) => { setShowHostForm(false); applySnapshot(snapshot); refreshRooms() }}
      />
      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
      <div className="rooms-view-inner">
        {error ? <p className="room-notice" role="alert">{error}</p> : null}
        {notice ? <p className="room-notice" role="status">{notice}</p> : null}
        {activeRoom ? (
          <ActiveRoomPanel
            snapshot={activeRoom}
            reconnecting={reconnecting}
            onSnapshot={applySnapshot}
            onLeft={(message) => { setActiveRoom(null); setNotice(message); refreshRooms() }}
            onActionError={setError}
          />
        ) : null}
        <RoomGroup title="Open to join" subtitle="on break · waiting to start" rooms={openRooms} open onHost={user && !activeRoom ? () => setShowHostForm((value) => !value) : undefined} onJoin={joinBySlug} />
        <RoomGroup title="In session" subtitle="focused · joins locked until break" rooms={liveRooms} open={false} onJoin={async () => undefined} />
      </div>
    </div>
  )
}

function HostRoomDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (snapshot: RoomSnapshotClient) => void }) {
  const [roomName, setRoomName] = React.useState("")
  const [visibility, setVisibility] = React.useState<"public" | "unlisted">("public")
  const [focusMinutes, setFocusMinutes] = React.useState(25)
  const [shortBreakMinutes, setShortBreakMinutes] = React.useState(5)
  const [longBreakMinutes, setLongBreakMinutes] = React.useState(15)
  const [autoStart, setAutoStart] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [error, setError] = React.useState("")
  const validDurations = [focusMinutes, shortBreakMinutes, longBreakMinutes].every((value) => Number.isInteger(value) && value >= 1 && value <= 90)

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!creating) { setError(""); onOpenChange(next) } }}>
      {/* Portaled to <body>; inherits the active theme from <html>. */}
      <DialogContent className="host-room-dialog">
        <DialogTitle className="host-room-dialog-title">Host a room</DialogTitle>
        <DialogDescription className="host-room-dialog-sub">Pick the vibe and timers — you control the session once people join.</DialogDescription>
        <form
          className="host-room-form"
          onSubmit={async (event) => {
            event.preventDefault()
            setError("")
            setCreating(true)
            try {
              const created = await createRoom({ name: roomName, visibility, focusMinutes, shortBreakMinutes, longBreakMinutes, autoStart })
              setRoomName("")
              onCreated(created)
            } catch (cause) {
              setError(cause instanceof Error && cause.message.includes("PRO_REQUIRED") ? "Hosting rooms requires Pomoder Pro." : "The room could not be created.")
            } finally { setCreating(false) }
          }}
        >
          <label className="host-room-name">Room name<input required minLength={2} maxLength={80} value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="Morning deep work" /></label>
          <label className="host-room-visibility">Visibility
            <Select value={visibility} onValueChange={(value) => setVisibility(value as "public" | "unlisted")}>
              <SelectTrigger aria-label="Visibility"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public — listed for everyone</SelectItem>
                <SelectItem value="unlisted">Unlisted — invite link only</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label>Focus minutes<input type="number" min={1} max={90} value={focusMinutes} onChange={(event) => setFocusMinutes(event.target.valueAsNumber)} /></label>
          <label>Short break<input type="number" min={1} max={90} value={shortBreakMinutes} onChange={(event) => setShortBreakMinutes(event.target.valueAsNumber)} /></label>
          <label>Long break<input type="number" min={1} max={90} value={longBreakMinutes} onChange={(event) => setLongBreakMinutes(event.target.valueAsNumber)} /></label>
          <label className="host-room-check"><Checkbox checked={autoStart} onCheckedChange={(state) => setAutoStart(state === true)} />Auto-start the next focus after each break</label>
          {error ? <p className="host-room-error" role="alert">{error}</p> : null}
          <button className="reference-primary" disabled={creating || !validDurations}>{creating ? "Creating…" : "Create room"}</button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ActiveRoomPanel({ snapshot, reconnecting, onSnapshot, onLeft, onActionError }: {
  snapshot: RoomSnapshotClient
  reconnecting: boolean
  onSnapshot: (snapshot: RoomSnapshotClient, closedNotice?: string, forceClosedNotice?: boolean) => void
  onLeft: (message: string) => void
  onActionError: (message: string) => void
}) {
  const { room, you, members, messages } = snapshot
  const isHost = you.role === "host"
  const countdown = useRoomCountdown(room.phaseEndsAt)
  const [message, setMessage] = React.useState("")
  const [pending, setPending] = React.useState("")
  const [copied, setCopied] = React.useState(false)
  const [copyFailed, setCopyFailed] = React.useState(false)
  const [panelNotice, setPanelNotice] = React.useState("")
  const [reporting, setReporting] = React.useState<{ id: string; authorName: string } | null>(null)
  const [confirm, setConfirm] = React.useState<ConfirmRequest | null>(null)
  const [reactionPending, setReactionPending] = React.useState<ReadonlySet<string>>(() => new Set())
  const inviteUrl = `${window.location.origin}/rooms/${room.slug}`

  const runAction = async (action: RoomHostActionClient) => {
    onActionError("")
    setPending(action)
    try {
      onSnapshot(await applyRoomAction(room.slug, action), "You closed the room.", true)
    } catch (cause) {
      onActionError(cause instanceof Error && cause.message.includes("ROOM_HOST_REQUIRED") ? "Only the host can control the room." : "The room could not be updated.")
    } finally { setPending("") }
  }

  const leave = async () => {
    onActionError("")
    setPending("leave")
    try {
      const result = await leaveActiveRoom(room.slug)
      onLeft(result.closed ? "You closed the room." : "You left the room.")
    } catch { onActionError("Leaving the room failed. Try again.") } finally { setPending("") }
  }

  const copyInvite = async () => {
    setCopyFailed(false)
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2_000)
    } catch { setCopyFailed(true) }
  }

  const moderationErrorMessage = (cause: unknown, fallback: string) => {
    const text = cause instanceof Error ? cause.message : ""
    if (text.includes("RATE_LIMITED")) return "Too many moderation actions at once. Wait a moment and try again."
    if (text.includes("ROOM_HOST_REQUIRED")) return "Only the host can do that."
    return fallback
  }

  const performModeration = async (key: string, action: () => Promise<RoomSnapshotClient>, successNotice: string, failureNotice: string) => {
    onActionError("")
    setPanelNotice("")
    setPending(key)
    try {
      onSnapshot(await action())
      setPanelNotice(successNotice)
    } catch (cause) { onActionError(moderationErrorMessage(cause, failureNotice)) } finally { setPending("") }
  }

  // Refreshed reaction counts reach everyone through the SSE snapshot, so we
  // only guard against firing the same toggle twice while one is in flight.
  const toggleMessageReaction = async (messageId: string, emoji: string) => {
    const key = `${messageId}:${emoji}`
    if (reactionPending.has(key)) return
    onActionError("")
    setReactionPending((current) => new Set(current).add(key))
    try {
      await toggleReaction(room.slug, messageId, emoji)
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : ""
      onActionError(text.includes("RATE_LIMITED") ? "You’re reacting a little fast. Wait a moment and try again." : "Your reaction didn’t go through. Try again.")
    } finally {
      setReactionPending((current) => { const next = new Set(current); next.delete(key); return next })
    }
  }

  const requestClose = () => setConfirm({
    title: "Close this room?",
    description: "This ends the session for everyone in the room and cannot be undone.",
    confirmLabel: "Close room",
    onConfirm: () => void runAction("close"),
  })
  const runDeleteMessage = (entry: { id: string }) => setConfirm({
    title: "Delete message?",
    description: "The message disappears for everyone and members see that it was removed.",
    confirmLabel: "Delete message",
    onConfirm: () => void performModeration(`delete-message:${entry.id}`, () => deleteMessage(room.slug, entry.id), "The message was deleted.", "The message could not be deleted."),
  })
  const runRemoveMember = (member: { id: string; name: string }) => setConfirm({
    title: `Remove ${member.name}?`,
    description: "They leave this room immediately but can join again later.",
    confirmLabel: "Remove member",
    onConfirm: () => void performModeration(`remove-member:${member.id}`, () => removeMember(room.slug, member.id), `${member.name} was removed from the room.`, "The member could not be removed."),
  })
  const runBanMember = (member: { id: string; name: string }) => setConfirm({
    title: `Ban ${member.name}?`,
    description: "They are removed immediately and cannot rejoin this room.",
    confirmLabel: "Ban member",
    onConfirm: () => void performModeration(`ban-member:${member.id}`, () => banMember(room.slug, member.id), `${member.name} was banned from the room.`, "The member could not be banned."),
  })

  const detail = room.phase === "focus" ? `Session ${Math.min(room.cycleFocusCount + 1, 4)} of 4`
    : room.phase === "short" || room.phase === "long" ? (room.autoStart ? `Next: ${room.focusMinutes} min focus starts automatically` : `Next: the host starts the ${room.focusMinutes} min focus`)
    : "The host starts each focus session"
  const actionIcon = (action: string, icon: React.ReactNode) => pending === action ? <Loader2 className="player-spinner" aria-hidden="true" /> : icon

  return (
    <section className="active-room-card" aria-label={`Your room: ${room.name}`}>
      <header className="active-room-heading">
        <div>
          <p>Current room · {room.visibility === "unlisted" ? "Unlisted" : "Public"}</p>
          <h2>{room.name}</h2>
          <span><Users aria-hidden="true" />{members.length} {members.length === 1 ? "person" : "people"} in the room</span>
        </div>
        <div className="active-room-invite">
          <code>{inviteUrl}</code>
          <button className="outline-pill" onClick={() => void copyInvite()}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? "Copied" : "Copy invite link"}</button>
        </div>
      </header>
      {copyFailed ? <p className="room-notice" role="alert">Copying failed — select the link text above and copy it manually.</p> : null}
      {reconnecting ? <p className="room-notice" role="status">Live updates were interrupted. Reconnecting…</p> : null}
      {panelNotice ? <p className="room-notice" role="status">{panelNotice}</p> : null}
      <div className="active-room-status">
        <span className={`room-phase-chip phase-${room.phase}`}>{ROOM_PHASE_LABELS[room.phase] ?? room.phase}</span>
        <strong className="room-countdown" aria-label="Time remaining">{countdown ?? "--:--"}</strong>
        <small>{detail}</small>
        <div className="active-room-actions">
          {isHost ? (
            <>
              <button className="pill-button" disabled={pending !== "" || room.phase === "focus"} onClick={() => void runAction("start_focus")}>{actionIcon("start_focus", <Play aria-hidden="true" />)}Start focus</button>
              <button className="outline-pill" disabled={pending !== "" || room.phase !== "focus"} onClick={() => void runAction("start_break")}>{actionIcon("start_break", <Coffee aria-hidden="true" />)}Start break</button>
              <button className="outline-pill" disabled={pending !== ""} onClick={() => void runAction("next_phase")}>{actionIcon("next_phase", <SkipForward aria-hidden="true" />)}Next phase</button>
              <button className="outline-pill room-close-button" disabled={pending !== ""} onClick={requestClose}>{actionIcon("close", <X aria-hidden="true" />)}Close room</button>
            </>
          ) : (
            <button className="outline-pill" disabled={pending !== ""} onClick={() => void leave()}>{actionIcon("leave", <LogOut aria-hidden="true" />)}Leave room</button>
          )}
        </div>
      </div>
      <div className="active-room-columns">
        <div className="active-room-members">
          <h3>In the room</h3>
          <ul>
            {members.map((member) => (
              <li key={member.id}>
                <img src={`/pomoder/avatars-${ROOM_AVATARS[member.avatarIndex % ROOM_AVATARS.length]}.png`} alt="" />
                <span>{member.name}</span>
                {member.role === "host" ? <b>HOST</b> : null}
                {isHost && member.role !== "host" ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="member-menu-trigger" aria-label={`Moderate ${member.name}`} title={`Moderate ${member.name}`} disabled={pending !== ""}><MoreVertical aria-hidden="true" /></button>
                    </DropdownMenuTrigger>
                    {/* Portaled to <body>; inherits the active theme from <html>. */}
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => runRemoveMember(member)}>Remove from room</DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => runBanMember(member)}>Ban from room</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        <div className="active-room-chat">
          <div className="chat-list">
            {messages.map((entry) => entry.deleted ? (
              <div className="chat-message deleted" key={entry.id}>
                <div><span className="chat-tombstone">Message removed by the host</span></div>
              </div>
            ) : (
              <div className={`chat-message ${entry.mine ? "mine" : ""}`} key={entry.id}>
                <div>
                  <p>{entry.authorName}<time>{new Date(entry.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</time></p>
                  <span>{entry.body}</span>
                  {entry.reactions.length ? (
                    <div className="chat-reactions">
                      {entry.reactions.map((reaction) => (
                        <button
                          key={reaction.emoji}
                          type="button"
                          className={`chat-reaction ${reaction.mine ? "mine" : ""}`}
                          aria-pressed={reaction.mine}
                          aria-label={`${roomReactionLabel(reaction.emoji)}, ${reaction.count} ${reaction.count === 1 ? "reaction" : "reactions"}${reaction.mine ? ", including you. Tap to remove your reaction" : ". Tap to react"}`}
                          disabled={reactionPending.has(`${entry.id}:${reaction.emoji}`)}
                          onClick={() => void toggleMessageReaction(entry.id, reaction.emoji)}
                        >
                          <span aria-hidden="true">{reaction.emoji}</span>
                          <b>{reaction.count}</b>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <span className="chat-message-actions">
                  <ReactionPicker
                    messageId={entry.id}
                    activeEmojis={new Set(entry.reactions.filter((reaction) => reaction.mine).map((reaction) => reaction.emoji))}
                    reactionPending={reactionPending}
                    disabled={pending !== ""}
                    onToggle={(emoji) => void toggleMessageReaction(entry.id, emoji)}
                  />
                  {!entry.mine ? <button type="button" title="Report message" aria-label={`Report message from ${entry.authorName}`} disabled={pending !== ""} onClick={() => setReporting({ id: entry.id, authorName: entry.authorName })}><Flag aria-hidden="true" /></button> : null}
                  {isHost ? <button type="button" title="Delete message" aria-label={`Delete message from ${entry.authorName}`} disabled={pending !== ""} onClick={() => runDeleteMessage(entry)}><Trash2 aria-hidden="true" /></button> : null}
                </span>
              </div>
            ))}
            {!messages.length ? <span className="chat-empty">Say hi — messages appear for everyone in the room.</span> : null}
          </div>
          <form className="chat-form" onSubmit={async (event) => { event.preventDefault(); const body = message.trim(); if (!body) return; setMessage(""); try { await sendRoomMessage(room.slug, body) } catch { onActionError("The message could not be sent."); setMessage(body) } }}>
            <input value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} placeholder="Send encouragement…" aria-label="Room message" />
            <button aria-label="Send message" disabled={!message.trim()}>Send</button>
          </form>
        </div>
      </div>
      <ReportMessageDialog
        key={reporting?.id ?? "closed"}
        slug={room.slug}
        message={reporting}
        onClose={() => setReporting(null)}
        onDone={(notice) => { setReporting(null); setPanelNotice(notice) }}
      />
      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
    </section>
  )
}

// The fixed emoji palette, revealed on demand from a single "add reaction"
// button so the chat stays calm by default. Selecting an emoji toggles it and
// closes the palette; a checked emoji is one you have already reacted with.
function ReactionPicker({ messageId, activeEmojis, reactionPending, onToggle, disabled }: {
  messageId: string
  activeEmojis: ReadonlySet<string>
  reactionPending: ReadonlySet<string>
  onToggle: (emoji: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" title="Add reaction" aria-label="Add reaction" disabled={disabled}><SmilePlus aria-hidden="true" /></button>
      </PopoverTrigger>
      {/* Portaled to <body>; inherits the active theme from <html>. */}
      <PopoverContent align="end" sideOffset={6} className="reaction-picker w-auto min-w-0 flex-row gap-1 p-1.5" role="group" aria-label="React with an emoji">
        {ROOM_REACTION_EMOJIS.map((emoji) => {
          const active = activeEmojis.has(emoji)
          return (
            <button
              key={emoji}
              type="button"
              className={`reaction-option ${active ? "active" : ""}`}
              aria-pressed={active}
              aria-label={`React with ${roomReactionLabel(emoji)}`}
              disabled={reactionPending.has(`${messageId}:${emoji}`)}
              onClick={() => { onToggle(emoji); setOpen(false) }}
            >
              <span aria-hidden="true">{emoji}</span>
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

function ReportMessageDialog({ slug, message, onClose, onDone }: { slug: string; message: { id: string; authorName: string } | null; onClose: () => void; onDone: (notice: string) => void }) {
  const [reason, setReason] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState("")

  return (
    <Dialog open={Boolean(message)} onOpenChange={(next) => { if (!next && !sending) onClose() }}>
      {/* Portaled to <body>; inherits the active theme from <html>. */}
      <DialogContent className="host-room-dialog report-dialog">
        <DialogTitle className="host-room-dialog-title">Report message</DialogTitle>
        <DialogDescription className="host-room-dialog-sub">Tell us what is wrong with {message?.authorName}’s message. Reports go to moderators only — other members never see them.</DialogDescription>
        <form
          className="report-form"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!message) return
            setError("")
            setSending(true)
            try {
              const { reported } = await reportMessage(slug, message.id, reason.trim())
              onDone(reported ? "Report sent. A moderator will review it." : "You already reported this message.")
            } catch (cause) {
              const text = cause instanceof Error ? cause.message : ""
              setError(text.includes("RATE_LIMITED") ? "You have sent too many reports recently. Try again later." : "The report could not be sent. Try again.")
            } finally { setSending(false) }
          }}
        >
          <label>Reason<textarea required minLength={3} maxLength={300} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Harassment, spam, hateful content…" /></label>
          {error ? <p className="host-room-error" role="alert">{error}</p> : null}
          <div className="report-form-actions">
            <button type="button" className="outline-pill" disabled={sending} onClick={onClose}>Cancel</button>
            <button className="pill-button" disabled={sending || reason.trim().length < 3}>{sending ? "Sending…" : "Send report"}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function RoomInvitePage() {
  const { user } = useRouteContext({ from: "__root__" })
  const { slug } = useParams({ from: "/_pomoder/rooms_/$slug" })
  const navigate = useNavigate()
  const [lookup, setLookup] = React.useState<Awaited<ReturnType<typeof lookupRoom>> | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [joining, setJoining] = React.useState(false)
  const [error, setError] = React.useState("")

  const refresh = React.useCallback(() => {
    setFailed(false)
    if (slug.length < 12 || slug.length > 80) { setLookup({ status: "not_found" }); return }
    lookupRoom(slug).then(setLookup).catch(() => setFailed(true))
  }, [slug])
  React.useEffect(() => { refresh() }, [refresh])

  const join = async () => {
    setJoining(true)
    setError("")
    try {
      await joinRoom(slug)
      void navigate({ to: "/rooms" })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : ""
      setError(message.includes("ROOM_LOCKED") ? "The room just started a focus session. Try again during the break." : message.includes("ROOM_CLOSED") ? "This room has ended." : message.includes("ROOM_BANNED") ? "You can't join this room." : "Joining failed. Try again.")
      refresh()
      setJoining(false)
    }
  }

  return (
    <div className="reference-view room-invite-view">
      <section className="room-invite-card" aria-label="Room invite">
        {failed ? (
          <><h2>Something went wrong</h2><p>The invite could not be checked.</p><button className="pill-button" onClick={refresh}>Try again</button></>
        ) : !lookup ? (
          <p role="status">Checking this invite…</p>
        ) : lookup.status === "not_found" ? (
          <><h2>Invite not found</h2><p>This invite link isn’t valid. Check that it was copied completely.</p><Link className="outline-pill" to="/rooms">Browse rooms</Link></>
        ) : lookup.status === "closed" ? (
          <><h2>{lookup.name}</h2><p>This room has ended.</p><Link className="outline-pill" to="/rooms">Browse rooms</Link></>
        ) : lookup.status === "banned" ? (
          <><h2>{lookup.name}</h2><p>You can’t join this room.</p><Link className="outline-pill" to="/rooms">Browse rooms</Link></>
        ) : lookup.status === "member" ? (
          <><h2>{lookup.name}</h2><p>You’re already in this room.</p><Link className="pill-button" to="/rooms">Go to your room</Link></>
        ) : lookup.status === "locked" ? (
          <><h2>{lookup.name}</h2><p><LockKeyhole aria-hidden="true" />{lookup.memberCount} focusing right now — joins unlock at the next break.</p>{error ? <p role="alert">{error}</p> : null}<button className="pill-button" onClick={refresh}>Check again</button><Link className="outline-pill" to="/rooms">Browse rooms</Link></>
        ) : (
          <>
            <p className="room-invite-kicker">You’re invited</p>
            <h2>{lookup.name}</h2>
            <p><Users aria-hidden="true" />{lookup.memberCount} in the room · {lookup.focusMinutes} min focus sessions</p>
            {error ? <p role="alert">{error}</p> : null}
            {user
              ? <button className="pill-button" disabled={joining} onClick={() => void join()}>{joining ? "Joining…" : "Join room"}</button>
              : <><p>Sign in to join, then open this invite again.</p><Link className="pill-button" to="/login">Sign in to join</Link><Link className="outline-pill" to="/register">Create free account</Link></>}
          </>
        )}
      </section>
    </div>
  )
}

type RoomCard = { id: string; slug: string; name: string; status: string; detail: string; memberCount: number; avatars: string[]; vibe: number; demo?: boolean }

const demoRooms: RoomCard[] = [
  { id: "demo-deep-work", slug: "demo", name: "Deep Work Club", status: "break · 3:12 left", detail: "Next: 25 min focus", memberCount: 5, avatars: ["maya", "tomas", "ana"], vibe: 0, demo: true },
  { id: "demo-thesis", slug: "demo", name: "Thesis Grind", status: "waiting to start", detail: "Starts when host begins", memberCount: 2, avatars: ["devon", "ana"], vibe: 1, demo: true },
  { id: "demo-morning", slug: "demo", name: "Morning Sprint", status: "14:05 left", detail: "Session 3 of 4", memberCount: 7, avatars: ["tomas", "devon", "maya"], vibe: 2, demo: true },
  { id: "demo-coffee", slug: "demo", name: "Code & Coffee", status: "07:41 left", detail: "Session 1 of 4", memberCount: 3, avatars: ["ana", "maya"], vibe: 3, demo: true },
]

function roomCard({ room, memberCount }: Awaited<ReturnType<typeof listRooms>>[number], index: number): RoomCard {
  const end = room.phaseEndsAt ? new Date(room.phaseEndsAt).getTime() : 0
  const remaining = Math.max(0, Math.ceil((end - Date.now()) / 60_000))
  return { id: room.id, slug: room.slug, name: room.name, status: room.phase === "waiting" ? "waiting to start" : `${remaining} min left`, detail: room.phase === "focus" ? `Session ${Math.min(room.cycleFocusCount + 1, 4)} of 4` : `Next: ${room.focusMinutes} min focus`, memberCount, avatars: ["maya", "tomas", "ana"].slice(0, Math.min(3, Math.max(1, memberCount))), vibe: index % 4 }
}

function RoomGroup({ title, subtitle, rooms, open, onJoin, onHost }: { title: string; subtitle: string; rooms: RoomCard[]; open: boolean; onJoin: (slug: string, demo?: boolean) => Promise<void>; onHost?: () => void }) {
  return (
    <section className="reference-room-group">
      <div className="reference-group-heading"><h2>{title}</h2><span>{subtitle}</span>{onHost ? <button onClick={onHost}><Plus aria-hidden="true" /> Host a room</button> : null}</div>
      <div className="reference-room-grid">
        {rooms.map((room) => (
          <article className={`reference-room-card ${open ? "" : "locked"}`} key={room.id}>
            <div className={`room-vibe vibe-${room.vibe}`}><LiveVibe /></div>
            <div className="reference-room-title"><i /><strong>{room.name}</strong><time>{room.status}</time></div>
            <div className="reference-room-members"><div>{room.avatars.map((avatar, index) => <img key={`${avatar}-${index}`} src={`/pomoder/avatars-${avatar}.png`} alt="" />)}</div><span>{room.memberCount} focusing</span></div>
            <div className="reference-room-action"><span>{room.detail}</span>{open ? <button onClick={() => void onJoin(room.slug, room.demo)}>Join</button> : <button disabled><LockKeyhole aria-hidden="true" /> Locked</button>}</div>
          </article>
        ))}
        {!rooms.length ? <p className="reference-empty">No rooms here yet.</p> : null}
      </div>
    </section>
  )
}

function LiveVibe() {
  return <span className="live-vibe"><i><b /><b /><b /></i><span>LIVE VIBE</span></span>
}

export function PricingPage() {
  const { user } = useRouteContext({ from: "__root__" })
  const [loading, setLoading] = React.useState("")
  const [error, setError] = React.useState("")
  const plans = [
    { name: "Free", price: "$0", note: "forever", extra: "", features: ["Solo pomodoro timer", "Tasks & daily streaks", "Join 1 room at a time"], action: "Start free", featured: false, interval: null },
    { name: "Monthly", price: "$9", note: "/ month", extra: "", features: ["Everything in Free", "Unlimited rooms & hosting", "Weekly leaderboards", "Custom themes & sounds"], action: "Go monthly", featured: false, interval: "monthly" },
    { name: "Yearly", price: "$78", note: "/ year", extra: "$6.50 / month, billed once", features: ["Everything in Monthly", "2 months free", "Yearly focus report"], action: "Go yearly", featured: true, interval: "yearly" },
  ] as const

  return (
    <div className="reference-view pricing-reference-view"><div className="pricing-reference-inner">
      <header><h2>Simple pricing</h2><p>Focus alone for free. Go premium to focus together.</p></header>
      {error ? <p role="alert">{error}</p> : null}
      <div className="reference-pricing-grid">
        {plans.map((plan) => (
          <article className={`reference-price-card ${plan.featured ? "featured" : ""}`} key={plan.name}>
            {plan.featured ? <b>Save 28%</b> : null}
            <div><p>{plan.name}</p><h3>{plan.price}<span>{plan.note}</span></h3>{plan.extra ? <small>{plan.extra}</small> : null}</div>
            <ul>{plan.features.map((feature) => <li key={feature}><Check aria-hidden="true" />{feature}</li>)}</ul>
            <button disabled={loading === plan.name} onClick={async () => { if (!plan.interval) { window.location.assign(user ? "/" : "/register"); return }; if (!user) { window.location.assign("/register"); return }; setLoading(plan.name); setError(""); try { const checkout = await createCheckout(plan.interval); window.location.assign(checkout.url) } catch { setError("Checkout is currently unavailable."); setLoading("") } }}>{loading === plan.name ? "Opening checkout…" : plan.action}</button>
          </article>
        ))}
      </div>
    </div></div>
  )
}

export function LeaderboardPage() {
  const { user } = useRouteContext({ from: "__root__" })
  const pomodoro = usePomodoro(false)
  const [leaders, setLeaders] = React.useState<Awaited<ReturnType<typeof loadLeaderboard>>>([])
  const [stats, setStats] = React.useState<Awaited<ReturnType<typeof loadProductivity>> | null>(null)
  const [statsError, setStatsError] = React.useState("")
  React.useEffect(() => { void loadLeaderboard().then(setLeaders) }, [])
  React.useEffect(() => { if (user) void loadProductivity().then(setStats).catch(() => setStatsError("Your focus stats could not be loaded. Reload to try again.")) }, [user])
  const week = [...(stats?.recentStats || [])].slice(0, 7).reverse()
  const focusSeconds = week.reduce((total, day) => total + day.focusSeconds, 0)
  const sessions = week.reduce((total, day) => total + day.focusSessions, 0)
  const completed = week.reduce((total, day) => total + day.tasksCompleted, 0)
  const hours = Math.floor(focusSeconds / 3_600)
  const minutes = Math.floor((focusSeconds % 3_600) / 60)
  const chartValues = stats ? [0,1,2,3,4,5,6].map((index) => week[index]?.focusSessions || 0) : user ? [0, 0, 0, 0, 0, 0, 0] : [6, 8, 4, 9, 7, 3, 5]
  const chartDays = stats ? [0,1,2,3,4,5,6].map((index) => week[index] ? new Date(`${week[index].localDate}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" }) : "·") : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  const chartMax = Math.max(1, ...chartValues)
  const leaderRows = leaders.length ? leaders.map((leader, index) => ({ id: leader.id, name: leader.name, focusSeconds: leader.focusSeconds, sessions: leader.focusSessions, avatar: ["tomas", "maya", "ana", "devon"][index % 4], you: leader.id === user?.id })) : [
    { id: "l1", name: "Kenji Watanabe", focusSeconds: 31 * 3600 + 10 * 60, sessions: 74, avatar: "tomas", you: false },
    { id: "l2", name: "Sofia Marino", focusSeconds: 28 * 3600 + 45 * 60, sessions: 69, avatar: "maya", you: false },
    { id: "l3", name: "Amara Okafor", focusSeconds: 25 * 3600 + 20 * 60, sessions: 61, avatar: "ana", you: false },
    { id: "l4", name: "Lucas Fenn", focusSeconds: 22 * 3600 + 5 * 60, sessions: 53, avatar: "devon", you: false },
    { id: "l5", name: "You", focusSeconds: 18 * 3600 + 20 * 60, sessions: 42, avatar: "you", you: true },
    { id: "l6", name: "Priya Anand", focusSeconds: 16 * 3600 + 40 * 60, sessions: 38, avatar: "ana", you: false },
  ]
  const statCards = stats ? [
    ["Focus today", `${Math.floor((stats.recentStats.find((day) => day.localDate === stats.today)?.focusSeconds || 0) / 3600)}h ${Math.floor(((stats.recentStats.find((day) => day.localDate === stats.today)?.focusSeconds || 0) % 3600) / 60)}m`, `${stats.recentStats.find((day) => day.localDate === stats.today)?.focusSessions || 0} sessions`],
    ["This week", `${hours}h ${minutes}m`, `${sessions} sessions`], ["Current streak", `${stats.summary.currentStreak} ${stats.summary.currentStreak === 1 ? "day" : "days"}`, `Best: ${stats.summary.bestStreak} ${stats.summary.bestStreak === 1 ? "day" : "days"}`], ["Tasks done", String(completed), "this week"],
  ] : user ? [["Focus today", statsError ? "Unavailable" : "", statsError ? "Reload to try again" : ""], ["This week", statsError ? "Unavailable" : "", statsError ? "Reload to try again" : ""], ["Current streak", statsError ? "Unavailable" : "", statsError ? "Reload to try again" : ""], ["Tasks done", statsError ? "Unavailable" : "", statsError ? "Reload to try again" : ""]] : [["Focus today", `${pomodoro.todayFocusSessions} ${pomodoro.todayFocusSessions === 1 ? "session" : "sessions"}`, `${pomodoro.todayFocusSessions} of ${pomodoro.dailyGoalSessions} goal`], ["This week", "Not synced", "Sign in for history"], ["Current streak", "Not synced", "Sign in for history"], ["Tasks done", String(pomodoro.tasks.filter((task) => task.completed).length), "today"]]
  return (
    <div className="reference-view leaderboard-reference-view"><div className="leaderboard-reference-inner">
      <header className="reference-page-heading"><h2>Leaderboard</h2><p>Your focus this week, and how you stack up.</p></header>
      {statsError ? <p role="alert">{statsError}</p> : null}
      <div className="reference-kicker">Your stats</div>
      <section className="reference-stat-grid">{statCards.map(([label, value, sub]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{sub}</small></article>)}</section>
      <section className="reference-week-chart"><header><h3>Sessions this week</h3><span>{chartValues.reduce((sum, value) => sum + value, 0)} total</span></header><div className="reference-bars">{chartValues.map((value, index) => <div key={chartDays[index]}><span>{value}</span><i className={index === 3 ? "today" : ""} style={{ height: `${Math.round(value / chartMax * 130) + 6}px` }} /><small>{chartDays[index]}</small></div>)}</div></section>
      <section className="reference-ranking"><header><span>Global ranking</span><small>this week</small></header><div>{leaderRows.map((leader, index) => <article className={leader.you ? "you" : ""} key={leader.id}><strong>{index + 1}</strong><img src={`/pomoder/avatars-${leader.avatar}.png`} alt="" /><b>{leader.name}</b><span>{Math.floor(leader.focusSeconds / 3600)}h {String(Math.floor((leader.focusSeconds % 3600) / 60)).padStart(2, "0")}m <small>{leader.sessions} sessions</small></span></article>)}</div></section>
    </div></div>
  )
}

export function TasksPage() {
  const { user } = useRouteContext({ from: "__root__" })
  const pomodoro = usePomodoro(Boolean(user))
  const [title, setTitle] = React.useState("")
  const [archive, setArchive] = React.useState<Awaited<ReturnType<typeof loadProductivity>>["archivedTasks"]>([])
  React.useEffect(() => { if (user) void loadProductivity().then((data) => setArchive(data.archivedTasks)) }, [user])
  const guestArchive = [
    { id: "a1", title: "Finish thesis chapter 3", pomodoroCount: 6, status: "completed", plannedDate: "Yesterday" },
    { id: "a2", title: "Email the design feedback", pomodoroCount: 2, status: "completed", plannedDate: "Yesterday" },
    { id: "a3", title: "Refactor auth middleware", pomodoroCount: 3, status: "carried", plannedDate: "Yesterday" },
    { id: "a4", title: "Read chapter 7 notes", pomodoroCount: 4, status: "completed", plannedDate: "Mon, Jul 6" },
    { id: "a5", title: "Sketch onboarding flow", pomodoroCount: 1, status: "abandoned", plannedDate: "Mon, Jul 6" },
    { id: "a6", title: "Weekly planning session", pomodoroCount: 2, status: "completed", plannedDate: "Sun, Jul 5" },
  ]
  const archiveItems = user ? archive.map((task) => ({ ...task, plannedDate: new Date(`${task.plannedDate}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) })) : guestArchive
  const archiveGroups = Array.from(archiveItems.reduce((groups, task) => {
    groups.set(task.plannedDate, [...(groups.get(task.plannedDate) || []), task])
    return groups
  }, new Map<string, typeof archiveItems>()))
  const completed = pomodoro.tasks.filter((task) => task.completed).length
  return (
    <div className="reference-view tasks-reference-view"><div className="tasks-reference-inner">
      <header className="reference-page-heading"><h2>Tasks</h2><p>What you’re focusing on today.</p></header>
      {pomodoro.syncError ? <p role="alert">{pomodoro.syncError}</p> : null}
      <section className="today-tasks-card"><header><h3>Today</h3><span>{completed} / {pomodoro.tasks.length} done</span></header><TodayTaskList pomodoro={pomodoro} /><form onSubmit={(event) => { event.preventDefault(); pomodoro.addTask(title); setTitle("") }}><Plus aria-hidden="true" /><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="Add a task, press Enter…" aria-label="New task" /></form></section>
      <section className="archive-section"><header><h2>Archive</h2><span>{archiveItems.length} past tasks</span></header>{archiveGroups.map(([date, tasks]) => <div className="archive-group" key={date}><h3>{date}</h3><div>{tasks?.map((task) => <article key={task.id}><span>{task.title}</span><small>{task.pomodoroCount} {task.pomodoroCount === 1 ? "pomo" : "pomos"}</small><b className={task.status}>{task.status === "carried" ? "Carried over" : task.status === "completed" ? "Completed" : "Abandoned"}</b></article>)}</div></div>)}</section>
    </div>
    </div>
  )
}

const DEFAULT_ALERT_HELP = "Plays a chime and shows a browser notification when a timer finishes."

export function SettingsPage() {
  const { user } = useRouteContext({ from: "__root__" })
  const pomodoro = usePomodoro(Boolean(user))
  const player = useSoundPlayer()
  const [alertHelp, setAlertHelp] = React.useState(DEFAULT_ALERT_HELP)
  const [focus, setFocus] = React.useState(25)
  const [short, setShort] = React.useState(5)
  const [long, setLong] = React.useState(15)
  const [dailyGoal, setDailyGoal] = React.useState(4)
  const [name, setName] = React.useState(user?.name || "")
  const [displayName, setDisplayName] = React.useState(user?.publicDisplayName || "")
  const [timezone, setTimezone] = React.useState(user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC")
  const [leaderboard, setLeaderboard] = React.useState(user?.leaderboardOptIn || false)
  const [deletePassword, setDeletePassword] = React.useState("")
  const [notice, setNotice] = React.useState("")
  const validTimerSettings = [focus, short, long].every((value) => Number.isInteger(value) && value >= 1 && value <= 90) && Number.isInteger(dailyGoal) && dailyGoal >= 1 && dailyGoal <= 20

  React.useEffect(() => {
    setFocus(pomodoro.durations.focus)
    setShort(pomodoro.durations.short)
    setLong(pomodoro.durations.long)
    setDailyGoal(pomodoro.dailyGoalSessions)
  }, [pomodoro.dailyGoalSessions, pomodoro.durations.focus, pomodoro.durations.long, pomodoro.durations.short])

  return (
    <div className="settings-layout">
      <section className="surface-card settings-card"><p>Appearance</p><h2>Theme</h2><div className="theme-setting-row"><div className="theme-setting-copy"><strong>Light or dark</strong><span>Pick the look that feels calm to you. Your choice is saved{user ? " to your account and synced across devices" : " on this device"}.</span></div><ThemeToggle showLabel /></div></section>
      <section className="surface-card settings-card"><p>Timer</p><h2>Focus rhythm</h2><FocusRhythmPresets pomodoro={pomodoro} authenticated={Boolean(user)} /><label>Focus minutes<input type="number" min="1" max="90" value={focus} onChange={(event) => setFocus(event.target.valueAsNumber)} /></label><label>Short break<input type="number" min="1" max="90" value={short} onChange={(event) => setShort(event.target.valueAsNumber)} /></label><label>Long break<input type="number" min="1" max="90" value={long} onChange={(event) => setLong(event.target.valueAsNumber)} /></label><label>Daily session goal<input type="number" min="1" max="20" value={dailyGoal} aria-describedby="daily-goal-help" onChange={(event) => setDailyGoal(event.target.valueAsNumber)} /></label><span id="daily-goal-help">Only completed focus sessions count toward your daily goal and streak.</span><label>Auto-start next<Checkbox checked={pomodoro.autoStart} onCheckedChange={(state) => pomodoro.setAutoStart(state === true)} /></label><label>Completion alerts<Checkbox checked={player.state.completionAlerts} aria-describedby="completion-alert-help" onCheckedChange={(state) => { const enabled = state === true; player.setCompletionAlerts(enabled); if (!enabled) { setAlertHelp(DEFAULT_ALERT_HELP); return }; void enableCompletionAlerts().then((permission) => setAlertHelp(permission === "granted" ? "You'll hear a chime and get a notification when a timer finishes." : permission === "denied" ? "Notifications are blocked in this browser, so you'll only hear the chime." : "You'll hear a chime when a timer finishes.")) }} /></label><span id="completion-alert-help">{alertHelp}</span><button className="pill-button" disabled={!validTimerSettings} onClick={async () => { setNotice(""); try { await pomodoro.setDurations({ focus, short, long }, dailyGoal); setNotice(user ? "Focus rhythm synced." : "Focus rhythm saved locally.") } catch { setNotice("Focus rhythm could not be saved.") } }}>Save focus rhythm</button></section>
      {user ? <section className="surface-card settings-card"><p>Account</p><h2>Your profile</h2><label>Name<input maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label><label>Public display name<input maxLength={50} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label>Timezone<input maxLength={80} value={timezone} onChange={(event) => setTimezone(event.target.value)} /></label><label>Leaderboard<Checkbox checked={leaderboard} onCheckedChange={(state) => setLeaderboard(state === true)} /></label><button className="pill-button" onClick={async () => { try { await updateProfile({ name, publicDisplayName: displayName.trim() || null, timezone, leaderboardOptIn: leaderboard }); setNotice("Profile updated.") } catch { setNotice("Profile could not be updated.") } }}>Save profile</button><button className="outline-pill" onClick={async () => { try { const portal = await createBillingPortal(); window.location.assign(portal.url) } catch { setNotice("No active subscription was found.") } }}>Manage billing</button><label>Confirm password to delete account<input type="password" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} /></label><button className="outline-pill" disabled={!deletePassword} onClick={async () => { if (!window.confirm("Delete your Pomoder account and all of its data? This cannot be undone.")) return; try { await deleteAccount(deletePassword); window.location.assign("/") } catch { setNotice("The account was not deleted. Check your password.") } }}>Delete account</button></section> : <section className="surface-card settings-card"><p>Account</p><h2>Sync across devices</h2><span>Sign in to save focus history, join rooms, upload custom media and appear on the leaderboard.</span><Link to="/register" className="pill-button">Create free account</Link></section>}
      {notice ? <p role="status">{notice}</p> : null}
    </div>
  )
}
