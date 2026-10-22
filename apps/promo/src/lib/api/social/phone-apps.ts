import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import { editorGet, editorPost } from "@/server/social/editor-guards"
import { actorFor, actorForInbox, guestProjectView } from "@/server/social/project-guests"
import { draftCaption } from "@/server/social/phone-apps/captions"
import {
  checkInboxNow,
  draftInboxReply,
  listInbox,
  sendInboxReply,
  skipInbox,
  type InboxRow,
} from "@/server/social/phone-apps/inbox"
import { readAppModuleView, type AppAccount, type AppModuleView } from "@/server/social/phone-apps/module"
import { cancelAppPosts, queueAppPost, type AppPostRow } from "@/server/social/phone-apps/posts"
import { queueProfileEdit, readProfileEdits, type ProfileEditView } from "@/server/social/phone-apps/profile"
import { PHONE_ONLY_NETWORKS, type PhoneAppNetwork } from "@/lib/social/networks"
import { ABOUT_MAX } from "@/lib/social/phone-apps"
import { readerWrittenRefusal } from "@/lib/social/refusal-words"

import { createErrorMessage } from "../error-message"

export type { AppAccount, AppModuleView, AppPostRow, InboxRow, ProfileEditView }

/**
 * Instagram and TikTok on a project's dashboard, the Messages dashboard, and
 * an account's profile (phone farm file 06). Admin only, like every Promo
 * endpoint. Drafting happens in the request, because an AI call takes
 * seconds and the person is watching the box; posting, answering and
 * changing a profile go on the queue, because they need the phone.
 */

/**
 * The refusals here are written for the reader and name the account, the
 * limit or the time, so they pass through as they are.
 */
const WRITTEN_HERE = [
  "Pick a photo or video",
  "cannot post that file",
  "is retired",
  "hit a ban screen",
  "is paused",
  "project is paused",
  "is on no phone",
  "is not on a phone any more",
  "has not been read signed in",
  "already on its way",
  "The caption is",
  "The caption has",
  "Say what the post is about",
  "less than a day ago",
  "not one of your uploaded images",
  "Change the name, the bio",
  "The name is",
  "The bio is",
  "The link",
  "Write the answer first",
  "The answer is",
  "answered or skipped already",
  "has already started on that post",
  "not there any more",
  "found it broken",
  "cannot answer here",
  "does not answer",
]

const lookup = createErrorMessage(
  {
    "key saved": "Add an AI provider key in Settings before asking for a draft.",
    AI_LIMIT_REACHED: "This month's AI allowance is used up.",
    "project does not exist": "That project is not there any more. Reload the page.",
  },
  "That did not work. Please try again."
)

export function getPhoneAppErrorMessage(error: unknown): string {
  const written = readerWrittenRefusal(error)
  if (written) return written
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  return WRITTEN_HERE.some((words) => message.includes(words)) ? message : lookup(error)
}

const network = z.enum(PHONE_ONLY_NETWORKS)
const id = z.string().min(1).max(64)

const moduleFn = createServerFn({ method: "GET" })
  .middleware([editorGet])
  .inputValidator(z.object({ projectId: id, network }))
  .handler(async ({ context, data }): Promise<AppModuleView> => {
    const actor = await actorFor(context.caller, data.projectId)
    const view = await readAppModuleView(actor.userId, data.projectId, data.network)
    return actor.guest ? await guestProjectView(view, data.projectId) : view
  })

/** A project's accounts, posts and comments on Instagram or TikTok. */
export function loadAppModule(projectId: string, picked: PhoneAppNetwork) {
  return moduleFn({ data: { projectId, network: picked } })
}

const captionFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ accountId: id, about: z.string().max(ABOUT_MAX), kind: z.enum(["photo", "video"]) }))
  .handler(async ({ context, data }): Promise<{ caption: string }> => ({
    caption: await draftCaption(context.user.id, data),
  }))

/** The AI's caption and hashtags in the account's voice, for the box. Nothing is posted. */
export function writeCaption(data: { accountId: string; about: string; kind: "photo" | "video" }) {
  return captionFn({ data })
}

const postFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      accountId: id,
      mediaUrl: z.string().min(1).max(2048),
      caption: z.string().max(10_000),
      draftCaption: z.string().max(10_000),
    })
  )
  .handler(async ({ context, data }): Promise<{ id: string }> => queueAppPost(context.user.id, data))

/** Sends one photo or video to the account's phone to post. Tried once, never again. */
export function sendAppPost(data: { accountId: string; mediaUrl: string; caption: string; draftCaption: string }) {
  return postFn({ data })
}

const cancelFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: z.array(id).min(1).max(200) }))
  .handler(async ({ context, data }) => cancelAppPosts(context.user.id, data.ids))

/** Calls off posts the phone has not started on, and answers which were. */
export function callOffAppPosts(ids: string[]) {
  return cancelFn({ data: { ids } })
}

const messagesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<InboxRow[]> => listInbox(context.user.id, { kind: "message" }))

/** Every phone account's open conversations, newest first. */
export function loadMessages() {
  return messagesFn()
}

const draftReplyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ inboxId: id }))
  .handler(async ({ context, data }): Promise<{ draft: string }> => ({
    draft: await draftInboxReply(context.user.id, data.inboxId),
  }))

/** The AI's suggested answer in the account's voice. Nothing is sent. */
export function writeInboxDraft(inboxId: string) {
  return draftReplyFn({ data: { inboxId } })
}

const replyFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ inboxId: id, text: z.string().max(5_000) }))
  .handler(async ({ context, data }): Promise<void> =>
    sendInboxReply((await actorForInbox(context.caller, [data.inboxId])).userId, data.inboxId, data.text)
  )

/** Sends an answer from the account's phone. Tried once, never again. */
export function sendInboxAnswer(inboxId: string, text: string) {
  return replyFn({ data: { inboxId, text } })
}

const skipFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ ids: z.array(id).min(1).max(200) }))
  .handler(async ({ context, data }) => skipInbox((await actorForInbox(context.caller, data.ids)).userId, data.ids))

/** Skips conversations (deleted, words and all) or comments (marked skipped). */
export function skipInboxItems(ids: string[]) {
  return skipFn({ data: { ids } })
}

const checkFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ accountId: id }))
  .handler(async ({ context, data }): Promise<{ queued: boolean }> => ({
    queued: await checkInboxNow(context.user.id, data.accountId),
  }))

/** Asks the account's phone to read its messages now, through the app's inbox. */
export function checkMessagesNow(accountId: string) {
  return checkFn({ data: { accountId } })
}

const profileReadFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ accountId: id }))
  .handler(async ({ context, data }) => readProfileEdits(context.user.id, data.accountId))

/** What Promo last set on the profile, and when a change may go. */
export function loadProfileEdits(accountId: string) {
  return profileReadFn({ data: { accountId } })
}

const nullableText = (max: number) => z.string().max(max).nullable()

const profileFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      accountId: id,
      displayName: nullableText(200),
      bio: nullableText(1_000),
      link: nullableText(1_000),
      pictureUrl: nullableText(2048),
    })
  )
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    const { accountId, ...fields } = data
    return queueProfileEdit(context.user.id, accountId, fields)
  })

/** Sends a profile change to the account's phone. Only the fields given change. */
export function applyProfileEdit(data: {
  accountId: string
  displayName: string | null
  bio: string | null
  link: string | null
  pictureUrl: string | null
}) {
  return profileFn({ data })
}
