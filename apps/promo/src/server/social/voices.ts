import { and, asc, eq, inArray } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { promoAccounts, promoVoices } from "./schema"

/**
 * Voices: what the AI is told when it writes a comment. The voice, what you
 * make, and the lines it must not cross. Any number of accounts, on any
 * network, may share one, which is why it is a record of its own rather than
 * three boxes on each account. Tyler asked for that on 6 Oct 2026.
 *
 * Every query is scoped by the person's id, and that filter is the ownership
 * check: a foreign id finds nothing and changes nothing.
 */

export type VoiceInput = {
  name: string
  voice: string
  product: string
  commentRules: string
}

export type VoiceView = VoiceInput & {
  id: string
  updatedAt: Date
  /** The accounts writing with it, by network and handle. */
  usedBy: Array<{ id: string; platform: string; handle: string }>
}

/** The words a draft is written with: a voice's, or three empty ones. */
export type VoiceWords = Pick<VoiceInput, "voice" | "product" | "commentRules">

const NO_WORDS: VoiceWords = { voice: "", product: "", commentRules: "" }

function clean(input: VoiceInput) {
  const name = input.name.trim().slice(0, 120)
  if (!name) throw new Error("A voice needs a name.")
  return {
    name,
    voice: input.voice.trim().slice(0, 4_000),
    product: input.product.trim().slice(0, 4_000),
    commentRules: input.commentRules.trim().slice(0, 4_000),
  }
}

/** Every voice the person has, by name, with the accounts using each. */
export async function listVoices(
  userId: string,
  db: CustomShellDb = defaultDb
): Promise<VoiceView[]> {
  const voices = await db
    .select()
    .from(promoVoices)
    .where(eq(promoVoices.userId, userId))
    .orderBy(asc(promoVoices.name))
  if (!voices.length) return []

  const accounts = await db
    .select({
      id: promoAccounts.id,
      voiceId: promoAccounts.voiceId,
      platform: promoAccounts.platform,
      handle: promoAccounts.handle,
    })
    .from(promoAccounts)
    .where(
      and(
        eq(promoAccounts.userId, userId),
        inArray(promoAccounts.voiceId, voices.map((voice) => voice.id))
      )
    )

  return voices.map((voice) => ({
    id: voice.id,
    name: voice.name,
    voice: voice.voice,
    product: voice.product,
    commentRules: voice.commentRules,
    updatedAt: voice.updatedAt,
    usedBy: accounts
      .filter((account) => account.voiceId === voice.id)
      .map(({ id, platform, handle }) => ({ id, platform, handle })),
  }))
}

export async function createVoice(
  userId: string,
  input: VoiceInput,
  db: CustomShellDb = defaultDb
): Promise<string> {
  const id = uuid()
  await db.insert(promoVoices).values({ id, userId, ...clean(input) })
  return id
}

/** Saves a voice. Every account using it drafts with the new words from now on. */
export async function updateVoice(
  userId: string,
  voiceId: string,
  input: VoiceInput,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const updated = await db
    .update(promoVoices)
    .set({ ...clean(input), updatedAt: new Date() })
    .where(and(eq(promoVoices.id, voiceId), eq(promoVoices.userId, userId)))
    .returning({ id: promoVoices.id })
  if (!updated.length) throw new Error("That voice does not exist.")
}

/**
 * Deletes voices. The accounts using one are kept, with no voice, and draft
 * plainly until they are given another; the foreign key does that.
 */
export async function deleteVoices(
  userId: string,
  ids: string[],
  db: CustomShellDb = defaultDb
): Promise<{ deleted: string[] }> {
  if (!ids.length) return { deleted: [] }
  const deleted = await db
    .delete(promoVoices)
    .where(and(inArray(promoVoices.id, ids), eq(promoVoices.userId, userId)))
    .returning({ id: promoVoices.id })
  return { deleted: deleted.map((row) => row.id) }
}

/**
 * The words an account drafts with. An account with no voice drafts with none,
 * exactly as an account with three empty boxes did before voices existed.
 */
export async function wordsForAccount(
  userId: string,
  accountId: string,
  db: CustomShellDb = defaultDb
): Promise<VoiceWords> {
  const [row] = await db
    .select({
      voice: promoVoices.voice,
      product: promoVoices.product,
      commentRules: promoVoices.commentRules,
    })
    .from(promoAccounts)
    .innerJoin(promoVoices, eq(promoVoices.id, promoAccounts.voiceId))
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  return row ?? NO_WORDS
}
