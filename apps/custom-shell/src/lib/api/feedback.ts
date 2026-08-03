import { createServerFn } from "@tanstack/react-start"
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { deleteMediaAsAdmin, findOwnedImageByUrl } from "@/server/media"
import { getPublicMediaUrl } from "@/server/media-storage"
import { enforceRateLimit } from "@/server/rate-limit"
import {
  customShellFeedback,
  customShellFeedbackComments,
  customShellMedia,
  customShellNotifications,
  customShellFeedbackVotes,
  customShellUsers,
  type CustomShellFeedback,
  type CustomShellFeedbackComment,
  type CustomShellUser,
} from "@/server/schema"
import { now, uuid } from "@/server/security"
import { adminPost, userGet, userPost } from "@/server/guards"
import {
  FEEDBACK_STATUSES,
  type FeedbackStatus,
} from "@/lib/feedback-status"
import {
  FEEDBACK_TAGS,
  MAX_FEEDBACK_TAGS,
  type FeedbackTag,
} from "@/lib/feedback-tags"

export type FeedbackType = "suggestion" | "bug_report" | "question" | "praise"

/** The orders the board can list in, decided by the server's query. */
export type FeedbackSort = "recent" | "most_votes" | "most_comments"

export type FeedbackListOptions = {
  type?: FeedbackType | "all"
  tag?: FeedbackTag | "all"
  status?: FeedbackStatus | "all"
  sort?: FeedbackSort
}

export type FeedbackItem = {
  id: string
  type: FeedbackType
  status: FeedbackStatus
  tags: FeedbackTag[]
  message: string
  author_name: string
  created_at: string
  updated_at: string
  vote_count: number
  comment_count: number
  has_voted: boolean
  /**
   * The screenshot's address — only ever filled in for the item's own author
   * and for admins. Everyone else gets null, decided on the server, so the
   * picture never rides along to people it was not meant for.
   */
  attachment_url: string | null
}

export type FeedbackCommentItem = {
  id: string
  feedback_id: string
  feedback_message: string
  feedback_type: FeedbackType
  message: string
  author_name: string
  created_at: string
  updated_at: string
  can_edit: boolean
  can_delete: boolean
  /**
   * The signed-in person wrote this one. `can_edit` cannot stand in for it: an
   * admin can edit everybody's comments, so it is true on comments that are
   * not theirs.
   */
  is_own: boolean
}

type FeedbackListResponse = {
  feedback: FeedbackItem[]
}

type FeedbackCommentListResponse = {
  comments: FeedbackCommentItem[]
}

type FeedbackCreatePayload = {
  type: FeedbackType
  tags: FeedbackTag[]
  message: string
  /** A media URL fresh from the picker; the server checks it is the author's. */
  attachmentUrl?: string
}

type FeedbackUpdatePayload = {
  feedbackId: string
  type: FeedbackType
  status: FeedbackStatus
  tags: FeedbackTag[]
  message: string
}

type FeedbackMergePayload = {
  /** The duplicate that goes away. */
  sourceId: string
  /** The item that keeps everything. */
  targetId: string
}

type FeedbackCommentCreatePayload = {
  feedbackId: string
  message: string
}

type FeedbackCommentUpdatePayload = {
  commentId: string
  message: string
}

const feedbackTagsSchema = z.array(z.enum(FEEDBACK_TAGS)).max(MAX_FEEDBACK_TAGS)

const createFeedbackSchema = z.object({
  type: z.enum(["suggestion", "bug_report", "question", "praise"]),
  tags: feedbackTagsSchema,
  message: z.string().min(1).max(5000),
  attachmentUrl: z.string().trim().min(1).max(2000).optional(),
})

const listFeedbackSchema = z.object({
  type: z
    .enum(["all", "suggestion", "bug_report", "question", "praise"])
    .default("all"),
  tag: z.enum(["all", ...FEEDBACK_TAGS]).default("all"),
  status: z.enum(["all", ...FEEDBACK_STATUSES]).default("all"),
  sort: z.enum(["recent", "most_votes", "most_comments"]).default("recent"),
})

const updateFeedbackSchema = z.object({
  feedbackId: z.string().min(1),
  type: z.enum(["suggestion", "bug_report", "question", "praise"]),
  status: z.enum(FEEDBACK_STATUSES),
  tags: feedbackTagsSchema,
  message: z.string().min(1).max(5000),
})

const mergeFeedbackSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
})

const feedbackIdSchema = z.object({
  feedbackId: z.string().min(1),
})

const feedbackIdsSchema = z.object({
  feedbackIds: z.array(z.string().min(1)).min(1),
})

const createFeedbackCommentSchema = z.object({
  feedbackId: z.string().min(1),
  message: z.string().min(1).max(5000),
})

const updateFeedbackCommentSchema = z.object({
  commentId: z.string().min(1),
  message: z.string().min(1).max(5000),
})

const feedbackCommentIdSchema = z.object({
  commentId: z.string().min(1),
})

export function getFeedbackErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (message.includes("RATE_LIMITED")) {
    return "You're posting quickly. Please wait a few minutes and try again."
  }
  return message || "Feedback request failed."
}

const listFeedbackFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(listFeedbackSchema)
  .handler(async ({ data, context }): Promise<FeedbackListResponse> => {
    const filters = []
    if (data.type !== "all") {
      filters.push(eq(customShellFeedback.type, data.type))
    }
    if (data.tag !== "all") {
      filters.push(
        sql`${customShellFeedback.tags} @> ARRAY[${data.tag}]::text[]`
      )
    }
    if (data.status !== "all") {
      filters.push(eq(customShellFeedback.status, data.status))
    }

    // The counts are counted here, in the query, so the order is the
    // database's answer — the board must not need every row shipped over
    // just to know which has the most votes. Ties fall back to newest first,
    // so the order never shuffles between reloads.
    const voteCount = sql<number>`(select count(*) from ${customShellFeedbackVotes} where ${customShellFeedbackVotes.feedbackId} = ${customShellFeedback.id})`
    const commentCount = sql<number>`(select count(*) from ${customShellFeedbackComments} where ${customShellFeedbackComments.feedbackId} = ${customShellFeedback.id})`
    const order =
      data.sort === "most_votes"
        ? [desc(voteCount), desc(customShellFeedback.createdAt)]
        : data.sort === "most_comments"
          ? [desc(commentCount), desc(customShellFeedback.createdAt)]
          : [desc(customShellFeedback.createdAt)]

    const rows = await db
      .select()
      .from(customShellFeedback)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(...order)

    return { feedback: await serializeFeedbackRows(rows, context.user) }
  })

const createFeedbackFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(createFeedbackSchema)
  .handler(async ({ data, context }): Promise<FeedbackItem> => {
    const message = data.message.trim()

    if (!message) {
      throw new Error("Message is required")
    }

    await enforceRateLimit(`feedback-create:${context.user.id}`, {
      maxAttempts: 10,
      windowSeconds: 10 * 60,
    })

    // The picture must be one of the author's own uploads. Anything else — a
    // typed address, somebody else's file, a video — is refused rather than
    // quietly dropped, so the author never posts believing a screenshot went
    // along when it did not.
    let attachmentMediaId: string | null = null
    if (data.attachmentUrl) {
      const media = await findOwnedImageByUrl(
        context.user.id,
        data.attachmentUrl
      )
      if (!media) {
        throw new Error("That screenshot is not one of your uploaded images.")
      }
      attachmentMediaId = media.id
    }

    const createdAt = now()
    const row = {
      id: uuid(),
      userId: context.user.id,
      type: data.type,
      status: "open",
      tags: dedupeTags(data.tags),
      message,
      attachmentMediaId,
      createdAt,
      updatedAt: createdAt,
    }

    await db.insert(customShellFeedback).values(row)
    return serializeFeedbackRow(
      row,
      context.user.name,
      0,
      0,
      false,
      // The author is looking at their own item, so the URL they just picked
      // simply comes back — no second lookup needed.
      attachmentMediaId ? (data.attachmentUrl ?? null) : null
    )
  })

const updateFeedbackFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(updateFeedbackSchema)
  .handler(async ({ data, context }): Promise<FeedbackItem> => {
    const message = data.message.trim()

    if (!message) {
      throw new Error("Message is required")
    }

    const [row] = await db
      .update(customShellFeedback)
      .set({
        type: data.type,
        status: data.status,
        tags: dedupeTags(data.tags),
        message,
        updatedAt: now(),
      })
      .where(eq(customShellFeedback.id, data.feedbackId))
      .returning()

    if (!row) {
      throw new Error("Feedback not found")
    }

    return serializeFeedbackWithMeta(row, context.user)
  })

const deleteFeedbackFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(feedbackIdSchema)
  .handler(async ({ data }): Promise<{ feedbackId: string }> => {
    const [row] = await db
      .delete(customShellFeedback)
      .where(eq(customShellFeedback.id, data.feedbackId))
      .returning({
        id: customShellFeedback.id,
        attachmentMediaId: customShellFeedback.attachmentMediaId,
      })

    if (!row) {
      throw new Error("Feedback not found")
    }

    await deleteFeedbackAttachments(
      row.attachmentMediaId ? [row.attachmentMediaId] : []
    )

    return { feedbackId: row.id }
  })

const deleteFeedbackManyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(feedbackIdsSchema)
  .handler(async ({ data }): Promise<{ feedbackIds: string[] }> => {
    const rows = await db
      .delete(customShellFeedback)
      .where(inArray(customShellFeedback.id, data.feedbackIds))
      .returning({
        id: customShellFeedback.id,
        attachmentMediaId: customShellFeedback.attachmentMediaId,
      })

    await deleteFeedbackAttachments(
      rows.flatMap((row) =>
        row.attachmentMediaId ? [row.attachmentMediaId] : []
      )
    )

    return { feedbackIds: rows.map((row) => row.id) }
  })

const toggleFeedbackVoteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(feedbackIdSchema)
  .handler(async ({ data, context }): Promise<FeedbackItem> => {
    const [row] = await db
      .select()
      .from(customShellFeedback)
      .where(eq(customShellFeedback.id, data.feedbackId))
      .limit(1)

    if (!row) {
      throw new Error("Feedback not found")
    }
    const [existingVote] = await db
      .select()
      .from(customShellFeedbackVotes)
      .where(
        and(
          eq(customShellFeedbackVotes.feedbackId, data.feedbackId),
          eq(customShellFeedbackVotes.userId, context.user.id)
        )
      )
      .limit(1)

    const hasVoted = !existingVote
    if (existingVote) {
      await db
        .delete(customShellFeedbackVotes)
        .where(eq(customShellFeedbackVotes.id, existingVote.id))
    } else {
      await db.transaction(async (tx) => {
        const createdAt = now()
        const [vote] = await tx
          .insert(customShellFeedbackVotes)
          .values({
            id: uuid(),
            feedbackId: data.feedbackId,
            userId: context.user.id,
            createdAt,
          })
          .returning({ id: customShellFeedbackVotes.id })

        if (!vote) {
          throw new Error("Vote was not created")
        }

        if (shouldNotifyFeedbackAuthor(row, context.user)) {
          await tx.insert(customShellNotifications).values({
            id: uuid(),
            recipientUserId: row.userId,
            actorUserId: context.user.id,
            feedbackId: row.id,
            type: "feedback_vote",
            feedbackVoteId: vote.id,
            createdAt,
          })
        }
      })
    }

    // The vote is already written; these four only describe the result, so
    // they go out together instead of one at a time.
    const [[voteCount], [author], commentCount, attachmentUrls] =
      await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(customShellFeedbackVotes)
          .where(eq(customShellFeedbackVotes.feedbackId, row.id)),

        db
          .select({ name: customShellUsers.name })
          .from(customShellUsers)
          .where(eq(customShellUsers.id, row.userId))
          .limit(1),

        getFeedbackCommentCount(row.id),

        loadAttachmentUrls([row], context.user),
      ])

    return serializeFeedbackRow(
      row,
      author?.name ?? "Unknown",
      voteCount?.count ?? 0,
      commentCount,
      hasVoted,
      attachmentUrls.get(row.id) ?? null
    )
  })

const mergeFeedbackFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(mergeFeedbackSchema)
  .handler(async ({ data, context }): Promise<FeedbackItem> => {
    if (data.sourceId === data.targetId) {
      throw new Error("Pick two different feedback items to merge.")
    }

    // Everything moves in one transaction: a merge that fails halfway would
    // otherwise leave votes on one item and comments on another with no record
    // of which. The duplicate's screenshot cannot be erased in here — the file
    // lives outside the database — so its id comes back out for cleanup after
    // the merge itself is safely done.
    const { leftoverAttachmentId } = await db.transaction(
      async (tx) => {
        const [source] = await tx
          .select()
          .from(customShellFeedback)
          .where(eq(customShellFeedback.id, data.sourceId))
          .limit(1)
        const [target] = await tx
          .select()
          .from(customShellFeedback)
          .where(eq(customShellFeedback.id, data.targetId))
          .limit(1)

        if (!source || !target) {
          throw new Error("Feedback not found")
        }

        // Somebody who voted on both counts once: their duplicate vote goes,
        // and deleting it takes its "thumbs up" notice along via the vote's
        // own cascade.
        await tx
          .delete(customShellFeedbackVotes)
          .where(
            and(
              eq(customShellFeedbackVotes.feedbackId, source.id),
              sql`${customShellFeedbackVotes.userId} in (select "user_id" from ${customShellFeedbackVotes} where "feedback_id" = ${target.id})`
            )
          )

        // The remaining votes and every comment simply change address.
        await tx
          .update(customShellFeedbackVotes)
          .set({ feedbackId: target.id })
          .where(eq(customShellFeedbackVotes.feedbackId, source.id))
        await tx
          .update(customShellFeedbackComments)
          .set({ feedbackId: target.id })
          .where(eq(customShellFeedbackComments.feedbackId, source.id))

        // Old notices about the duplicate follow their votes and comments to
        // the surviving item instead of being wiped by the delete below.
        await tx
          .update(customShellNotifications)
          .set({ feedbackId: target.id })
          .where(eq(customShellNotifications.feedbackId, source.id))

        // The screenshot moves only into an empty slot; a target with its own
        // picture keeps it, and the duplicate's file is erased afterwards.
        let leftoverAttachmentId: string | null = null
        if (source.attachmentMediaId) {
          if (target.attachmentMediaId) {
            leftoverAttachmentId = source.attachmentMediaId
          } else {
            await tx
              .update(customShellFeedback)
              .set({
                attachmentMediaId: source.attachmentMediaId,
                updatedAt: now(),
              })
              .where(eq(customShellFeedback.id, target.id))
          }
        }

        if (shouldNotifyFeedbackAuthor(source, context.user)) {
          await tx.insert(customShellNotifications).values({
            id: uuid(),
            recipientUserId: source.userId,
            actorUserId: context.user.id,
            feedbackId: target.id,
            type: "feedback_merged",
            createdAt: now(),
          })
        }

        await tx
          .delete(customShellFeedback)
          .where(eq(customShellFeedback.id, source.id))

        return { leftoverAttachmentId }
      }
    )

    await deleteFeedbackAttachments(
      leftoverAttachmentId ? [leftoverAttachmentId] : []
    )

    // Read back rather than reusing the row from inside the transaction, which
    // would not know about a screenshot that just moved across.
    return serializeFeedbackWithMeta(
      await requireFeedback(data.targetId),
      context.user
    )
  })

const listFeedbackCommentsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(feedbackIdSchema)
  .handler(async ({ data, context }): Promise<FeedbackCommentListResponse> => {
    const rows = await db
      .select()
      .from(customShellFeedbackComments)
      .where(eq(customShellFeedbackComments.feedbackId, data.feedbackId))
      .orderBy(asc(customShellFeedbackComments.createdAt))

    return { comments: await serializeFeedbackCommentRows(rows, context.user) }
  })

const createFeedbackCommentFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(createFeedbackCommentSchema)
  .handler(async ({ data, context }): Promise<FeedbackCommentItem> => {
    const message = data.message.trim()

    if (!message) {
      throw new Error("Comment is required")
    }

    await enforceRateLimit(`feedback-comment:${context.user.id}`, {
      maxAttempts: 20,
      windowSeconds: 10 * 60,
    })

    const feedback = await requireFeedback(data.feedbackId)

    const createdAt = now()
    const row = await db.transaction(async (tx) => {
      const [comment] = await tx
        .insert(customShellFeedbackComments)
        .values({
          id: uuid(),
          feedbackId: data.feedbackId,
          userId: context.user.id,
          message,
          createdAt,
          updatedAt: createdAt,
        })
        .returning()

      if (!comment) {
        throw new Error("Comment was not created")
      }

      if (shouldNotifyFeedbackAuthor(feedback, context.user)) {
        await tx.insert(customShellNotifications).values({
          id: uuid(),
          recipientUserId: feedback.userId,
          actorUserId: context.user.id,
          feedbackId: feedback.id,
          type: "feedback_comment",
          feedbackCommentId: comment.id,
          createdAt,
        })
      }

      return comment
    })

    return serializeFeedbackCommentWithMeta(row, context.user)
  })

const updateFeedbackCommentFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(updateFeedbackCommentSchema)
  .handler(async ({ data, context }): Promise<FeedbackCommentItem> => {
    const message = data.message.trim()

    if (!message) {
      throw new Error("Comment is required")
    }

    const comment = await requireFeedbackComment(data.commentId)
    if (!canManageFeedbackComment(comment, context.user)) {
      throw new Error("Not authorized")
    }

    const [row] = await db
      .update(customShellFeedbackComments)
      .set({ message, updatedAt: now() })
      .where(eq(customShellFeedbackComments.id, data.commentId))
      .returning()

    if (!row) {
      throw new Error("Comment not found")
    }

    return serializeFeedbackCommentWithMeta(row, context.user)
  })

const deleteFeedbackCommentFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(feedbackCommentIdSchema)
  .handler(
    async ({ data, context }): Promise<{ commentId: string; feedbackId: string }> => {
      const comment = await requireFeedbackComment(data.commentId)

      if (!canManageFeedbackComment(comment, context.user)) {
        throw new Error("Not authorized")
      }

      const [row] = await db
        .delete(customShellFeedbackComments)
        .where(eq(customShellFeedbackComments.id, data.commentId))
        .returning({
          id: customShellFeedbackComments.id,
          feedbackId: customShellFeedbackComments.feedbackId,
        })

      if (!row) {
        throw new Error("Comment not found")
      }

      return { commentId: row.id, feedbackId: row.feedbackId }
    }
  )

export function listFeedback(options: FeedbackListOptions = {}) {
  return listFeedbackFn({
    data: {
      type: options.type ?? "all",
      tag: options.tag ?? "all",
      status: options.status ?? "all",
      sort: options.sort ?? "recent",
    },
  })
}

export function createFeedback(payload: FeedbackCreatePayload) {
  return createFeedbackFn({ data: payload })
}

export function updateFeedback(payload: FeedbackUpdatePayload) {
  return updateFeedbackFn({ data: payload })
}

export function deleteFeedback(feedbackId: string) {
  return deleteFeedbackFn({ data: { feedbackId } })
}

export function deleteFeedbackMany(feedbackIds: string[]) {
  return deleteFeedbackManyFn({ data: { feedbackIds } })
}

export function mergeFeedback(payload: FeedbackMergePayload) {
  return mergeFeedbackFn({ data: payload })
}

export function toggleFeedbackVote(feedbackId: string) {
  return toggleFeedbackVoteFn({ data: { feedbackId } })
}

export function listFeedbackComments(feedbackId: string) {
  return listFeedbackCommentsFn({ data: { feedbackId } })
}

export function createFeedbackComment(payload: FeedbackCommentCreatePayload) {
  return createFeedbackCommentFn({ data: payload })
}

export function updateFeedbackComment(payload: FeedbackCommentUpdatePayload) {
  return updateFeedbackCommentFn({ data: payload })
}

export function deleteFeedbackComment(commentId: string) {
  return deleteFeedbackCommentFn({ data: { commentId } })
}

async function requireFeedback(feedbackId: string) {
  const [row] = await db
    .select()
    .from(customShellFeedback)
    .where(eq(customShellFeedback.id, feedbackId))
    .limit(1)

  if (!row) {
    throw new Error("Feedback not found")
  }

  return row
}

async function requireFeedbackComment(commentId: string) {
  const [row] = await db
    .select()
    .from(customShellFeedbackComments)
    .where(eq(customShellFeedbackComments.id, commentId))
    .limit(1)

  if (!row) {
    throw new Error("Comment not found")
  }

  return row
}

export function canManageFeedbackComment(
  comment: Pick<CustomShellFeedbackComment, "userId">,
  user: Pick<CustomShellUser, "id" | "role">
) {
  return user.role === "admin" || comment.userId === user.id
}

export function shouldNotifyFeedbackAuthor(
  feedback: Pick<CustomShellFeedback, "userId">,
  actor: Pick<CustomShellUser, "id">
) {
  return feedback.userId !== actor.id
}

