import * as React from "react"

import {
  getCrmErrorMessage,
  loadReplyDrafts,
  saveReplyDraftToServer,
  sendReply,
  startConversation,
} from "@/lib/api/crm/inbox"
import {
  applyReplyDraft,
  noReplyDrafts,
  replyDraftFor,
  type ReplyDraftUpdate,
  type ReplyDrafts,
} from "@/lib/crm/reply-drafts"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * What the CRM holds about replies while it is open, above any one section:
 * the half-written words, the files picked for them, and the replies waiting
 * out their ten seconds before they go (CRM task 38, parts 1 and 5).
 *
 * **Above the sections, not inside one.** The Inbox and the Leads section
 * both draw a conversation's reply box, and each is thrown away when the
 * other is picked. A reply waiting to send must still send when its section
 * goes, and a draft typed on one must still be there on the other, so they
 * live here, in the page, for as long as the page is open.
 *
 * **The words are kept on the server too**, each admin's own, so a reload or
 * a shut tab loses nothing. They are saved a second after typing stops and
 * at once when the tab is hidden. The files are not kept past a reload.
 *
 * **A reply waits ten seconds before it goes**, with Undo beside it in the
 * conversation. Its words stay saved on the server until the send has really
 * gone, and the server forgets them then, so a tab shut during the wait keeps
 * them as a draft rather than losing them or sending them.
 */

/** How long a reply waits before it goes, so a slip can be taken back. */
export const UNDO_SEND_MS = 10_000

/** How long typing has to pause before the words are saved. */
const SAVE_AFTER_MS = 1_000

/** A file going with a reply: from the media library, or uploaded from the computer. */
export type ReplyFile =
  | { kind: "media"; url: string; name: string }
  | { kind: "upload"; key: string; name: string }

/** A reply that was sent and is waiting out its ten seconds. */
export type PendingReply = {
  threadId: string
  body: string
  files: ReplyFile[]
  /** When it goes, in milliseconds since 1970. */
  sendAt: number
  /** True once it has been handed to the server and can no longer be undone. */
  sending: boolean
}

/** A New email waiting out its ten seconds. */
export type PendingNewEmail = {
  input: Parameters<typeof startConversation>[0]
  sendAt: number
  sending: boolean
}

export type ReplyStoreState = {
  drafts: ReplyDrafts
  files: Readonly<Record<string, ReplyFile[]>>
  pending: Readonly<Record<string, PendingReply>>
  newEmail: PendingNewEmail | null
}

const EMPTY: ReplyStoreState = { drafts: noReplyDrafts, files: {}, pending: {}, newEmail: null }

let state: ReplyStoreState = EMPTY
const listeners = new Set<() => void>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
let draftsAsked = false

