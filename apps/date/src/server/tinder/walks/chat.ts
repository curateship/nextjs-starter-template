import { eq } from "drizzle-orm"

import { averageHash, cropScreenshot, hashDistance, keepPicture } from "@/server/phone/pictures"

import { findNode, isVisible, screenTexts, type ScreenNode } from "../screen"
import { dateMatches, dateMessages } from "../schema"
import { markTheyLeft, saveChatList, saveConversation, settleMessage, type ListedChat } from "../store"
import { FrozenError, onChatList, WalkError, type Seen, type WalkContext, type WalkKit } from "./kit"
import { prependOlder, readBubbles, readChatList, sameBubbles, type Bubble, type ChatRow } from "./parse"

/** How many screenfuls of the chat list are read for one look. */
const MAX_LIST_SCROLLS = 4

/** How far back a conversation is read, in screenfuls. */
const MAX_CHAT_SCROLLS = 8

/**
 * The chat walks, the same on Tinder and on Facebook Dating: the chat list,
 * one conversation, sending and unmatching. The words come from the walk's
 * app (`kit.app`).
 */
async function toChatList(kit: WalkKit): Promise<Seen> {
  return kit.goToTab(await kit.openApp(), kit.app.words.tabChat, (screen) => onChatList(kit.app, screen), "chat")
}

async function avatarOf(seen: Seen, row: ChatRow): Promise<{ hash: string; jpeg: Buffer | null }> {
  if (!row.avatar || !seen.shot) return { hash: "", jpeg: null }
  const jpeg = await cropScreenshot(seen.shot, row.avatar, seen.screen.screenWidth)
  return { hash: await averageHash(jpeg), jpeg }
}

/**
 * Reads the chat list: the new matches across the top and the conversations
 * under them, a few screenfuls down. New people become matches; a last line
 * that changed marks that conversation to be read.
 */
export async function readMatches(ctx: WalkContext, kit: WalkKit): Promise<Record<string, unknown>> {
  let seen = await toChatList(kit)
  const chats = new Map<string, ListedChat>()
  const take = async (screenSeen: Seen) => {
    let added = 0
    for (const row of readChatList(screenSeen.screen, kit.app)) {
      const key = `${row.isNew ? "new" : "chat"}:${row.name}:${row.preview}`
      if (chats.has(key)) continue
      const avatar = await avatarOf(screenSeen, row)
      const photoId = avatar.jpeg ? await keepPicture(ctx.phone.userId, avatar.jpeg, "photo", ctx.db, ctx.now()) : null
      chats.set(key, { name: row.name, preview: row.preview, avatarHash: avatar.hash, photoId, isNew: row.isNew })
      added += 1
    }
    return added
  }
  await take(seen)
  // A scroll that shows nobody new is the bottom of the list, so the read is
  // complete and a chat not in it has gone from the app.
  let complete = false
  for (let scrolls = 0; scrolls < MAX_LIST_SCROLLS; scrolls += 1) {
    seen = await kit.scroll(seen, "up", 600)
    if (!(await take(seen))) {
      complete = true
      break
    }
  }
  const listed = Array.from(chats.values())
  const saved = await saveChatList(
    { userId: ctx.phone.userId, workspaceId: ctx.phone.workspaceId, phoneId: ctx.phone.id, accountId: ctx.phone.accountId },
    listed,
    ctx.db,
    ctx.now(),
    complete
  )
  return { listed: listed.length, added: saved.added, toRead: saved.toRead, complete, theyUnmatched: saved.theyUnmatched }
}

export async function matchFor(ctx: WalkContext, input: Record<string, unknown>) {
  const matchId = typeof input.matchId === "string" ? input.matchId : ""
  const [match] = await ctx.db.select().from(dateMatches).where(eq(dateMatches.id, matchId)).limit(1)
  if (!match || match.accountId !== ctx.phone.accountId) throw new WalkError("That match is gone.")
  if (match.unmatchedAt) throw new WalkError(`You unmatched ${match.theirName}.`)
  return match
}

/**
 * Opens one person's conversation from the chat list, scrolling down the list
 * to find them. Two people of one name are told apart by their picture. The
 * conversation's header has to show their name, or nothing more is done.
 */