async function serializeFeedbackRows(
  rows: CustomShellFeedback[],
  viewer: Pick<CustomShellUser, "id" | "role">
) {
  if (!rows.length) {
    return []
  }

  const feedbackIds = rows.map((row) => row.id)
  const authorIds = Array.from(new Set(rows.map((row) => row.userId)))

  // Vote counts, my votes, author names, comment counts and screenshot
  // addresses do not depend on each other, so they go out together. Run one
  // after another they cost five round trips to a database that is 1-2s away.
  const [voteRows, votedRows, authorRows, commentRows, attachmentUrls] =
    await Promise.all([
      db
        .select({
          feedbackId: customShellFeedbackVotes.feedbackId,
          count: sql<number>`count(*)::int`,
        })
        .from(customShellFeedbackVotes)
        .where(inArray(customShellFeedbackVotes.feedbackId, feedbackIds))
        .groupBy(customShellFeedbackVotes.feedbackId),

      db
        .select({ feedbackId: customShellFeedbackVotes.feedbackId })
        .from(customShellFeedbackVotes)
        .where(
          and(
            inArray(customShellFeedbackVotes.feedbackId, feedbackIds),
            eq(customShellFeedbackVotes.userId, viewer.id)
          )
        ),

      db
        .select({ id: customShellUsers.id, name: customShellUsers.name })
        .from(customShellUsers)
        .where(inArray(customShellUsers.id, authorIds)),

      db
        .select({
          feedbackId: customShellFeedbackComments.feedbackId,
          count: sql<number>`count(*)::int`,
        })
        .from(customShellFeedbackComments)
        .where(inArray(customShellFeedbackComments.feedbackId, feedbackIds))
        .groupBy(customShellFeedbackComments.feedbackId),

      loadAttachmentUrls(rows, viewer),
    ])

  const voteCounts = new Map(voteRows.map((row) => [row.feedbackId, row.count]))
  const commentCounts = new Map(
    commentRows.map((row) => [row.feedbackId, row.count])
  )
  const votedIds = new Set(votedRows.map((row) => row.feedbackId))
  const authorNames = new Map(authorRows.map((row) => [row.id, row.name]))

  return rows.map((row) =>
    serializeFeedbackRow(
      row,
      authorNames.get(row.userId) ?? "Unknown",
      voteCounts.get(row.id) ?? 0,
      commentCounts.get(row.id) ?? 0,
      votedIds.has(row.id),
      attachmentUrls.get(row.id) ?? null
    )
  )
}

async function serializeFeedbackWithMeta(
  row: CustomShellFeedback,
  viewer: Pick<CustomShellUser, "id" | "role">
) {
  // Five independent lookups, so they go out together rather than one at a time.
  const [[voteCount], [vote], [author], commentCount, attachmentUrls] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(customShellFeedbackVotes)
        .where(eq(customShellFeedbackVotes.feedbackId, row.id)),

      db
        .select({ id: customShellFeedbackVotes.id })
        .from(customShellFeedbackVotes)
        .where(
          and(
            eq(customShellFeedbackVotes.feedbackId, row.id),
            eq(customShellFeedbackVotes.userId, viewer.id)
          )
        )
        .limit(1),

      db
        .select({ name: customShellUsers.name })
        .from(customShellUsers)
        .where(eq(customShellUsers.id, row.userId))
        .limit(1),

      getFeedbackCommentCount(row.id),

      loadAttachmentUrls([row], viewer),
    ])

  return serializeFeedbackRow(
    row,
    author?.name ?? "Unknown",
    voteCount?.count ?? 0,
    commentCount,
    Boolean(vote),
    attachmentUrls.get(row.id) ?? null
  )
}

/**
 * The screenshot address for each row this viewer is allowed to see: an item's
 * own author and admins, nobody else. Decided here on the server so a member's
 * board never carries other people's pictures at all.
 */
