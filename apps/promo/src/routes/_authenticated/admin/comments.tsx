import { createFileRoute, redirect } from "@tanstack/react-router"

import { findProjectForOldScreen } from "@/lib/api/social/projects"

type CommentsSearch = { tab?: "failed" | "posts"; replies?: string; comment?: string }

/** Ids are ours, so anything that is not a short plain id is dropped. */
function id(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9-]{1,40}$/.test(value) ? value : undefined
}

/**
 * The Comments screen's old address, which the bell's reply, removal and
 * failure notices lead to. Comments became a tab in each project's Reddit
 * module on 14 Oct 2026, so this sends to the Comments tab of the project the
 * comment's account is in, with the same comment, Replies window or list
 * open. With no comment named it is the only project, or the Projects table.
 */
export const Route = createFileRoute("/_authenticated/admin/comments")({
  validateSearch: (search: Record<string, unknown>): CommentsSearch => ({
    tab: search.tab === "failed" || search.tab === "posts" ? search.tab : undefined,
    replies: id(search.replies),
    comment: id(search.comment),
  }),
  beforeLoad: async ({ search }) => {
    const { projectId } = await findProjectForOldScreen("comments", search.replies ?? search.comment ?? null)
    if (!projectId) throw redirect({ to: "/admin/projects", replace: true })
    throw redirect({
      to: "/admin/projects/$projectId",
      params: { projectId },
      search: { view: "comments", list: search.tab, replies: search.replies, comment: search.comment },
      replace: true,
    })
  },
})
