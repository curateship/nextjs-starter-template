import { onDiscover } from "../app-screens"
import { allWords, findNode, type NodeMatch } from "../screen"
import { NOBODY_NEW, TINDER_WORDS } from "../screen-words"
import { StopScreenError, type Seen, type WalkContext, type WalkKit } from "./kit"
import { readChatList } from "./parse"

/**
 * The check after the app updates (part 7 of "facebook/01-facebook-dating",
 * and part 1 of "features/04"): a read-only look at each screen the walks
 * use, confirming every button they need is still there. It never likes,
 * passes, sends or unmatches, and never touches a message box.
 *
 * All found, the version counts as checked and swiping carries on. Any
 * missing stops the profile until Resume, with the missing buttons named,
 * such as "Can't find: Send button", and a picture of the first screen one
 * was missing from. Resume runs the check again.
 */

/** One screen looked at: the buttons needed on it, each with the name the Phone card shows. */
type LabelLook = { seen: Seen; needs: Array<[name: string, match: NodeMatch]> }

/** Collects what is missing across the screens looked at; `finish` stops the profile when anything is. */
export function labelChecker(version: string) {
  const missing: string[] = []
  let shot: Buffer | null = null
  return {
    look({ seen, needs }: LabelLook) {
      for (const [name, match] of needs) {
        if (findNode(seen.screen, match)) continue
        missing.push(name)
        shot ??= seen.shot
      }
    },
    /** A screen the check could not reach at all counts as its button missing. */
    unreached(name: string, seen: Seen | null) {
      missing.push(name)
      shot ??= seen?.shot ?? null
    },
    finish(checked: string[]): Record<string, unknown> {
      if (missing.length) throw new StopScreenError("app_changed", `Can't find: ${Array.from(new Set(missing)).join(", ")}`, shot)
      return { version, checked }
    },
  }
}

export async function checkTinderLabels(_ctx: WalkContext, kit: WalkKit, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const version = typeof input.version === "string" ? input.version : ""
  const checker = labelChecker(version)
  const checked: string[] = []

  // The cards, unless Tinder has nobody to show.
  let seen = await kit.openApp()
  const tab = kit.find(seen, TINDER_WORDS.tabDiscover)
  if (!onDiscover(seen.screen) && tab) seen = await kit.tap(tab, 1_000)
  if (!NOBODY_NEW.some((pattern) => pattern.test(allWords(seen.screen)))) {
    checker.look({
      seen,
      needs: [
        ["Like button", TINDER_WORDS.like],
        ["Pass button", TINDER_WORDS.pass],
        ["Open profile button", TINDER_WORDS.openProfile],
      ],
    })
    checked.push("cards")
  }
  checker.look({ seen, needs: [["Chat tab", TINDER_WORDS.tabChat]] })

  // The chat list and, when there is one, a conversation. Its message box is only looked at.
  const chatTab = kit.find(seen, TINDER_WORDS.tabChat)
  if (chatTab) {
    const list = await kit.tap(chatTab, 1_000)
    if (!findNode(list.screen, TINDER_WORDS.messagesHeading) && !findNode(list.screen, TINDER_WORDS.newMatchesHeading)) checker.unreached("Chat list headings", list)
    checked.push("chat list")
    const row = readChatList(list.screen).find((item) => !item.isNew)
    if (row) {
      const chat = await kit.tap(row.node, 1_000)
      checker.look({
        seen: chat,
        needs: [
          ["Message box", TINDER_WORDS.messageInput],
          ["Send button", TINDER_WORDS.send],
          ["Conversation menu", TINDER_WORDS.chatMenu],
        ],
      })
      checked.push("a conversation")
      await kit.back(700)
    }
  }
  return checker.finish(checked)
}