async function loadAttachmentUrls(
  rows: Pick<CustomShellFeedback, "id" | "userId" | "attachmentMediaId">[],
  viewer: Pick<CustomShellUser, "id" | "role">
) {
  const urls = new Map<string, string>()
  const visible = rows.filter(
    (row) =>
      row.attachmentMediaId &&
      (viewer.role === "admin" || row.userId === viewer.id)
  )
  if (!visible.length) {
    return urls
  }

  const mediaRows = await db
    .select({
      id: customShellMedia.id,
      storagePath: customShellMedia.storagePath,
    })
    .from(customShellMedia)
    .where(
      inArray(
        customShellMedia.id,
        visible.map((row) => row.attachmentMediaId as string)
      )
    )

  const pathsByMediaId = new Map(
    mediaRows.map((row) => [row.id, row.storagePath])
  )
  for (const row of visible) {
    const storagePath = pathsByMediaId.get(row.attachmentMediaId as string)
    if (!storagePath) continue
    try {
      urls.set(row.id, getPublicMediaUrl(storagePath))
    } catch {
      // Storage not configured: there is no address to hand out, and the rest
      // of the item is still worth showing.
    }
  }
  return urls
}

/**
 * Erases the screenshot files behind deleted feedback. Runs after the rows are
 * already gone, so a failure here cannot undo a delete the admin was told
 * happened — it only leaves a file for the orphan scanner, which exists for
 * exactly this.
 */
async function deleteFeedbackAttachments(mediaIds: string[]) {
  if (!mediaIds.length) return
  await deleteMediaAsAdmin(mediaIds).catch(() => undefined)
}

async function serializeFeedbackCommentRows(
  rows: CustomShellFeedbackComment[],
  currentUser: CustomShellUser
) {
  if (!rows.length) {
    return []
  }

  const authorIds = Array.from(new Set(rows.map((row) => row.userId)))
  const feedbackIds = Array.from(new Set(rows.map((row) => row.feedbackId)))

  // Same shape as the feedback list: two independent lookups, sent together.
  const [authorRows, feedbackRows] = await Promise.all([
    db
      .select({ id: customShellUsers.id, name: customShellUsers.name })
      .from(customShellUsers)
      .where(inArray(customShellUsers.id, authorIds)),

    db
      .select()
      .from(customShellFeedback)
      .where(inArray(customShellFeedback.id, feedbackIds)),
  ])

  const authorNames = new Map(authorRows.map((row) => [row.id, row.name]))
  const feedbackById = new Map(feedbackRows.map((row) => [row.id, row]))

  return rows.map((row) =>
    serializeFeedbackCommentRow(
      row,
      authorNames.get(row.userId) ?? "Unknown",
      currentUser,
      feedbackById.get(row.feedbackId)
    )
  )
}

async function serializeFeedbackCommentWithMeta(
  row: CustomShellFeedbackComment,
  currentUser: CustomShellUser
) {
  const [[author], feedback] = await Promise.all([
    db
      .select({ name: customShellUsers.name })
      .from(customShellUsers)
      .where(eq(customShellUsers.id, row.userId))
      .limit(1),

    requireFeedback(row.feedbackId),
  ])

  return serializeFeedbackCommentRow(
    row,
    author?.name ?? "Unknown",
    currentUser,
    feedback
  )
}

async function getFeedbackCommentCount(feedbackId: string) {
  const [commentCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customShellFeedbackComments)
    .where(eq(customShellFeedbackComments.feedbackId, feedbackId))

  return commentCount?.count ?? 0
}

/** The same tag twice says nothing twice; the database's cap counts copies. */
function dedupeTags(tags: FeedbackTag[]) {
  return Array.from(new Set(tags))
}

function serializeFeedbackRow(
  row: CustomShellFeedback,
  authorName: string,
  voteCount: number,
  commentCount: number,
  hasVoted: boolean,
  attachmentUrl: string | null
): FeedbackItem {
  return {
    id: row.id,
    type: row.type as FeedbackType,
    status: row.status as FeedbackStatus,
    tags: row.tags as FeedbackTag[],
    message: row.message,
    author_name: authorName,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    vote_count: voteCount,
    comment_count: commentCount,
    has_voted: hasVoted,
    attachment_url: attachmentUrl,
  }
}

function serializeFeedbackCommentRow(
  row: CustomShellFeedbackComment,
  authorName: string,
  currentUser: CustomShellUser,
  feedback?: CustomShellFeedback
): FeedbackCommentItem {
  const canManage = canManageFeedbackComment(row, currentUser)
  return {
    id: row.id,
    feedback_id: row.feedbackId,
    feedback_message: feedback?.message ?? "Deleted feedback",
    feedback_type: (feedback?.type ?? "suggestion") as FeedbackType,
    message: row.message,
    author_name: authorName,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    can_edit: canManage,
    can_delete: canManage,
    is_own: row.userId === currentUser.id,
  }
}
