import type { SocialPost } from "@/lib/viral/promo-link"
import { isTextSocial, type TextSocial } from "@/lib/viral/socials"

/**
 * The middle panel's list of X, Reddit and LinkedIn posts
 * (`workspace/docs/project-page.md`): its sorts and the words each social
 * uses for its numbers. Reddit calls likes upvotes and replies comments;
 * LinkedIn calls likes reactions. Reddit shows no views and no reposts.
 */
export const TEXT_POST_SORTS = ["newest", "views", "likes", "replies", "reposts"] as const
export type TextPostSort = (typeof TEXT_POST_SORTS)[number]

type Figure = Exclude<TextPostSort, "newest">

const WORDS: Record<TextSocial, Record<Figure, string | null>> = {
  x: { views: "Views", likes: "Likes", replies: "Replies", reposts: "Reposts" },
  reddit: { views: null, likes: "Upvotes", replies: "Comments", reposts: null },
  linkedin: { views: null, likes: "Reactions", replies: "Comments", reposts: "Reposts" },
}

/** What a figure is called on a social, or null when that social never shows it. */
export function figureName(social: TextSocial, figure: Figure): string | null {
  return WORDS[social][figure]
}

/** The sorts a social's list offers, with their names: Newest, then each figure it shows. */
export function textPostSorts(social: TextSocial): { value: TextPostSort; label: string }[] {
  const figures = (["views", "likes", "replies", "reposts"] as const).flatMap((figure) => {
    const label = figureName(social, figure)
    return label ? [{ value: figure as TextPostSort, label }] : []
  })
  return [{ value: "newest", label: "Newest" }, ...figures]
}

/** The sort a list opens on: the biggest figure the social shows. */
export function defaultTextPostSort(social: TextSocial): TextPostSort {
  return social === "x" ? "views" : "likes"
}

/** A sort the social offers, or its default. A Reddit list asked for views sorts by upvotes. */
export function readTextPostSort(social: TextSocial, value: unknown): TextPostSort {
  return textPostSorts(social).some((sort) => sort.value === value) ? (value as TextPostSort) : defaultTextPostSort(social)
}

/**
 * The posts biggest first, or newest first; "asc" turns that round. A post
 * missing the number being sorted on goes to the bottom either way; ties go
 * to the newest.
 */
export function sortTextPosts(posts: SocialPost[], sort: TextPostSort, direction: "asc" | "desc" = "desc"): SocialPost[] {
  const time = (post: SocialPost) => new Date(post.postedAt ?? post.firstSeenAt).getTime()
  const turn = direction === "asc" ? -1 : 1
  return [...posts].sort((a, b) => {
    if (sort !== "newest") {
      const missing = Number(a[sort] === null) - Number(b[sort] === null)
      if (missing) return missing
      const difference = ((b[sort] ?? 0) - (a[sort] ?? 0)) * turn
      if (difference) return difference
      return time(b) - time(a)
    }
    return (time(b) - time(a)) * turn
  })
}

/** The steps of the Filter's "at least" row: likes on X, upvotes on Reddit, reactions on LinkedIn. */
export const TEXT_POST_MIN_STEPS = [10, 100, 1_000, 10_000, 100_000] as const

/** A step of `TEXT_POST_MIN_STEPS`, or undefined. */
export function readTextPostMin(value: unknown): number | undefined {
  const number = Number(value)
  return (TEXT_POST_MIN_STEPS as readonly number[]).includes(number) ? number : undefined
}

/**
 * One social's posts the search and the "at least" filter leave. The search
 * looks in the words, the title, the writer and the subreddit. A post whose
 * likes are hidden is left out while a minimum is set.
 */
export function filterTextPosts(
  posts: SocialPost[],
  { social, q, minLikes }: { social: TextSocial; q?: string; minLikes?: number }
): SocialPost[] {
  const words = q?.trim().toLowerCase() ?? ""
  return posts.filter((post) => {
    if (post.network !== social) return false
    if (minLikes !== undefined && (post.likes === null || post.likes < minLikes)) return false
    if (!words) return true
    return [post.title, post.text, post.authorName, post.authorHandle, post.community].some((text) =>
      text.toLowerCase().includes(words)
    )
  })
}

/**
 * Saved views on a project's X, Reddit and LinkedIn list (`viral-posts:<id>`
 * in the shell's saved views), kept apart from the video list's views
 * because they hold different things. A view keeps its social, so opening it
 * picks that social, and what the address keeps: the search, the sort, the
 * order and the "at least" filter.
 */
export const TEXT_POSTS_SAVED_VIEW_KIND = "viral-posts"

export type TextPostsViewFilters = {
  social?: TextSocial
  q?: string
  psort?: TextPostSort
  pdir?: "asc"
  pmin?: number
}

/** The values a posts view keeps out of the ones given, each checked the way the address checks it. */
export function textPostsViewFilters(values: Record<string, unknown>): TextPostsViewFilters {
  const kept: TextPostsViewFilters = {}
  if (isTextSocial(values.social)) kept.social = values.social
  const q = typeof values.q === "string" ? values.q.slice(0, 200).trim() : ""
  if (q) kept.q = q
  if ((TEXT_POST_SORTS as readonly unknown[]).includes(values.psort)) kept.psort = values.psort as TextPostSort
  if (values.pdir === "asc") kept.pdir = "asc"
  const pmin = readTextPostMin(values.pmin)
  if (pmin !== undefined) kept.pmin = pmin
  return kept
}

/** `X · "meal prep" · Sort: Likes, lowest first · 1k+ likes` */
export function describeTextPostsView(filters: TextPostsViewFilters, socialName: (social: TextSocial) => string): string {
  const social = filters.social
  const parts: string[] = []
  if (social) parts.push(socialName(social))
  if (filters.q) parts.push(`"${filters.q}"`)
  if (filters.psort || filters.pdir) {
    const sort = social ? readTextPostSort(social, filters.psort) : (filters.psort ?? "newest")
    const label = social ? textPostSorts(social).find((one) => one.value === sort)?.label : sort
    parts.push(`Sort: ${label ?? "Newest"}${filters.pdir === "asc" ? (sort === "newest" ? ", oldest first" : ", lowest first") : ""}`)
  }
  if (filters.pmin !== undefined) {
    const figure = (social && figureName(social, "likes")) || "Likes"
    parts.push(`${filters.pmin.toLocaleString("en-US")}+ ${figure.toLowerCase()}`)
  }
  return parts.join(" · ")
}

/** What a post's row and thread call its writer: "Name @handle", or whichever is known. */
export function postAuthor(post: Pick<SocialPost, "authorName" | "authorHandle" | "network">): string {
  const handle = post.authorHandle && post.network === "x" && !post.authorHandle.startsWith("@") ? `@${post.authorHandle}` : post.authorHandle
  if (post.authorName && handle && post.authorName !== handle) return `${post.authorName} ${handle}`
  return post.authorName || handle || "Someone"
}

/** The words a list row shows: a Reddit post's title, otherwise the post's opening words. */
export function postHeadline(post: Pick<SocialPost, "title" | "text">): string {
  return post.title || post.text || "A post with no words"
}
