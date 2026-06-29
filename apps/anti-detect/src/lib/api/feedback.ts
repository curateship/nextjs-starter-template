import { createServerFn } from "@tanstack/react-start"
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import {
  feedback,
  feedbackComments,
  notifications,
  feedbackVotes,
  users,
  type Feedback,
  type FeedbackComment,
  type User,
} from "@/server/schema"
import { findCurrentUser, now, uuid } from "@/server/security"

export type FeedbackType = "suggestion" | "bug_report" | "question" | "praise"

export type FeedbackItem = {
  id: string
  type: FeedbackType
  message: string
  author_name: string
  created_at: string
  updated_at: string
  vote_count: number
  comment_count: number
  has_voted: boolean
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
}

type FeedbackListResponse = {
  feedback: FeedbackItem[]
}

type FeedbackCommentListResponse = {
  comments: FeedbackCommentItem[]
}

type FeedbackCreatePayload = {
  type: FeedbackType
  message: string
}

type FeedbackUpdatePayload = FeedbackCreatePayload & {
  feedbackId: string
}

type FeedbackCommentCreatePayload = {
  feedbackId: string
  message: string
}

type FeedbackCommentUpdatePayload = {
  commentId: string
  message: string
}

const createFeedbackSchema = z.object({
  type: z.enum(["suggestion", "bug_report", "question", "praise"]),
  message: z.string().min(1).max(5000),
})

const updateFeedbackSchema = createFeedbackSchema.extend({
  feedbackId: z.string().min(1),
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

const feedbackCommentIdsSchema = z.object({
  commentIds: z.array(z.string().min(1)).min(1),
})

export function getFeedbackErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Feedback request failed."
}

const listFeedbackFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<FeedbackListResponse> => {
    const user = await requireUser()
    const rows = await db
      .select()
      .from(feedback)
      .orderBy(desc(feedback.createdAt))

    return { feedback: await serializeFeedbackRows(rows, user.id) }
  }
)

const createFeedbackFn = createServerFn({ method: "POST" })
  .inputValidator(createFeedbackSchema)
  .handler(async ({ data }): Promise<FeedbackItem> => {
    requireAppOrigin()
    const user = await requireUser()
    const message = data.message.trim()

    if (!message) {
      throw new Error("Message is required")
    }

    const createdAt = now()
    const row = {
      id: uuid(),
      userId: user.id,
      type: data.type,
      message,
      createdAt,
      updatedAt: createdAt,
    }

    await db.insert(feedback).values(row)
    return serializeFeedbackRow(row, user.name, 0, 0, false)
  })

const updateFeedbackFn = createServerFn({ method: "POST" })
  .inputValidator(updateFeedbackSchema)
  .handler(async ({ data }): Promise<FeedbackItem> => {
    requireAppOrigin()
    const user = await requireAdminUser()
    const message = data.message.trim()

    if (!message) {
      throw new Error("Message is required")
    }

    const [row] = await db
      .update(feedback)
      .set({ type: data.type, message, updatedAt: now() })
      .where(eq(feedback.id, data.feedbackId))
      .returning()

    if (!row) {
      throw new Error("Feedback not found")
    }

    return serializeFeedbackWithMeta(row, user.id)
  })

const deleteFeedbackFn = createServerFn({ method: "POST" })
  .inputValidator(feedbackIdSchema)
  .handler(async ({ data }): Promise<{ feedbackId: string }> => {
    requireAppOrigin()
    await requireAdminUser()

    const [row] = await db
      .delete(feedback)
      .where(eq(feedback.id, data.feedbackId))
      .returning({ id: feedback.id })

    if (!row) {
      throw new Error("Feedback not found")
    }

    return { feedbackId: row.id }
  })

const deleteFeedbackManyFn = createServerFn({ method: "POST" })
  .inputValidator(feedbackIdsSchema)
  .handler(async ({ data }): Promise<{ feedbackIds: string[] }> => {
    requireAppOrigin()
    await requireAdminUser()

    const rows = await db
      .delete(feedback)
      .where(inArray(feedback.id, data.feedbackIds))
      .returning({ id: feedback.id })

    return { feedbackIds: rows.map((row) => row.id) }
  })

