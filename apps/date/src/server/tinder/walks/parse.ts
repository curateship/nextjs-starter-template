import { MESSAGE_KIND_WORDS, type MessageKind } from "@/lib/dating/options"
import type { Bounds } from "@/server/phone/pictures"
import type { ProfileHandles, ProfilePrompt, ProfileSection } from "../schema"

import { TINDER_SCREENS, type AppScreens } from "../app-screens"
import { findNode, isVisible, nodeWords, screenTexts, type ScreenNode, type ScreenRead } from "../screen"
import {
  DISTANCE_LINE,
  NAME_AGE_LINE,
  SECTION_HEADINGS,
  TINDER_CHROME_LINES,
  TINDER_WORDS,
  VERIFIED_LABEL,
} from "../screen-words"

/**
 * Turning Tinder's screens into a card, a profile and a conversation. Pure
 * functions of a screen, so each is tested on its own against the screens in
 * `../fixtures/`. A conversation and the chat list are read the same way on
 * Facebook Dating, with its own words (`AppScreens`).
 */

export type CardFace = {
  name: string
  age: number | null
  distance: string
  verified: boolean
  /** The card's other lines, in order: a job, a school, a line of bio. */
  lines: string[]
  /** Where the photo is on the screen, to cut it from the screenshot. */
  photoBox: Bounds
  like: ScreenNode
  pass: ScreenNode
}

function isChrome(line: string, lines: readonly RegExp[] = TINDER_CHROME_LINES): boolean {
  return lines.some((pattern) => pattern.test(line))
}

/** The card in front on the Discover screen, or null when there is no card. */
export function readCardFace(screen: ScreenRead): CardFace | null {
  const like = findNode(screen, TINDER_WORDS.like)
  const pass = findNode(screen, TINDER_WORDS.pass)
  if (!like || !pass) return null
  const buttonsTop = Math.min(like.bounds[1], pass.bounds[1])
  const band = { top: Math.round(screen.screenHeight * 0.06), bottom: buttonsTop }
  const lines = screenTexts(screen, band).filter((line) => !isChrome(line))

  let name = ""
  let age: number | null = null
  let nameIndex = -1
  for (let index = 0; index < lines.length; index += 1) {
    const together = NAME_AGE_LINE.exec(lines[index])
    if (together) {
      name = together[1].trim()
      age = Number(together[2])
      nameIndex = index
      break
    }
    if (/^\d{2}$/.test(lines[index + 1] ?? "") && /^\p{L}/u.test(lines[index])) {
      name = lines[index]
      age = Number(lines[index + 1])
      nameIndex = index
      break
    }
  }
  if (!name) return null

  const rest = lines.filter((line, index) => index !== nameIndex && !(index === nameIndex + 1 && /^\d{2}$/.test(line)))
  const distance = rest.find((line) => DISTANCE_LINE.test(line)) ?? ""
  const verified = screen.nodes.some(
    (node) =>
      isVisible(node, screen) &&
      node.bounds[1] < buttonsTop &&
      (VERIFIED_LABEL.desc.some((pattern) => pattern.test(node.desc)) || /^verified$/i.test(node.text))
  )

  return {
    name,
    age,
    distance,
    verified,
    lines: rest.filter((line) => line !== distance),
    photoBox: photoBoxOf(screen, buttonsTop),
    like,
    pass,
  }
}

/**
 * Where the card's photo is: the largest box above the buttons that spans
 * most of the screen's width, or, failing that, the space between the top bar
 * and the buttons.
 */
function photoBoxOf(screen: ScreenRead, buttonsTop: number): Bounds {
  const { screenWidth: width, screenHeight: height } = screen
  let best: ScreenNode | null = null
  let bestArea = 0
  for (const node of screen.nodes) {
    if (!isVisible(node, screen)) continue
    const [left, top, right, bottom] = node.bounds
    const nodeWidth = right - left
    const nodeHeight = bottom - top
    if (bottom > buttonsTop + 4 || nodeWidth < width * 0.8 || nodeHeight < height * 0.35) continue
    if (top < height * 0.03) continue
    const area = nodeWidth * nodeHeight
    if (area > bestArea) {
      best = node
      bestArea = area
    }
  }
  if (best) return best.bounds
  return [Math.round(width * 0.03), Math.round(height * 0.1), Math.round(width * 0.97), buttonsTop - Math.round(height * 0.01)]
}

export type ParsedProfile = {
  bio: string
  job: string
  school: string
  livesIn: string
  sections: ProfileSection[]
  handles: ProfileHandles
}

/** The headings, the app's own lines and its distance line a profile is laid out by. Tinder's unless an app says otherwise. */
export type ProfileWords = { headings: readonly string[]; chrome: readonly RegExp[]; distance: RegExp }

const TINDER_PROFILE_WORDS: ProfileWords = { headings: SECTION_HEADINGS, chrome: TINDER_CHROME_LINES, distance: DISTANCE_LINE }

