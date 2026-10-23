import { and, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm"

import { IMPORTANCE_WORDS, type AccountImportance } from "@/lib/social/importance"
import { handleWords } from "@/lib/social/networks"
import { Refusal } from "@/server/browser/refusal"
import { promoProfiles } from "@/server/browser/schema"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { promoPhones } from "@/server/phones/schema"

import { promoLinkedinComments, promoLinkedinConnects, promoLinkedinPosts } from "./linkedin/schema"
import { promoAccounts, promoComments, promoFinds, promoJobs, promoPosts } from "./schema"

/**
 * Keeps important and throwaway accounts apart (part 22 of the phone farm).
 *
 * Tyler's plan: important accounts on real phones, throwaways on browser
 * profiles. A throwaway that gets banned must never lead back to an
 * important one, so Promo refuses whatever would link the two groups, each
 * with its own sentence, and changes nothing:
 *
 * - an important account set to run on a browser profile;
 * - a throwaway set onto a phone that held an important account since its
 *   last wipe;
 * - a phone and a browser profile using the same proxy;
 * - one voice shared by both groups;
 * - one project holding both groups (Tyler, 14 Oct 2026);
 * - a throwaway commenting on a post by an important account, or answering
 *   one of its replies;
 * - a throwaway's words naming an important account, as u/name, a link to
 *   its profile, or a link to one of its posts or comments (Tyler, 14 Oct);
 * - either group commenting under a post the other group already commented
 *   on, or has a comment on its way to (Tyler, 14 Oct).
 *
 * Every account starts as throwaway, and marking one important is one way.
 * Every refusal here says the groups are "kept apart", which the dashboards'
 * error lookups pass through word for word (`src/lib/social/refusal-words.ts`).
 */

const APART = "Important and throwaway accounts are kept apart"

type AccountRow = typeof promoAccounts.$inferSelect

/**
 * Accounts of the other group. A throwaway on its way to a phone counts as
 * important already, since it will be the moment the phone reads it signed
 * in; otherwise a throwaway could share its voice or project meanwhile.
 */
function otherGroup(importance: AccountImportance) {
  return importance === "important"
    ? and(eq(promoAccounts.importance, "throwaway"), isNull(promoAccounts.movingToPhoneId))
    : or(eq(promoAccounts.importance, "important"), isNotNull(promoAccounts.movingToPhoneId))
}

/** The group an account counts in now: a throwaway on its way to a phone is important already. */
function effectiveGroup(account: { importance: AccountImportance; movingToPhoneId?: string | null }): AccountImportance {
  return account.importance === "important" || account.movingToPhoneId ? "important" : "throwaway"
}

function name(account: { handle: string; platform?: string }): string {
  return account.handle ? handleWords(account.platform ?? "reddit", account.handle) : "this account"
}

/** An important account runs on a phone only. */
export function refuseImportantOnProfile(
  account: Pick<AccountRow, "handle" | "importance">,
  input: { profileId: string | null }
): void {
  if (account.importance === "important" && input.profileId) {
    throw new Error(
      `${APART}: ${name(account)} is important, so it runs on a phone only, never on a browser profile. Pick a phone.`
    )
  }
}

/**
 * A phone that held an important account since its last wipe takes no
 * throwaway: the phone's own history would tie the two together.
 */
export async function refuseThrowawayOnImportantPhone(
  userId: string,
  account: Pick<AccountRow, "handle" | "importance">,
  phoneId: string | null,
  db: CustomShellDb = defaultDb
): Promise<void> {
  if (!phoneId || account.importance !== "throwaway") return
  const [phone] = await db
    .select({ name: promoPhones.name, heldImportantAt: promoPhones.heldImportantAt })
    .from(promoPhones)
    .where(and(eq(promoPhones.id, phoneId), eq(promoPhones.userId, userId)))
    .limit(1)
  if (phone?.heldImportantAt) {
    throw new Error(
      `${APART}: the phone ${phone.name} held an important account, so a throwaway like ${name(account)} may not run on it until it is wiped. Wipe it from its window on the Phones dashboard first.`
    )
  }
}

/**
 * A proxy is used by phones or by browser profiles, never by both, so a
 * banned throwaway's address never leads to an important account's phone.
 * The reader browser is a profile too. `saving` is the kind of record being
 * saved, which may keep its own proxy: only the other kind is looked at.
 */
export async function refuseSharedProxy(
  userId: string,
  proxyId: string | null,
  saving: "phone" | "profile",
  db: CustomShellDb = defaultDb
): Promise<void> {
  if (!proxyId) return
  if (saving === "phone") {
    const [profile] = await db
      .select({ name: promoProfiles.name })
      .from(promoProfiles)
      .where(and(eq(promoProfiles.userId, userId), eq(promoProfiles.proxyId, proxyId)))
      .limit(1)
    if (profile) {
      throw new Error(
        `${APART}: that proxy is already used by the browser profile ${profile.name}. A phone and a browser profile never share a proxy, or a banned throwaway's address leads to the phone. Pick another proxy.`
      )
    }
    return
  }
  const [phone] = await db
    .select({ name: promoPhones.name })
    .from(promoPhones)
    .where(and(eq(promoPhones.userId, userId), eq(promoPhones.proxyId, proxyId)))
    .limit(1)
  if (phone) {
    throw new Error(
      `${APART}: that proxy is already used by the phone ${phone.name}. A phone and a browser profile never share a proxy, or a banned throwaway's address leads to the phone. Pick another proxy.`
    )
  }
}

/** One voice is never shared by an important and a throwaway account. */
export async function refuseMixedVoice(
  userId: string,
  given: { id: string | null; handle: string; importance: AccountImportance; movingToPhoneId?: string | null },
  voiceId: string | null,
  db: CustomShellDb = defaultDb
): Promise<void> {
  if (!voiceId) return
  const account = { ...given, importance: effectiveGroup(given) }
  const [other] = await db
    .select({ handle: promoAccounts.handle, importance: promoAccounts.importance, movingToPhoneId: promoAccounts.movingToPhoneId })
    .from(promoAccounts)
    .where(
      and(
        eq(promoAccounts.userId, userId),
        eq(promoAccounts.voiceId, voiceId),
        otherGroup(account.importance),
        ...(account.id ? [ne(promoAccounts.id, account.id)] : [])
      )
    )
    .limit(1)
  if (other) {
    throw new Error(
      `${APART}: that voice is used by the ${effectiveGroup(other)} account ${name(other)}, and ${name(account)} is ${IMPORTANCE_WORDS[account.importance].toLowerCase()}. Two accounts writing alike is a link. Pick another voice, or make a copy of it on the Voices dashboard.`
    )
  }
}

/** A project holds important accounts or throwaways, never both (Tyler, 14 Oct 2026). */
export async function refuseMixedProject(
  userId: string,
  given: { id: string; handle: string; importance: AccountImportance; movingToPhoneId?: string | null },
  projectId: string | null,
  db: CustomShellDb = defaultDb
): Promise<void> {
  if (!projectId) return
  const account = { ...given, importance: effectiveGroup(given) }
  const [other] = await db
    .select({ handle: promoAccounts.handle, importance: promoAccounts.importance, movingToPhoneId: promoAccounts.movingToPhoneId })
    .from(promoAccounts)
    .where(
      and(
        eq(promoAccounts.userId, userId),
        eq(promoAccounts.projectId, projectId),
        otherGroup(account.importance),
        ne(promoAccounts.id, account.id),
        isNull(promoAccounts.retiredAt)
      )
    )
    .limit(1)
  if (other) {
    throw new Error(
      `${APART}: this project already has the ${effectiveGroup(other)} account ${name(other)}, and ${name(account)} is ${IMPORTANCE_WORDS[account.importance].toLowerCase()}. A project holds one kind only, so the two never promote the same thing.`
    )
  }
}

/** The important accounts' handles, lower case, counting a throwaway on its way to a phone, for the interaction checks. */
async function importantHandles(userId: string, db: CustomShellDb): Promise<Map<string, string>> {
  const rows = await db
    .select({ handle: promoAccounts.handle })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.userId, userId), otherGroup("throwaway"), ne(promoAccounts.handle, "")))
  return new Map(rows.map((row) => [row.handle.toLowerCase(), row.handle]))
}