const toggleFeedbackVoteFn = createServerFn({ method: "POST" })
  .inputValidator(feedbackIdSchema)
  .handler(async ({ data }): Promise<FeedbackItem> => {
    requireAppOrigin()
    const user = await requireUser()

    const [row] = await db
      .select()
      .from(feedback)
      .where(eq(feedback.id, data.feedbackId))
      .limit(1)

    if (!row) {
      throw new Error("Feedback not found")
    }
    const [existingVote] = await db
      .select()
      .from(feedbackVotes)
      .where(
        and(
          eq(feedbackVotes.feedbackId, data.feedbackId),
          eq(feedbackVotes.userId, user.id)
        )
      )
      .limit(1)

    const hasVoted = !existingVote
    if (existingVote) {
      await db
        .delete(feedbackVotes)
        .where(eq(feedbackVotes.id, existingVote.id))
    } else {
      await db.transaction(async (tx) => {
        const createdAt = now()
        const [vote] = await tx
          .insert(feedbackVotes)
          .values({
            id: uuid(),
            feedbackId: data.feedbackId,
            userId: user.id,
            createdAt,
          })
          .returning({ id: feedbackVotes.id })

        if (!vote) {
          throw new Error("Vote was not created")
        }

        if (shouldNotifyFeedbackAuthor(row, user)) {
          await tx.insert(notifications).values({
            id: uuid(),
            recipientUserId: row.userId,
            actorUserId: user.id,
            feedbackId: row.id,
            type: "feedback_vote",
            feedbackVoteId: vote.id,
            createdAt,
          })
        }
      })
    }

    const [voteCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(feedbackVotes)
      .where(eq(feedbackVotes.feedbackId, row.id))
    const [author] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1)

    return serializeFeedbackRow(
      row,
      author?.name ?? "Unknown",
      voteCount?.count ?? 0,
      await getFeedbackCommentCount(row.id),
      hasVoted
    )
  })

const listFeedbackCommentsFn = createServerFn({ method: "GET" })
  .inputValidator(feedbackIdSchema)
  .handler(async ({ data }): Promise<FeedbackCommentListResponse> => {
    const user = await requireUser()
    const rows = await db
      .select()
      .from(feedbackComments)
      .where(eq(feedbackComments.feedbackId, data.feedbackId))
      .orderBy(asc(feedbackComments.createdAt))

    return { comments: await serializeFeedbackCommentRows(rows, user) }
  })

const listFeedbackCommentDashboardFn = createServerFn({
  method: "GET",
}).handler(async (): Promise<FeedbackCommentListResponse> => {
  const user = await requireAdminUser()
  const rows = await db
    .select()
    .from(feedbackComments)
    .orderBy(desc(feedbackComments.createdAt))

  return { comments: await serializeFeedbackCommentRows(rows, user) }
})

const createFeedbackCommentFn = createServerFn({ method: "POST" })
  .inputValidator(createFeedbackCommentSchema)
  .handler(async ({ data }): Promise<FeedbackCommentItem> => {
    requireAppOrigin()
    const user = await requireUser()
    const message = data.message.trim()

    if (!message) {
      throw new Error("Comment is required")
    }

    const feedback = await requireFeedback(data.feedbackId)

    const createdAt = now()
    const row = await db.transaction(async (tx) => {
      const [comment] = await tx
        .insert(feedbackComments)
        .values({
          id: uuid(),
          feedbackId: data.feedbackId,
          userId: user.id,
          message,
          createdAt,
          updatedAt: createdAt,
        })
        .returning()

      if (!comment) {
        throw new Error("Comment was not created")
      }

      if (shouldNotifyFeedbackAuthor(feedback, user)) {
        await tx.insert(notifications).values({
          id: uuid(),
          recipientUserId: feedback.userId,
          actorUserId: user.id,
          feedbackId: feedback.id,
          type: "feedback_comment",
          feedbackCommentId: comment.id,
          createdAt,
        })
      }

      return comment
    })

    return serializeFeedbackCommentWithMeta(row, user)
  })

const updateFeedbackCommentFn = createServerFn({ method: "POST" })
  .inputValidator(updateFeedbackCommentSchema)
  .handler(async ({ data }): Promise<FeedbackCommentItem> => {
    requireAppOrigin()
    const user = await requireUser()
    const message = data.message.trim()

    if (!message) {
      throw new Error("Comment is required")
    }

    const comment = await requireFeedbackComment(data.commentId)
    if (!canManageFeedbackComment(comment, user)) {
      throw new Error("Not authorized")
    }

    const [row] = await db
      .update(feedbackComments)
      .set({ message, updatedAt: now() })
      .where(eq(feedbackComments.id, data.commentId))
      .returning()

    if (!row) {
      throw new Error("Comment not found")
    }

    return serializeFeedbackCommentWithMeta(row, user)
  })

const deleteFeedbackCommentFn = createServerFn({ method: "POST" })
  .inputValidator(feedbackCommentIdSchema)
  .handler(
    async ({ data }): Promise<{ commentId: string; feedbackId: string }> => {
      requireAppOrigin()
      const user = await requireUser()
      const comment = await requireFeedbackComment(data.commentId)

      if (!canManageFeedbackComment(comment, user)) {
        throw new Error("Not authorized")
      }

      const [row] = await db
        .delete(feedbackComments)
        .where(eq(feedbackComments.id, data.commentId))
        .returning({
          id: feedbackComments.id,
          feedbackId: feedbackComments.feedbackId,
        })

      if (!row) {
        throw new Error("Comment not found")
      }

      return { commentId: row.id, feedbackId: row.feedbackId }
    }
  )

const deleteFeedbackCommentsManyFn = createServerFn({ method: "POST" })
  .inputValidator(feedbackCommentIdsSchema)
  .handler(async ({ data }): Promise<{ commentIds: string[] }> => {
    requireAppOrigin()
    await requireAdminUser()

    const rows = await db
      .delete(feedbackComments)
      .where(inArray(feedbackComments.id, data.commentIds))
      .returning({ id: feedbackComments.id })

    return { commentIds: rows.map((row) => row.id) }
  })

