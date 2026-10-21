import { readdir, readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { uuid } from "@/server/auth/security"
import type { CustomShellDb } from "@/server/db"
import * as schema from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace, type TestDatabase } from "@/server/test-support"

vi.mock("@/server/media/storage", () => ({
  R2StorageNotConfiguredError: class extends Error {},
  uploadToR2: vi.fn(async () => {}),
  getFromR2: vi.fn(async () => ({ Body: undefined })),
  deleteFromR2: vi.fn(async () => {}),
}))

import { DEFAULT_DATING_SETTINGS } from "@/lib/dating/settings"
import { datePhones, datePictures } from "@/server/phone/schema"
import { insertAccount } from "@/server/tinder/fixtures/accounts"
import { checkWalkAllowed } from "@/server/tinder/jobs"
import { dateMatches, dateMessages, dateProfiles, dateWalks } from "@/server/tinder/schema"
import { customShellAiUsageEvents } from "@/server/schema"

import {
  accountCounts,
  createAccount,
  deleteAccount,
  listProfiles,
  openAccount,
  ownAccount,
  pickAccount,
  setAccountPaused,
  type DatingAccount,
} from "./accounts"
import { askAboutMatches, tidyReply, type AiAsk } from "./ai"
import { loadDashboard } from "./dashboard"
import { DATING_MODEL } from "./model"
import { dateAccounts, dateGoogleCalendars, dateSettings } from "./schema"
import { datingSavedViewScreen } from "./saved-views"
import { readDatingSettings, saveDatingSettings } from "./settings"
import { accountOwner, monthSpendDollars } from "./spend"
import { runDatingPass, startLoop } from "./worker"

const T0 = new Date("2099-01-01T12:00:00Z")

/**
 * Task "features/06-profiles": one member runs several dating profiles, each
 * with its own cards, chats, settings and spend, and only its owner sees it.
 */

