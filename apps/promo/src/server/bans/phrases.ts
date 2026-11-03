import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm"

import { banKindFromWords } from "@/lib/bans/options"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { clearBanScreen } from "@/server/phones/health"
import { clearProblem } from "@/server/phones/notices"
import { promoAccounts } from "@/server/social/schema"

import { keepBanPicture, recordBan } from "./record"
import { promoBanPhrases, promoBans } from "./schema"

/**
 * Screens Promo did not know (Bans task, part 9).
 *
 * After every app action the rack also looks for a ban word ("suspended",
 * "banned", "disabled", "locked", "violat", "restricted") on a short screen
 * that matched no known line. That screen stops the account like a ban,
 * keeps its picture, and asks a person. "It's a ban" writes the ban record
 * and teaches the rack the line, so the next copy of that screen is a
 * normal ban. "Not a ban" lets the account run again and teaches the rack
 * the line is harmless, so the same screen never stops it twice.
 */

/** Keeps the screen and its line, waiting for a person's answer. The same line asked again is one question. */
export async function askAboutScreen(
  userId: string,
  input: { accountId: string; app: string; line: string; words: string; phoneId: string; actionId: string | null },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const line = (input.line || input.words).trim().slice(0, 500)
  if (!line) return
  const id = uuid()
  const put = await db
    .insert(promoBanPhrases)
    .values({
      id,
      userId,
      app: input.app,
      line,
      accountId: input.accountId,
      phoneId: input.phoneId,
      actionId: input.actionId,
      words: input.words.slice(0, 2_000),
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [promoBanPhrases.userId, promoBanPhrases.app, promoBanPhrases.line],
      // Asked again only while nobody has answered; an answered line is the rack's to apply.
      set: { accountId: input.accountId, phoneId: input.phoneId, actionId: input.actionId, words: input.words.slice(0, 2_000), createdAt: now },
      setWhere: eq(promoBanPhrases.verdict, ""),
    })
    .returning({ id: promoBanPhrases.id })
  if (put[0] && input.actionId) {
    const key = await keepBanPicture(input.actionId, `phrase-${put[0].id}`, db)
    if (key) await db.update(promoBanPhrases).set({ pictureKey: key }).where(eq(promoBanPhrases.id, put[0].id))
  }
}

/** A person's earlier answer about this line, or '' while it is unanswered or new. */
export async function answeredLine(userId: string, app: string, line: string, db: CustomShellDb = defaultDb): Promise<"" | "ban" | "harmless"> {
  const plain = line.trim().slice(0, 500)
  if (!plain) return ""
  const [row] = await db
    .select({ verdict: promoBanPhrases.verdict })
    .from(promoBanPhrases)
    .where(and(eq(promoBanPhrases.userId, userId), eq(promoBanPhrases.app, app), eq(promoBanPhrases.line, plain)))
    .limit(1)
  return row?.verdict ?? ""
}

export type UnknownScreenView = {
  id: string
  app: string
  line: string
  words: string
  account: { id: string; platform: string; handle: string } | null
  phoneId: string | null
  hasPicture: boolean
  at: Date
}

/** The screens still waiting for an answer, newest first. */
export async function unknownScreens(userId: string, db: CustomShellDb = defaultDb): Promise<UnknownScreenView[]> {
  const rows = await db
    .select({ phrase: promoBanPhrases, platform: promoAccounts.platform, handle: promoAccounts.handle })
    .from(promoBanPhrases)
    .leftJoin(promoAccounts, eq(promoAccounts.id, promoBanPhrases.accountId))
    .where(and(eq(promoBanPhrases.userId, userId), eq(promoBanPhrases.verdict, "")))
    .orderBy(desc(promoBanPhrases.createdAt))
    .limit(50)
  return rows.map(({ phrase, platform, handle }) => ({
    id: phrase.id,
    app: phrase.app,
    line: phrase.line,
    words: phrase.words,
    account: phrase.accountId && platform !== null ? { id: phrase.accountId, platform, handle: handle ?? "" } : null,
    phoneId: phrase.phoneId,
    hasPicture: Boolean(phrase.pictureKey),
    at: phrase.createdAt,
  }))
}

/** The lines the rack adds to its ban list, and the ones it skips, with each action it asks for. */
export async function learnedPhrases(
  userId: string,
  db: CustomShellDb = defaultDb
): Promise<{ bans: Array<{ app: string; line: string }>; harmless: Array<{ app: string; line: string }> }> {
  const rows = await db
    .select({ app: promoBanPhrases.app, line: promoBanPhrases.line, verdict: promoBanPhrases.verdict })
    .from(promoBanPhrases)
    .where(and(eq(promoBanPhrases.userId, userId), inArray(promoBanPhrases.verdict, ["ban", "harmless"])))
    .limit(500)
  return {
    bans: rows.filter((row) => row.verdict === "ban").map(({ app, line }) => ({ app, line })),
    harmless: rows.filter((row) => row.verdict === "harmless").map(({ app, line }) => ({ app, line })),
  }
}

/**
 * A person's answer. "It's a ban" writes the ban record for the account the
 * screen stopped, which stays stopped. "Not a ban" lets it run again at full
 * pace. Either way the line is learned, and the bell's question goes.
 */
export async function answerScreen(
  userId: string,
  phraseId: string,
  verdict: "ban" | "harmless",
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const [phrase] = await db
    .update(promoBanPhrases)
    .set({ verdict, answeredAt: now })
    .where(and(eq(promoBanPhrases.id, phraseId), eq(promoBanPhrases.userId, userId), eq(promoBanPhrases.verdict, "")))
    .returning()
  if (!phrase) throw new Error("That screen was already answered.")
  // Every account of the app the same screen stopped, not only the last one
  // asked about: in a crackdown several hit it before anybody answers. An
  // unknown screen's stop holds the screen's words and writes no ban row.
  const stopped = await db
    .select({ id: promoAccounts.id })
    .from(promoAccounts)
    .where(
      and(
        eq(promoAccounts.userId, userId),
        eq(promoAccounts.platform, phrase.app),
        isNotNull(promoAccounts.banScreenAt),
        sql`strpos(${promoAccounts.blockedReason}, ${phrase.line}) > 0`,
        sql`NOT EXISTS (SELECT 1 FROM ${promoBans} WHERE ${promoBans.accountId} = ${promoAccounts.id} AND ${promoBans.letRunAt} IS NULL AND ${promoBans.cleanedUpAt} IS NULL)`
      )
    )
  const ids = new Set([...stopped.map((row) => row.id), ...(phrase.accountId ? [phrase.accountId] : [])])
  for (const accountId of ids) {
    const [account] = await db.select({ banScreenAt: promoAccounts.banScreenAt }).from(promoAccounts).where(eq(promoAccounts.id, accountId)).limit(1)
    if (account?.banScreenAt) {
      if (verdict === "ban") {
        // Still stopped: the screen stopped it, and that stands.
        const actionId = accountId === phrase.accountId ? phrase.actionId : null
        await recordBan(userId, { accountId, kind: banKindFromWords(phrase.line, phrase.app), words: phrase.words, actionId }, db, now)
      } else {
        await clearBanScreen(userId, accountId, db, now, { slow: false })
      }
    }
    await clearProblem(userId, "ban_unknown", accountId, null, db, now)
  }
}
