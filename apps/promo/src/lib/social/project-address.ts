import { readProjectArchiveSearch, type ArchiveSearch } from "@/lib/archive/search"
import { LINKEDIN_COMMENT_VIEWS, LINKEDIN_VIEWS, type LinkedinView } from "@/lib/social/linkedin/options"
import { MEDIUM_COMMENT_VIEWS, MEDIUM_VIEWS, type MediumView } from "@/lib/social/medium/options"
import { isNetwork, type Network } from "@/lib/social/networks"
import { REDDIT_VIEWS, type RedditView } from "@/lib/social/reddit/options"
import { isCommentingNetwork, type Side } from "@/lib/social/sides"
import { X_COMMENT_VIEWS, X_VIEWS, type XView } from "@/lib/social/x/options"

/**
 * A project's address (`workspace/tasks/Projects/commenting-dashboard.md`),
 * read the same way by the admin page and the guest page. Each network has
 * two sides inside the project, your own posts and commenting on other
 * people's; `?side=commenting` picks the second.
 */

/** Ids are ours, so anything that is not a short plain id is dropped. */
function id(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9-]{1,40}$/.test(value) ? value : undefined
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

const ALL_TABS = [...new Set<MediumView | XView | LinkedinView>([...MEDIUM_VIEWS, ...X_VIEWS, ...LINKEDIN_VIEWS])]

/** Each network's tabs that belong to its Commenting, apart from Reddit's `?view=`. */
export const COMMENT_TABS: Record<"medium" | "x" | "linkedin", readonly string[]> = {
  medium: MEDIUM_COMMENT_VIEWS,
  x: X_COMMENT_VIEWS,
  linkedin: LINKEDIN_COMMENT_VIEWS,
}

export type ProjectSearch = Omit<ArchiveSearch, "project" | "open"> & {
  network?: Network
  /** Commenting on other people's posts; none is your own posts. */
  side?: "commenting"
  /** Medium's, X's and LinkedIn's tab. */
  tab?: MediumView | XView | LinkedinView
  open?: string
  /** A Failed list, or Reddit's old Posts list under Comments (`?view=comments&list=posts`). */
  list?: "failed" | "posts"
  /** Reddit's commenting tab, or Instagram's and TikTok's Comments tab. */
  view?: RedditView
  /** One sent Reddit comment, or Instagram's and TikTok's open comment. */
  comment?: string
  /** A sent Reddit comment's Replies window. */
  replies?: string
  window?: "jobs"
  /** The keyword whose posts are listed on Commenting; none is every keyword's. */
  keyword?: string
  archive?: "1"
}

/** What the page's address may hold, with the keys it reads once and passes on. */
export type ProjectRouteSearch = ProjectSearch & {
  /** A Reddit post to open on Commenting, from a link. */
  post?: string
  /** A failed comment whose words go back in its box. */
  retry?: string
  /** A failed Reddit post, or a Viral draft, whose words New post opens with. */
  newPost?: string
}

export function readProjectSearch(search: Record<string, unknown>): ProjectRouteSearch {
  return {
    network: isNetwork(search.network) ? search.network : undefined,
    side: oneOf(search.side, ["commenting"] as const),
    tab: oneOf(search.tab, ALL_TABS),
    open: id(search.open),
    list: oneOf(search.list, ["failed", "posts"] as const),
    view: oneOf(search.view, REDDIT_VIEWS),
    comment: id(search.comment),
    replies: id(search.replies),
    window: oneOf(search.window, ["jobs"] as const),
    keyword: id(search.keyword),
    post: id(search.post),
    retry: id(search.retry),
    newPost: id(search.newPost),
    ...readProjectArchiveSearch(search),
  }
}

/**
 * Which side of the shown network the address opens. `?side=commenting` says
 * so, and so does anything only Commenting has, which is how addresses written
 * before 5 Nov 2026, when commenting had no side of its own, still land on it
 * (part 22): Reddit's `?view=`, `?post=`, `?retry=`, `?replies=` and
 * `?comment=`, a commenting `?tab=` on Medium, X or LinkedIn, `?open=` with no
 * tab there (your own posts always name their tab), a keyword, or the Jobs
 * window. Reddit's old Posts list (`?view=comments&list=posts`) is your posts.
 */
export function sideOf(network: Network | null, search: ProjectRouteSearch): Side {
  if (!network || !isCommentingNetwork(network)) return "posts"
  if (search.side === "commenting" || search.keyword || search.window) return "commenting"
  if (network === "reddit") {
    if (search.view === "comments" && search.list === "posts") return "posts"
    return search.view || search.post || search.retry || search.replies || search.comment ? "commenting" : "posts"
  }
  if (search.tab) return COMMENT_TABS[network].includes(search.tab) ? "commenting" : "posts"
  return search.open ? "commenting" : "posts"
}

/** What a notice's address names on a network's Commenting. */
export type CommentingParams = {
  network: "reddit" | "medium" | "x" | "linkedin"
  view?: RedditView
  tab?: MediumView | XView | LinkedinView
  open?: string
  list?: "failed"
}

/**
 * The address of a network's Commenting inside its project, which a notice
 * opens. Written by the server, so the bell leads straight to the right tab.
 */
export function commentingHref(projectId: string | null, params: CommentingParams): string {
  if (!projectId) return "/admin/projects"
  const query = new URLSearchParams({ network: params.network, side: "commenting" })
  for (const key of ["view", "tab", "open", "list"] as const) {
    const value = params[key]
    if (value) query.set(key, value)
  }
  return `/admin/projects/${encodeURIComponent(projectId)}?${query.toString()}`
}