/** Reddit's own ids inside an address: a post's after /comments/, a comment's after the post's slug. */
export function redditIds(url: string): { post: string; comment: string } {
  const found = url.match(/\/comments\/([a-z0-9]+)(?:\/[^/?#]*\/([a-z0-9]+))?/i)
  return { post: found?.[1]?.toLowerCase() ?? "", comment: found?.[2]?.toLowerCase() ?? "" }
}

/**
 * Which important account the words name, or null: u/name, a link to its
 * profile, or a link to one of its own posts or comments.
 */
function namedImportant(
  words: string,
  handles: Map<string, string>,
  links: { posts: Map<string, string>; comments: Map<string, string> }
): string | null {
  const lower = words.toLowerCase()
  for (const [handle, shown] of handles) {
    const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const mention = new RegExp(`(^|[^a-z0-9_-])(/?u/|reddit\\.com/user/|reddit\\.com/u/)${escaped}(?![a-z0-9_-])`, "i")
    if (mention.test(lower)) return shown
  }
  for (const match of lower.matchAll(/\/comments\/([a-z0-9]+)(?:\/[^/\s?#]*\/([a-z0-9]+))?/g)) {
    const post = match[1] ?? ""
    const comment = match[2] ?? ""
    if (comment && links.comments.has(comment)) return links.comments.get(comment) ?? null
    if (!comment && links.posts.has(post)) return links.posts.get(post) ?? null
  }
  for (const match of lower.matchAll(/redd\.it\/([a-z0-9]+)/g)) {
    if (links.posts.has(match[1] ?? "")) return links.posts.get(match[1] ?? "") ?? null
  }
  return null
}

/** The important accounts' own posts and comments, by Reddit id, each with its account's handle. */
async function importantLinks(
  userId: string,
  db: CustomShellDb
): Promise<{ posts: Map<string, string>; comments: Map<string, string> }> {
  const comments = await db
    .select({ url: promoComments.commentUrl, handle: promoAccounts.handle })
    .from(promoComments)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoComments.accountId))
    .where(and(eq(promoComments.userId, userId), otherGroup("throwaway"), ne(promoComments.commentUrl, "")))
  const posts = await db
    .select({ url: promoPosts.postUrl, handle: promoAccounts.handle })
    .from(promoPosts)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoPosts.accountId))
    .where(and(eq(promoPosts.userId, userId), otherGroup("throwaway"), ne(promoPosts.postUrl, "")))
  const byComment = new Map<string, string>()
  for (const row of comments) {
    const { comment } = redditIds(row.url)
    if (comment) byComment.set(comment, row.handle)
  }
  const byPost = new Map<string, string>()
  for (const row of posts) {
    const { post } = redditIds(row.url)
    if (post) byPost.set(post, row.handle)
  }
  return { posts: byPost, comments: byComment }
}

/**
 * Refuses a comment, an answer to a reply, a post of your own or an edit
 * that would tie the account to the other group. Run where each is queued,
 * after a person pressed the button and before anything goes to Reddit.
 */
export async function refuseInteraction(
  userId: string,
  account: Pick<AccountRow, "id" | "handle" | "importance" | "movingToPhoneId">,
  what: {
    /** The author of the post being commented on. */
    postAuthor?: string
    /** The author of the reply being answered. */
    replyAuthor?: string
    /** Reddit's id of the post being commented under. */
    redditPostId?: string
    /** Everything that will be written: the comment, or a post's title and body. */
    words: string[]
  },
  db: CustomShellDb = defaultDb
): Promise<void> {
  // A throwaway on its way to a phone is held to the important side's rules.
  const group = effectiveGroup(account)
  if (group === "throwaway") {
    const handles = await importantHandles(userId, db)
    if (handles.size) {
      const author = what.postAuthor?.toLowerCase()
      if (author && handles.has(author)) {
        throw new Refusal(
          `${APART}: that post is by your important account u/${handles.get(author)}, and ${name(account)} is a throwaway. Comment from an important account instead.`
        )
      }
      const replier = what.replyAuthor?.toLowerCase()
      if (replier && handles.has(replier)) {
        throw new Refusal(
          `${APART}: that reply is by your important account u/${handles.get(replier)}, and ${name(account)} is a throwaway. It is not answered.`
        )
      }
      const named = namedImportant(what.words.join("\n"), handles, await importantLinks(userId, db))
      if (named) {
        throw new Refusal(
          `${APART}: the words name your important account u/${named}, or link to its profile, a post or a comment, and ${name(account)} is a throwaway. Take that out first.`
        )
      }
    }
  }

  if (what.redditPostId) {
    const other = await otherGroupOnPost(userId, group, what.redditPostId, db)
    if (other) {
      throw new Refusal(
        `${APART}: the ${effectiveGroup(other)} account ${name(other)} already commented under this post${other.waiting ? ", or has a comment on its way" : ""}, and ${name(account)} is ${group}. Two groups under one post is a link.`
      )
    }
  }
}

/**
 * X's own checks (X task, part 8). A throwaway X account never replies to or
 * quotes a post by an important account, never names it as @name, and never
 * links its x.com page or one of its posts. Two of the person's accounts
 * never meet under one post at all on X (`refuseSecondAccountOnPost` in
 * `x/posting.ts`), so the two groups cannot meet there either.
 */
export async function refuseXInteraction(
  userId: string,
  account: Pick<AccountRow, "id" | "handle" | "importance" | "movingToPhoneId">,
  what: { postAuthor?: string; words: string[] },
  db: CustomShellDb = defaultDb
): Promise<void> {
  if (effectiveGroup(account) !== "throwaway") return
  const rows = await db
    .select({ handle: promoAccounts.handle })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.userId, userId), eq(promoAccounts.platform, "x"), otherGroup("throwaway"), ne(promoAccounts.handle, "")))
  if (!rows.length) return
  const handles = new Map(rows.map((row) => [row.handle.toLowerCase(), row.handle]))
  const author = what.postAuthor?.toLowerCase()
  if (author && handles.has(author)) {
    throw new Refusal(
      `${APART}: that post is by your important account @${handles.get(author)}, and ${name(account)} is a throwaway. Reply from an important account instead.`
    )
  }
  const words = what.words.join("\n").toLowerCase()
  for (const [handle, shown] of handles) {
    const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const named = new RegExp(`(^|[^a-z0-9_])(@|(?:x|twitter)\\.com/)${escaped}(?![a-z0-9_])`, "i")
    if (named.test(words)) {
      throw new Refusal(
        `${APART}: the words name your important account @${shown}, or link to its page or a post, and ${name(account)} is a throwaway. Take that out first.`
      )
    }
  }
}