/**
 * A full profile's lines, laid out under the app's headings. Lines before the
 * first heading belong to the card itself. Everything is also kept as plain
 * lines, so nothing a heading missed is lost to the AI.
 */
export function parseProfileLines(cardLines: string[], profileLines: string[], words: ProfileWords = TINDER_PROFILE_WORDS): ParsedProfile {
  const headings = new Map(words.headings.map((heading) => [heading.toLowerCase(), heading]))
  const chrome = (line: string) => words.chrome.some((pattern) => pattern.test(line))
  const sections: ProfileSection[] = []
  let current: ProfileSection | null = null
  for (const line of profileLines) {
    if (chrome(line) || words.distance.test(line)) continue
    const heading = headings.get(line.trim().toLowerCase())
    if (heading) {
      current = { heading, items: [] }
      sections.push(current)
      continue
    }
    if (current) current.items.push(line)
  }

  const section = (heading: string) => sections.find((item) => item.heading === heading)?.items ?? []
  const allLines = [...cardLines, ...profileLines].filter((line) => !chrome(line))

  const aboutMe = section("About me").join("\n")
  const longest = allLines
    .filter((line) => line.length >= 40 && !words.distance.test(line) && !headings.has(line.toLowerCase()))
    .sort((a, b) => b.length - a.length)[0]

  const livesInLine = allLines.find((line) => /^lives in\s+/i.test(line))
  const jobTitle = section("Job title")[0] ?? section("Work")[0] ?? ""
  const company = section("Company")[0] ?? ""
  const jobLine = cardLines.find((line) => /\s(at|@)\s/.test(line) && !/^lives in/i.test(line))
  const schoolLine = cardLines.find((line) => /(university|college|school|academy|institute)/i.test(line))

  const instagram = section("Instagram").find((line) => /^@?[\w.]{2,30}$/.test(line) && !/photos?$/i.test(line))
  const artists = section("Top Spotify Artists")
  const anthem = section("My anthem").slice(0, 2).join(" · ")

  const handles: ProfileHandles = {}
  if (instagram) handles.instagram = instagram.startsWith("@") ? instagram : `@${instagram}`
  if (artists.length) handles.spotifyArtists = artists
  if (anthem) handles.anthem = anthem

  return {
    bio: aboutMe || longest || "",
    job: jobTitle ? (company ? `${jobTitle} at ${company}` : jobTitle) : (jobLine ?? (company || "")),
    school: section("School")[0] ?? section("Education")[0] ?? schoolLine ?? "",
    livesIn: section("Lives in")[0] ?? livesInLine?.replace(/^lives in\s+/i, "") ?? "",
    sections,
    handles,
  }
}

/** The words under one heading of a profile, such as the bio under "About me", or empty. */
export function sectionText(sections: ProfileSection[], heading: string): string {
  return sections.find((section) => section.heading === heading)?.items.join("\n") ?? ""
}

/**
 * The member's prompts, read from the "Prompts" section of their own
 * profile: its lines in pairs, Tinder's question and then the answer. A
 * guess until the edit screen is read on a real phone, like Tinder's labels.
 */
export function promptsOf(sections: ProfileSection[]): ProfilePrompt[] {
  const lines = sections.find((section) => section.heading === "Prompts")?.items ?? []
  const prompts: ProfilePrompt[] = []
  for (let index = 0; index < lines.length; index += 2) prompts.push({ question: lines[index], answer: lines[index + 1] ?? "" })
  return prompts
}

/** A message on screen. A photo, voice note and the like has words saying what it is, such as "Sent a photo". */
export type Bubble = { direction: "in" | "out"; text: string; kind?: MessageKind }

/**
 * A message that is not words, told by its spoken label (part 17 of
 * "facebook/01"). Only a box at least this share of the screen wide counts,
 * so the small round picture beside their messages is never taken for one.
 */
const MEDIA_LABELS: Array<{ kind: Exclude<MessageKind, "text">; pattern: RegExp }> = [
  { kind: "voice", pattern: /voice (message|note|clip)|audio/i },
  { kind: "video", pattern: /^video\b|video message/i },
  { kind: "gif", pattern: /\bgif\b/i },
  { kind: "sticker", pattern: /sticker/i },
  { kind: "photo", pattern: /photo|image|picture/i },
]
const MEDIA_MIN_WIDTH = 0.15

/**
 * The messages on a conversation screen, oldest at the top. Theirs sit on
 * the left and ours on the right, which is how they are told apart. Times,
 * "Sent" and "Seen" are the app's, not a message. A photo, voice note,
 * sticker, video or GIF is kept as one, with words saying which.
 */
