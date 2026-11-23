import { FACEBOOK_PACKAGE } from "@/lib/dating/options"
import type { AppScreens } from "@/server/tinder/app-screens"
import { findNode, isVisible, screenTexts, type NodeMatch, type ScreenRead } from "@/server/tinder/screen"
import { CHAT_CHROME_LINES } from "@/server/tinder/screen-words"
import { WalkError, type Seen, type WalkKit } from "@/server/tinder/walks/kit"

import { facebookStopScreen } from "./stop-screens"

/**
 * Every word and spoken label the Facebook Dating walks look for, in one
 * place (task "facebook/01-facebook-dating", 22 Oct 2026).
 *
 * **Written before any real phone was read**, the same way Tinder's were on
 * 18 Oct 2026: from how Facebook's Android app is known to label itself.
 * Facebook draws its own screens and gives few view ids, so these are words
 * and spoken labels only, each with several candidates. The first run on the
 * real phone is the proof: a walk that cannot find a box stops with a picture
 * of the screen, and the fix is a line here. `workspace/docs/facebook/walks.md`
 * says how to read a real screen and refresh these.
 */

const r = (pattern: string) => new RegExp(pattern, "i")

export const FACEBOOK_WORDS = {
  /** Facebook's own menu, where the Dating shortcut is. */
  menu: { desc: [r("^menu$"), r("^menu, tab \\d"), r("^(open )?menu$")], text: [r("^menu$")] },
  /** The member's own name at the top of Facebook's menu, which says whose Facebook is signed in. */
  menuProfile: { desc: [r("^(see )?your profile$"), r("^your profile, .+$")] },
  /** Facebook's word that a report went. */
  reportDone: { text: [r("^thanks for (letting us know|your report|reporting)"), r("^(your )?report (was )?(sent|received|submitted)")] },
  /** The Dating shortcut in the menu. */
  datingShortcut: { text: [r("^dating$"), r("^facebook dating$")], desc: [r("^dating$"), r("^dating, (button|link|shortcut)")] },
  /** Dating's own tabs. Any one on screen says this is Dating. */
  tabSuggested: { text: [r("^suggested( for you)?$"), r("^discover$")], desc: [r("^suggested( for you)?(, tab.*)?$")] },
  tabLikes: { text: [r("^likes( you)?$"), r("^who likes you$")], desc: [r("^likes( you)?(, tab.*)?$")] },
  tabChat: { text: [r("^matches$"), r("^conversations$")], desc: [r("^matches(, tab.*)?$"), r("^conversations(, tab.*)?$")] },
  /** The main buttons under a suggested profile. */
  like: { desc: [r("^like$"), r("^like (profile|.+'s profile)$"), r("^send (a )?like$")], text: [r("^like$")] },
  pass: { desc: [r("^pass$"), r("^(not interested|skip)$"), r("^pass on .+$")], text: [r("^pass$")] },
  /** The heart beside one photo or one answer, which likes that and asks for a comment. */
  likeItem: { desc: [r("^like (this )?(photo|answer|prompt|picture)$"), r("^like .+'s (photo|answer)$")] },
  /** After a like: the box for an optional comment, and the button that sends the like. */
  likeComment: { hint: [r("add a (comment|message|note)"), r("^say something"), r("^(write|type) a (comment|message)")], desc: [r("^add a (comment|message)$")] },
  sendLike: { text: [r("^send( a)? like$"), r("^send$")], desc: [r("^send( a)? like$")] },
  /** "It's a match" and its way out, which never opens the chat. */
  matchScreen: { text: [r("^it'?s a match!?$"), r("^you matched with [^.!?]{1,60}[.!]?$"), r("^you and .{1,60} (like|liked) each other[.!]?$")], desc: [r("^it'?s a match!?$")] },
  keepBrowsing: { text: [r("^keep (browsing|looking|swiping)$"), r("^not now$"), r("^close$")], desc: [r("^(close|not now)$")] },
  /** Offers and tips Facebook puts in the way, closed by their way out. */
  dismissOffer: { text: [r("^(not now|maybe later|skip|no thanks|dismiss|got it|close)$")], desc: [r("^(close|dismiss|not now)$")] },
  /** The Matches tab's headings: new matches across the top, then the conversations. */
  newMatchesHeading: { text: [r("^new matches$"), r("^new$")] },
  messagesHeading: { text: [r("^conversations$"), r("^messages$"), r("^chats$")] },
  messageInput: { hint: [r("^(message|aa|type a message|write a message)")], desc: [r("^(message|type a message|write a message)$")] },
  send: { desc: [r("^send( message)?$"), r("^press to send$")], text: [r("^send$")] },
  chatMenu: { desc: [r("^(more|more options|options|conversation (info|details|options)|info|menu)$")] },
  unmatch: { text: [r("^unmatch( .+)?$")], desc: [r("^unmatch$")] },
  confirmUnmatch: { text: [r("^(yes, )?unmatch$"), r("^confirm$"), r("^yes$")] },
  /** Reporting a match as a scam (part 20): the menu's Report, the reason, and the button that sends it. */
  report: { text: [r("^report( .+)?$")], desc: [r("^report$")] },
  reportScam: { text: [r("scam"), r("fraud"), r("asking (me )?for money")] },
  reportSend: { text: [r("^(submit|report|send|send report|done|next)$")], desc: [r("^(submit|report|send)$")] },
  /** Second Look (part 14): people you passed, shown again. */
  secondLook: { text: [r("^second look$"), r("^see (people you passed|passed profiles)$")], desc: [r("^second look$")] },
  /** Likes you with nobody in it. */
  likesYouEmpty: { text: [r("no (one|likes|new likes) yet"), r("when someone likes you"), r("nobody has liked you")] },
  /** The weekly surprise match (part 21). */
  weeklyMatch: { text: [r("^(your )?weekly (surprise )?match$"), r("^(your )?surprise match$"), r("^meet cute$"), r("^your match (this|of the) week$")] },
  /** Dating's own settings and what is in them. */
  datingSettings: { desc: [r("^(dating )?settings$"), r("^open (dating )?settings$")], text: [r("^(dating )?settings$")] },
  takeBreak: { text: [r("^take a break$"), r("^pause (your )?(dating )?profile$"), r("^hide (your )?profile$")] },
  distanceHeading: { text: [r("^(maximum )?distance$"), r("^distance preference$"), r("^how far away$")] },
  ageHeading: { text: [r("^age( range)?$"), r("^age preference$"), r("^ages$")] },
  distanceSlider: { desc: [r("^distance( slider)?$")] },
  ageSlider: { desc: [r("^age( range)?( slider)?$")] },
  settingsDone: { text: [r("^(done|save)$")], desc: [r("^(done|save|back|navigate up)$")] },
} satisfies Record<string, NodeMatch>