/**
 * LinkedIn's own checks (LinkedIn task, part 6). A throwaway LinkedIn account
 * never comments on, reacts to or reposts a post by an important account,
 * never connects with one, never tags one, and never links its page. Two of
 * the person's accounts never meet under one post at all on LinkedIn
 * (`refuseSecondAccountOnPost` in `linkedin/posting.ts`), and an important
 * account never connects with a throwaway either, so the two groups cannot
 * meet there. Nor do the two groups ever ask the same person to connect, or
 * repost a post the other group commented on or reposted.
 */
export async function refuseLinkedinInteraction(
  userId: string,
  account: Pick<AccountRow, "id" | "handle" | "importance" | "movingToPhoneId">,
  what: { postAuthor?: string; connectTo?: string; repostOf?: string; words: string[]; tags?: string[] },
  db: CustomShellDb = defaultDb
): Promise<void> {
  const group = effectiveGroup(account)
  const who = name({ handle: account.handle, platform: "linkedin" })
  const rows = await db
    .select({ id: promoAccounts.id, handle: promoAccounts.handle })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.userId, userId), eq(promoAccounts.platform, "linkedin"), otherGroup(group), ne(promoAccounts.handle, "")))
  if (!rows.length) return
  const others = new Map(rows.map((row) => [row.handle.toLowerCase(), row.handle]))
  const otherIds = rows.map((row) => row.id)
  const otherWord = group === "throwaway" ? "an important" : "a throwaway"
  const connectTo = what.connectTo?.toLowerCase()
  if (connectTo && others.has(connectTo)) {
    throw new Refusal(
      `${APART}: in/${others.get(connectTo)} is your ${group === "throwaway" ? "important" : "throwaway"} account, and ${who} is ${group === "throwaway" ? "a throwaway" : "important"}. The two never connect.`
    )
  }
  if (connectTo) {
    const [asked] = await db
      .select({ id: promoLinkedinConnects.id })
      .from(promoLinkedinConnects)
      .where(
        and(
          eq(promoLinkedinConnects.userId, userId),
          inArray(promoLinkedinConnects.accountId, otherIds),
          inArray(promoLinkedinConnects.status, ["waiting", "sent"]),
          sql`lower(${promoLinkedinConnects.slug}) = ${connectTo}`
        )
      )
      .limit(1)
    if (asked) throw new Refusal(`${APART}: ${otherWord} account of yours already asked this person to connect, so ${who} does not.`)
  }
  if (what.repostOf) {
    const [commented] = await db
      .select({ id: promoLinkedinComments.id })
      .from(promoLinkedinComments)
      .where(
        and(
          eq(promoLinkedinComments.userId, userId),
          inArray(promoLinkedinComments.accountId, otherIds),
          eq(promoLinkedinComments.targetId, what.repostOf),
          inArray(promoLinkedinComments.status, ["waiting", "posted"])
        )
      )
      .limit(1)
    const [reposted] = await db
      .select({ id: promoLinkedinPosts.id })
      .from(promoLinkedinPosts)
      .where(
        and(
          eq(promoLinkedinPosts.userId, userId),
          inArray(promoLinkedinPosts.accountId, otherIds),
          eq(promoLinkedinPosts.repostOf, what.repostOf),
          inArray(promoLinkedinPosts.status, ["waiting", "posted"])
        )
      )
      .limit(1)
    if (commented || reposted) {
      throw new Refusal(`${APART}: ${otherWord} account of yours already ${commented ? "commented on" : "reposted"} this post, so ${who} does not repost it.`)
    }
  }
  if (group !== "throwaway") return
  const author = what.postAuthor?.toLowerCase()
  if (author && others.has(author)) {
    throw new Refusal(
      `${APART}: that post is by your important account in/${others.get(author)}, and ${who} is a throwaway. Comment from an important account instead.`
    )
  }
  for (const tag of what.tags ?? []) {
    const shown = others.get(tag.toLowerCase())
    if (shown) throw new Refusal(`${APART}: the post tags your important account in/${shown}, and ${who} is a throwaway. Take the tag out first.`)
  }
  const words = what.words.join("\n").toLowerCase()
  for (const [handle, shown] of others) {
    const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    if (new RegExp(`linkedin\\.com/in/${escaped}(?![\\p{L}\\p{N}_-])`, "iu").test(words)) {
      throw new Refusal(`${APART}: the words link to your important account in/${shown}, and ${who} is a throwaway. Take that out first.`)
    }
  }
}

