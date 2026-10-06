import { readdir, readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { uuid } from "@/server/auth/security"
import type { CustomShellDb } from "@/server/db"
import * as schema from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  type TestDatabase,
} from "@/server/test-support"

import { saveAccount } from "./accounts"
import { promoAccounts, promoVoices } from "./schema"
import {
  createVoice,
  deleteVoices,
  listVoices,
  updateVoice,
  wordsForAccount,
} from "./voices"

const words = {
  voice: "Plain and helpful, never salesy.",
  product: "A tool that finds Reddit threads worth answering.",
  commentRules: "Never pretend to be a customer.",
}

/**
 * The migration that gives every existing account a voice. The one thing it
 * must not do is change what a draft is told, so the words are read before and
 * after and compared.
 */
describe("adopting the accounts that already have words", () => {
  const MIGRATION = "0096_promo_voices.sql"
  const folder = new URL("../../../drizzle/", import.meta.url)
  let client: PGlite
  let db: CustomShellDb
  let userId: string

  beforeEach(async () => {
    client = new PGlite()
    const files = (await readdir(folder)).filter((file) => file.endsWith(".sql")).sort()
    for (const file of files.filter((one) => one < MIGRATION)) {
      await client.exec(await readFile(new URL(file, folder), "utf8"))
    }
    db = drizzle(client, { schema }) as unknown as CustomShellDb
    userId = (await insertUser(db, { role: "admin" })).id
  })

  afterEach(async () => {
    await client.close()
  })

  it("drafts with the same words before and after", async () => {
    const accountId = uuid()
    await client.query(
      `INSERT INTO promo_accounts (id, user_id, voice, product, comment_rules) VALUES ($1, $2, $3, $4, $5)`,
      [accountId, userId, words.voice, words.product, words.commentRules]
    )

    const files = (await readdir(folder)).filter((file) => file.endsWith(".sql")).sort()
    for (const file of files.filter((one) => one >= MIGRATION)) {
      await client.exec(await readFile(new URL(file, folder), "utf8"))
    }

    expect(await wordsForAccount(userId, accountId, db)).toEqual(words)
    const [voice] = await db.select().from(promoVoices)
    expect(voice.name).toBe("Main voice")
    const [account] = await db.select().from(promoAccounts)
    expect(account.voiceId).toBe(voice.id)

    // The old columns are still there with their words.
    const old = await client.query<{ voice: string }>(`SELECT voice FROM promo_accounts`)
    expect(old.rows[0].voice).toBe(words.voice)
  })
})

describe("voices shared by accounts", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string

  beforeEach(async () => {
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
  })

  afterEach(async () => {
    await client.close()
  })

  async function account(handle: string, voiceId: string | null, platform = "reddit") {
    const id = uuid()
    await db.insert(promoAccounts).values({ id, userId, handle, platform, voiceId })
    return id
  }

  it("lets two accounts draft with one voice, and an edit changes both", async () => {
    const voiceId = await createVoice(userId, { name: "Main voice", ...words }, db)
    const reddit = await account("a_persona", voiceId)
    const other = await account("someone", voiceId, "instagram")

    expect(await wordsForAccount(userId, reddit, db)).toEqual(words)
    expect(await wordsForAccount(userId, other, db)).toEqual(words)

    await updateVoice(userId, voiceId, { name: "Main voice", ...words, voice: "Short and dry." }, db)

    expect((await wordsForAccount(userId, reddit, db)).voice).toBe("Short and dry.")
    expect((await wordsForAccount(userId, other, db)).voice).toBe("Short and dry.")
  })

  it("names the accounts using a voice, and leaves them with none when it goes", async () => {
    const voiceId = await createVoice(userId, { name: "Main voice", ...words }, db)
    await account("a_persona", voiceId)
    await account("someone", voiceId, "instagram")

    const [listed] = await listVoices(userId, db)
    expect(listed.usedBy.map((one) => one.handle).sort()).toEqual(["a_persona", "someone"])

    await deleteVoices(userId, [voiceId], db)

    const rows = await db.select().from(promoAccounts)
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.voiceId === null)).toBe(true)
  })

  it("drafts plainly for an account with no voice", async () => {
    const id = await account("a_persona", null)
    expect(await wordsForAccount(userId, id, db)).toEqual({ voice: "", product: "", commentRules: "" })
  })

  it("refuses a voice with no name", async () => {
    await expect(createVoice(userId, { name: "  ", ...words }, db)).rejects.toThrow("needs a name")
  })

  it("never touches another person's voice", async () => {
    const other = (await insertUser(db, { role: "admin" })).id
    const theirs = await createVoice(other, { name: "Theirs", ...words }, db)

    await expect(updateVoice(userId, theirs, { name: "Mine now", ...words }, db)).rejects.toThrow(
      "does not exist"
    )
    expect(await deleteVoices(userId, [theirs], db)).toEqual({ deleted: [] })
    await expect(saveAccount(userId, { profileId: null, voiceId: theirs }, db)).rejects.toThrow(
      "That voice does not exist."
    )
  })

  it("saves the account's pick and reads it back by name", async () => {
    const voiceId = await createVoice(userId, { name: "Main voice", ...words }, db)

    const saved = await saveAccount(userId, { profileId: null, voiceId }, db)

    expect(saved.voice).toEqual({ id: voiceId, name: "Main voice" })
    const [row] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, saved.id))
    expect(row.voiceId).toBe(voiceId)
  })
})
