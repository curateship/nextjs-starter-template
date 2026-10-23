import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import type { CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { storagePathForUrl } from "@/server/media/library"
import { customShellMedia } from "@/server/schema"
import { zoneClockText } from "@/lib/social/waking"
import {
  LINKEDIN_POLL_CHOICE_CHARS,
  LINKEDIN_POLL_CHOICES,
  LINKEDIN_POLL_DAYS,
  LINKEDIN_POLL_QUESTION_CHARS,
  LINKEDIN_POST_CHARS,
  LINKEDIN_POST_KINDS,
  NEWSLETTER_BODY_CHARS,
  NEWSLETTER_TITLE_CHARS,
  linkedinPostUrl,
  linkedinSlug,
  linksIn,
  type LinkedinIncoming,
  type LinkedinPoll,
  type LinkedinPollDays,
  type LinkedinPostKind,
  type LinkedinPostStatus,
  type LinkedinTag,
} from "@/lib/social/linkedin/options"
import { linkedinMayHaveLanded, linkedinPostingRefusal } from "@/lib/social/linkedin/wording"
import { isWorkday } from "@/lib/social/linkedin/workday"

import { refuseLinkedinInteraction } from "../apart"
import { queueJob } from "../jobs"
import { redditCommentsWorthAnArticle } from "../medium/articles"
import { promoMediumArticles } from "../medium/schema"
import { mediaArgs } from "../phone-apps/posts"
import { ownedProject } from "../projects"
import { promoAccounts, promoJobs } from "../schema"
import { similarWarning } from "../x/similar"
import { linkedinComment, linkedinNewsletter, linkedinPublish } from "./calls"
import { answeredLinkedinIds, linkedinToAnswer } from "./comments"
import { checkLinkedinRules } from "./drafts"
import { ownedLinkedinFind } from "./finds"
import { projectGroup } from "./groups"
import { linkedinWritingAccount, readLinkedinPostingState, refuseLinkedinOnPhone, refuseLinkedinPage } from "./posting"
import { promoLinkedinFinds, promoLinkedinPosts } from "./schema"
import { closestLinkedinPiece } from "./similar"

/**
 * Posts of the account's own (parts 28 to 38): a post with words, a picture
 * or a video, a poll, tags; a repost with thoughts; a newsletter issue; into
 * a group or as a company page. A draft in Promo, then Post, through the
 * same warm-up, pace and workday checks as a comment. Tyler, 22 Oct 2026:
 * any LinkedIn account past its warm-up may post.
 *
 * LinkedIn shows a post with a link to fewer people, so a link typed into
 * the words is taken out, the post goes up, and the link is posted as the
 * first comment under it from the same account (part 29). Comments never
 * carry links (Tyler's answer); this first comment is the one exception, on
 * the account's own post.
 */

type PostRow = typeof promoLinkedinPosts.$inferSelect

/** Ten seconds to undo, as for a comment. */
const UNDO_SECONDS = 10

export type LinkedinPostInput = {
  accountId: string | null
  kind: LinkedinPostKind
  text: string
  title: string
  pictureUrl: string
  videoUrl: string
  poll: { question: string; choices: string[]; days: number } | null
  tags: LinkedinTag[]
  /** The find whose post a repost shares (part 33). */
  repostFindId: string | null
  groupId: string
  asPageId: string
  source: string
  /** The hour a person picked, or null for as soon as Post is pressed. */
  scheduledFor: Date | null
}

export type LinkedinPostView = {
  id: string
  account: { id: string; handle: string; onPhone: boolean } | null
  kind: LinkedinPostKind
  text: string
  title: string
  pictureUrl: string
  videoUrl: string
  poll: LinkedinPoll | null
  tags: LinkedinTag[]
  repostOf: string
  /** The project's find of the post a repost shares, so the AI can read it, or null. */
  repostFindId: string | null
  groupId: string
  asPageId: string
  firstComment: string
  firstCommentPosted: boolean
  source: string
  status: LinkedinPostStatus
  scheduledFor: Date | null
  lastError: string
  url: string
  reactions: number | null
  commentCount: number | null
  reposts: number | null
  stillVisible: boolean | null
  checkedAt: Date | null
  /** The comments under it, each saying whether Promo answered it, null until read. */
  incoming: Array<LinkedinIncoming & { answered: boolean }> | null
  toAnswer: number
  deletedAt: Date | null
  createdAt: Date
  postedAt: Date | null
  mayHaveLanded: boolean
}

function view(row: PostRow, handle: string | null, onPhone: boolean, answered: Set<string>, repostFindId: string | null): LinkedinPostView {
  return {
    id: row.id,
    account: row.accountId && handle !== null ? { id: row.accountId, handle, onPhone } : null,
    kind: row.kind,
    text: row.text,
    title: row.title,
    pictureUrl: row.pictureUrl,
    videoUrl: row.videoUrl,
    poll: row.poll,
    tags: row.tags,
    repostOf: row.repostOf,
    repostFindId,
    groupId: row.groupId,
    asPageId: row.asPageId,
    firstComment: row.firstComment,
    firstCommentPosted: Boolean(row.firstCommentId),
    source: row.source,
    status: row.status,
    scheduledFor: row.scheduledFor,
    lastError: row.lastError,
    url: row.postUrl,
    reactions: row.reactions,
    commentCount: row.commentCount,
    reposts: row.reposts,
    stillVisible: row.stillVisible,
    checkedAt: row.checkedAt,
    incoming: row.incoming?.map((item) => ({ ...item, answered: answered.has(item.id) })) ?? null,
    toAnswer: linkedinToAnswer(row.incoming, answered),
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    postedAt: row.postedAt,
    mayHaveLanded: row.status === "failed" && linkedinMayHaveLanded(row.lastError),
  }
}

/** The project's own posts, reposts and newsletter issues, newest first. */
export async function listLinkedinPosts(userId: string, projectId: string, db: CustomShellDb = defaultDb): Promise<LinkedinPostView[]> {
  await ownedProject(userId, projectId, db)
  const rows = await db
    .select({ post: promoLinkedinPosts, handle: promoAccounts.handle, phoneId: promoAccounts.phoneId })
    .from(promoLinkedinPosts)
    .leftJoin(promoAccounts, eq(promoAccounts.id, promoLinkedinPosts.accountId))
    .where(and(eq(promoLinkedinPosts.userId, userId), eq(promoLinkedinPosts.projectId, projectId)))
    .orderBy(desc(promoLinkedinPosts.createdAt))
    .limit(200)
  const answered = await answeredLinkedinIds(userId, db)
  const shared = [...new Set(rows.map(({ post }) => post.repostOf).filter(Boolean))]
  const finds = shared.length
    ? await db
        .select({ id: promoLinkedinFinds.id, postId: promoLinkedinFinds.postId })
        .from(promoLinkedinFinds)
        .where(and(eq(promoLinkedinFinds.userId, userId), eq(promoLinkedinFinds.projectId, projectId), inArray(promoLinkedinFinds.postId, shared)))
    : []
  const findOf = new Map(finds.map((find) => [find.postId, find.id]))
  return rows.map(({ post, handle, phoneId }) => view(post, handle, Boolean(phoneId), answered, findOf.get(post.repostOf) ?? null))
}

async function ownedPost(userId: string, postRowId: string, db: CustomShellDb): Promise<PostRow> {
  const [row] = await db
    .select()
    .from(promoLinkedinPosts)
    .where(and(eq(promoLinkedinPosts.id, postRowId), eq(promoLinkedinPosts.userId, userId)))
    .limit(1)
  if (!row) throw new Error("That post is not saved any more.")
  return row
}

/** Checks an account belongs to the project and is a LinkedIn account, for a draft that names one. */
async function projectLinkedinAccount(userId: string, projectId: string, accountId: string, db: CustomShellDb): Promise<void> {
  const [account] = await db
    .select({ platform: promoAccounts.platform, projectId: promoAccounts.projectId })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account || account.platform !== "linkedin") throw new Refusal("Pick a LinkedIn account first.")
  if (account.projectId !== projectId) throw new Refusal("That account is not in this project.")
}

