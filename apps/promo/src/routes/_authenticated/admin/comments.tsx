import { createFileRoute, redirect } from "@tanstack/react-router"

import { findProjectForOldComments } from "@/lib/api/social/projects"

type CommentsSearch = { tab?: "failed" | "posts"; replies?: string; comment?: string }

/** Ids are ours, so anything that is not a short plain id is dropped. */
function id(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9-]{1,40}$/.test(value) ? value : undefined
}

/**
 * The Comments screen's old address, which the bell's reply and removal
 * notices lead to. Comments became a tab in each project's Reddit module on
 * 14 Oct 2026, and Reddit's Sent tab on its Commenting row on 5 Nov 2026
 * (`workspace/tasks/Projects/commenting-dashboard.md`). So this sends there,
 * for the project the comment's account is in, with the same comment,
 * Replies window or Failed list open. Its old Posts list is Reddit's Posts
 * row. With no comment named it is the only project, or the Projects table.
 */
export const Route = createFileRoute("/_authenticated/admin/comments")({
  validateSearch: (search: Record<string, unknown>): CommentsSearch => ({
    tab: search.tab === "failed" || search.tab === "posts" ? search.tab : undefined,
    replies: id(search.replies),
    comment: id(search.comment),
  }),
  beforeLoad: async ({ search }) => {
    const { projectId } = await findProjectForOldComments(search.replies ?? search.comment ?? null)
    if (search.tab === "posts") {
      if (!projectId) throw redirect({ to: "/admin/projects", replace: true })
      throw redirect({ to: "/admin/projects/$projectId", params: { projectId }, search: { network: "reddit" }, replace: true })
    }
    if (!projectId) throw redirect({ to: "/admin/projects", replace: true })
    throw redirect({
      to: "/admin/projects/$projectId",
      params: { projectId },
      search: { network: "reddit", side: "commenting", view: "comments", list: search.tab === "failed" ? "failed" : undefined, replies: search.replies, comment: search.comment },
      replace: true,
    })
  },
})
