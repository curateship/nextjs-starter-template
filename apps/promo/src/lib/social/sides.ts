/**
 * The two sides of a network inside a project. Tyler, 5 Nov 2026: "Every
 * middle panel clicking from the left panel should show my own posts but
 * reddit, medium, x and linkedin are showing search to comments." Then, the
 * same day: "I think its better that commenting lives within its project.
 * Make each network have its own card and inside that cade have 2 rows, one
 * for posts and one for commenting".
 *
 * - **posts**: your own posts on the network.
 * - **commenting**: other people's posts found by keyword, and what you sent
 *   under them.
 *
 * `workspace/tasks/Projects/commenting-dashboard.md` is the task.
 */
export type Side = "posts" | "commenting"

/**
 * The networks that comment on other people's posts. Instagram and TikTok
 * only answer comments under your own posts, so they have no Commenting
 * (Tyler, 16 Oct 2026: "IG and tiktok is not reddit").
 */
export const COMMENTING_NETWORKS = ["reddit", "medium", "x", "linkedin"] as const

export type CommentingNetwork = (typeof COMMENTING_NETWORKS)[number]

export function isCommentingNetwork(value: unknown): value is CommentingNetwork {
  return typeof value === "string" && (COMMENTING_NETWORKS as readonly string[]).includes(value)
}
