import * as React from "react"
import { toast } from "sonner"

import { getCurrentRoom } from "@/lib/api/pomodoro/rooms"
import { productAuth, subscribeProductAuth } from "@/lib/pomodoro/auth-state"
import { enterHostedRoom, leaveHostedRoom } from "@/lib/pomodoro/room-media-store"
import { followRoomRunning, setRoomClockActive } from "@/lib/pomodoro/sound-engine"
import { pomodoroEngineState, toggleTimer } from "@/lib/pomodoro/use-pomodoro"

/**
 * The room you are in, kept live for the whole tab: its snapshot, the one
 * connection that keeps it current, and what happens when it ends. See
 * "The header follows your room" in `workspace/docs/rooms.md`.
 *
 * It lives here rather than in the room page because the header's timer pill
 * shows the room's clock on every page (rooms task 03). The room page, the
 * Rooms page and the header all read this one store, so a tab never holds two
 * connections to the same room.
 *
 * While a room is on, the room's clock is the one that drives the sound, and
 * your personal timer is held paused where it was (Tyler, 10 Oct 2026).
 */

export type RoomSnapshotClient = NonNullable<
  Awaited<ReturnType<typeof getCurrentRoom>>
>

type RoomClockState = {
  snapshot: RoomSnapshotClient | null
  /**
   * Asking the server which room you are in failed. While it has, nothing
   * that reads this store may draw "no room".
   */
  checkFailed: boolean
  /** The live connection dropped. The last known clock stays on screen. */
  reconnecting: boolean
}

const emptyState: RoomClockState = { snapshot: null, checkFailed: false, reconnecting: false }
const signedOut = { known: false, authenticated: false }

let state: RoomClockState = emptyState
const listeners = new Set<() => void>()
/** Pages that want to hear when the room ends, such as the Rooms list. */
const endedListeners = new Set<() => void>()
/** How many mounted readers want the room kept live. */
let readers = 0
let source: EventSource | null = null
let sourceSlug = ""
let checking: Promise<void> | null = null
// Whether this tab has seen the room's clock yet. The first snapshot only
// records it, so arriving mid-focus never starts the sound by itself.
let clockSeen = false
// The room whose ending the person's own action already explained, so a
// broadcast arriving afterwards does not explain it again in vaguer words.
let endExplained = ""
// The people in the room at the last snapshot, for the host's "joined" and
// "left" word. Null until a snapshot after the connection (re)opened.
let lastPeople: { slug: string; people: Map<string, string> } | null = null

