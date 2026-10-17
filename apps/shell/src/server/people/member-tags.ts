import { and, asc, eq, inArray } from "drizzle-orm"

import {
  MEMBER_TAG_LIMIT,
  MEMBER_TAG_MAX_LENGTH,
  MEMBER_TAG_SEPARATOR,
  normalizeMemberTag,
  normalizeMemberTags,
} from "@/lib/member-tags"
import { db, type CustomShellDb } from "@/server/db"
import { customShellMemberTags, customShellUsers } from "@/server/schema"
import { now } from "@/server/auth/security"

export async function listMemberTags(
  userIds: string[],
  database: CustomShellDb = db
): Promise<Map<string, string[]>> {
  const result = new Map(userIds.map((userId) => [userId, [] as string[]]))
  if (userIds.length === 0) return result

  const rows = await database
    .select({
      userId: customShellMemberTags.userId,
      tag: customShellMemberTags.tag,
    })
    .from(customShellMemberTags)
    .where(inArray(customShellMemberTags.userId, userIds))
    .orderBy(asc(customShellMemberTags.tag))

  for (const row of rows) result.get(row.userId)?.push(row.tag)
  return result
}

/** Replaces one account's complete label set, as the admin edit window does. */
export async function replaceMemberTags(
  userId: string,
  values: string[],
  database: CustomShellDb = db
): Promise<string[]> {
  const tags = normalizeMemberTags(values)

  return database.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: customShellUsers.id })
      .from(customShellUsers)
      .where(eq(customShellUsers.id, userId))
      .limit(1)
      .for("update")
    if (!user) throw new Error("USER_NOT_FOUND")

    await tx
      .delete(customShellMemberTags)
      .where(eq(customShellMemberTags.userId, userId))
    if (tags.length) {
      await tx
        .insert(customShellMemberTags)
        .values(tags.map((tag) => ({ userId, tag, createdAt: now() })))
    }
    return tags
  })
}

export type MemberTagChange = "added" | "removed" | "unchanged"

/** Adds or removes one label and says whether anything actually changed. */
export async function changeMemberTag(
  userId: string,
  mode: "add" | "remove",
  value: string,
  database: CustomShellDb = db
): Promise<MemberTagChange> {
  const tag = normalizeMemberTag(value)
  if (
    !tag ||
    tag.length > MEMBER_TAG_MAX_LENGTH ||
    tag.includes(MEMBER_TAG_SEPARATOR)
  ) {
    throw new Error("MEMBER_TAG_INVALID")
  }

  return database.transaction(async (tx) => {
    // Every writer locks the account row first. That keeps simultaneous flow
    // runs and admin edits from losing a tag or slipping past the account cap.
    const [user] = await tx
      .select({ id: customShellUsers.id })
      .from(customShellUsers)
      .where(eq(customShellUsers.id, userId))
      .limit(1)
      .for("update")
    if (!user) throw new Error("USER_NOT_FOUND")

    if (mode === "remove") {
      const removed = await tx
        .delete(customShellMemberTags)
        .where(
          and(
            eq(customShellMemberTags.userId, userId),
            eq(customShellMemberTags.tag, tag)
          )
        )
        .returning({ tag: customShellMemberTags.tag })
      return removed.length ? "removed" : "unchanged"
    }

    const existing = await tx
      .select({ tag: customShellMemberTags.tag })
      .from(customShellMemberTags)
      .where(eq(customShellMemberTags.userId, userId))
    if (existing.some((row) => row.tag === tag)) return "unchanged"
    if (existing.length >= MEMBER_TAG_LIMIT) throw new Error("MEMBER_TAG_LIMIT")

    const inserted = await tx
      .insert(customShellMemberTags)
      .values({ userId, tag, createdAt: now() })
      .onConflictDoNothing()
      .returning({ tag: customShellMemberTags.tag })
    return inserted.length ? "added" : "unchanged"
  })
}