function change(next: ReplyStoreState) {
  state = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The store as it is now, outside React. */
export function readReplyStore(): ReplyStoreState {
  return state
}

/** The whole store, redrawing whoever reads it when anything in it changes. */
export function useReplyStore(): ReplyStoreState {
  React.useEffect(() => {
    loadSavedDrafts()
    watchTabHiding()
  }, [])
  return React.useSyncExternalStore(subscribe, () => state, () => EMPTY)
}

// ——— Sent events ———

type SentEvent = { kind: "reply"; threadId: string } | { kind: "new-email"; threadId: string }
const sentListeners = new Set<(event: SentEvent) => void>()

/**
 * Runs `onSent` whenever a reply or a New email this page held has really
 * gone, so the screen showing it can read the conversation and the list
 * again. Whichever section is showing then hears it, not the one that pressed
 * Send.
 */
export function useReplySent(onSent: (event: SentEvent) => void) {
  const latest = React.useRef(onSent)
  React.useEffect(() => {
    latest.current = onSent
  })
  React.useEffect(() => listenReplySent((event) => latest.current(event)), [])
}

/** The same, outside React: answers the function that stops listening. */
export function listenReplySent(listener: (event: SentEvent) => void) {
  sentListeners.add(listener)
  return () => {
    sentListeners.delete(listener)
  }
}

function announceSent(event: SentEvent) {
  for (const listener of sentListeners) listener(event)
}

// ——— Drafts ———

/**
 * Puts this admin's saved drafts into the boxes, once per page. A box already
 * typed in, or a reply waiting to send, keeps what it has: the saved copy is
 * older than either.
 */
function loadSavedDrafts() {
  if (draftsAsked) return
  draftsAsked = true
  loadReplyDrafts()
    .then((saved) => {
      let drafts = state.drafts
      for (const [threadId, body] of Object.entries(saved)) {
        if (replyDraftFor(drafts, threadId) || state.pending[threadId]) continue
        drafts = applyReplyDraft(drafts, threadId, body)
      }
      if (drafts !== state.drafts) change({ ...state, drafts })
    })
    // A draft that could not be read back is not worth an error over the
    // inbox: the box simply starts empty, as it did before drafts were kept.
    .catch(() => {
      draftsAsked = false
    })
}

/** What is in one conversation's box. */
export function replyDraftOf(store: ReplyStoreState, threadId: string | null) {
  return replyDraftFor(store.drafts, threadId)
}

/** The box changed: keep the words here at once, and on the server a second after typing stops. */
export function changeReplyDraft(threadId: string, update: ReplyDraftUpdate) {
  const drafts = applyReplyDraft(state.drafts, threadId, update)
  if (drafts === state.drafts) return
  change({ ...state, drafts })
  scheduleSave(threadId)
}

function scheduleSave(threadId: string) {
  const waiting = saveTimers.get(threadId)
  if (waiting) clearTimeout(waiting)
  saveTimers.set(
    threadId,
    setTimeout(() => saveNow(threadId), SAVE_AFTER_MS)
  )
}

function saveNow(threadId: string) {
  const waiting = saveTimers.get(threadId)
  if (waiting) clearTimeout(waiting)
  saveTimers.delete(threadId)
  const typed = replyDraftFor(state.drafts, threadId)
  const held = state.pending[threadId]
  // While a reply waits to send, the server keeps its words until it has
  // really gone, so whatever is typed meanwhile is kept after them, the way
  // Undo would put them back. An empty box is the box the Send emptied.
  if (held && !typed) return
  const body = held ? `${held.body}\n\n${typed}` : typed
  // A save that fails keeps the words on screen. Saying so on every pause in
  // typing would be noise over something that is retried at the next one.
  void saveReplyDraftToServer(threadId, body).catch(() => undefined)
}

let watchingTab = false

/** A tab being hidden is often a tab about to be shut, so waiting saves go at once. */
function watchTabHiding() {
  if (watchingTab || typeof document === "undefined") return
  watchingTab = true
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return
    for (const threadId of [...saveTimers.keys()]) saveNow(threadId)
  })
}

// ——— Files ———

export function replyFilesOf(store: ReplyStoreState, threadId: string | null): ReplyFile[] {
  return threadId ? (store.files[threadId] ?? []) : []
}

export function changeReplyFiles(threadId: string, update: (current: ReplyFile[]) => ReplyFile[]) {
  const next = update(state.files[threadId] ?? [])
  const files = { ...state.files }
  if (next.length) files[threadId] = next
  else delete files[threadId]
  change({ ...state, files })
}

// ——— Undo send ———

/**
 * Send pressed: the box empties, and the reply waits ten seconds with Undo
 * beside it before it goes. The words are saved on the server first, so a
 * tab shut during the wait keeps them.
 */
export function holdReply(threadId: string, body: string, files: ReplyFile[]) {
  if (state.pending[threadId]) return
  const waiting = saveTimers.get(threadId)
  if (waiting) clearTimeout(waiting)
  saveTimers.delete(threadId)
  void saveReplyDraftToServer(threadId, body).catch(() => undefined)

  const drafts = applyReplyDraft(state.drafts, threadId, "")
  const restFiles = { ...state.files }
  delete restFiles[threadId]
  change({
    ...state,
    drafts,
    files: restFiles,
    pending: {
      ...state.pending,
      [threadId]: { threadId, body, files, sendAt: Date.now() + UNDO_SEND_MS, sending: false },
    },
  })
  timers.set(
    threadId,
    setTimeout(() => void sendHeldReply(threadId), UNDO_SEND_MS)
  )
}