/**
 * Lines on a profile or the Matches tab that are Facebook's own words rather
 * than the person's, left out of what is stored as the card's text.
 */
export const FACEBOOK_CHROME_LINES = [
  r("^(facebook )?dating$"),
  r("^(suggested( for you)?|likes( you)?|matches|conversations|profile)$"),
  r("^(like|pass|send like|second look|see more|show more)$"),
  r("^active (now|today|recently)$"),
  r("^report .+$"),
  r("^block .+$"),
  r("^share .+$"),
  r("^(done|save|close)$"),
]

/**
 * Headings Facebook Dating puts over parts of a profile, beside Tinder's
 * that it shares. A line matching one starts a section.
 */
export const FACEBOOK_SECTION_HEADINGS = [
  "About me",
  "Basics",
  "Looking for",
  "Interests",
  "Work",
  "Education",
  "Hometown",
  "Lives in",
  "Questions",
  "Mutual friends",
  "Groups",
  "Shared groups",
  "Events",
  "Instagram",
] as const

/** Where a line says how far away someone is, as Facebook words it. */
export const FACEBOOK_DISTANCE_LINE = r("^(\\d+\\s*(miles?|mi|kilomet(re|er)s?|km)\\s+away|less than a (mile|kilometre|kilometer) away)$")