export async function openConversation(
  kit: WalkKit,
  match: { theirName: string; avatarHash: string }
): Promise<Seen> {
  let seen = await toChatList(kit)
  // The app keeps the list where it was left, so it goes back to the top first.
  for (let scrolls = 0; scrolls < MAX_LIST_SCROLLS; scrolls += 1) {
    const before = readChatList(seen.screen, kit.app).map((row) => row.name).join("|")
    const higher = await kit.scroll(seen, "down", 500)
    const after = readChatList(higher.screen, kit.app).map((row) => row.name).join("|")
    seen = higher
    if (after === before) break
  }
  for (let scrolls = 0; scrolls <= MAX_LIST_SCROLLS; scrolls += 1) {
    const rows = readChatList(seen.screen, kit.app).filter((row) => row.name.toLowerCase() === match.theirName.toLowerCase())
    let row = rows[0]
    if (rows.length > 1 && match.avatarHash) {
      let best = 65
      for (const candidate of rows) {
        const { hash } = await avatarOf(seen, candidate)
        const distance = hash ? hashDistance(hash, match.avatarHash) : 64
        if (distance < best) {
          best = distance
          row = candidate
        }
      }
    }
    if (row) {
      const opened = await kit.tap(row.node, 1_000)
      if (!conversationHeader(opened, match.theirName)) {
        throw new WalkError(`Opened a conversation, but it is not ${match.theirName}'s. Nothing was done in it.`, opened.shot)
      }
      return opened
    }
    if (scrolls < MAX_LIST_SCROLLS) seen = await kit.scroll(seen, "up", 600)
  }
  throw new WalkError(`Could not find ${match.theirName} in ${kit.app.appName}'s chat list.`, seen.shot)
}

/** Their name in the top part of the screen, which is how an open conversation says whose it is. */
function conversationHeader(seen: Seen, name: string): ScreenNode | null {
  const top = seen.screen.screenHeight * 0.16
  return (
    seen.screen.nodes.find(
      (node) =>
        isVisible(node, seen.screen) &&
        node.bounds[3] <= top &&
        (node.text.trim().toLowerCase() === name.toLowerCase() || node.desc.trim().toLowerCase() === name.toLowerCase())
    ) ?? null
  )
}

/** Reads the open conversation back to its start, or eight screenfuls, whichever comes first. */
async function readWholeConversation(kit: WalkKit, opened: Seen, theirName: string): Promise<Bubble[]> {
  // The app's own line saying they have gone is not a message.
  const skip = (line: string) => kit.app.theyLeft?.(line, theirName) ?? false
  let seen = opened
  let view = readBubbles(seen.screen, findNode(seen.screen, kit.app.words.messageInput), kit.app, skip)
  let all = view
  for (let scrolls = 0; scrolls < MAX_CHAT_SCROLLS; scrolls += 1) {
    seen = await kit.scroll(seen, "down", 600)
    const older = readBubbles(seen.screen, findNode(seen.screen, kit.app.words.messageInput), kit.app, skip)
    if (sameBubbles(older, view)) break
    all = prependOlder(all, older)
    view = older
  }
  return all
}

/**
 * Reads one conversation and lays it over the messages kept. When the app
 * says in the chat that the person has gone ("no longer available" on
 * Facebook Dating), they unmatched, and that is marked at once (part 18 of
 * "facebook/01").
 */
export async function readConversation(
  ctx: WalkContext,
  kit: WalkKit,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const match = await matchFor(ctx, input)
  const opened = await openConversation(kit, match)
  const left = screenTexts(opened.screen).some((line) => kit.app.theyLeft?.(line, match.theirName) ?? false)
  const bubbles = await readWholeConversation(kit, opened, match.theirName)
  await kit.back(700)
  const saved = await saveConversation(match.id, bubbles, ctx.db, ctx.now())
  if (left) await markTheyLeft(match.id, ctx.db, ctx.now())
  return { matchId: match.id, messages: bubbles.length, newFromThem: saved.newFromThem, theyLeft: left }
}

