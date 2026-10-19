import type { TranscriptLine } from "@/lib/note/videos"

/**
 * What a saved X post is, in the words and numbers both sides need.
 *
 * The browser draws these and the server writes them, so they live here rather
 * than beside the server code: a value the browser imports out of a
 * `@/server/*` module drags the database driver into the page with it.
 */

export const NOTE_POST_STATUSES = [
  "waiting",
  "reading",
  "saved",
  "queued",
  "analysing",
  "ready",
  "failed",
] as const
export type NotePostStatus = (typeof NOTE_POST_STATUSES)[number]

export type NotePostKind = "post" | "merged"

export const POST_VIDEO_STATUSES = [
  "none",
  "waiting",
  "downloading",
  "saved",
  "failed",
  "too_long",
] as const
export type PostVideoStatus = (typeof POST_VIDEO_STATUSES)[number]

/** none, whole, or cut when the rest of the thread could not be read. */
export type ThreadStatus = "none" | "whole" | "cut"

export type PostPicture = { path: string; width: number | null; height: number | null }

/** One plan step. `from` names the post a merged plan's step came from. */
export type PlanStep = { text: string; done: boolean; from?: string | null }

/** Which part of the post a highlight is in, and where in its words. */
export type HighlightPart = "post" | "quoted" | `thread-${number}`
export type Highlight = { part: HighlightPart; start: number; end: number }

export type QuotedPost = {
  postId: string
  url: string
  authorName: string | null
  authorHandle: string | null
  text: string
  postedAt: string | null
  pictures: PostPicture[]
}

export type ThreadPost = { postId: string; text: string; pictures: PostPicture[] }

/** Not started (no ticks), In progress (some), Done (all). Null with no plan. */
export type PlanProgress = "not_started" | "in_progress" | "done"

export const PLAN_PROGRESS_FILTERS = ["not_started", "in_progress", "done"] as const

export const PLAN_STEPS_MAX = 30
export const PLAN_STEP_MAX = 400
export const ABOUT_YOU_MAX = 500
/** How many cards one read of the list brings, newest first. */
export const POSTS_PAGE_SIZE = 50
/** The most posts one press of Analyse or One plan takes. */
export const MANY_AT_ONCE_MAX = 10
/** The most saved posts the similar-post check reads, newest first. */
export const SIMILAR_POSTS_MAX = 200

/** The sentences a refusal shows, said the same way on both sides. */
export const POST_SAYS = {
  notALink: "That is not a link to an X post",
  postNotFound: "Post not found",
  notReadable: "Wait for the post to finish saving first.",
  videoStillSaving: "Wait for the video to finish saving first.",
  tooManyLinks: "That is a lot of posts at once. Wait a few minutes and save the rest.",
  deleted: "This post was deleted, or the link is wrong.",
  private: "This post is private, so only people its author lets in can read it.",
  xBusy: "X didn't answer. Try again in a minute.",
  xChanged: "X's page did not have the post in it. X may have changed its page.",
  notAnArticle: "That link did not lead to an article.",
  noArticle: "This post has no link to an article.",
  pickTwo: "Pick at least two analysed posts.",
  tooManyPicked: "Pick up to 10 posts at a time.",
  stepEmpty: "A step needs some words",
  tooManySteps: "A plan holds up to 30 steps",
  stillAnalysing: "Wait for the analysis to finish first.",
  noPlanYet: "Analyse this post first, so it has a plan to merge.",
  noVideo: "This post's video is not waiting to be tried again.",
} as const

/** Still being worked on, so the screen keeps asking where it has got to. */
export function isPostMoving(post: { status: NotePostStatus; videoStatus: PostVideoStatus }) {
  return (
    post.status === "waiting" ||
    post.status === "reading" ||
    post.status === "queued" ||
    post.status === "analysing" ||
    post.videoStatus === "waiting" ||
    post.videoStatus === "downloading"
  )
}

export function isPostAnalysing(status: NotePostStatus) {
  return status === "queued" || status === "analysing"
}

/** Whether Analyse may be pressed now, and if not, the reason. */
export function analyseRefusal(post: {
  status: NotePostStatus
  videoStatus: PostVideoStatus
  hasText: boolean
}): string | null {
  if (!post.hasText) return POST_SAYS.notReadable
  if (post.videoStatus === "waiting" || post.videoStatus === "downloading") {
    return POST_SAYS.videoStillSaving
  }
  if (post.status !== "saved" && post.status !== "ready" && post.status !== "failed") {
    return POST_SAYS.notReadable
  }
  return null
}