export function listFeedback() {
  return listFeedbackFn()
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

export function toggleFeedbackVote(feedbackId: string) {
  return toggleFeedbackVoteFn({ data: { feedbackId } })
}

export function listFeedbackComments(feedbackId: string) {
  return listFeedbackCommentsFn({ data: { feedbackId } })
}

export function listFeedbackCommentDashboard() {
  return listFeedbackCommentDashboardFn()
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

export function deleteFeedbackCommentsMany(commentIds: string[]) {
  return deleteFeedbackCommentsManyFn({ data: { commentIds } })
}

async function requireUser() {
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Custom Shell session")
  }
  return user
}

async function requireAdminUser() {
  const user = await requireUser()
  if (user.role !== "admin") {
    throw new Error("Not authorized")
  }
  return user
}

async function requireFeedback(feedbackId: string) {
  const [row] = await db
    .select()
    .from(feedback)
    .where(eq(feedback.id, feedbackId))
    .limit(1)

  if (!row) {
    throw new Error("Feedback not found")
  }

  return row
}

async function requireFeedbackComment(commentId: string) {
  const [row] = await db
    .select()
    .from(feedbackComments)
    .where(eq(feedbackComments.id, commentId))
    .limit(1)

  if (!row) {
    throw new Error("Comment not found")
  }

  return row
}

export function canManageFeedbackComment(
  comment: Pick<FeedbackComment, "userId">,
  user: Pick<User, "id" | "role">
) {
  return user.role === "admin" || comment.userId === user.id
}

export function shouldNotifyFeedbackAuthor(
  feedback: Pick<Feedback, "userId">,
  actor: Pick<User, "id">
) {
  return feedback.userId !== actor.id
}

async function serializeFeedbackRows(
  rows: Feedback[],
  currentUserId: string
) {
  if (!rows.length) {
    return []
  }

  const feedbackIds = rows.map((row) => row.id)
  const voteRows = await db
    .select({
      feedbackId: feedbackVotes.feedbackId,
      count: sql<number>`count(*)::int`,
    })
    .from(feedbackVotes)
    .where(inArray(feedbackVotes.feedbackId, feedbackIds))
    .groupBy(feedbackVotes.feedbackId)

  const votedRows = await db
    .select({ feedbackId: feedbackVotes.feedbackId })
    .from(feedbackVotes)
    .where(
      and(
        inArray(feedbackVotes.feedbackId, feedbackIds),
        eq(feedbackVotes.userId, currentUserId)
      )
    )

  const authorIds = Array.from(new Set(rows.map((row) => row.userId)))
  const authorRows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, authorIds))

  const commentRows = await db
    .select({
      feedbackId: feedbackComments.feedbackId,
      count: sql<number>`count(*)::int`,
    })
    .from(feedbackComments)
    .where(inArray(feedbackComments.feedbackId, feedbackIds))
    .groupBy(feedbackComments.feedbackId)

  const voteCounts = new Map(
    voteRows.map((row) => [row.feedbackId, row.count])
  )
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
      votedIds.has(row.id)
    )
  )
}

async function serializeFeedbackWithMeta(
  row: Feedback,
  currentUserId: string
) {
  const [voteCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(feedbackVotes)
    .where(eq(feedbackVotes.feedbackId, row.id))
  const [vote] = await db
    .select({ id: feedbackVotes.id })
    .from(feedbackVotes)
    .where(
      and(
        eq(feedbackVotes.feedbackId, row.id),
        eq(feedbackVotes.userId, currentUserId)
      )
    )
    .limit(1)
  const [author] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1)

  return serializeFeedbackRow(
    row,
    author?.name ?? "Unknown",
    voteCount?.count ?? 0,
    await getFeedbackCommentCount(row.id),
    Boolean(vote)
  )
}

async function serializeFeedbackCommentRows(
  rows: FeedbackComment[],
  currentUser: User
) {
  if (!rows.length) {
    return []
  }

  const authorIds = Array.from(new Set(rows.map((row) => row.userId)))
  const feedbackIds = Array.from(new Set(rows.map((row) => row.feedbackId)))
  const authorRows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, authorIds))
  const feedbackRows = await db
    .select()
    .from(feedback)
    .where(inArray(feedback.id, feedbackIds))

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
  row: FeedbackComment,
  currentUser: User
) {
  const [author] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1)
  const feedback = await requireFeedback(row.feedbackId)

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
    .from(feedbackComments)
    .where(eq(feedbackComments.feedbackId, feedbackId))

  return commentCount?.count ?? 0
}

function serializeFeedbackRow(
  row: Feedback,
  authorName: string,
  voteCount: number,
  commentCount: number,
  hasVoted: boolean
): FeedbackItem {
  return {
    id: row.id,
    type: row.type as FeedbackType,
    message: row.message,
    author_name: authorName,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    vote_count: voteCount,
    comment_count: commentCount,
    has_voted: hasVoted,
  }
}

function serializeFeedbackCommentRow(
  row: FeedbackComment,
  authorName: string,
  currentUser: User,
  feedback?: Feedback
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
  }
}
