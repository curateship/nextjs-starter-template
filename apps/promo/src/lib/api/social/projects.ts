import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import {
  addAccountToProject,
  createProject,
  deleteProject,
  deleteProjects,
  listProjectRows,
  readProjectView,
  removeAccountFromProject,
  updateProject,
  type ProjectAccount,
  type ProjectRow,
  type ProjectView,
} from "@/server/social/projects"
import { setProjectPaused } from "@/server/social/pause"
import {
  listPromoThreads,
  queuePromoThreadReads,
  type PromoThreadRow,
} from "@/server/social/reddit/promo-threads"

import { createErrorMessage } from "../error-message"

export type { ProjectAccount, ProjectRow, ProjectView, PromoThreadRow }

/**
 * The Projects dashboards' endpoints: the table of every project, one
 * project with its accounts, and putting accounts in and taking them out. Keywords and posts
 * are in `reddit/keywords.ts`, and writing and sending in `reddit/drafts.ts`.
 * Admin only, like every Reddit endpoint.
 */

export const getProjectErrorMessage = createErrorMessage(
  {
    "needs a name": "Give the project a name first.",
    "not one of your uploaded images": "That picture is not one of your uploaded images. Pick or upload it again.",
    "project does not exist": "That project is not there any more. Reload the page.",
    "account is not there any more": "That account is not there any more. Reload the page.",
    "already in another project": "That account is already in another project. An account belongs to one project only.",
    "found no posts yet": "This project has found no posts yet, so there are no subreddits to look in. Run a keyword first.",
    "There is no reader browser": "Pick a reader browser in Settings → Behaviour first. The look runs in it.",
  },
  "That did not work. Please try again."
)

/**
 * The refusal to delete a project names the project and how many accounts and
 * keywords it still holds, so it passes through as it is.
 */
export function getDeleteProjectErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ""
  return message.includes("still holds") ? message : getProjectErrorMessage(error)
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
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<ProjectView> =>
    readProjectView(context.user.id, data.projectId)
  )

/** One project with its accounts, best to comment from first, and what the queue is doing. */
export function loadProject(projectId: string) {
  return viewFn({ data: { projectId } })
}

const createFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ name: z.string().max(120) }))
  .handler(async ({ context, data }): Promise<{ id: string }> => ({
    id: await createProject(context.user.id, data.name),
  }))

export function makeProject(name: string) {
  return createFn({ data: { name } })
}

const updateFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      projectId: z.string().min(1),
      name: z.string().max(120).optional(),
      description: z.string().max(4_000).optional(),
      // A media address from the shared image field, or "" for none. The
      // server refuses any address that is not this person's own upload.
      imageUrl: z.string().trim().max(2_048).optional(),
    })
  )
  .handler(async ({ context, data: { projectId, ...input } }): Promise<void> =>
    updateProject(context.user.id, projectId, input)
  )

/** Saves the name or the description as it is typed, or the picture when it is picked. */
export function saveProject(data: { projectId: string; name?: string; description?: string; imageUrl?: string }) {
  return updateFn({ data })
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

const threadsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context, data }) => listPromoThreads(context.user.id, data.projectId))

/** The project's subreddits with a self-promotion thread found, and how many looks are on their way. */
export function loadPromoThreads(projectId: string) {
  return threadsFn({ data: { projectId } })
}

const lookFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<{ queued: number }> => ({
    queued: await queuePromoThreadReads(context.user.id, data.projectId),
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
