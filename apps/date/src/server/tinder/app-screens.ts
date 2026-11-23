import { TINDER_PACKAGE } from "@/lib/dating/options"

import { findNode, type NodeMatch, type ScreenRead } from "./screen"
import { CHAT_CHROME_LINES, TINDER_CHROME_LINES, TINDER_WORDS } from "./screen-words"
import { stopScreen, type StopScreen } from "./stop-screens"
import type { Seen, WalkKit } from "./walks/kit"

/**
 * How one dating app's screens look, for the walks that work on more than
 * one app: the walk kit, the chat walks and the parsers of a chat. Tinder's
 * is here; Facebook Dating's is `src/server/facebook/screen-words.ts` (task
 * "facebook/01"). Each app's own walks, such as reading a card, use its
 * words directly.
 */
export type AppScreens = {
  /** The app's name as the phone shows it, for "Facebook was not in front". */
  appName: string
  packageName: string
  /** The words the shared walks look for. */
  words: {
    /** The like button, which says the cards are in front and no offer is in the way. */
    like: NodeMatch
    /** An offer's way out, tapped without buying anything. */
    dismissOffer: NodeMatch
    tabChat: NodeMatch
    newMatchesHeading: NodeMatch
    messagesHeading: NodeMatch
    messageInput: NodeMatch
    send: NodeMatch
    chatMenu: NodeMatch
    unmatch: NodeMatch
    confirmUnmatch: NodeMatch
  }
  /** Lines on a card, profile or chat list that are the app's own words, not the person's. */
  chromeLines: readonly RegExp[]
  /** Words in a chat that are the app's, not a message. */
  chatChromeLines: readonly RegExp[]
  /** A screen that stops the profile until Resume, or null. */
  stopScreen: (screen: ScreenRead) => StopScreen | null
  /** From the app just opened to its dating screens. */
  arrive: (kit: WalkKit, seen: Seen) => Promise<Seen>
  /** Whether a screen is inside the dating part of the app. Left out for an app that is all dating. */
  inside?: (screen: ScreenRead) => boolean
  /** An empty screen on a second look means the app froze (Facebook draws slowly). */
  blankMeansFrozen?: boolean
  /**
   * Whether one whole line in an open chat is the app saying this person has
   * gone, so they unmatched (part 18 of "facebook/01"). Only a whole line of
   * the app's own words counts, never a message that happens to say so.
   */
  theyLeft?: (line: string, theirName: string) => boolean
}

/** Whether this screen is Tinder's card stack: the like and pass buttons are both on it. */
export function onDiscover(screen: ScreenRead): boolean {
  return Boolean(findNode(screen, TINDER_WORDS.like) && findNode(screen, TINDER_WORDS.pass))
}

export const TINDER_SCREENS: AppScreens = {
  appName: "Tinder",
  packageName: TINDER_PACKAGE,
  words: TINDER_WORDS,
  chromeLines: TINDER_CHROME_LINES,
  chatChromeLines: CHAT_CHROME_LINES,
  stopScreen,
  // Tinder opens on its cards; an offer in the way is shut.
  arrive: (kit, seen) => kit.dismissOffers(seen),
}
