import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import { editorGet, editorPost } from "@/server/social/editor-guards"
import { actorFor, guestOnlyDescription, guestProjectView } from "@/server/social/project-guests"
import {
  addAccountToProject,
  addProjectNetwork,
  createProject,
  deleteProject,
  deleteProjects,
  listProjectRows,
  projectForOldComments,
  readProjectView,
  removeAccountFromProject,
  removeProjectNetwork,
  setProjectDescriptionLocked,
  setProjectPinned,
  updateProject,
  type ProjectAccount,
  type ProjectRow,
  type ProjectView,
} from "@/server/social/projects"
import { setProjectCommentingPaused, setProjectNetworkPaused, setProjectPaused } from "@/server/social/pause"
import { readPostCounts } from "@/server/social/post-counts"
import { readToday } from "@/server/social/today"
import { readMediumCounts } from "@/server/social/medium/module"
import { readLinkedinCounts } from "@/server/social/linkedin/module"
import { readXCounts } from "@/server/social/x/module"
import { PAGE_MAX_LENGTH } from "@/lib/notes/page-body"
import { coverImagesSchema, coverSchema } from "@/lib/notes/page-cover"
import { PROJECT_DESCRIPTION_MOVED } from "@/lib/social/project-description"
import {
  listPromoThreads,
  queuePromoThreadReads,
  type PromoThreadRow,
} from "@/server/social/reddit/promo-threads"
import { NETWORKS, type Network } from "@/lib/social/networks"
import { passReaderWritten } from "@/lib/social/refusal-words"

import { createErrorMessage } from "../error-message"

export type { ProjectAccount, ProjectRow, ProjectView, PromoThreadRow }

/**
 * The Projects dashboards' endpoints: the table of every project, one
 * project with its accounts, and putting accounts in and taking them out. Keywords and posts
 * are in `reddit/keywords.ts`, and writing and sending in `reddit/drafts.ts`.
 * Admin only, like every Reddit endpoint.
 */

export const getProjectErrorMessage = passReaderWritten(createErrorMessage(
  {
    "needs a name": "Give the project a name first.",
    "not one of your uploaded images": "That picture is not one of your uploaded images. Pick or upload it again.",
    "project does not exist": "That project is not there any more. Reload the page.",
    "account is not there any more": "That account is not there any more. Reload the page.",
    "already in another project": "That account is already in another project. An account belongs to one project only.",
    "found no posts yet": "This project has found no posts yet, so there are no subreddits to look in. Run a keyword first.",
    "There is no reader browser": "Pick a reader browser in Settings → Behaviour first. The look runs in it.",
    "cannot use that network": "Promo cannot use that network yet.",
    "description only": "You can change the description only.",
    "description is locked": "The description is locked. Unlock it from the project's ⋮ menu first.",
    "Keep it under": "The description is too long. Keep it under 4,000 letters.",
    "changed somewhere else": PROJECT_DESCRIPTION_MOVED,
  },
  "That did not work. Please try again."
))

/**
 * The refusal to delete a project names the project and how many accounts and
 * keywords it still holds, so it passes through as it is.
 */
export function getDeleteProjectErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ""
  return message.includes("still holds") ? message : getProjectErrorMessage(error)
}

/**
 * Adding a network the project already uses, or taking one off that still
 * holds accounts or keywords, names the project and the network, so those
 * pass through as they are.
 */
export function getNetworkErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ""
  return message.includes("still holds") || message.includes("already uses") ? message : getProjectErrorMessage(error)
}

const rowsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<ProjectRow[]> => listProjectRows(context.user.id))

/** Every project with its counts, for the Projects table dashboard. */
export function loadProjectRows() {
  return rowsFn()
}

const deleteManyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: z.array(z.string().min(1)).min(1).max(200) }))
  .handler(async ({ context, data }) => deleteProjects(context.user.id, data.ids))

/** Deletes the empty ones and answers with why each of the rest was kept. */
export function removeProjects(ids: string[]) {
  return deleteManyFn({ data: { ids } })
}