/** "3 mutual friends", "1 mutual friend". */
export const MUTUAL_COUNT_LINE = /^(\d+)\s+mutual friends?$/i

/** "Mutual friends: Sam, Alex and Jo" or "Friends in common: Sam". */
export const MUTUAL_NAMES_LINE = /^(?:mutual friends?|friends in common):\s*(.+)$/i

/** "You're both in Toronto Climbers". */
export const SHARED_GROUP_LINE = /^you'?re both (?:in|members of)\s+(.+)$/i

/** A like that came with a comment, as Likes you shows it: "Commented on your photo: love this". */
export const THEIR_COMMENT_LINE = /^(?:commented|replied|said) on your (photo|answer|prompt|picture)(?:\s*:\s*["“]?|\s+["“])(.+?)["”]?$/i

/**
 * Screens where Facebook has nobody new to suggest. Not a stop screen: the
 * loop waits for the next day (part 5, "Out of suggestions is a wait").
 */
const OUT_OF_SUGGESTIONS = [
  r("you'?ve seen everyone( for (now|today))?"),
  r("no (more )?(new )?(people|suggestions|profiles)( to show)?( right now| for (now|today))?"),
  r("check back (later|tomorrow)"),
  r("come back (later|tomorrow)"),
  r("that'?s everyone for (now|today)"),
]

/**
 * A whole line in an open chat that is Facebook saying the person has gone
 * from Dating (part 18): their name and "is no longer available", or one of
 * Facebook's own sentences. A message that only says "no longer available"
 * about something else is never taken for it.
 */
function facebookTheyLeft(line: string, theirName: string): boolean {
  const name = theirName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const text = line.trim()
  return [
    new RegExp(`^${name} (is|are) no longer available\\.?$`, "i"),
    new RegExp(`^${name} (isn'?t|is not) available( any ?more| on dating)?\\.?$`, "i"),
    new RegExp(`^${name} (left|deleted (their|her|his)) (facebook )?dating( profile)?\\.?$`, "i"),
    /^this (person|profile) (is no longer|isn'?t) on dating( any ?more)?\.?$/i,
    /^you can'?t (reply to|message) this (conversation|person)( any ?more)?\.?$/i,
  ].some((pattern) => pattern.test(text))
}

/** The weekly surprise match's way into the chat list without opening a chat. */
export const WEEKLY_MATCH_CLOSE = { text: [r("^(not now|maybe later|close|keep browsing|later)$")], desc: [r("^close$")] } satisfies NodeMatch

/** Boxes in the top band of the screen, where a header or a heading sits, never a person's words. */
function inTopBand(screen: ScreenRead, share: number) {
  const bottom = screen.screenHeight * share
  return screen.nodes.filter((node) => isVisible(node, screen) && node.bounds[3] <= bottom)
}

/**
 * Two of Dating's own tabs side by side. One alone is not enough: Facebook's
 * feed shows "Suggested for you" over posts, and a walk must never take the
 * feed for Dating and tap there.
 */
function datingTabsRow(screen: ScreenRead): boolean {
  const tabs = [FACEBOOK_WORDS.tabSuggested, FACEBOOK_WORDS.tabLikes, FACEBOOK_WORDS.tabChat].flatMap((match) => {
    const node = findNode(screen, match)
    return node ? [node] : []
  })
  return tabs.some((a) => tabs.some((b) => a !== b && Math.abs((a.bounds[1] + a.bounds[3]) / 2 - (b.bounds[1] + b.bounds[3]) / 2) < 60))
}

/** Whether the screen is a suggested profile, with Like and Pass under it. */
export function onSuggested(screen: ScreenRead): boolean {
  return Boolean(findNode(screen, FACEBOOK_WORDS.like) && findNode(screen, FACEBOOK_WORDS.pass))
}

/**
 * Facebook's weekly surprise match: its heading, a whole line across the top,
 * on a screen that is not a profile with Like and Pass. A bio that mentions a
 * "meet cute" is never taken for it.
 */
export function onWeeklyMatch(screen: ScreenRead): boolean {
  if (onSuggested(screen)) return false
  return inTopBand(screen, 0.15).some((node) => FACEBOOK_WORDS.weeklyMatch.text.some((pattern) => pattern.test(node.text.trim())))
}

/**
 * A screen inside Facebook Dating (part 3, "a sure mark for Dating's
 * screens"): two of Dating's tabs in a row, "It's a match" or the weekly
 * match, or "Dating" (or "Dating settings") written across the top. A screen
 * it cannot tell is outside, which stops the profile: the safe side.
 */
function insideDating(screen: ScreenRead): boolean {
  if (datingTabsRow(screen) || findNode(screen, FACEBOOK_WORDS.matchScreen) || onWeeklyMatch(screen)) return true
  return inTopBand(screen, 0.12).some(
    (node) => /^(facebook )?dating( settings)?$/i.test(node.text.trim()) || /^(facebook )?dating( (settings|conversation|profile|chat))?$/i.test(node.desc.trim())
  )
}

/**
 * A stop screen covers the whole screen, so one showing Dating's own tabs, a
 * profile's Like and Pass, or a message box is never one. A message or a bio
 * that says "confirm" or "going too fast" can then never stop the phone.
 */
function facebookStop(screen: ScreenRead) {
  if (datingTabsRow(screen) || onSuggested(screen) || findNode(screen, FACEBOOK_WORDS.messageInput)) return null
  return facebookStopScreen(screen)
}

/**
 * From Facebook just opened to Dating's home: Facebook opens on the feed or
 * wherever it was, so the walk goes to the menu and taps Dating, then shuts a
 * tip or two Dating puts in the way. Nothing outside Dating is touched but
 * the menu and its Dating shortcut.
 */
async function arrive(kit: WalkKit, seen: Seen): Promise<Seen> {
  let current = seen
  for (let tries = 0; tries < 3 && !insideDating(current.screen); tries += 1) {
    const me = kit.find(current, FACEBOOK_WORDS.menuProfile)
    if (me?.text.trim()) kit.notice("signedInAs", me.text.trim())
    const shortcut = kit.find(current, FACEBOOK_WORDS.datingShortcut)
    if (shortcut) {
      current = await kit.tap(shortcut, 1_800)
      continue
    }
    const menu = kit.find(current, FACEBOOK_WORDS.menu)
    if (!menu) break
    current = await kit.tap(menu, 1_200)
  }
  if (!insideDating(current.screen)) {
    throw new WalkError("Could not open Dating from Facebook's menu. The words for it may have changed, or Dating is not set up on this Facebook account.", current.shot)
  }
  for (let tries = 0; tries < 2; tries += 1) {
    const offer = kit.find(current, FACEBOOK_WORDS.dismissOffer)
    // The weekly match's "Not now" is left for the walk, which keeps the match first.
    if (!offer || onSuggested(current.screen) || onWeeklyMatch(current.screen)) break
    current = await kit.tap(offer)
  }
  return current
}

export const FACEBOOK_SCREENS: AppScreens = {
  appName: "Facebook",
  packageName: FACEBOOK_PACKAGE,
  words: FACEBOOK_WORDS,
  chromeLines: FACEBOOK_CHROME_LINES,
  chatChromeLines: CHAT_CHROME_LINES,
  stopScreen: facebookStop,
  arrive,
  inside: insideDating,
  blankMeansFrozen: true,
  theyLeft: facebookTheyLeft,
}

/**
 * Whether Facebook says there is nobody left to suggest today: one of its
 * lines, on a screen with no profile in front, so a bio such as "No more
 * people pleasers" never ends the day's swiping.
 */
export function outOfSuggestions(screen: ScreenRead): string | null {
  if (onSuggested(screen)) return null
  const lines = screenTexts(screen)
  return lines.some((line) => OUT_OF_SUGGESTIONS.some((pattern) => pattern.test(line))) ? lines.join("\n").slice(0, 300) : null
}