/**
 * Types one message into a conversation and taps Send. The message was
 * written down before this started, so it is never tried twice. Once Send is
 * tapped the message is "unsure" until it shows in the chat; anything that
 * goes wrong after that tap leaves it unsure, for the next read of the chat
 * to settle, because it may well have gone.
 */
export async function sendMessage(
  ctx: WalkContext,
  kit: WalkKit,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const match = await matchFor(ctx, input)
  const messageId = typeof input.messageId === "string" ? input.messageId : ""
  const [message] = await ctx.db.select().from(dateMessages).where(eq(dateMessages.id, messageId)).limit(1)
  if (!message || message.matchId !== match.id) throw new WalkError("That message is gone.")
  if (message.status !== "sending") throw new WalkError("That message is not waiting to be sent, so it was not sent again.")

  try {
    const opened = await openConversation(kit, match)
    const box = kit.need(opened, kit.app.words.messageInput, "the message box")
    const typed = await kit.type(box, message.text)
    const filled = typed.screen.nodes.find((node) => node.edit && node.text.trim() === message.text.trim())
    if (!filled) throw new WalkError(`The words did not go into ${kit.app.appName}'s message box. Nothing was sent.`, typed.shot)
    const button = kit.need(typed, kit.app.words.send, "the Send button")
    // From the moment Send is tapped it may have gone, so it is never tried again.
    await settleMessage(message.id, "unsure", "", ctx.db, ctx.now())
    const after = await kit.tap(button, 1_500)
    const bubbles = readBubbles(after.screen, findNode(after.screen, kit.app.words.messageInput), kit.app)
    const lastOurs = [...bubbles].reverse().find((bubble) => bubble.direction === "out")
    if (lastOurs?.text.trim() !== message.text.trim()) {
      throw new WalkError(
        "Send was tapped but the message did not show in the chat yet. The next read of this chat will say whether it went.",
        after.shot
      )
    }
    await settleMessage(message.id, "sent", "", ctx.db, ctx.now())
    await kit.back(700)
    return { matchId: match.id, messageId: message.id, sent: true }
  } catch (error) {
    // Before Send was tapped nothing went out: it is not sent, and may be tried again by hand. A
    // freeze before anything was typed leaves it waiting, for the walk's one restart to send it.
    if (error instanceof FrozenError && !kit.committed) throw error
    const [now] = await ctx.db.select({ status: dateMessages.status }).from(dateMessages).where(eq(dateMessages.id, message.id)).limit(1)
    if (now?.status === "sending") {
      await settleMessage(message.id, "failed", error instanceof Error ? error.message : "It could not be sent.", ctx.db, ctx.now())
    }
    throw error
  }
}

/** Unmatches one person through the app's own menu and its confirm. */
export async function unmatch(ctx: WalkContext, kit: WalkKit, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const match = await matchFor(ctx, input)
  const opened = await openConversation(kit, match)
  const menu = await kit.tap(kit.need(opened, kit.app.words.chatMenu, "the conversation's menu"), 900)
  await confirmUnmatch(kit, menu, match.theirName)
  const now = ctx.now()
  await ctx.db
    .update(dateMatches)
    .set({ unmatchedAt: now, unmatchedBy: "member", draft: "", draftSendAt: null, draftForMessageId: null, draftChoices: [], updatedAt: now })
    .where(eq(dateMatches.id, match.id))
  return { matchId: match.id, unmatched: true }
}

/**
 * From a conversation's menu: Unmatch, its confirm, and a check that the
 * conversation has gone. Facebook's report (`src/server/facebook/walks/index.ts`)
 * ends here too.
 */
export async function confirmUnmatch(kit: WalkKit, menu: Seen, theirName: string): Promise<Seen> {
  const asked = await kit.tap(kit.need(menu, kit.app.words.unmatch, "Unmatch in the menu"), 900)
  const confirm = kit.find(asked, kit.app.words.confirmUnmatch)
  const after = confirm ? await kit.commit(confirm, 1_200) : asked
  if (conversationHeader(after, theirName) && kit.has(after, kit.app.words.messageInput)) {
    throw new WalkError(`${kit.app.appName} still shows the conversation with ${theirName}, so the unmatch may not have gone through.`, after.shot)
  }
  return after
}