const viewFn = createServerFn({ method: "GET" })
  .middleware([editorGet])
  .inputValidator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<ProjectView> => {
    const actor = await actorFor(context.caller, data.projectId)
    const view = await readProjectView(actor.userId, data.projectId)
    // What waits on Commenting's rows: strong posts and replies to answer.
    // Every count is this project's alone, so a guest sees them too.
    const networkCounts: ProjectView["networkCounts"] = {}
    if (view.project.networks.includes("reddit")) {
      const today = await readToday(actor.userId, data.projectId)
      networkCounts.reddit = today.posts.length + today.replies.reduce((sum, reply) => sum + reply.toAnswer, 0)
    }
    if (view.project.networks.includes("medium")) {
      const counts = await readMediumCounts(actor.userId, data.projectId)
      networkCounts.medium = counts.strong + counts.toAnswer
    }
    if (view.project.networks.includes("x")) {
      const counts = await readXCounts(actor.userId, data.projectId)
      networkCounts.x = counts.strong + counts.toAnswer
    }
    if (view.project.networks.includes("linkedin")) {
      const counts = await readLinkedinCounts(actor.userId, data.projectId)
      networkCounts.linkedin = counts.strong + counts.toAnswer + counts.invites
    }
    // What needs you on the project's own rows: failed posts and drafts.
    const postCounts = await readPostCounts(actor.userId, data.projectId, view.project.networks)
    const counted = { ...view, networkCounts, postCounts }
    return actor.guest ? guestProjectView(counted, data.projectId) : counted
  })

/** One project with its accounts, best to comment from first, and what the queue is doing. */
export function loadProject(projectId: string) {
  return viewFn({ data: { projectId } })
}

const createFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ name: z.string().max(120), networks: z.array(z.enum(NETWORKS)).max(NETWORKS.length) }))
  .handler(async ({ context, data }): Promise<{ id: string }> => ({
    id: await createProject(context.user.id, data.name, undefined, data.networks),
  }))

/** Makes a project using the networks ticked in the New project window. */
export function makeProject(name: string, networks: Network[]) {
  return createFn({ data: { name, networks } })
}

const networkFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: z.string().min(1), network: z.enum(NETWORKS), use: z.boolean() }))
  .handler(async ({ context, data }): Promise<void> =>
    data.use
      ? addProjectNetwork(context.user.id, data.projectId, data.network)
      : removeProjectNetwork(context.user.id, data.projectId, data.network)
  )

/** Adds a network to a project, or with `use` false takes it off. */
export function setProjectNetwork(projectId: string, network: Network, use: boolean) {
  return networkFn({ data: { projectId, network, use } })
}

const updateFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(
    z.object({
      projectId: z.string().min(1),
      name: z.string().max(120).optional(),
      // The project's page as JSON text: the description's words, "/"
      // blocks and the Networks block. The server cleans it to what a page
      // may hold whatever the browser sent, and checks its length as it saves.
      page: z.string().max(PAGE_MAX_LENGTH).optional(),
      // The page the editor started from, as the server last gave it, so a
      // stale copy is refused rather than written over what is stored.
      base: z.string().max(PAGE_MAX_LENGTH).optional(),
      // The cover from the shell's Cover photo row: None, the sky or a
      // picture, and the pictures it has had. The server refuses any picture
      // that is not this person's own upload.
      cover: z.object({ coverUrl: coverSchema, coverImages: coverImagesSchema }).optional(),
    })
  )
  .handler(async ({ context, data: { projectId, ...input } }): Promise<{ page: string | null }> => {
    const actor = await actorFor(context.caller, projectId)
    // A guest works the project and may rewrite what it makes, never its name or picture.
    if (actor.guest) guestOnlyDescription(input)
    return updateProject(actor.userId, projectId, input)
  })

/** Saves the name or the project's page as it is typed, or the picture when it is picked. */
export function saveProject(data: {
  projectId: string
  name?: string
  page?: string
  base?: string
  cover?: { coverUrl: string | null; coverImages: string[] }
}) {
  return updateFn({ data })
}

const pinFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: z.string().min(1), pinned: z.boolean() }))
  .handler(async ({ context, data }): Promise<void> => setProjectPinned(context.user.id, data.projectId, data.pinned))

