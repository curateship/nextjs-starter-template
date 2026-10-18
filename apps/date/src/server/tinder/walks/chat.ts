import { eq } from "drizzle-orm"

import { averageHash, cropScreenshot, hashDistance, keepPicture } from "@/server/phone/pictures"

import { findNode, isVisible, type ScreenNode } from "../screen"
import { TINDER_WORDS } from "../screen-words"
import { dateMatches, dateMessages } from "../schema"
import { saveChatList, saveConversation, settleMessage, type ListedChat } from "../store"
import { onChatList, WalkError, type Seen, type WalkContext, type WalkKit } from "./kit"
import { prependOlder, readBubbles, readChatList, sameBubbles, type Bubble, type ChatRow } from "./parse"

/** How many screenfuls of the chat list are read for one look. */
const MAX_LIST_SCROLLS = 4

/** How far back a conversation is read, in screenfuls. */
const MAX_CHAT_SCROLLS = 8

async function toChatList(kit: WalkKit): Promise<Seen> {
  return kit.goToTab(await kit.openTinder(), TINDER_WORDS.tabChat, onChatList, "Chat")
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
    for (const row of readChatList(screenSeen.screen)) {
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
  for (let scrolls = 0; scrolls < MAX_LIST_SCROLLS; scrolls += 1) {
    seen = await kit.scroll(seen, "up", 600)
    if (!(await take(seen))) break
  }
  const listed = Array.from(chats.values())
  const saved = await saveChatList(
    { userId: ctx.phone.userId, workspaceId: ctx.phone.workspaceId, phoneId: ctx.phone.id },
    listed,
    ctx.db,
    ctx.now()
  )
  return { listed: listed.length, added: saved.added, toRead: saved.toRead }
}

async function matchFor(ctx: WalkContext, input: Record<string, unknown>) {
  const matchId = typeof input.matchId === "string" ? input.matchId : ""
  const [match] = await ctx.db.select().from(dateMatches).where(eq(dateMatches.id, matchId)).limit(1)
  if (!match || match.userId !== ctx.phone.userId) throw new WalkError("That match is gone.")
  if (match.unmatchedAt) throw new WalkError(`You unmatched ${match.theirName}.`)
  return match
}

/**
 * Opens one person's conversation from the chat list, scrolling down the list
 * to find them. Two people of one name are told apart by their picture. The
 * conversation's header has to show their name, or nothing more is done.
 */
async function openConversation(
  kit: WalkKit,
  match: { theirName: string; avatarHash: string }
): Promise<Seen> {
  let seen = await toChatList(kit)
  // Tinder keeps the list where it was left, so it goes back to the top first.
  for (let scrolls = 0; scrolls < MAX_LIST_SCROLLS; scrolls += 1) {
    const before = readChatList(seen.screen).map((row) => row.name).join("|")
    const higher = await kit.scroll(seen, "down", 500)
    const after = readChatList(higher.screen).map((row) => row.name).join("|")
    seen = higher
    if (after === before) break
  }
  for (let scrolls = 0; scrolls <= MAX_LIST_SCROLLS; scrolls += 1) {
    const rows = readChatList(seen.screen).filter((row) => row.name.toLowerCase() === match.theirName.toLowerCase())
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
  throw new WalkError(`Could not find ${match.theirName} in Tinder's chat list.`, seen.shot)
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
async function readWholeConversation(kit: WalkKit, opened: Seen): Promise<Bubble[]> {
  let seen = opened
  let view = readBubbles(seen.screen, findNode(seen.screen, TINDER_WORDS.messageInput))
  let all = view
  for (let scrolls = 0; scrolls < MAX_CHAT_SCROLLS; scrolls += 1) {
    seen = await kit.scroll(seen, "down", 600)
    const older = readBubbles(seen.screen, findNode(seen.screen, TINDER_WORDS.messageInput))
    if (sameBubbles(older, view)) break
    all = prependOlder(all, older)
    view = older
  }
  return all
}

/** Reads one conversation and lays it over the messages kept. */
export async function readConversation(
  ctx: WalkContext,
  kit: WalkKit,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const match = await matchFor(ctx, input)
  const opened = await openConversation(kit, match)
  const bubbles = await readWholeConversation(kit, opened)
  await kit.back(700)
  const saved = await saveConversation(match.id, bubbles, ctx.db, ctx.now())
  return { matchId: match.id, messages: bubbles.length, newFromThem: saved.newFromThem }
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
    const box = kit.need(opened, TINDER_WORDS.messageInput, "the message box")
    const typed = await kit.type(box, message.text)
    const filled = typed.screen.nodes.find((node) => node.edit && node.text.trim() === message.text.trim())
    if (!filled) throw new WalkError("The words did not go into Tinder's message box. Nothing was sent.", typed.shot)
    const button = kit.need(typed, TINDER_WORDS.send, "the Send button")
    // From the moment Send is tapped it may have gone, so it is never tried again.
    await settleMessage(message.id, "unsure", "", ctx.db, ctx.now())
    const after = await kit.tap(button, 1_500)
    const bubbles = readBubbles(after.screen, findNode(after.screen, TINDER_WORDS.messageInput))
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
    // Before Send was tapped nothing went out: it is not sent, and may be tried again by hand.
    const [now] = await ctx.db.select({ status: dateMessages.status }).from(dateMessages).where(eq(dateMessages.id, message.id)).limit(1)
    if (now?.status === "sending") {
      await settleMessage(message.id, "failed", error instanceof Error ? error.message : "It could not be sent.", ctx.db, ctx.now())
    }
    throw error
  }
}

/** Unmatches one person through Tinder's own menu and its confirm. */
export async function unmatch(ctx: WalkContext, kit: WalkKit, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const match = await matchFor(ctx, input)
  const opened = await openConversation(kit, match)
  const menu = await kit.tap(kit.need(opened, TINDER_WORDS.chatMenu, "the conversation's menu"), 900)
  const asked = await kit.tap(kit.need(menu, TINDER_WORDS.unmatch, "Unmatch in the menu"), 900)
  const confirm = kit.find(asked, TINDER_WORDS.confirmUnmatch)
  const after = confirm ? await kit.tap(confirm, 1_200) : asked
  if (conversationHeader(after, match.theirName) && kit.has(after, TINDER_WORDS.messageInput)) {
    throw new WalkError(`Tinder still shows the conversation with ${match.theirName}, so the unmatch may not have gone through.`, after.shot)
  }
  const now = ctx.now()
  await ctx.db
    .update(dateMatches)
    .set({ unmatchedAt: now, draft: "", draftSendAt: null, draftForMessageId: null, updatedAt: now })
    .where(eq(dateMatches.id, match.id))
  return { matchId: match.id, unmatched: true }
}
