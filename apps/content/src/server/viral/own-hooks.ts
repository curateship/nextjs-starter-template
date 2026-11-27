import { and, eq } from "drizzle-orm"

import { cleanHookLink, OWN_HOOK_WORDS_MAX, type OwnLibraryHook } from "@/lib/viral/library"
import { viralSays } from "@/lib/viral/viral"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { requireHookType } from "@/server/viral/hook-types"
import { ownHookTags, setHookTags, toOwnHook } from "@/server/viral/library"
import { viralOwnHooks, type ViralOwnHookRow } from "@/server/viral/schema"

/**
 * Your own hook on Library → Hooks (`workspace/docs/library.md`,
 * more-features task part 8). Tyler, 6 Nov 2026: "Words, link, tags". It
 * belongs to the person, not one project, so it shows under All projects.
 *
 * Its type is picked by the person when they add it, from the same list the
 * AI picks from, or left empty for the labelling pass on Settings → Hook
 * types to name. Saving never waits on an AI and never fails for want of a key.
 */

function cleanWords(value: string): string {
  const words = value.trim().replace(/\s+/g, " ").slice(0, OWN_HOOK_WORDS_MAX)
  if (!words) throw viralSays("Type the hook's words first.")
  return words
}

/** A link that is not http or https is refused out loud, rather than dropped quietly. */
function cleanLink(value: string): string | null {
  if (!value.trim()) return null
  const link = cleanHookLink(value)
  if (!link) throw viralSays("The link has to start with http:// or https://.")
  return link
}

export async function requireOwnHook(ownerId: string, hookId: string): Promise<ViralOwnHookRow> {
  const [row] = await db
    .select()
    .from(viralOwnHooks)
    .where(and(eq(viralOwnHooks.id, hookId), eq(viralOwnHooks.ownerId, ownerId)))
  if (!row) throw viralSays("That hook is gone.")
  return row
}

async function withTags(row: ViralOwnHookRow): Promise<OwnLibraryHook> {
  return toOwnHook(row, (await ownHookTags([row.id])).get(row.id) ?? [])
}

/** "+ New hook": the words, an optional link, a type or none, and tags. */
export async function createOwnHook(
  ownerId: string,
  input: { words: string; link: string; typeId: string | null; tags: string[] }
): Promise<OwnLibraryHook> {
  const words = cleanWords(input.words)
  const link = cleanLink(input.link)
  const type = await requireHookType(ownerId, input.typeId)
  const at = now()
  const [row] = await db
    .insert(viralOwnHooks)
    .values({ id: uuid(), ownerId, words, link, ...type, createdAt: at, updatedAt: at })
    .returning()
  if (input.tags.length) await setHookTags(ownerId, "own", row.id, input.tags)
  return withTags(row)
}

/** One field changed in the hook's ⋮, saved as it changes. */
export async function updateOwnHook(
  ownerId: string,
  hookId: string,
  change: { words?: string; link?: string; typeId?: string | null }
): Promise<OwnLibraryHook> {
  const hook = await requireOwnHook(ownerId, hookId)
  const set: Partial<typeof viralOwnHooks.$inferInsert> = { updatedAt: now() }
  if (change.words !== undefined) set.words = cleanWords(change.words)
  if (change.link !== undefined) set.link = cleanLink(change.link)
  if (change.typeId !== undefined) Object.assign(set, await requireHookType(ownerId, change.typeId))
  const [row] = await db
    .update(viralOwnHooks)
    .set(set)
    .where(and(eq(viralOwnHooks.id, hook.id), eq(viralOwnHooks.ownerId, ownerId)))
    .returning()
  return withTags(row)
}

/** Deletes your own hook, its tags and every hook written from it. */
export async function deleteOwnHook(ownerId: string, hookId: string): Promise<void> {
  const hook = await requireOwnHook(ownerId, hookId)
  await db.delete(viralOwnHooks).where(and(eq(viralOwnHooks.id, hook.id), eq(viralOwnHooks.ownerId, ownerId)))
}