/** The picture and video types LinkedIn takes on a post. */
const PICTURE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"])
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"])

/** LinkedIn's largest video, 5 GB, and the most the app uploads through a proxy, 500 MB. */
const VIDEO_MAX_BYTES = 500 * 1024 * 1024

/**
 * Refuses a picture or video that is not one of this person's own media
 * library files, or one LinkedIn would not take. The browser and the phone
 * only ever download Promo's own files, so no address a person typed is
 * fetched from the server or a phone.
 */
async function refuseStrangeMedia(userId: string, url: string, kind: "picture" | "video", db: CustomShellDb): Promise<void> {
  if (!url) return
  if (!/^https:\/\//.test(url)) throw new Refusal(`Pick the ${kind} from the media library.`)
  const storagePath = await storagePathForUrl(url)
  const [file] = storagePath
    ? await db
        .select({ mimeType: customShellMedia.mimeType, fileSize: customShellMedia.fileSize })
        .from(customShellMedia)
        .where(and(eq(customShellMedia.userId, userId), eq(customShellMedia.storagePath, storagePath)))
        .limit(1)
    : []
  if (!file) throw new Refusal(`Pick the ${kind} from your media library.`)
  if (kind === "picture" && !PICTURE_TYPES.has(file.mimeType)) throw new Refusal(`LinkedIn can't post that file (${file.mimeType}). Pick a JPEG, PNG, WebP or GIF picture.`)
  if (kind === "video") {
    if (!VIDEO_TYPES.has(file.mimeType)) throw new Refusal(`LinkedIn can't post that file (${file.mimeType}). Pick an MP4, MOV or WebM video.`)
    if (Number(file.fileSize) > VIDEO_MAX_BYTES) throw new Refusal("That video is over 500 MB, more than the app uploads through a proxy. Pick a shorter one.")
  }
}

/** Refuses a poll LinkedIn would not take: a question of 140 characters, two to four answers of 30, open 1, 3, 7 or 14 days. */
function cleanPoll(poll: LinkedinPostInput["poll"]): LinkedinPoll | null {
  if (!poll) return null
  const question = poll.question.trim()
  if (!question) throw new Refusal("Write the poll's question first.")
  if (question.length > LINKEDIN_POLL_QUESTION_CHARS) throw new Refusal(`The poll's question is at most ${LINKEDIN_POLL_QUESTION_CHARS} characters.`)
  const choices = poll.choices.map((choice) => choice.trim()).filter(Boolean)
  if (choices.length < LINKEDIN_POLL_CHOICES.min || choices.length > LINKEDIN_POLL_CHOICES.max) {
    throw new Refusal(`A poll has ${LINKEDIN_POLL_CHOICES.min} to ${LINKEDIN_POLL_CHOICES.max} answers.`)
  }
  if (choices.some((choice) => choice.length > LINKEDIN_POLL_CHOICE_CHARS)) throw new Refusal(`Each poll answer is at most ${LINKEDIN_POLL_CHOICE_CHARS} characters.`)
  if (!(LINKEDIN_POLL_DAYS as readonly number[]).includes(poll.days)) throw new Refusal("A poll stays open 1 day, 3 days, 1 week or 2 weeks.")
  return { question, choices, days: poll.days as LinkedinPollDays, votes: null }
}

/** Tags as stored: each a person or page with a slug and the name typed after @, at most ten. */
function cleanTags(tags: LinkedinTag[], text: string): LinkedinTag[] {
  if (tags.length > 10) throw new Refusal("A post here tags at most ten people or pages.")
  return tags.map((tag) => {
    const slug = linkedinSlug(tag.slug, tag.kind)
    const name = tag.name.trim().slice(0, 100)
    if (!slug || !name) throw new Refusal("Each tag needs the person's or page's name and the address of their page.")
    if (!text.includes(`@${name}`)) throw new Refusal(`The words don't hold @${name}. Type it where the tag goes.`)
    return { name, slug, kind: tag.kind }
  })
}

/**
 * Takes the links out of a post's words (part 29). The first one becomes the
 * first comment under the post; the words keep the rest of the sentence.
 */
export function splitFirstLink(text: string): { text: string; firstComment: string } {
  const [first] = linksIn(text)
  if (!first) return { text: text.trim(), firstComment: "" }
  const words = text
    .replace(/https?:\/\/[^\s<>"']+/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
  return { text: words, firstComment: first.slice(0, 600) }
}

/** Saves a new draft, or changes one that has not gone out. Returns its id. */
export async function saveLinkedinPost(
  userId: string,
  projectId: string,
  postRowId: string | null,
  input: LinkedinPostInput,
  db: CustomShellDb = defaultDb
): Promise<string> {
  await ownedProject(userId, projectId, db)
  if (!LINKEDIN_POST_KINDS.includes(input.kind)) throw new Error("That is not a kind of post Promo makes.")
  if (input.accountId) await projectLinkedinAccount(userId, projectId, input.accountId, db)
  if (input.groupId && !(await projectGroup(userId, projectId, input.groupId, db))) throw new Refusal("Add that group to the project's groups first.")
  let repostOf = ""
  if (input.kind === "repost") {
    // A repost draft saved again keeps the post it shares; only a new one names it by its find.
    const kept = !input.repostFindId && postRowId ? (await ownedPost(userId, postRowId, db)).repostOf : ""
    const find = input.repostFindId ? await ownedLinkedinFind(userId, input.repostFindId, db) : null
    if (find && find.projectId !== projectId) throw new Refusal("Pick the post to repost from the project's LinkedIn posts.")
    repostOf = find?.postId ?? kept
    if (!repostOf) throw new Refusal("Pick the post to repost from the project's LinkedIn posts.")
  }
  const { text, firstComment } = input.kind === "post" ? splitFirstLink(input.text) : { text: input.text.trim(), firstComment: "" }
  const limit = input.kind === "newsletter" ? NEWSLETTER_BODY_CHARS : LINKEDIN_POST_CHARS
  if (text.length > limit) throw new Refusal(`That is ${text.length} characters. LinkedIn takes ${limit}.`)
  if (input.kind === "newsletter" && input.title.trim().length > NEWSLETTER_TITLE_CHARS) throw new Refusal(`The title is at most ${NEWSLETTER_TITLE_CHARS} characters.`)
  if (input.kind === "newsletter" && input.groupId) throw new Refusal("A newsletter issue goes to the account's subscribers, not into a group.")
  const pictureUrl = input.pictureUrl.trim().slice(0, 2_048)
  const videoUrl = input.kind === "post" ? input.videoUrl.trim().slice(0, 2_048) : ""
  await refuseStrangeMedia(userId, pictureUrl, "picture", db)
  await refuseStrangeMedia(userId, videoUrl, "video", db)
  const poll = input.kind === "post" ? cleanPoll(input.poll) : null
  if ([pictureUrl && input.kind === "post", videoUrl, poll].filter(Boolean).length > 1) throw new Refusal("A post carries one of a picture, a video or a poll.")
  const values = {
    accountId: input.accountId,
    kind: input.kind,
    text,
    title: input.kind === "newsletter" ? input.title.trim() : "",
    pictureUrl,
    videoUrl,
    poll,
    tags: input.kind === "newsletter" ? [] : cleanTags(input.tags, text),
    repostOf,
    groupId: input.groupId,
    asPageId: input.asPageId,
    firstComment,
    source: input.source.slice(0, 80),
    scheduledFor: input.scheduledFor,
    updatedAt: new Date(),
  }
  if (!postRowId) {
    const id = uuid()
    await db.insert(promoLinkedinPosts).values({ id, userId, projectId, ...values })
    return id
  }
  const row = await ownedPost(userId, postRowId, db)
  if (row.projectId !== projectId) throw new Error("That post is in another project.")
  if (row.postId) throw new Refusal("This post is on LinkedIn already, so it can't be changed here. Edit it from the Posts tab.")
  // Written only while it is still a draft or a failure, so a save that
  // lands after Post was pressed never changes words that were checked.
  const saved = await db
    .update(promoLinkedinPosts)
    .set(values)
    .where(and(eq(promoLinkedinPosts.id, row.id), inArray(promoLinkedinPosts.status, ["draft", "failed"])))
    .returning({ id: promoLinkedinPosts.id })
  if (!saved.length) throw new Refusal("That post has gone to LinkedIn or is on its way, so it can't be changed here.")
  return row.id
}

/** Deletes a draft that never went to LinkedIn. */
export async function deleteLinkedinDraftPost(userId: string, postRowId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const row = await ownedPost(userId, postRowId, db)
  if (row.status === "waiting" || row.status === "posted" || row.postId) throw new Refusal("This post went to LinkedIn. Delete it from LinkedIn with Delete on the Posts tab.")
  await db.delete(promoLinkedinPosts).where(eq(promoLinkedinPosts.id, row.id))
}

/**
 * Refuses a post into a group whose rules it breaks (part 37). The rules,
 * read off the group or pasted by hand, are checked by the AI the same way
 * the Check rules button checks them; a group with no rules saved checks
 * nothing. `check` is the AI's check, passed in by the tests.
 */
export async function refuseGroupRules(
  userId: string,
  projectId: string,
  text: string,
  rules: string,
  check: typeof checkLinkedinRules = checkLinkedinRules
): Promise<void> {
  if (!rules.trim()) return
  const verdict = await check(userId, { projectId, text, groupRules: rules, isComment: false })
  if (!verdict.ok) throw new Refusal(`The group's rules don't allow this post: ${verdict.problems.join(" ")}`)
}

export type QueuedLinkedinPost = { jobId: string; runAfter: Date | null; undoUntil: Date | null; similarTo: string }

/**
 * Queues a post a person pressed Post for, or refuses it with why. A picked
 * hour must be inside the account's workday (part 7); with no hour it goes at
 * once, or at the next workday morning.
 */
export async function queueLinkedinPublish(userId: string, postRowId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<QueuedLinkedinPost> {
  const row = await ownedPost(userId, postRowId, db)
  if (row.status === "waiting") throw new Refusal("This post is already on its way.")
  if (row.status === "posted") throw new Refusal("This post is on LinkedIn already.")
  if (!row.accountId) throw new Refusal("Pick the account it goes out as first.")
  const account = await linkedinWritingAccount(userId, row.accountId, db)
  if (account.projectId !== row.projectId) throw new Refusal("That account is not in this post's project any more.")
  if (row.kind === "newsletter") {
    if (!row.title.trim()) throw new Refusal("Give the issue a title first.")
    if (!row.text.trim()) throw new Refusal("Write the issue first.")
    refuseLinkedinOnPhone(account, "A newsletter issue")
  } else if (!row.text.trim() && row.kind === "post") {
    throw new Refusal("Write the post first.")
  }
  if (row.kind === "repost") refuseLinkedinOnPhone(account, "A repost")
  // The app never says where a phone's post landed, so its first comment with the link could never follow.
  if (row.firstComment) refuseLinkedinOnPhone(account, "A post with a link")
  if (row.poll) refuseLinkedinOnPhone(account, "A poll")
  if (row.videoUrl) refuseLinkedinOnPhone(account, "A video")
  if (row.tags.length) refuseLinkedinOnPhone(account, "Tagging people")
  if (row.groupId) {
    refuseLinkedinOnPhone(account, "Posting into a group")
    const group = await projectGroup(userId, row.projectId, row.groupId, db)
    if (!group) throw new Refusal("That group is not one of the project's groups any more.")
    await refuseGroupRules(userId, row.projectId ?? "", [row.text, row.firstComment].filter(Boolean).join("\n"), group.rules)
  }
  if (row.asPageId) refuseLinkedinOnPhone(account, "Posting as a company page")
  await refuseLinkedinPage(userId, account, row.asPageId, db)
  await refuseStrangeMedia(userId, row.pictureUrl, "picture", db)
  await refuseStrangeMedia(userId, row.videoUrl, "video", db)
  // The LinkedIn app looks nowhere before it types, so a phone's failure that
  // may have landed is never sent again from here (nothing is tried twice).
  if (row.status === "failed" && account.phoneId && linkedinMayHaveLanded(row.lastError)) {
    throw new Refusal("This went from a phone and may already be on LinkedIn. Look at the account's page first. If it isn't there, delete this draft and write it again.")
  }
  await refuseLinkedinInteraction(userId, account, { words: [row.title, row.text, row.firstComment], tags: row.tags.filter((tag) => tag.kind === "person").map((tag) => tag.slug) }, db)
  if (row.repostOf) {
    const [find] = await db
      .select({ authorSlug: promoLinkedinFinds.authorSlug, authorKind: promoLinkedinFinds.authorKind })
      .from(promoLinkedinFinds)
      .where(and(eq(promoLinkedinFinds.userId, userId), eq(promoLinkedinFinds.postId, row.repostOf)))
      .limit(1)
    await refuseLinkedinInteraction(userId, account, { postAuthor: find?.authorKind === "person" ? find.authorSlug : undefined, repostOf: row.repostOf, words: [] }, db)
  }

  const state = await readLinkedinPostingState(userId, account, db, now)
  const refusal = linkedinPostingRefusal(state, now, state.timeZone)
  if (refusal) throw new Refusal(refusal)
  let runAfter: Date | null = state.nextWorkAt
  // A failed post is tried again now, whatever hour it was set for.
  if (row.scheduledFor && row.status !== "failed") {
    if (row.scheduledFor.getTime() <= now.getTime()) throw new Refusal("That time has passed. Pick a later one, or clear it to post now.")
    if (!isWorkday(row.scheduledFor, state.timeZone)) {
      throw new Refusal(`${zoneClockText(row.scheduledFor, state.timeZone)} is outside the account's workday (weekdays, 8:00 to 18:00), so it would never post then. Pick a time inside it.`)
    }
    runAfter = row.scheduledFor
  }
  const close = await closestLinkedinPiece(userId, account.id, `${row.title}\n${row.text}`, db)
  const similarTo = close ? similarWarning(close) : ""
  const undoUntil = runAfter ? null : new Date(now.getTime() + UNDO_SECONDS * 1000)
  const jobId = uuid()
  // Under the account's lock, the one comments take, so a post and a comment
  // pressed together can't both pass a pace with one place left.
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`promo-linkedin-write:${account.id}`}))`)
    const paced = await readLinkedinPostingState(userId, account, tx, now)
    const late = linkedinPostingRefusal(paced, now, paced.timeZone)
    if (late) throw new Refusal(late)
    // Moved to waiting only from where it was, so two presses at once queue one job.
    const moved = await tx
      .update(promoLinkedinPosts)
      .set({ status: "waiting", jobId, lastError: "", updatedAt: now })
      .where(and(eq(promoLinkedinPosts.id, row.id), eq(promoLinkedinPosts.status, row.status)))
      .returning({ id: promoLinkedinPosts.id })
    if (!moved.length) throw new Refusal("This post is already on its way.")
    await queueJob(userId, "linkedin_publish", { postRowId: row.id, accountId: account.id }, tx, runAfter ?? undoUntil, jobId)
  })
  return { jobId, runAfter, undoUntil, similarTo }
}

/** Takes back a post still waiting: in its ten seconds, or before its hour. */
export async function cancelLinkedinPublish(userId: string, postRowId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const row = await ownedPost(userId, postRowId, db)
  if (row.status !== "waiting" || !row.jobId) throw new Error("That post is no longer waiting.")
  const removed = await db
    .delete(promoJobs)
    .where(and(eq(promoJobs.id, row.jobId), eq(promoJobs.userId, userId), eq(promoJobs.status, "queued")))
    .returning({ id: promoJobs.id })
  if (!removed.length) throw new Error("That post is no longer waiting. It may have started going to LinkedIn.")
  await db.update(promoLinkedinPosts).set({ status: "draft", jobId: null, updatedAt: new Date() }).where(eq(promoLinkedinPosts.id, row.id))
}

/**
 * Posts one waiting post from the account's browser or phone, then its
 * first comment with the link (part 29), a minute later in the same job. The
 * post's id is written the moment LinkedIn takes it, so a failure on the
 * first comment never posts the post again: Try again then only posts the
 * comment.
 *
 * On a phone the LinkedIn app does not show where a post landed: it is
 * marked posted with no id, and a search account looks it up a minute later;
 * a link waits for that look before its first comment can go.
 */
export async function runLinkedinPublish(
  userId: string,
  postRowId: string,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const row = await ownedPost(userId, postRowId, db)
  if (row.status !== "waiting") throw new Refusal("That post has been dealt with already.")
  const [account] = row.accountId ? await db.select({ phoneId: promoAccounts.phoneId }).from(promoAccounts).where(eq(promoAccounts.id, row.accountId)).limit(1) : []
  const onPhone = Boolean(account?.phoneId)
  const fail = async (error: unknown, where: string) => {
    const message = error instanceof Error ? error.message : String(error)
    await db
      .update(promoLinkedinPosts)
      .set({ status: "failed", lastError: `${where}${message}`.slice(0, 2_000), updatedAt: new Date() })
      .where(eq(promoLinkedinPosts.id, row.id))
    throw error
  }
  let postId = row.postId
  if (!postId) {
    try {
      const since = Math.floor(row.createdAt.getTime() / 1000)
      const sent =
        row.kind === "newsletter"
          ? await linkedinNewsletter(target, { title: row.title, body: row.text, coverUrl: row.pictureUrl, since })
          : await linkedinPublish(target, {
              text: row.text,
              pictureUrl: row.pictureUrl && onPhone ? (await mediaArgs(userId, account?.phoneId ?? null, row.pictureUrl, db, now)).mediaUrl : row.pictureUrl,
              videoUrl: row.videoUrl,
              poll: row.poll ? { question: row.poll.question, choices: row.poll.choices, days: row.poll.days } : null,
              tags: row.tags,
              repostOf: row.repostOf,
              groupId: row.groupId,
              asPageId: row.asPageId,
              since,
            })
      postId = /^\d{10,25}$/.test(sent.postId) ? sent.postId : ""
      if (!postId && !onPhone) throw new Error("LinkedIn took the post but did not say where it landed. Look at the account's page before trying again.")
    } catch (error) {
      return fail(error, "")
    }
    await db
      .update(promoLinkedinPosts)
      .set({ postId, postUrl: postId ? linkedinPostUrl(postId) : "", updatedAt: new Date() })
      .where(eq(promoLinkedinPosts.id, row.id))
  }
  if (row.firstComment && postId && !row.firstCommentId) {
    try {
      const sent = await linkedinComment(target, { postId, parentCommentId: "", text: row.firstComment, react: false, asPageId: row.asPageId })
      const commentId = /^\d{3,40}$/.test(sent.commentId) ? sent.commentId : "posted"
      await db.update(promoLinkedinPosts).set({ firstCommentId: commentId, updatedAt: new Date() }).where(eq(promoLinkedinPosts.id, row.id))
    } catch (error) {
      return fail(error, "The post is up, but its first comment with the link did not go: ")
    }
  }
  const [posted] = await db
    .update(promoLinkedinPosts)
    .set({ status: "posted", postedAt: row.postedAt ?? now, lastError: "", updatedAt: now })
    .where(and(eq(promoLinkedinPosts.id, row.id), eq(promoLinkedinPosts.status, "waiting")))
    .returning({ id: promoLinkedinPosts.id })
  if (!posted) return
  if (row.accountId) await db.update(promoAccounts).set({ lastPostedAt: now }).where(eq(promoAccounts.id, row.accountId))
  if (!postId) {
    try {
      await queueJob(userId, "linkedin_check", { postRowId: row.id }, db, new Date(now.getTime() + 60_000))
    } catch (error) {
      console.warn(`LinkedIn post ${row.id} went out, but where it landed can't be looked up: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

export type LinkedinPostSource = {
  /** `medium:<article id>` or `reddit:<comment id>`. */
  source: string
  label: string
  text: string
}

/**
 * What a post or newsletter issue can start from: the project's published
 * Medium articles (part 36) and its best Reddit comments still up (part 34).
 */
export async function linkedinPostSources(userId: string, projectId: string, db: CustomShellDb = defaultDb): Promise<LinkedinPostSource[]> {
  await ownedProject(userId, projectId, db)
  const articles = await db
    .select({ id: promoMediumArticles.id, title: promoMediumArticles.title, body: promoMediumArticles.body })
    .from(promoMediumArticles)
    .where(
      and(
        eq(promoMediumArticles.userId, userId),
        eq(promoMediumArticles.projectId, projectId),
        eq(promoMediumArticles.status, "published"),
        isNull(promoMediumArticles.deletedAt),
        ne(promoMediumArticles.url, "")
      )
    )
    .orderBy(desc(promoMediumArticles.publishedAt))
    .limit(10)
  const comments = await redditCommentsWorthAnArticle(userId, projectId, db)
  return [
    ...articles.map((article) => ({ source: `medium:${article.id}`, label: `Medium article: ${article.title}`, text: `${article.title}\n\n${article.body}` })),
    ...comments.map((comment) => ({
      source: `reddit:${comment.id}`,
      label: `Reddit comment${comment.upvotes === null ? "" : `, ${comment.upvotes} upvotes`}: ${comment.postTitle}`,
      text: comment.text,
    })),
  ]
}
