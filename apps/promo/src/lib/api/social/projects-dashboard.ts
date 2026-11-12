import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { PAGE_MAX_LENGTH } from "@/lib/notes/page-body"
import { coverImagesSchema, coverSchema } from "@/lib/notes/page-cover"
import { PROJECTS_PAGE_ERRORS } from "@/lib/social/projects-dashboard-page"
import { PROJECTS_LIST_SECTIONS } from "@/lib/social/projects-dashboard-search"
import { adminGet, adminPost } from "@/server/guards"
import {
  getProjectsPageAndSections,
  getProjectsWidgets,
  listPostsNeedingYou,
  saveProjectsPageBody,
  saveProjectsSections,
  saveProjectsWidgets,
  setProjectsPageCover,
  setProjectsPageLock,
  type PostsNeedingYou,
  type ProjectsSections,
} from "@/server/social/projects-dashboard"

import { createErrorMessage } from "../error-message"

export type { PostsNeedingYou, ProjectsSections }

/**
 * The Projects dashboard's own records (Tyler, 12 Nov 2026): each person's
 * left page and Overview layout, and the posts that need them. Every one is
 * admin only and the signed-in person's own.
 */

export const getProjectsDashboardErrorMessage = createErrorMessage(
  {
    [PROJECTS_PAGE_ERRORS.tooLong]: PROJECTS_PAGE_ERRORS.tooLong,
    [PROJECTS_PAGE_ERRORS.locked]: PROJECTS_PAGE_ERRORS.locked,
  },
  "That did not work. Please try again."
)

const loadPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }) => getProjectsPageAndSections(context.user.id))

const sectionSchema = z.array(z.enum(PROJECTS_LIST_SECTIONS as [string, ...string[]])).max(PROJECTS_LIST_SECTIONS.length)

const saveSectionsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ hidden: sectionSchema, order: sectionSchema }))
  .handler(async ({ data, context }) => saveProjectsSections(context.user.id, data as ProjectsSections))

const savePageFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ body: z.string().max(PAGE_MAX_LENGTH) }))
  .handler(async ({ data, context }) => saveProjectsPageBody(context.user.id, data.body))

const lockPageFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ locked: z.boolean() }))
  .handler(async ({ data, context }) => setProjectsPageLock(context.user.id, data.locked))

const coverFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ coverUrl: coverSchema, coverImages: coverImagesSchema }))
  .handler(async ({ data, context }) => setProjectsPageCover(context.user.id, data))

const rowSchema = z.object({
  columns: z.number().int().min(0).max(4),
  spots: z.array(z.string().max(80).nullable()).max(4),
})

const loadWidgetsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<WidgetLayout> => getProjectsWidgets(context.user.id))

const saveWidgetsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ top: rowSchema, bottom: rowSchema }))
  .handler(async ({ data, context }): Promise<WidgetLayout> => saveProjectsWidgets(context.user.id, data))

const postsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<PostsNeedingYou[]> => listPostsNeedingYou(context.user.id))

/** The left page and the Dashboards block's hidden sections and order. */
export function loadProjectsPage() {
  return loadPageFn()
}
export function saveProjectsPageSections(sections: ProjectsSections) {
  return saveSectionsFn({ data: sections })
}
export function saveProjectsPage(body: string) {
  return savePageFn({ data: { body } })
}
export function lockProjectsPage(locked: boolean) {
  return lockPageFn({ data: { locked } })
}
export function setProjectsPageCoverPhoto(cover: { coverUrl: string | null; coverImages: string[] }) {
  return coverFn({ data: cover })
}
export function loadProjectsWidgets() {
  return loadWidgetsFn()
}
export function saveProjectsWidgetLayout(layout: WidgetLayout) {
  return saveWidgetsFn({ data: layout })
}
/** Every project's failed posts and unsent drafts, network by network, for Overview. */
export function loadPostsNeedingYou() {
  return postsFn()
}
