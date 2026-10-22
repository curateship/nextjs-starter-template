import { and, eq } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import type { CommandTarget } from "@/server/browser/command"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { mediumStoryUrl } from "@/lib/social/medium/options"

import { mediumSearch, mediumStory, type MediumStory } from "./calls"
import { rankMediumFind } from "./rank"
import { promoMediumFinds, promoMediumKeywords } from "./schema"

/**
 * Running a Medium keyword and reading one story in full, in the reader
 * browser (parts 6, 9, 13, 14 and 19).
 *
 * A search adds whatever is new and updates the figures of what it found
 * before: claps, responses, followers and rank. It never changes a decision.
 * A story skipped or replied to stays that way however often it turns up.
 */

function postedAt(seconds: number | null): Date | null {
  return seconds ? new Date(seconds * 1000) : null
}

/** The figures a search or a read keeps fresh on a find, the same for both. */
function figures(story: MediumStory) {
  return {
    // Medium writes the address. Anything but https is put back to the
    // story's own address, since the screens draw it as a link.
    url: story.url.startsWith("https://") ? story.url.slice(0, 600) : mediumStoryUrl(story.storyId),
    title: story.title.slice(0, 600),
    subtitle: story.subtitle,
    writerId: story.writerId.slice(0, 40),
    writerHandle: story.writerHandle.slice(0, 120),
    writerName: story.writerName.slice(0, 200),
    writerFollowers: story.writerFollowers,
    publicationSlug: story.publicationSlug.slice(0, 120),
    publicationName: story.publicationName.slice(0, 200),
    tags: story.tags.slice(0, 5),
    postedAt: postedAt(story.postedSeconds),
    claps: story.claps,
    responseCount: story.responseCount,
    membersOnly: story.membersOnly,
  }
}

/**
 * Searches one keyword and stores what came back. A failure is written on
 * the keyword, so its chip can say why, and then thrown so the job fails.
 */
export async function runMediumSearch(
  userId: string,
  keywordId: string,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ seen: number; added: number; unread: number }> {
  const [keyword] = await db
    .select()
    .from(promoMediumKeywords)
    .where(and(eq(promoMediumKeywords.id, keywordId), eq(promoMediumKeywords.userId, userId)))
    .limit(1)
  if (!keyword) throw new Error("That Medium keyword is no longer saved.")

  let answer: Awaited<ReturnType<typeof mediumSearch>>
  try {
    answer = await mediumSearch(target, { kind: keyword.kind, value: keyword.value })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db
      .update(promoMediumKeywords)
      .set({ lastRunAt: now, lastError: message.slice(0, 1_000), updatedAt: now })
      .where(eq(promoMediumKeywords.id, keywordId))
    throw error
  }

  const named = keyword.mark !== ""
  let added = 0
  for (const story of answer.stories) {
    // A response is a story of its own on Medium, and one can turn up in a
    // writer's feed. It is not something to respond to from here.
    if (!story.title && !story.text) continue
    const rank = rankMediumFind(
      {
        position: story.position,
        responseCount: story.responseCount,
        postedAt: postedAt(story.postedSeconds),
        writerFollowers: story.writerFollowers,
        named,
      },
      now
    )
    const inserted = await db
      .insert(promoMediumFinds)
      .values({
        id: uuid(),
        userId,
        keywordId,
        storyId: story.storyId,
        ...figures(story),
        position: story.position,
        rank,
        text: story.text,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [promoMediumFinds.keywordId, promoMediumFinds.storyId],
        set: { ...figures(story), position: story.position, rank, lastSeenAt: now },
      })
      .returning({ firstSeenAt: promoMediumFinds.firstSeenAt })
    if (inserted[0] && inserted[0].firstSeenAt.getTime() === now.getTime()) added += 1
  }

  await db
    .update(promoMediumKeywords)
    .set({ lastRunAt: now, lastError: "", updatedAt: now })
    .where(eq(promoMediumKeywords.id, keywordId))
  return { seen: answer.stories.length, added, unread: answer.unread }
}

/**
 * Reads one story in full for the right column: its words, its top
 * responses, and fresh figures. Every find of the same story is updated, so
 * a story found by two keywords reads the same under both.
 */
export async function readMediumStory(
  userId: string,
  findId: string,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const [find] = await db
    .select({ storyId: promoMediumFinds.storyId })
    .from(promoMediumFinds)
    .where(and(eq(promoMediumFinds.id, findId), eq(promoMediumFinds.userId, userId)))
    .limit(1)
  if (!find) throw new Error("That Medium story is no longer saved.")
  const story = await mediumStory(target, { storyId: find.storyId })
  await db
    .update(promoMediumFinds)
    .set({ ...figures(story), text: story.text, responses: story.responses, storyReadAt: now })
    .where(and(eq(promoMediumFinds.userId, userId), eq(promoMediumFinds.storyId, find.storyId)))
}