describe("the move to profiles (drizzle/0108_date_profiles.sql)", () => {
  let client: PGlite

  beforeEach(async () => {
    client = new PGlite()
    const folder = new URL("../../../drizzle/", import.meta.url)
    const files = (await readdir(folder)).filter((file) => file.endsWith(".sql") && file < "0108").sort()
    for (const file of files) await client.exec(await readFile(new URL(file, folder), "utf8"))
  })

  afterEach(async () => {
    await client.close()
  })

  const rows = async <T,>(text: string, params: unknown[] = []) => (await client.query<T>(text, params)).rows

  it("makes a profile per phone and one for a member with no phone, and moves every record into its profile", async () => {
    const db = drizzle(client, { schema }) as unknown as CustomShellDb
    const tyler = (await insertUser(db)).id
    const sam = (await insertUser(db)).id
    const site = (await insertWorkspace(db)).id
    const pixel = uuid()
    const spare = uuid()
    await client.query(`INSERT INTO date_phones (id, user_id, workspace_id, name, created_at) VALUES ($1, $2, $3, 'Pixel', '2098-01-01'), ($4, $2, $3, 'Spare', '2098-02-01')`, [pixel, tyler, site, spare])
    await client.query(`INSERT INTO date_own_profile (phone_id, user_id, workspace_id, name) VALUES ($1, $2, $3, 'Tyler')`, [pixel, tyler, site])
    const onPixel = uuid()
    const onSpare = uuid()
    const sample = uuid()
    await client.query(
      `INSERT INTO date_profiles (id, user_id, workspace_id, phone_id, name, sample) VALUES ($1, $4, $5, $6, 'Maya', false), ($2, $4, $5, $7, 'Ana', false), ($3, $4, $5, NULL, 'Noor', true)`,
      [onPixel, onSpare, sample, tyler, site, pixel, spare]
    )
    const chat = uuid()
    await client.query(`INSERT INTO date_matches (id, user_id, workspace_id, phone_id, profile_id, their_name) VALUES ($1, $2, $3, $4, $5, 'Ana')`, [chat, tyler, site, spare, onSpare])
    await client.query(`INSERT INTO date_walks (id, user_id, workspace_id, phone_id, kind, asked_by) VALUES ($1, $2, $3, $4, 'read-card', 'ai')`, [uuid(), tyler, site, pixel])
    await client.query(`INSERT INTO date_settings (user_id, workspace_id, values) VALUES ($1, $3, '{"likeAbove": 70}'), ($2, $3, '{"likeAbove": 55}')`, [tyler, sam, site])
    await client.query(`INSERT INTO date_google_calendars (user_id, workspace_id, email, refresh_token_encrypted) VALUES ($1, $2, 'me@example.com', 'secret')`, [tyler, site])
    const aboutAna = uuid()
    const plain = uuid()
    await client.query(
      `INSERT INTO ai_usage_events (id, user_id, provider, model, feature, input_tokens, output_tokens, cost_cents, status, month_start, metadata, created_at)
       VALUES ($1, $3, 'anthropic', 'x', 'dating-read-card', 1, 1, 0, 'success', '2099-01-01', $4::jsonb, now()),
              ($2, $3, 'anthropic', 'x', 'dating-ask-matches', 1, 1, 0, 'success', '2099-01-01', '{}'::jsonb, now())`,
      [aboutAna, plain, tyler, JSON.stringify({ profileId: onSpare })]
    )

    await client.exec(await readFile(new URL("../../../drizzle/0108_date_profiles.sql", import.meta.url), "utf8"))

    const accounts = await rows<{ id: string; user_id: string; name: string; phone_id: string | null }>(`SELECT id, user_id, name, phone_id FROM date_accounts ORDER BY created_at`)
    const byPhone = (phone: string) => accounts.find((account) => account.phone_id === phone)
    expect(accounts.filter((account) => account.user_id === tyler).map((account) => account.name)).toEqual(["Tyler", "Tinder"])
    expect(accounts.filter((account) => account.user_id === sam)).toMatchObject([{ name: "Tinder", phone_id: null }])
    const first = byPhone(pixel)!.id
    const second = byPhone(spare)!.id

    const cards = await rows<{ id: string; account_id: string }>(`SELECT id, account_id FROM date_profiles`)
    expect(Object.fromEntries(cards.map((card) => [card.id, card.account_id]))).toEqual({ [onPixel]: first, [onSpare]: second, [sample]: first })
    expect(await rows(`SELECT account_id FROM date_matches`)).toEqual([{ account_id: second }])
    expect(await rows(`SELECT account_id FROM date_walks`)).toEqual([{ account_id: first }])
    expect(await rows(`SELECT account_id, name FROM date_own_profile`)).toEqual([{ account_id: first, name: "Tyler" }])

    // Settings are copied to each of the member's profiles; the calendar stays with the first, so no two share a Google sign-in.
    const settings = await rows<{ account_id: string; values: { likeAbove: number } }>(`SELECT account_id, values FROM date_settings WHERE user_id = $1`, [tyler])
    expect(settings.map((row) => [row.account_id, row.values.likeAbove]).sort()).toEqual([[first, 70], [second, 70]].sort())
    expect(await rows(`SELECT account_id FROM date_google_calendars`)).toEqual([{ account_id: first }])

    // This month's spend stays counted: by the card it was about, else the first profile.
    const spent = await rows<{ id: string; account: string }>(`SELECT id, metadata->>'accountId' AS account FROM ai_usage_events`)
    expect(Object.fromEntries(spent.map((row) => [row.id, row.account]))).toEqual({ [aboutAna]: second, [plain]: first })
  })
})