/** Undo: the reply does not go, and its words and files are back in the box. */
export function undoHeldReply(threadId: string) {
  const held = state.pending[threadId]
  if (!held || held.sending) return
  const timer = timers.get(threadId)
  if (timer) clearTimeout(timer)
  timers.delete(threadId)
  putBack(held)
}

/**
 * The reply's words and files back in its box, in front of anything typed
 * there since. The server already holds the words, from when Send was pressed.
 */
function putBack(held: PendingReply) {
  const pending = { ...state.pending }
  delete pending[held.threadId]
  const typedSince = replyDraftFor(state.drafts, held.threadId)
  const drafts = applyReplyDraft(
    state.drafts,
    held.threadId,
    typedSince ? `${held.body}\n\n${typedSince}` : held.body
  )
  const files = { ...state.files, [held.threadId]: [...held.files, ...(state.files[held.threadId] ?? [])] }
  if (files[held.threadId].length === 0) delete files[held.threadId]
  change({ ...state, pending, drafts, files })
  if (typedSince) scheduleSave(held.threadId)
}

async function sendHeldReply(threadId: string) {
  timers.delete(threadId)
  const held = state.pending[threadId]
  if (!held) return
  change({ ...state, pending: { ...state.pending, [threadId]: { ...held, sending: true } } })
  try {
    await sendReply(
      threadId,
      held.body,
      held.files.flatMap((file) => (file.kind === "media" ? [file.url] : [])),
      held.files.flatMap((file) => (file.kind === "upload" ? [{ key: file.key, name: file.name }] : []))
    )
    const pending = { ...state.pending }
    delete pending[threadId]
    change({ ...state, pending })
    // The server forgot the draft with the send. Anything typed during the
    // wait is the next draft, so it is kept again on its own.
    if (replyDraftFor(state.drafts, threadId)) scheduleSave(threadId)
    announceSent({ kind: "reply", threadId })
  } catch (error) {
    // Refused: the words and files go back in the box with the reason, the
    // same as a refused send always did.
    putBack(held)
    showErrorToast(getCrmErrorMessage(error))
  }
}

// ——— New email ———

/** New email's Send: the same ten seconds, with Undo in the dropdown. */
export function holdNewEmail(input: PendingNewEmail["input"]) {
  if (state.newEmail) return
  change({ ...state, newEmail: { input, sendAt: Date.now() + UNDO_SEND_MS, sending: false } })
  timers.set(
    NEW_EMAIL,
    setTimeout(() => void sendHeldNewEmail(), UNDO_SEND_MS)
  )
}

/**
 * Undo on New email: nothing goes. The dropdown kept what was typed, so it is
 * there to change and send again.
 */
export function undoHeldNewEmail() {
  const held = state.newEmail
  if (!held || held.sending) return
  const timer = timers.get(NEW_EMAIL)
  if (timer) clearTimeout(timer)
  timers.delete(NEW_EMAIL)
  change({ ...state, newEmail: null })
}

const NEW_EMAIL = "new-email"

async function sendHeldNewEmail() {
  timers.delete(NEW_EMAIL)
  const held = state.newEmail
  if (!held) return
  change({ ...state, newEmail: { ...held, sending: true } })
  try {
    const { threadId } = await startConversation(held.input)
    change({ ...state, newEmail: null })
    announceSent({ kind: "new-email", threadId })
  } catch (error) {
    // The dropdown still holds what was typed, so it can be sent again.
    change({ ...state, newEmail: null })
    showErrorToast(getCrmErrorMessage(error))
  }
}

/** Seconds left before a held send goes, for the countdown beside Undo. */
export function useSecondsLeft(sendAt: number | null): number {
  const [nowMs, setNowMs] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (sendAt === null) return
    const tick = setInterval(() => setNowMs(Date.now()), 250)
    return () => clearInterval(tick)
  }, [sendAt])
  return sendAt === null ? 0 : Math.max(0, Math.ceil((sendAt - nowMs) / 1000))
}