export function readBubbles(screen: ScreenRead, input: ScreenNode | null, app: AppScreens, skip: (line: string) => boolean = () => false): Bubble[] {
  const top = Math.round(screen.screenHeight * 0.1)
  const bottom = input ? input.bounds[1] : Math.round(screen.screenHeight * 0.88)
  const bubbles: Bubble[] = []
  for (const node of screen.nodes) {
    if (!isVisible(node, screen) || node.edit) continue
    if (node.bounds[1] < top || node.bounds[3] > bottom) continue
    const middle = (node.bounds[0] + node.bounds[2]) / 2
    const direction = middle >= screen.screenWidth / 2 ? "out" : "in"
    const text = node.text.trim()
    if (!text) {
      const media = node.desc.trim() && node.bounds[2] - node.bounds[0] >= screen.screenWidth * MEDIA_MIN_WIDTH ? MEDIA_LABELS.find((label) => label.pattern.test(node.desc)) : undefined
      if (media) bubbles.push({ direction, text: MESSAGE_KIND_WORDS[media.kind], kind: media.kind })
      continue
    }
    if (app.chatChromeLines.some((pattern) => pattern.test(text)) || skip(text)) continue
    bubbles.push({ direction, text })
  }
  return bubbles
}

function sameBubble(a: Bubble, b: Bubble): boolean {
  return a.direction === b.direction && a.text === b.text && (a.kind ?? "text") === (b.kind ?? "text")
}

/**
 * Joins an older screenful onto what was read so far. The two overlap where
 * the older one's last messages are the newer one's first; the overlap is
 * kept once.
 */
export function prependOlder(current: Bubble[], older: Bubble[]): Bubble[] {
  for (let overlap = Math.min(current.length, older.length); overlap > 0; overlap -= 1) {
    const tail = older.slice(older.length - overlap)
    if (tail.every((bubble, index) => sameBubble(bubble, current[index]))) {
      return [...older.slice(0, older.length - overlap), ...current]
    }
  }
  return [...older, ...current]
}

/** Whether two screenfuls show exactly the same messages: the conversation has stopped moving. */
export function sameBubbles(a: Bubble[], b: Bubble[]): boolean {
  return a.length === b.length && a.every((bubble, index) => sameBubble(bubble, b[index]))
}

export type ChatRow = { name: string; preview: string; node: ScreenNode; avatar: Bounds | null; isNew: boolean }

/**
 * The chat list: the row of new matches across the top, which have no
 * messages yet, and the list of conversations under "Messages", each a name
 * and its last line. Facebook Dating's Matches tab is laid out the same way,
 * under its own headings.
 */
export function readChatList(screen: ScreenRead, app: AppScreens = TINDER_SCREENS): ChatRow[] {
  const newHeading = findNode(screen, app.words.newMatchesHeading)
  const messagesHeading = findNode(screen, app.words.messagesHeading)
  const chrome = (line: string) => isChrome(line, app.chromeLines)
  const rows: ChatRow[] = []
  const visible = screen.nodes.filter((node) => isVisible(node, screen) && nodeWords(node))

  if (newHeading) {
    const bandBottom = messagesHeading ? messagesHeading.bounds[1] : newHeading.bounds[3] + screen.screenHeight * 0.2
    for (const node of visible) {
      if (node === newHeading || !node.text.trim()) continue
      if (node.bounds[1] <= newHeading.bounds[3] || node.bounds[3] > bandBottom) continue
      if (chrome(node.text) || /^\d+\+?$/.test(node.text.trim())) continue
      const width = node.bounds[2] - node.bounds[0]
      // The picture sits right above the name, as wide as the name's column.
      const avatar: Bounds = [node.bounds[0], Math.max(newHeading.bounds[3], node.bounds[1] - width), node.bounds[2], node.bounds[1]]
      rows.push({ name: node.text.trim(), preview: "", node, avatar, isNew: true })
    }
  }

  if (messagesHeading) {
    const below = visible.filter((node) => node !== messagesHeading && node.text.trim() && node.bounds[1] > messagesHeading.bounds[3])
    // Lines that share a row's height belong to one conversation: the name, then its last line.
    const used = new Set<ScreenNode>()
    for (const node of below) {
      if (used.has(node) || chrome(node.text)) continue
      const rowTop = node.bounds[1]
      const rowBottom = rowTop + (node.bounds[3] - node.bounds[1]) * 3
      const preview = below.find(
        (other) => other !== node && !used.has(other) && other.bounds[1] >= node.bounds[3] - 2 && other.bounds[1] < rowBottom && Math.abs(other.bounds[0] - node.bounds[0]) < 24
      )
      used.add(node)
      if (preview) used.add(preview)
      const height = (preview ? preview.bounds[3] : node.bounds[3]) - rowTop
      const avatar: Bounds = [Math.max(0, node.bounds[0] - height - 24), rowTop, Math.max(1, node.bounds[0] - 24), rowTop + height]
      rows.push({ name: node.text.trim(), preview: preview?.text.trim() ?? "", node, avatar: avatar[2] > avatar[0] ? avatar : null, isNew: false })
    }
  }
  return rows
}