describe("profiles", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let workspaceId: string
  let phoneId: string
  let main: DatingAccount
  let other: DatingAccount

  beforeEach(async () => {
    vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "a key for these tests only")
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    workspaceId = (await insertWorkspace(db)).id
    phoneId = uuid()
    await db.insert(datePhones).values({ id: phoneId, userId, workspaceId, name: "Pixel 8a", keyEncrypted: "paired", timeZone: "UTC", lastSeenAt: T0, discoveryOwed: false })
    main = await insertAccount(db, { userId, workspaceId, phoneId, name: "Tyler" })
    other = await insertAccount(db, { userId, workspaceId, name: "Weekends" })
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await client.close()
  })

  async function card(account: DatingAccount, values: Partial<typeof dateProfiles.$inferInsert> = {}) {
    const id = uuid()
    await db.insert(dateProfiles).values({ id, userId, workspaceId, accountId: account.id, phoneId: account.phoneId, name: "Maya", readAt: T0, ...values })
    return id
  }

  async function chat(account: DatingAccount, values: Partial<typeof dateMatches.$inferInsert> = {}) {
    const id = uuid()
    await db.insert(dateMatches).values({ id, userId, workspaceId, accountId: account.id, phoneId: account.phoneId, theirName: "Noor", ...values })
    return id
  }

  describe("keeping profiles apart", () => {
    it("shows one profile's leads, settings and spend on its dashboard and none of the other's", async () => {
      await card(main, { name: "Maya" })
      await chat(main, { theirName: "Ana" })
      await saveDatingSettings(main, { ...DEFAULT_DATING_SETTINGS, likeAbove: 80 }, db, T0)
      await db.insert(customShellAiUsageEvents).values({
        id: uuid(),
        userId,
        provider: "anthropic",
        model: DATING_MODEL,
        feature: "dating-read-card",
        inputTokens: 1_000_000,
        outputTokens: 0,
        costCents: 0,
        status: "success",
        monthStart: "2099-01-01",
        metadata: { accountId: main.id },
        createdAt: T0,
      })

      const mine = await loadDashboard(main, db, T0)
      expect(mine.leads.map((lead) => lead.name).sort()).toEqual(["Ana", "Maya"])
      expect(mine.settings.likeAbove).toBe(80)
      expect(mine.spendDollars).toBe(4)
      expect(mine.phone?.id).toBe(phoneId)

      const theirs = await loadDashboard(other, db, T0)
      expect(theirs.leads).toEqual([])
      expect(theirs.settings.likeAbove).toBe(DEFAULT_DATING_SETTINGS.likeAbove)
      expect(theirs.spendDollars).toBe(0)
      expect(theirs.phone).toBeNull()
      expect(theirs.profile).toEqual({ id: other.id, name: "Weekends", app: "tinder", paused: false })
      expect(theirs.profiles.map((profile) => profile.name)).toEqual(["Tyler", "Weekends"])
      expect(await monthSpendDollars({ userId, accountId: other.id }, db, T0)).toBe(0)
    })

    it("counts what waits on the member per profile, the way the lead list does", async () => {
      await chat(main, { flaggedReason: "scam" })
      await chat(main, { draft: "Hi!" })
      await chat(main, { draft: "Timed", draftSendAt: T0 })
      await chat(main, { draft: "Over", endedAt: T0 })
      await chat(main, { draft: "Taken over", aiOff: true })
      await chat(other, { draft: "Theirs" })
      const waiting = async () => Object.fromEntries((await listProfiles(userId, workspaceId, db, T0)).map((profile) => [profile.name, profile.waiting]))
      expect(await waiting()).toEqual({ Tyler: 3, Weekends: 1 })
      // With automate on, a draft with a send time goes by itself.
      await saveDatingSettings(main, { ...DEFAULT_DATING_SETTINGS, automate: true }, db, T0)
      expect(await waiting()).toEqual({ Tyler: 2, Weekends: 1 })
      expect((await listProfiles(userId, workspaceId, db, T0))[0].phone).toEqual({ name: "Pixel 8a", here: true })
    })
  })

  describe("picking", () => {
    it("opens the pick, else the first profile, and makes a first one once for a member with none", async () => {
      expect((await openAccount(userId, workspaceId, db, T0)).id).toBe(main.id)
      await pickAccount(userId, workspaceId, other.id, db, T0)
      expect((await openAccount(userId, workspaceId, db, T0)).id).toBe(other.id)
      await db.delete(dateAccounts).where(eq(dateAccounts.id, other.id))
      expect((await openAccount(userId, workspaceId, db, T0)).id).toBe(main.id)

      const fresh = (await insertUser(db)).id
      const [a, b] = await Promise.all([openAccount(fresh, workspaceId, db, T0), openAccount(fresh, workspaceId, db, T0)])
      expect(a.id).toBe(b.id)
      expect(a).toMatchObject({ name: "Tinder", app: "tinder", phoneId: null })
    })

    it("refuses another member's profile as gone", async () => {
      const stranger = (await insertUser(db)).id
      const theirs = await insertAccount(db, { userId: stranger, workspaceId })
      await expect(ownAccount(userId, workspaceId, theirs.id, db)).rejects.toThrow("That profile is gone.")
      await expect(pickAccount(userId, workspaceId, theirs.id, db)).rejects.toThrow("That profile is gone.")
      const elsewhere = (await insertWorkspace(db)).id
      await expect(ownAccount(userId, elsewhere, main.id, db)).rejects.toThrow("That profile is gone.")
    })

    it("keeps saved views per profile, and only on the member's own", async () => {
      const stranger = (await insertUser(db)).id
      await expect(datingSavedViewScreen.authorize({ userId, recordId: main.id, database: db })).resolves.toBeUndefined()
      await expect(datingSavedViewScreen.authorize({ userId: stranger, recordId: main.id, database: db })).rejects.toThrow("That profile is gone.")
      await expect(datingSavedViewScreen.authorize({ userId, recordId: "", database: db })).rejects.toThrow("That profile is gone.")
    })
  })

  describe("New profile", () => {
    it("copies the open profile's settings but never its Google Calendar, and leaves the pick alone", async () => {
      await saveDatingSettings(main, { ...DEFAULT_DATING_SETTINGS, aboutMe: "I'm a designer.", likeAbove: 77 }, db, T0)
      await db.insert(dateGoogleCalendars).values({ accountId: main.id, userId, workspaceId, email: "me@example.com", refreshTokenEncrypted: "secret" })
      const made = await createAccount(main, { name: "  Second   Tinder ", app: "tinder" }, db, T0)
      expect(made).toMatchObject({ name: "Second Tinder", app: "tinder", phoneId: null })
      expect(await readDatingSettings(made.id, db)).toMatchObject({ aboutMe: "I'm a designer.", likeAbove: 77 })
      expect(await db.select().from(dateGoogleCalendars).where(eq(dateGoogleCalendars.accountId, made.id))).toEqual([])
      expect((await openAccount(userId, workspaceId, db, T0)).id).toBe(main.id)
    })

    it("refuses no name and Hinge, which isn't built yet", async () => {
      await expect(createAccount(main, { name: "  ", app: "tinder" }, db, T0)).rejects.toThrow("Give the profile a name.")
      await expect(createAccount(main, { name: "Hinge", app: "hinge" }, db, T0)).rejects.toThrow("Hinge isn't ready yet. Date runs Tinder only for now.")
    })
  })

  describe("two profiles on one phone", () => {
    it("refuses swiping hours that overlap the other profile's, naming it", async () => {
      const hinge = await insertAccount(db, { userId, workspaceId, phoneId, name: "Tyler", app: "hinge" })
      await saveDatingSettings(main, { ...DEFAULT_DATING_SETTINGS, scheduleStart: 19, scheduleEnd: 22 }, db, T0)
      await expect(saveDatingSettings(hinge, { ...DEFAULT_DATING_SETTINGS, scheduleStart: 21, scheduleEnd: 23 }, db, T0)).rejects.toThrow(
        "Tinder (Tyler) swipes on this phone from 19:00 to 22:00. Pick hours that don't overlap it."
      )
      // Running past midnight into the other's start overlaps too.
      await expect(saveDatingSettings(hinge, { ...DEFAULT_DATING_SETTINGS, scheduleStart: 23, scheduleEnd: 20 }, db, T0)).rejects.toThrow(/19:00 to 22:00/)
      await saveDatingSettings(hinge, { ...DEFAULT_DATING_SETTINGS, scheduleStart: 22, scheduleEnd: 23 }, db, T0)
      expect((await readDatingSettings(hinge.id, db)).scheduleStart).toBe(22)
      // A profile on another phone is never in the way.
      await saveDatingSettings(other, { ...DEFAULT_DATING_SETTINGS, scheduleStart: 19, scheduleEnd: 22 }, db, T0)
    })
  })

  describe("Pause", () => {
    it("stops the loop, calls off what waits on the phone, and the pass then leaves the profile alone", async () => {
      await db.update(datePhones).set({ running: true, runningSince: T0 }).where(eq(datePhones.id, phoneId))
      await db.insert(dateWalks).values({ id: uuid(), userId, workspaceId, accountId: main.id, phoneId, kind: "read-card", askedBy: "ai" })
      const unread = await card(main, { aiReadAt: null })
      await setAccountPaused(main, true, db, T0)

      const [phone] = await db.select().from(datePhones).where(eq(datePhones.id, phoneId))
      expect(phone).toMatchObject({ running: false, stopWhy: "The profile was paused." })
      expect((await db.select().from(dateWalks)).map((walk) => walk.status)).toEqual(["cancelled"])

      const asked: string[] = []
      const ask: AiAsk = async (question) => {
        asked.push(question.label)
        throw new Error("A paused profile must not reach the AI.")
      }
      const { work } = await runDatingPass(db, T0, { ask, drive: async () => ({ ok: true }) as never })
      await Promise.all(work)
      expect(asked).toEqual([])
      const [still] = await db.select().from(dateProfiles).where(eq(dateProfiles.id, unread))
      expect(still.aiStartedAt).toBeNull()

      // Pressed by hand too: nothing reaches the AI or spends while paused.
      const match = await chat(main)
      await expect(tidyReply(match, "hey want to get a drink", db, T0, { ask })).resolves.toMatchObject({ words: "This profile is paused. Resume it in the Dating settings first." })
      await expect(askAboutMatches(accountOwner(main), "Who likes hiking?", db, T0, { ask })).rejects.toThrow("This profile is paused.")
      expect(asked).toEqual([])

      const paused = (await ownAccount(userId, workspaceId, main.id, db))
      await expect(startLoop(paused, db, T0)).rejects.toThrow("This profile is paused. Resume it in the Dating settings first.")
      await expect(checkWalkAllowed({ userId, accountId: main.id, phoneId, kind: "read-card" }, db, T0)).rejects.toThrow(/paused/)

      await setAccountPaused(paused, false, db, T0)
      expect((await ownAccount(userId, workspaceId, main.id, db)).pausedAt).toBeNull()
    })

    it("refuses a walk for a phone that is not the profile's", async () => {
      await expect(checkWalkAllowed({ userId, accountId: other.id, phoneId, kind: "read-card" }, db, T0)).rejects.toThrow("Pixel 8a is not this profile's phone.")
    })
  })

  describe("Delete", () => {
    it("takes the profile's leads, chats, settings and phone with it, keeps a picture another profile still shows, and leaves the other alone", async () => {
      const picture = async (sha: string) => {
        const id = uuid()
        await db.insert(datePictures).values({ id, userId, kind: "photo", sha256: sha })
        return id
      }
      const onlyMine = await picture("a".repeat(64))
      const shared = await picture("b".repeat(64))
      await card(main, { photoIds: [onlyMine, shared] })
      await card(main, { name: "Ruth" })
      const match = await chat(main, { profileId: null })
      await db.insert(dateMessages).values({ id: uuid(), userId, matchId: match, direction: "in", sentBy: "them", text: "Hi", hash: "h", position: 1 })
      await saveDatingSettings(main, DEFAULT_DATING_SETTINGS, db, T0)
      await card(other, { photoIds: [shared] })
      await chat(other)
      const view = (accountId: string) => ({ id: uuid(), userId, screen: `dating:${accountId}`, name: "Waiting", filters: {}, createdAt: T0, updatedAt: T0 })
      await db.insert(schema.customShellSavedViews).values([view(main.id), view(other.id)])

      expect(await accountCounts(main.id, db)).toEqual({ leads: 3, chats: 1 })
      await deleteAccount(main, db, T0)

      expect(await db.select().from(dateAccounts)).toMatchObject([{ id: other.id }])
      expect((await db.select().from(dateProfiles)).every((row) => row.accountId === other.id)).toBe(true)
      expect((await db.select().from(dateMatches)).every((row) => row.accountId === other.id)).toBe(true)
      expect(await db.select().from(dateMessages)).toEqual([])
      expect(await db.select().from(dateSettings).where(eq(dateSettings.accountId, main.id))).toEqual([])
      expect(await db.select().from(datePhones)).toEqual([])
      expect((await db.select().from(datePictures)).map((row) => row.id)).toEqual([shared])
      expect((await db.select().from(schema.customShellSavedViews)).map((row) => row.screen)).toEqual([`dating:${other.id}`])
      // The member's next load opens what is left.
      expect((await openAccount(userId, workspaceId, db, T0)).id).toBe(other.id)
    })
  })
})
