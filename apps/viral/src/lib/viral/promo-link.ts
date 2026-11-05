/**
 * The shapes the link with the Promo app shares between the server and the
 * screens (`workspace/docs/promo-connection.md`). Tyler, 4 Nov 2026: "Ask
 * Promo to read them". Viral never signs in to X, LinkedIn or Reddit; Promo
 * reads them with its own search accounts and reader.
 */

/** The networks Promo can read for Viral. Promo has no Threads, so Threads is not one. */
export const PROMO_READ_NETWORKS = ["x", "linkedin", "reddit"] as const
export type PromoReadNetwork = (typeof PROMO_READ_NETWORKS)[number]

/** What a read looks at. */
export const PROMO_READ_KINDS = ["search", "hashtag", "account", "person", "company", "subreddit", "post"] as const
export type PromoReadKind = (typeof PROMO_READ_KINDS)[number]

/** Which kinds each network takes. A `post` read is one post with its top replies, for the thread view. */
export const PROMO_READ_KINDS_BY_NETWORK: Record<PromoReadNetwork, readonly PromoReadKind[]> = {
  x: ["search", "hashtag", "account", "post"],
  linkedin: ["search", "hashtag", "person", "company", "post"],
  reddit: ["search", "subreddit", "post"],
}

export type PromoReadStatus = "waiting" | "done" | "failed"

/** One read, as the screens see it. */
export type PromoRead = {
  id: string
  projectId: string
  network: PromoReadNetwork
  kind: PromoReadKind
  value: string
  status: PromoReadStatus
  error: string
  /** How many posts it found. */
  found: number
  createdAt: string
  finishedAt: string | null
}

export type SocialPostReply = { author: string; text: string; likes: number }

/** A post a read found, as the screens see it. Numbers a network doesn't show are null. */
export type SocialPost = {
  id: string
  projectId: string
  network: PromoReadNetwork
  postId: string
  url: string
  /** A Reddit post's title, or "". */
  title: string
  text: string
  authorHandle: string
  authorName: string
  authorFollowers: number | null
  postedAt: string | null
  views: number | null
  /** Likes on X, reactions on LinkedIn, upvotes on Reddit. */
  likes: number | null
  replies: number | null
  reposts: number | null
  link: string
  /** A subreddit's name for Reddit, or "". */
  community: string
  /** Empty until the post itself has been read (`kind: "post"`). */
  topReplies: SocialPostReply[]
  repliesReadAt: string | null
  firstSeenAt: string
}

/**
 * The networks Write a post for Promo writes for, Tyler's four picks. A
 * Threads post is written for Copy only, because Promo has no Threads.
 */
export const PROMO_POST_NETWORKS = ["x", "threads", "linkedin", "reddit"] as const
export type PromoPostNetwork = (typeof PROMO_POST_NETWORKS)[number]

export const PROMO_POST_NETWORK_NAMES: Record<PromoPostNetwork, string> = {
  x: "X",
  threads: "Threads",
  linkedin: "LinkedIn",
  reddit: "Reddit",
}

/** Whether a post for that network can go to Promo, or is for Copy only. */
export function sendsToPromo(network: PromoPostNetwork): network is Exclude<PromoPostNetwork, "threads"> {
  return network !== "threads"
}

/** The most characters each network takes in one piece, as Promo checks them. */
export const PROMO_POST_LIMITS: Record<PromoPostNetwork, number> = {
  x: 280,
  threads: 500,
  linkedin: 3_000,
  reddit: 10_000,
}

/** A Reddit title stops at 300 characters. */
export const REDDIT_TITLE_LIMIT = 300

/** The most pieces an X thread is written in. */
export const X_THREAD_MAX = 8

export type PromoSendStatus = "written" | "sent" | "failed"

/** A post written for Promo from a vault idea. */
export type PromoPostSend = {
  id: string
  network: PromoPostNetwork
  title: string
  pieces: string[]
  status: PromoSendStatus
  promoProjectId: string | null
  /** Where the draft opens in Promo, only on the Promo address saved in Settings. */
  draftUrl: string | null
  error: string
  createdAt: string
  sentAt: string | null
}

/** Your own post of a vault idea, as Promo reported it. */
export type VaultPost = {
  id: string
  network: string
  url: string
  views: number | null
  likes: number | null
  comments: number | null
  postedAt: string | null
  figuresAt: string
}
