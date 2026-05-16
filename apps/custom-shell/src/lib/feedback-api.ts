import { createServerFn } from "@tanstack/react-start"
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import {
  customShellFeedback,
  customShellFeedbackVotes,
  customShellUsers,
  type CustomShellFeedback,
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
  has_voted: boolean
}

type FeedbackListResponse = {
  feedback: FeedbackItem[]
}

type FeedbackCreatePayload = {
  type: FeedbackType
  message: string
}

const createFeedbackSchema = z.object({
  type: z.enum(["suggestion", "bug_report", "question", "praise"]),
  message: z.string().min(1).max(5000),
})

const feedbackIdSchema = z.object({
  feedbackId: z.string().min(1),
})

export function getFeedbackErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Feedback request failed."
}

const listFeedbackFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<FeedbackListResponse> => {
    const user = await requireUser()
    const rows = await db
      .select()
      .from(customShellFeedback)
      .orderBy(desc(customShellFeedback.createdAt))

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

    await db.insert(customShellFeedback).values(row)
    return serializeFeedbackRow(row, user.name, 0, false)
  })

const toggleFeedbackVoteFn = createServerFn({ method: "POST" })
  .inputValidator(feedbackIdSchema)
  .handler(async ({ data }): Promise<FeedbackItem> => {
    requireAppOrigin()
    const user = await requireUser()

    const [row] = await db
      .select()
      .from(customShellFeedback)
      .where(eq(customShellFeedback.id, data.feedbackId))
      .limit(1)

    if (!row) {
      throw new Error("Feedback not found")
    }
    if (row.type !== "suggestion") {
      throw new Error("Only suggestions can be upvoted")
    }

    const [existingVote] = await db
      .select()
      .from(customShellFeedbackVotes)
      .where(
        and(
          eq(customShellFeedbackVotes.feedbackId, data.feedbackId),
          eq(customShellFeedbackVotes.userId, user.id)
        )
      )
      .limit(1)

    const hasVoted = !existingVote
    if (existingVote) {
      await db
        .delete(customShellFeedbackVotes)
        .where(eq(customShellFeedbackVotes.id, existingVote.id))
    } else {
      await db.insert(customShellFeedbackVotes).values({
        id: uuid(),
        feedbackId: data.feedbackId,
        userId: user.id,
        createdAt: now(),
      })
    }

    const [voteCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(customShellFeedbackVotes)
      .where(eq(customShellFeedbackVotes.feedbackId, row.id))
    const [author] = await db
      .select({ name: customShellUsers.name })
      .from(customShellUsers)
      .where(eq(customShellUsers.id, row.userId))
      .limit(1)

    return serializeFeedbackRow(
      row,
      author?.name ?? "Unknown",
      voteCount?.count ?? 0,
      hasVoted
    )
  })

export function listFeedback() {
  return listFeedbackFn()
}

export function createFeedback(payload: FeedbackCreatePayload) {
  return createFeedbackFn({ data: payload })
}

export function toggleFeedbackVote(feedbackId: string) {
  return toggleFeedbackVoteFn({ data: { feedbackId } })
}

async function requireUser() {
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Custom Shell session")
  }
  return user
}

async function serializeFeedbackRows(
  rows: CustomShellFeedback[],
  currentUserId: string
) {
  if (!rows.length) {
    return []
  }

  const feedbackIds = rows.map((row) => row.id)
  const voteRows = await db
    .select({
      feedbackId: customShellFeedbackVotes.feedbackId,
      count: sql<number>`count(*)::int`,
    })
    .from(customShellFeedbackVotes)
    .where(inArray(customShellFeedbackVotes.feedbackId, feedbackIds))
    .groupBy(customShellFeedbackVotes.feedbackId)

  const votedRows = await db
    .select({ feedbackId: customShellFeedbackVotes.feedbackId })
    .from(customShellFeedbackVotes)
    .where(
      and(
        inArray(customShellFeedbackVotes.feedbackId, feedbackIds),
        eq(customShellFeedbackVotes.userId, currentUserId)
      )
    )

  const authorIds = Array.from(new Set(rows.map((row) => row.userId)))
  const authorRows = await db
    .select({ id: customShellUsers.id, name: customShellUsers.name })
    .from(customShellUsers)
    .where(inArray(customShellUsers.id, authorIds))

  const voteCounts = new Map(
    voteRows.map((row) => [row.feedbackId, row.count])
  )
  const votedIds = new Set(votedRows.map((row) => row.feedbackId))
  const authorNames = new Map(authorRows.map((row) => [row.id, row.name]))

  return rows.map((row) =>
    serializeFeedbackRow(
      row,
      authorNames.get(row.userId) ?? "Unknown",
      voteCounts.get(row.id) ?? 0,
      votedIds.has(row.id)
    )
  )
}

function serializeFeedbackRow(
  row: CustomShellFeedback,
  authorName: string,
  voteCount: number,
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
    has_voted: hasVoted,
  }
}