/** An account of the other group with a comment under the same Reddit post, sent or on its way. */
async function otherGroupOnPost(
  userId: string,
  group: AccountImportance,
  redditPostId: string,
  db: CustomShellDb
): Promise<{ handle: string; importance: AccountImportance; movingToPhoneId: string | null; waiting: boolean } | null> {
  const finds = (
    await db
      .select({ id: promoFinds.id })
      .from(promoFinds)
      .where(and(eq(promoFinds.userId, userId), eq(promoFinds.redditId, redditPostId)))
  ).map((row) => row.id)
  if (!finds.length) return null
  const [sent] = await db
    .select({ handle: promoAccounts.handle, importance: promoAccounts.importance, movingToPhoneId: promoAccounts.movingToPhoneId })
    .from(promoComments)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoComments.accountId))
    .where(
      and(
        eq(promoComments.userId, userId),
        inArray(promoComments.findId, finds),
        eq(promoComments.status, "posted"),
        otherGroup(group)
      )
    )
    .limit(1)
  if (sent) return { ...sent, waiting: false }
  const [waiting] = await db
    .select({ handle: promoAccounts.handle, importance: promoAccounts.importance, movingToPhoneId: promoAccounts.movingToPhoneId })
    .from(promoJobs)
    .innerJoin(promoAccounts, sql`${promoAccounts.id} = ${promoJobs.payload}->>'accountId'`)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "comment"),
        inArray(promoJobs.status, ["queued", "running"]),
        inArray(sql`${promoJobs.payload}->>'findId'`, finds),
        otherGroup(group)
      )
    )
    .limit(1)
  return waiting ? { ...waiting, waiting: true } : null
}