/** Pins a project, which puts it first in the Projects table, or with `pinned` false unpins it. */
export function pinProject(projectId: string, pinned: boolean) {
  return pinFn({ data: { projectId, pinned } })
}

const lockFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: z.string().min(1), locked: z.boolean() }))
  .handler(async ({ context, data }): Promise<void> =>
    setProjectDescriptionLocked(context.user.id, data.projectId, data.locked)
  )

/** Lock description, or with `locked` false Unlock description. The owner's alone. */
export function lockProjectDescription(projectId: string, locked: boolean) {
  return lockFn({ data: { projectId, locked } })
}

const deleteFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<void> => deleteProject(context.user.id, data.projectId))

export function removeProject(projectId: string) {
  return deleteFn({ data: { projectId } })
}

const pauseFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: z.string().min(1), paused: z.boolean() }))
  .handler(async ({ context, data }): Promise<void> =>
    setProjectPaused(context.user.id, data.projectId, data.paused)
  )

/**
 * Pauses a whole project, or with `paused` false resumes it. None of its
 * accounts posts, warms up or takes a health reading while it is paused.
 */
export function pauseProject(projectId: string, paused: boolean) {
  return pauseFn({ data: { projectId, paused } })
}

const pauseNetworkFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: z.string().min(1), network: z.enum(NETWORKS), paused: z.boolean() }))
  .handler(async ({ context, data }): Promise<void> => {
    await setProjectNetworkPaused(context.user.id, data.projectId, data.network, data.paused)
  })

/**
 * Pauses one network of a project, or with `paused` false resumes it. Its
 * accounts there stop posting and warming up; the rest of the project runs.
 */
export function pauseProjectNetwork(projectId: string, network: Network, paused: boolean) {
  return pauseNetworkFn({ data: { projectId, network, paused } })
}

const pauseCommentingFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: z.string().min(1), network: z.enum(NETWORKS), paused: z.boolean() }))
  .handler(async ({ context, data }): Promise<void> => {
    await setProjectCommentingPaused(context.user.id, data.projectId, data.network, data.paused)
  })

/**
 * Pauses commenting on one network of a project, or with `paused` false
 * resumes it, from a network's Commenting row. Comments, answers and
 * connection requests wait; the project's own posts keep going out.
 */
export function pauseProjectCommenting(projectId: string, network: Network, paused: boolean) {
  return pauseCommentingFn({ data: { projectId, network, paused } })
}

const threadsFn = createServerFn({ method: "GET" })
  .middleware([editorGet])
  .inputValidator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context, data }) =>
    listPromoThreads((await actorFor(context.caller, data.projectId)).userId, data.projectId)
  )

/** The project's subreddits with a self-promotion thread found, and how many looks are on their way. */
export function loadPromoThreads(projectId: string) {
  return threadsFn({ data: { projectId } })
}

const lookFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<{ queued: number }> => ({
    queued: await queuePromoThreadReads((await actorFor(context.caller, data.projectId)).userId, data.projectId),
  }))

/** Looks for the self-promotion thread in each of the project's subreddits, in the reader browser. */
export function lookForPromoThreads(projectId: string) {
  return lookFn({ data: { projectId } })
}

const addAccountFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: z.string().min(1), accountId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<void> =>
    addAccountToProject(context.user.id, data.projectId, data.accountId)
  )

export function putAccountInProject(projectId: string, accountId: string) {
  return addAccountFn({ data: { projectId, accountId } })
}

const removeAccountFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ accountId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<void> =>
    removeAccountFromProject(context.user.id, data.accountId)
  )

export function takeAccountOutOfProject(accountId: string) {
  return removeAccountFn({ data: { accountId } })
}

const oldCommentsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ commentId: z.string().min(1).max(40).nullable() }))
  .handler(async ({ context, data }): Promise<{ projectId: string | null }> => ({
    projectId: await projectForOldComments(context.user.id, data.commentId),
  }))

/**
 * Which project `/admin/comments` opens now, or null for the Projects table.
 * That address only sends on.
 */
export function findProjectForOldComments(commentId: string | null = null) {
  return oldCommentsFn({ data: { commentId } })
}
