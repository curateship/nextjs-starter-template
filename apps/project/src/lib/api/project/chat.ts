import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import {
  LIMITS,
  deleteCommentSchema,
  editCommentSchema,
  pollSchema,
  reactSchema,
  sendMessageSchema,
  voteSchema,
  type ChatPlace,
} from "@/lib/project/rules"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { userGet, userPost } from "@/server/guards"
import { inTeam } from "@/server/project/access"
import { teamScope } from "@/lib/api/project/scope"
import {
  deleteComment,
  editComment,
  loadChatUnread,
  loadProjectChat,
  reactToMessage,
  sendMessage,
  voteOnPoll,
} from "@/server/project/task-chat"
import { findTasksToLink } from "@/server/project/task-links"

export type { ChatMessage, ChatPoll, ChatQuote, ChatReaction, ProjectChat } from "@/server/project/task-chat"
export type { LinkChoice } from "@/server/project/task-links"

const id = z.string().min(1).max(36)
const cursor = z.object({ at: z.string().datetime(), id })

/**
 * A message and its files in one form, so they arrive together. Files are
 * refused here before anything is stored when there are too many or one is
 * too big, and the server checks again.
 */
const sendFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator((data) => {
    if (!(data instanceof FormData)) throw new Error("Expected form data")
    const taskId = data.get("taskId")
    const projectId = data.get("projectId")
    const message = sendMessageSchema.parse({
      chat: taskId === null ? { projectId } : { taskId },
      body: data.get("body") ?? "",
      replyToId: data.get("replyToId") || null,
    })
    const files = data.getAll("file")
    if (files.some((file) => !(file instanceof File))) throw new Error("Pick a file to add.")
    return { ...message, files: files as File[] }
  })
  .handler(async ({ data, context }) => {
    if (data.files.length > LIMITS.filesPerMessage) throw new Error(PROJECT_ERRORS.tooManyMessageFiles)
    if (data.files.some((file) => file.size > LIMITS.fileBytes)) throw new Error(PROJECT_ERRORS.fileTooBig)
    if (data.files.length) {
      try {
        await enforceRateLimit(`project-task-file:${context.user.id}`, {
          maxAttempts: 60,
          windowSeconds: 10 * 60,
        })
      } catch (error) {
        if (error instanceof Error && error.message.includes("RATE_LIMITED")) {
          throw new Error(PROJECT_ERRORS.tooManyUploads)
        }
        throw error
      }
    }
    return sendMessage(context.user, {
      chat: data.chat,
      body: data.body,
      replyToId: data.replyToId,
      files: await Promise.all(
        data.files.map(async (file) => ({
          name: file.name,
          mimeType: file.type,
          data: new Uint8Array(await file.arrayBuffer()),
        }))
      ),
    })
  })

const editFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(editCommentSchema)
  .handler(async ({ data, context }) => editComment(context.user, data))

const deleteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(deleteCommentSchema)
  .handler(async ({ data, context }) => deleteComment(context.user, data))

const reactFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(reactSchema)
  .handler(async ({ data, context }) => reactToMessage(context.user, data))

const sendPollFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(pollSchema)
  .handler(async ({ data, context }) =>
    sendMessage(context.user, {
      chat: { projectId: data.projectId },
      body: data.question,
      replyToId: null,
      poll: data.choices,
    })
  )

const voteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(voteSchema)
  .handler(async ({ data, context }) => voteOnPoll(context.user, data))

const loadProjectChatFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(
    z.object({
      projectId: id,
      before: cursor.optional(),
      from: cursor.optional(),
    })
  )
  .handler(async ({ data, context }) => loadProjectChat(context.user.id, data))

const loadChatUnreadFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ data, context }) => loadChatUnread(context.user.id, data.projectId))

const findTasksToLinkFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ q: z.string().max(200), ...teamScope }))
  .handler(async ({ data, context }) => inTeam(data.teamId, () => findTasksToLink(context.user.id, data.q)))

export function sendChatMessage(input: {
  chat: ChatPlace
  body: string
  replyToId: string | null
  files: File[]
}) {
  const form = new FormData()
  if ("taskId" in input.chat) form.append("taskId", input.chat.taskId)
  else form.append("projectId", input.chat.projectId)
  form.append("body", input.body)
  if (input.replyToId) form.append("replyToId", input.replyToId)
  for (const file of input.files) form.append("file", file)
  return sendFn({ data: form })
}
export function editChatMessage(data: z.input<typeof editCommentSchema>) {
  return editFn({ data })
}
export function deleteChatMessage(data: z.input<typeof deleteCommentSchema>) {
  return deleteFn({ data })
}
export function reactToChatMessage(data: z.input<typeof reactSchema>) {
  return reactFn({ data })
}
export function sendChatPoll(data: z.input<typeof pollSchema>) {
  return sendPollFn({ data })
}
export function voteOnChatPoll(data: z.input<typeof voteSchema>) {
  return voteFn({ data })
}
/** The newest page, the page before `before`, or every message from `from` on. */
export function loadProjectChatPage(
  projectId: string,
  page: { before?: { at: string; id: string }; from?: { at: string; id: string } } = {}
) {
  return loadProjectChatFn({ data: { projectId, ...page } })
}
/** How many messages in a project's own chat are new to me. */
export function loadProjectChatUnread(projectId: string) {
  return loadChatUnreadFn({ data: { projectId } })
}
export function findLinkableTasks(q: string, teamId?: string) {
  return findTasksToLinkFn({ data: { q, teamId } })
}