/** "Brooke", "Brooke and Sam", "Brooke and 2 others". */
function peopleNamed(names: string[]) {
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names[0]} and ${names.length - 1} others`
}

/**
 * The host's pop-up when somebody joins or leaves their room, on any page
 * while this tab holds the room's live connection (Tyler, 11 Oct 2026: "Add
 * notifications when someone join and leave my room"). The bell gets every
 * join and leave as well. Each snapshot's people are compared with the last
 * one's. When the connection opens again after the tab was hidden, the first
 * snapshot only sets the starting point, so coming back is not a burst of
 * pop-ups for what the bell already holds.
 */
function tellComingsAndGoings(snapshot: RoomSnapshotClient) {
  const people = new Map(snapshot.members.filter((member) => !member.mine).map((member) => [member.id, member.name]))
  const before = lastPeople
  lastPeople = { slug: snapshot.room.slug, people }
  if (snapshot.you.role !== "host" || !before || before.slug !== snapshot.room.slug) return
  const joined = [...people].filter(([id]) => !before.people.has(id)).map(([, name]) => name)
  const left = [...before.people].filter(([id]) => !people.has(id)).map(([, name]) => name)
  if (joined.length) toast(`${peopleNamed(joined)} joined your room.`)
  if (left.length) toast(`${peopleNamed(left)} left your room.`)
}

function setState(next: Partial<RoomClockState>) {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

/**
 * Hands a room's snapshot to the store that decides the sound and background
 * on screen. Called for every snapshot, and straight after a join or a
 * create, so the page you land on already draws the room.
 */
function enterRoomFromSnapshot(snapshot: RoomSnapshotClient) {
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
    files: snapshot.room.files,
  })
}

/**
 * Holds your personal timer while a room is on: only one clock may touch the
 * sound. It is the timer's own pause, so the session is paused on your
 * account like any pause, never finished or abandoned, and comes back with
 * the same time left when you leave. Checked on every snapshot, because the
 * personal timer can arrive running from another device after the room did.
 */
function freezePersonalTimer() {
  if (pomodoroEngineState().timer.running) toggleTimer()
}

/** Says how a room you were in came to an end, once per room. */
function announceRoomEnd(slug: string, message: string, deliberate: boolean) {
  if (!deliberate && endExplained === slug) return
  if (deliberate) endExplained = slug
  // One toast per room: a broadcast that beat the person's own answer is
  // replaced by it rather than stacked under it.
  toast.success(message, { id: `room-ended:${slug}` })
}

/**
 * Back to your personal room and your personal timer, still paused.
 * `tellPages` is false when a page ended the room itself, because that page
 * already refreshes after its own action.
 */
function endRoom(tellPages = true) {
  setState({ snapshot: null, reconnecting: false })
  leaveHostedRoom()
  followRoomRunning(false)
  setRoomClockActive(false)
  clockSeen = false
  syncStream()
  if (tellPages) for (const listener of endedListeners) listener()
}

/**
 * A fresh snapshot, from the stream or from an action's own answer. The SSE
 * broadcast and an action's response race in either order, so only a
 * deliberate action (`forceClosedNotice`) may replace the room-ended toast.
 */
export function applyRoomSnapshot(
  snapshot: RoomSnapshotClient,
  closedNotice = "This room has ended.",
  forceClosedNotice = false
) {
  if (snapshot.room.phase === "closed") {
    announceRoomEnd(snapshot.room.slug, closedNotice, forceClosedNotice)
    endRoom()
    return
  }
  endExplained = ""
  enterRoomFromSnapshot(snapshot)
  // The room's clock takes the sound before the personal timer is paused,
  // so that pause cannot fade the room's sound out.
  setRoomClockActive(true)
  freezePersonalTimer()
  // The sound plays only while the room is in a focus; a break is quiet.
  followRoomRunning(snapshot.room.phase === "focus", !clockSeen)
  clockSeen = true
  tellComingsAndGoings(snapshot)
  setState({ snapshot, checkFailed: false })
  syncStream()
}

/** You left or closed it yourself, and `message` says which. */
export function leftRoom(slug: string, message: string) {
  announceRoomEnd(slug, message, true)
  endRoom(false)
}

/** Asks the server which room you are in. One question at a time. */
export function checkCurrentRoom() {
  if (!productAuth().authenticated) return Promise.resolve()
  checking ??= getCurrentRoom()
    .then(
      (snapshot) => {
        if (snapshot) applyRoomSnapshot(snapshot)
        // The room ended while nobody was looking. Back to your own pair.
        else if (state.snapshot) endRoom()
        else {
          leaveHostedRoom()
          setRoomClockActive(false)
          setState({ checkFailed: false })
        }
      },
      () => setState({ checkFailed: true })
    )
    .finally(() => {
      checking = null
    })
  return checking
}

function pageVisible() {
  return typeof document === "undefined" || document.visibilityState === "visible"
}

/**
 * Opens, moves or closes the one connection to the room. It is held only
 * while something on the page reads the room and the tab is on screen: the
 * server counts an open connection as somebody looking at the room and keeps
 * the bell quiet about what they can already see. Coming back reconnects, and
 * the first message is a full snapshot, so nothing on screen is stale.
 */
function syncStream() {
  if (typeof window === "undefined") return
  const wanted = readers > 0 && pageVisible() ? (state.snapshot?.room.slug ?? "") : ""
  if (wanted === sourceSlug) return
  source?.close()
  source = null
  sourceSlug = wanted
  // A new connection starts the comparison afresh: see `tellComingsAndGoings`.
  lastPeople = null
  if (!wanted) return
  const opened = new EventSource(`/api/pomodoro/rooms/${wanted}/events`)
  opened.addEventListener("snapshot", (event) => {
    if (state.reconnecting) setState({ reconnecting: false })
    applyRoomSnapshot(JSON.parse((event as MessageEvent<string>).data) as RoomSnapshotClient)
  })
  opened.addEventListener("room_gone", () => {
    // A deliberate leave or close already explained itself; this only speaks
    // when the membership ended from the other side.
    announceRoomEnd(wanted, "You are no longer in this room.", false)
    endRoom()
  })
  // The browser reconnects by itself. Until it does, the last clock stays.
  opened.onerror = () => {
    if (!state.reconnecting) setState({ reconnecting: true })
  }
  source = opened
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", syncStream)
  // Signing out forgets the room quietly: the next account starts from its own.
  subscribeProductAuth(() => {
    if (productAuth().authenticated || !state.snapshot) return
    setRoomClockActive(false)
    clockSeen = false
    setState(emptyState)
    syncStream()
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * The room you are in, kept live while this is mounted. `check` asks the
 * server which room that is, whenever it turns true; a page that must not
 * draw "no room" by mistake passes true. `onEnded` runs when the room closes
 * or you are removed, but not when this page ended it.
 */
export function useRoomClock({
  check = false,
  onEnded,
}: { check?: boolean; onEnded?: () => void } = {}) {
  // The engines' own record of who is signed in, not the loader's: a child's
  // effect runs before the layout's effect has recorded it, and asking then
  // would be refused as a guest and never asked again.
  const { authenticated } = React.useSyncExternalStore(
    subscribeProductAuth,
    productAuth,
    () => signedOut
  )
  React.useEffect(() => {
    if (check && authenticated) void checkCurrentRoom()
  }, [check, authenticated])
  const onEndedRef = React.useRef(onEnded)
  React.useEffect(() => {
    onEndedRef.current = onEnded
  }, [onEnded])
  React.useEffect(() => {
    const listener = () => onEndedRef.current?.()
    endedListeners.add(listener)
    readers += 1
    syncStream()
    return () => {
      endedListeners.delete(listener)
      readers -= 1
      syncStream()
    }
  }, [])
  return React.useSyncExternalStore(subscribe, () => state, () => emptyState)
}