/**
 * Marks an account important, from its settings on the Reddit accounts
 * dashboard. One way only (Tyler, 14 Oct 2026). Refused while it runs on a
 * browser profile (Move to a phone does that, and marks it important when it
 * is done), while its voice is a throwaway's too, and while its project
 * holds throwaways. Its phone is marked as having held an important account.
 */
export async function markImportant(
  userId: string,
  accountId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account) throw new Error("That account is not there any more.")
  if (account.importance === "important") return
  if (!account.phoneId) {
    throw new Error(
      `${APART}: ${name(account)} runs on ${account.profileId ? "a browser profile" : "nothing yet"}, and an important account runs on a phone only. Use Move to a phone, which marks it important once the phone reads it signed in.`
    )
  }
  const asImportant = { id: account.id, handle: account.handle, importance: "important" as const }
  await refuseMixedVoice(userId, asImportant, account.voiceId, db)
  await refuseMixedProject(userId, asImportant, account.projectId, db)
  await db
    .update(promoAccounts)
    .set({ importance: "important", updatedAt: now })
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
  await noteImportantOnPhone(userId, account.phoneId, db, now)
}

/** Marks the phone as having held an important account since its last wipe, once. */
export async function noteImportantOnPhone(
  userId: string,
  phoneId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  await db
    .update(promoPhones)
    .set({ heldImportantAt: now })
    .where(and(eq(promoPhones.id, phoneId), eq(promoPhones.userId, userId), isNull(promoPhones.heldImportantAt)))
}