/** The status line on a card and above the Analyse button. */
export function postStatusWords(post: {
  status: NotePostStatus
  error: string | null
  kind: NotePostKind
}): string {
  switch (post.status) {
    case "waiting":
    case "reading":
      return "Saving…"
    case "saved":
      return "Ready to analyse"
    case "queued":
      return "Queued"
    case "analysing":
      return post.kind === "merged" ? "Writing the plan…" : "Analysing…"
    case "ready":
      return post.kind === "merged" ? "Plan ready" : "Analysed"
    case "failed":
      return `Failed: ${post.error ?? "something went wrong"}`
  }
}

export function planProgress(plan: readonly PlanStep[] | null | undefined): PlanProgress | null {
  if (!plan?.length) return null
  const ticked = plan.filter((step) => step.done).length
  if (ticked === 0) return "not_started"
  return ticked === plan.length ? "done" : "in_progress"
}

export function progressWords(progress: PlanProgress) {
  return progress === "done" ? "Done" : progress === "in_progress" ? "In progress" : "Not started"
}

/** What the AI's price line needs to know about one post, worked out on the server. */
export type AnalyseInputs = {
  /** Characters of words the call reads: the post, quote, thread, article and transcript. */
  chars: number
  pictures: number
  /** Seconds of video still to be written down, or 0. */
  videoSeconds: number
}

/** One card in the middle panel, as the list hands it over. */
export type NotePostCard = {
  id: string
  kind: NotePostKind
  folderId: string | null
  url: string | null
  status: NotePostStatus
  error: string | null
  /** Whether the words were read, which decides what Try again does. */
  hasText: boolean
  /** "@naval", or "Plan from 4 posts" for a merged plan. */
  title: string
  authorName: string | null
  authorHandle: string | null
  authorPictureUrl: string | null
  postedAt: string | null
  firstLines: string | null
  firstPictureUrl: string | null
  firstHighlight: string | null
  firstSummaryLine: string | null
  tags: string[]
  progress: PlanProgress | null
  videoStatus: PostVideoStatus
  analyse: AnalyseInputs
  /** Characters across the plan's steps, for One plan's price. */
  planChars: number
  createdAt: string
}

export type PictureView = { url: string; width: number | null; height: number | null }

/** Everything the right panel shows about one post. */
export type NotePostDetail = NotePostCard & {
  text: string
  pictures: PictureView[]
  quoted: (Omit<QuotedPost, "pictures"> & { pictures: PictureView[] }) | null
  thread: (Omit<ThreadPost, "pictures"> & { pictures: PictureView[] })[]
  threadStatus: ThreadStatus
  articleTitle: string | null
  hasArticleText: boolean
  /** A link in the post to a page off X, whether or not it was brought in. */
  articleLink: string | null
  likesWhenSaved: number | null
  repostsWhenSaved: number | null
  videoError: string | null
  videoSeconds: number | null
  videoUrl: string | null
  videoCoverUrl: string | null
  transcript: TranscriptLine[]
  highlights: Highlight[]
  summary: string[]
  actionPlan: PlanStep[]
  suggestedFolder: { id: string; name: string } | null
  similar: { id: string; title: string; savedAt: string } | null
  /** A merged plan's posts, as they are now. A deleted one is left out. */
  sources: { id: string; title: string }[]
  analysedAt: string | null
}

export type NotePostFolder = { id: string; name: string; position: number; postCount: number }

/** What the left panel counts: everything, the loose ones, and each folder. */
export type NotePostFolderList = {
  folders: NotePostFolder[]
  allCount: number
  noFolderCount: number
}

export type PostAuthor = { handle: string; name: string | null; pictureUrl: string | null; count: number }

export type PostFilters = {
  folder?: string
  search?: string
  author?: string
  tag?: string
  progress?: PlanProgress
}

export type NotePostPage = {
  posts: NotePostCard[]
  /** Where "Show older" carries on from, or null when there is nothing older. */
  nextCursor: string | null
  /** How many of this person's posts the similar-post check would read. */
  similarCount: number
}

/**
 * The name to show beside a handle, or null when it would only repeat it:
 * some people's display name is their handle ("@levelsio").
 */
export function distinctName(name: string | null | undefined, handle: string | null | undefined) {
  const clean = name?.trim()
  if (!clean) return null
  return handle && clean.replace(/^@/, "").toLowerCase() === handle.toLowerCase() ? null : clean
}

/** "@naval": an X handle as people write it. */
export function atHandle(handle: string | null | undefined) {
  return handle ? `@${handle}` : "X post"
}
