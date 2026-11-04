import {
  captionEntranceProgress,
  captionWordAnimation,
  clamp01,
  CAPTION_ANIM_ENTRANCE_MS,
  isAnimatedCaption,
  resolveCaptionAnimation,
  type CaptionAnimationId,
} from "@/lib/video/caption-animations"

/**
 * Ready-made social stickers in the Graphics panel: a reply to a comment, a
 * Subscribe or Follow button that a cursor presses, and a "Link in bio" tag
 * (workspace/docs/social-stickers.md).
 *
 * Each one is a shape clip (`shape: "comment"` and so on), so it is placed,
 * moved, resized, faded and timed exactly like a circle: its box is the two
 * points `x`/`y` and `toX`/`toY`, and the sticker is drawn as big as fits in
 * that box, in the middle of it. Its words are `text`, the name on it is
 * `socialName` and the round picture is `pictureUrl`.
 *
 * Both ends draw from here. The preview puts this markup in the SVG over the
 * stage, and the export draws the same markup to a picture, one per frame
 * while it moves and one still after. The only difference is the picture's
 * address: the preview hands the file's own address, and the export hands
 * the picture's bytes, read from storage, because the export's drawing reads
 * no addresses.
 */

export const SOCIAL_KINDS = ["comment", "subscribe", "link-in-bio"] as const
export type SocialKind = (typeof SOCIAL_KINDS)[number]

export const SOCIAL_LABELS: Record<SocialKind, string> = {
  comment: "Comment reply",
  subscribe: "Subscribe button",
  "link-in-bio": "Link in bio",
}

export const SOCIAL_PLATFORMS = ["tiktok", "instagram", "youtube"] as const
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
}

/** How long a new sticker stays on screen. */
export const DEFAULT_SOCIAL_DURATION_MS = 3500
/** Longest name drawn, and longest words, so a card never runs off forever. */
export const SOCIAL_NAME_MAX = 40
export const SOCIAL_TEXT_MAX = 200
export const LINK_TEXT_MAX = 24

/**
 * The Subscribe button's little film, in milliseconds into the clip: the
 * cursor arrives, presses, the button changes, and the cursor fades away.
 * The click sound laid with it lands on `SUBSCRIBE_PRESS_MS`.
 */
const SUBSCRIBE_CURSOR_IN_MS = 400
const SUBSCRIBE_CURSOR_AT_BUTTON_MS = 1000
export const SUBSCRIBE_PRESS_MS = 1100
const SUBSCRIBE_PRESS_END_MS = 1250
const SUBSCRIBE_CURSOR_OUT_START_MS = 1600
const SUBSCRIBE_CURSOR_OUT_END_MS = 1900

type Frame = { width: number; height: number }

export type SocialClip = {
  id: string
  kind?: string
  shape?: string
  x?: number
  y?: number
  toX?: number
  toY?: number
  text?: string
  socialName?: string
  socialPlatform?: SocialPlatform
  pictureUrl?: string
  pointsUp?: boolean
  animation?: CaptionAnimationId
  durationMs: number
}

export function isSocialKind(shape: string | undefined): shape is SocialKind {
  return (SOCIAL_KINDS as readonly string[]).includes(shape ?? "")
}

export function isSocialClip(clip: { kind?: string; shape?: string }) {
  return clip.kind === "shape" && isSocialKind(clip.shape)
}

/** Which look a comment or Subscribe sticker has. Absent reads as TikTok. */
export function socialPlatform(clip: { socialPlatform?: string }): SocialPlatform {
  return (SOCIAL_PLATFORMS as readonly string[]).includes(clip.socialPlatform ?? "")
    ? (clip.socialPlatform as SocialPlatform)
    : "tiktok"
}

/** The words a new sticker starts with, before anybody types. */
export function defaultSocialText(kind: SocialKind) {
  switch (kind) {
    case "comment":
      return "How did you make this? I need the steps!"
    case "link-in-bio":
      return "Link in bio"
    case "subscribe":
      return ""
  }
}

// --- Words ---------------------------------------------------------------

/**
 * The export draws in Inter SemiBold, the one weight it ships, and the
 * preview draws the same face. Lines are cut by a guess of the width rather
 * than by measuring, so both ends cut them in the same places. 0.55 of the
 * font size is Inter's average letter, with the same margin text clips use
 * (text-fonts.ts), so a line breaks a little early rather than running off.
 */
const LETTER_WIDTH = 0.55

/** Lines of at most `width` units, never more than `maxLines`, the last cut short with "…". */
export function wrapSocialText(text: string, fontSize: number, width: number, maxLines: number) {
  const perLine = Math.max(4, Math.floor(width / (fontSize * LETTER_WIDTH)))
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ""
  for (const word of words) {
    // A word longer than a line is broken where the line ends.
    let rest = word
    while (rest.length > perLine) {
      if (line) {
        lines.push(line)
        line = ""
      }
      lines.push(rest.slice(0, perLine))
      rest = rest.slice(perLine)
    }
    const next = line ? `${line} ${rest}` : rest
    if (next.length > perLine) {
      lines.push(line)
      line = rest
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  const last = kept[maxLines - 1]
  kept[maxLines - 1] = `${last.slice(0, Math.max(0, perLine - 1)).trimEnd()}…`
  return kept
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function fmt(value: number) {
  return String(Math.round(value * 100) / 100)
}

/** A clip id made safe for an SVG id, which must be unique on the page. */
function safeId(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "")
}

function nameOf(clip: SocialClip) {
  return (clip.socialName ?? "").trim().slice(0, SOCIAL_NAME_MAX) || "You"
}

function textOf(clip: SocialClip, kind: SocialKind) {
  const typed = (clip.text ?? "").trim()
  const max = kind === "link-in-bio" ? LINK_TEXT_MAX : SOCIAL_TEXT_MAX
  return (typed || defaultSocialText(kind)).slice(0, max)
}

function textEl(
  x: number,
  y: number,
  size: number,
  fill: string,
  words: string,
  anchor: "start" | "middle" | "end" = "start"
) {
  return `<text x="${fmt(x)}" y="${fmt(y)}" font-family="Inter" font-weight="600" font-size="${size}" fill="${fill}" text-anchor="${anchor}">${escapeXml(words)}</text>`
}

// --- Pictures --------------------------------------------------------------

/**
 * A round picture of the person, or their first letter on a coloured circle
 * when there is no picture. `href` is the picture's address in the preview
 * and its bytes in the export.
 */
function avatar(id: string, cx: number, cy: number, r: number, name: string, href: string | null) {
  if (href) {
    const clipId = `${id}-avatar`
    return `<clipPath id="${clipId}"><circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}"/></clipPath><image href="${escapeXml(href)}" x="${fmt(cx - r)}" y="${fmt(cy - r)}" width="${fmt(r * 2)}" height="${fmt(r * 2)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>`
  }
  const letter = name.trim().charAt(0).toUpperCase() || "?"
  return `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}" fill="#7c3aed"/>${textEl(cx, cy + r * 0.36, Math.round(r), "#ffffff", letter, "middle")}`
}

// --- The stickers, each in its own units ------------------------------------

type Drawn = { width: number; height: number; body: string }

const COMMENT_WIDTH = 760
const PAD = 28
const AVATAR = 64

function drawComment(clip: SocialClip, id: string, picture: string | null): Drawn {
  const platform = socialPlatform(clip)
  const name = nameOf(clip)
  const words = textOf(clip, "comment")
  const textX = PAD + AVATAR + 20
  const textWidth = COMMENT_WIDTH - textX - PAD
  const dark = platform === "youtube"
  const bodySize = platform === "tiktok" ? 34 : 32
  const lineHeight = Math.round(bodySize * 1.3)
  const lines = wrapSocialText(words, bodySize, textWidth, 5)
  const headSize = 26
  const head =
    platform === "tiktok"
      ? `Reply to ${name}'s comment`
      : platform === "youtube"
        ? `@${name.toLowerCase().replace(/\s+/g, "")} · 1 day ago`
        : name
  const headFill = platform === "instagram" ? "#000000" : dark ? "#aaaaaa" : "#8a8b91"
  const bodyFill = dark ? "#f1f1f1" : platform === "instagram" ? "#262626" : "#161823"
  const headY = PAD + headSize
  const firstLineY = headY + 14 + bodySize
  const textBottom = firstLineY + (lines.length - 1) * lineHeight
  const footer = platform === "tiktok" ? 0 : 44
  const cardHeight = Math.max(PAD + AVATAR, textBottom + 12 + footer) + PAD
  const tail = platform === "tiktok" ? 22 : 0
  const parts = [
    `<rect x="0" y="0" width="${COMMENT_WIDTH}" height="${cardHeight}" rx="28" fill="${dark ? "#0f0f0f" : "#ffffff"}"/>`,
    tail
      ? `<path d="M44 ${cardHeight - 1}L44 ${cardHeight + tail}L80 ${cardHeight - 1}Z" fill="#ffffff"/>`
      : "",
    avatar(id, PAD + AVATAR / 2, PAD + AVATAR / 2, AVATAR / 2, name, picture),
    textEl(textX, headY, headSize, headFill, head),
    ...lines.map((line, index) =>
      textEl(textX, firstLineY + index * lineHeight, bodySize, bodyFill, line)
    ),
  ]
  const footerY = textBottom + 12 + 30
  if (platform === "instagram") {
    parts.push(textEl(textX, footerY, 24, "#8e8e8e", "1d   Reply"))
    // An outlined heart on the right, as on Instagram.
    const hx = COMMENT_WIDTH - PAD - 16
    const hy = PAD + 18
    parts.push(
      `<path d="M${hx} ${hy + 10}c-6-6-16-14-16-21a8 8 0 0 1 16-3a8 8 0 0 1 16 3c0 7-10 15-16 21z" fill="none" stroke="#8e8e8e" stroke-width="3" stroke-linejoin="round"/>`
    )
  }
  if (platform === "youtube") {
    // A thumbs up, its count, a thumbs down and Reply.
    const y = footerY - 10
    parts.push(
      `<path d="M${textX} ${y + 6}h6v14h-6zM${textX + 9} ${y + 20}h13l4-11v-3h-10l2-8-2-2-7 9z" fill="none" stroke="#aaaaaa" stroke-width="2.5" stroke-linejoin="round"/>`,
      textEl(textX + 38, footerY, 24, "#aaaaaa", "12"),
      `<path d="M${textX + 90} ${y + 14}h6v-14h-6zM${textX + 99} ${y}h13l4 11v3h-10l2 8-2 2-7-9z" fill="none" stroke="#aaaaaa" stroke-width="2.5" stroke-linejoin="round"/>`,
      textEl(textX + 150, footerY, 24, "#aaaaaa", "Reply")
    )
  }
  return { width: COMMENT_WIDTH, height: cardHeight + tail, body: parts.join("") }
}

const SUBSCRIBE_WIDTH = 760
const SUBSCRIBE_HEIGHT = 140
const BUTTON = { x: SUBSCRIBE_WIDTH - 20 - 270, y: 28, width: 270, height: 84 }

/** Where the cursor's tip is at this moment, and how big and solid it is. */
export function subscribeCursor(atMs: number) {
  if (atMs < SUBSCRIBE_CURSOR_IN_MS) return null
  const target = { x: BUTTON.x + BUTTON.width * 0.55, y: BUTTON.y + BUTTON.height * 0.62 }
  const start = { x: SUBSCRIBE_WIDTH - 30, y: SUBSCRIBE_HEIGHT + 150 }
  const travel = clamp01(
    (atMs - SUBSCRIBE_CURSOR_IN_MS) / (SUBSCRIBE_CURSOR_AT_BUTTON_MS - SUBSCRIBE_CURSOR_IN_MS)
  )
  const eased = 1 - (1 - travel) ** 3
  const pressing = atMs >= SUBSCRIBE_PRESS_MS && atMs < SUBSCRIBE_PRESS_END_MS
  const opacity =
    1 -
    clamp01(
      (atMs - SUBSCRIBE_CURSOR_OUT_START_MS) /
        (SUBSCRIBE_CURSOR_OUT_END_MS - SUBSCRIBE_CURSOR_OUT_START_MS)
    )
  if (opacity <= 0) return null
  return {
    x: start.x + (target.x - start.x) * eased,
    y: start.y + (target.y - start.y) * eased,
    scale: pressing ? 0.85 : 1,
    opacity,
  }
}

const BUTTON_LOOK: Record<
  SocialPlatform,
  { before: [string, string, string]; after: [string, string, string] }
> = {
  // [fill, words, word colour]
  youtube: { before: ["#ff0000", "Subscribe", "#ffffff"], after: ["#3f3f3f", "Subscribed", "#ffffff"] },
  tiktok: { before: ["#fe2c55", "Follow", "#ffffff"], after: ["#3a3a3a", "Following", "#ffffff"] },
  instagram: { before: ["#0095f6", "Follow", "#ffffff"], after: ["#efefef", "Following", "#000000"] },
}

function drawSubscribe(clip: SocialClip, id: string, picture: string | null, atMs: number): Drawn {
  const platform = socialPlatform(clip)
  const name = nameOf(clip)
  const pressed = atMs >= SUBSCRIBE_PRESS_MS
  const [fill, words, wordFill] = BUTTON_LOOK[platform][pressed ? "after" : "before"]
  const avatarR = 50
  const nameLines = wrapSocialText(name, 34, BUTTON.x - 150 - 16, 1)
  const parts = [
    `<rect x="0" y="0" width="${SUBSCRIBE_WIDTH}" height="${SUBSCRIBE_HEIGHT}" rx="${SUBSCRIBE_HEIGHT / 2}" fill="#000000" fill-opacity="0.6"/>`,
    avatar(id, 20 + avatarR, SUBSCRIBE_HEIGHT / 2, avatarR, name, picture),
    textEl(150, SUBSCRIBE_HEIGHT / 2 + 12, 34, "#ffffff", nameLines[0] ?? ""),
    `<rect x="${BUTTON.x}" y="${BUTTON.y}" width="${BUTTON.width}" height="${BUTTON.height}" rx="${BUTTON.height / 2}" fill="${fill}"/>`,
  ]
  const centreX = BUTTON.x + BUTTON.width / 2
  if (platform === "youtube" && pressed) {
    // The bell beside "Subscribed".
    const bx = BUTTON.x + 36
    const by = BUTTON.y + 26
    parts.push(
      `<path d="M${bx} ${by + 26}h28l-4-6v-10a10 10 0 0 0-20 0v10z M${bx + 10} ${by + 30}a4 4 0 0 0 8 0" fill="none" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"/>`,
      textEl(centreX + 18, BUTTON.y + BUTTON.height / 2 + 11, 30, wordFill, words, "middle")
    )
  } else {
    parts.push(textEl(centreX, BUTTON.y + BUTTON.height / 2 + 11, 32, wordFill, words, "middle"))
  }
  if (platform === "tiktok") {
    // TikTok's small + under the picture, a tick once followed.
    const cx = 20 + avatarR
    const cy = SUBSCRIBE_HEIGHT / 2 + avatarR - 4
    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="14" fill="${pressed ? "#ffffff" : "#fe2c55"}"/>`,
      pressed
        ? `<path d="M${cx - 6} ${cy}l4 4l8-8" fill="none" stroke="#fe2c55" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<path d="M${cx - 6} ${cy}h12M${cx} ${cy - 6}v12" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>`
    )
  }
  const cursor = subscribeCursor(atMs)
  if (cursor) {
    // A white arrow pointer with a dark edge, its tip at the point.
    parts.push(
      `<g opacity="${fmt(cursor.opacity)}" transform="translate(${fmt(cursor.x)} ${fmt(cursor.y)}) scale(${fmt(cursor.scale * 1.6)})"><path d="M0 0L0 34L9 26L15 40L21 37L15 24L27 24Z" fill="#ffffff" stroke="#111111" stroke-width="2.5" stroke-linejoin="round"/></g>`
    )
  }
  return { width: SUBSCRIBE_WIDTH, height: SUBSCRIBE_HEIGHT, body: parts.join("") }
}

const LINK_WIDTH = 520
const LINK_PILL = 96
const LINK_ARROW = 84

function drawLinkInBio(clip: SocialClip): Drawn {
  const words = wrapSocialText(textOf(clip, "link-in-bio"), 38, LINK_WIDTH - 140, 1)[0] ?? ""
  const up = !!clip.pointsUp
  const pillY = up ? LINK_ARROW + 16 : 0
  const arrowTop = up ? 0 : LINK_PILL + 16
  const cx = LINK_WIDTH / 2
  // A thick arrow, its point up or down.
  const arrow = up
    ? `M${cx} ${arrowTop}L${cx + 40} ${arrowTop + 44}H${cx + 16}V${arrowTop + LINK_ARROW}H${cx - 16}V${arrowTop + 44}H${cx - 40}Z`
    : `M${cx} ${arrowTop + LINK_ARROW}L${cx + 40} ${arrowTop + 40}H${cx + 16}V${arrowTop}H${cx - 16}V${arrowTop + 40}H${cx - 40}Z`
  // A chain link: two rounded rings at an angle.
  const lx = 52
  const ly = pillY + LINK_PILL / 2
  const parts = [
    `<rect x="0" y="${pillY}" width="${LINK_WIDTH}" height="${LINK_PILL}" rx="${LINK_PILL / 2}" fill="#ffffff"/>`,
    `<g transform="rotate(-45 ${lx + 16} ${ly})" fill="none" stroke="#000000" stroke-width="5"><rect x="${lx - 8}" y="${ly - 9}" width="30" height="18" rx="9"/><rect x="${lx + 10}" y="${ly - 9}" width="30" height="18" rx="9"/></g>`,
    textEl(LINK_WIDTH / 2 + 30, pillY + LINK_PILL / 2 + 13, 38, "#000000", words, "middle"),
    `<path d="${arrow}" fill="#ffffff" stroke="#000000" stroke-opacity="0.15" stroke-width="2" stroke-linejoin="round"/>`,
  ]
  return { width: LINK_WIDTH, height: LINK_PILL + 16 + LINK_ARROW, body: parts.join("") }
}

function draw(clip: SocialClip, id: string, picture: string | null, atMs: number): Drawn {
  switch (clip.shape as SocialKind) {
    case "comment":
      return drawComment(clip, id, picture)
    case "subscribe":
      return drawSubscribe(clip, id, picture, atMs)
    default:
      return drawLinkInBio(clip)
  }
}

/** The sticker's own size, in its own units, for fitting a box to it. */
export function socialNaturalSize(clip: SocialClip) {
  const drawn = draw(clip, "size", null, 0)
  return { width: drawn.width, height: drawn.height }
}

// --- Placing it in its box --------------------------------------------------

/** Where a sticker sits: its box in the frame's pixels, and how much it is scaled. */
function placement(clip: SocialClip, frame: Frame, drawn: Drawn) {
  const left = Math.min(clip.x ?? 0.1, clip.toX ?? 0.9) * frame.width
  const top = Math.min(clip.y ?? 0.2, clip.toY ?? 0.35) * frame.height
  const boxWidth = Math.abs((clip.toX ?? 0.9) - (clip.x ?? 0.1)) * frame.width
  const boxHeight = Math.abs((clip.toY ?? 0.35) - (clip.y ?? 0.2)) * frame.height
  const scale = Math.max(0.01, Math.min(boxWidth / drawn.width, boxHeight / drawn.height))
  return {
    x: left + (boxWidth - drawn.width * scale) / 2,
    y: top + (boxHeight - drawn.height * scale) / 2,
    scale,
  }
}

/**
 * How long the sticker moves for, from its start: its entrance, and for the
 * Subscribe button the cursor's whole visit. After this it holds still.
 */
export function socialMovingMs(clip: SocialClip) {
  const entrance = isAnimatedCaption(resolveCaptionAnimation(clip.animation))
    ? CAPTION_ANIM_ENTRANCE_MS
    : 0
  const moving = clip.shape === "subscribe" ? SUBSCRIBE_CURSOR_OUT_END_MS : entrance
  return Math.min(moving, clip.durationMs)
}

/**
 * The moment the preview shows while a sticker is picked and the video is
 * paused: just after it has arrived, before the Subscribe cursor comes, so
 * the button can be read and placed.
 */
export const SOCIAL_PLACING_MS = CAPTION_ANIM_ENTRANCE_MS

/**
 * The sticker at `atMs` into its clip, as SVG markup in the frame's pixels,
 * without the SVG around it. `picture` is the picture's address or bytes.
 */
export function socialStickerMarkup(
  clip: SocialClip,
  frame: Frame,
  atMs: number,
  picture: string | null
) {
  const id = `social-${safeId(clip.id)}`
  const drawn = draw(clip, id, picture, atMs)
  const place = placement(clip, frame, drawn)
  const entrance = captionWordAnimation(
    resolveCaptionAnimation(clip.animation),
    captionEntranceProgress(atMs, 0)
  )
  // The entrance moves the whole sticker about its middle. Rise counts its
  // shift in a third of the sticker's height, the way a caption counts in
  // its letters' height.
  const cx = drawn.width / 2
  const cy = drawn.height / 2
  const dy = entrance.dyEm * drawn.height * 0.3
  const move =
    entrance.scale !== 1 || dy !== 0
      ? ` transform="translate(${fmt(cx)} ${fmt(cy + dy)}) scale(${fmt(entrance.scale)}) translate(${fmt(-cx)} ${fmt(-cy)})"`
      : ""
  const shadowId = `${id}-shadow`
  return `<filter id="${shadowId}" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#000000" flood-opacity="0.3"/></filter><g transform="translate(${fmt(place.x)} ${fmt(place.y)}) scale(${fmt(place.scale)})"><g opacity="${fmt(entrance.opacity)}" filter="url(#${shadowId})"${move}>${drawn.body}</g></g>`
}

/** The sticker as a whole SVG the size of the frame, for the export. */
export function socialStickerSvg(
  clip: SocialClip,
  frame: Frame,
  atMs: number,
  picture: string | null
) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}">${socialStickerMarkup(clip, frame, atMs, picture)}</svg>`
}

/**
 * The export's moments across the sticker: one picture per frame of the film
 * while it moves, then one still for the rest. Each window says which moment
 * of the clip its picture shows.
 */
export function socialExportWindows(clip: SocialClip, fps: number) {
  const movingMs = socialMovingMs(clip)
  if (movingMs <= 0) return [{ fromMs: 0, toMs: clip.durationMs, atMs: clip.durationMs }]
  const frameMs = 1000 / fps
  const windows: { fromMs: number; toMs: number; atMs: number }[] = []
  for (let fromMs = 0; fromMs < movingMs - 0.001; fromMs += frameMs) {
    windows.push({ fromMs, toMs: Math.min(movingMs, fromMs + frameMs), atMs: fromMs })
  }
  if (movingMs < clip.durationMs) {
    windows.push({ fromMs: movingMs, toMs: clip.durationMs, atMs: clip.durationMs })
  }
  return windows
}

// --- A new sticker -----------------------------------------------------------

/**
 * A new sticker's fields: its words, look, name and picture, and a box the
 * shape of the sticker, 80% of the frame's width at most, centred across.
 * Not in the middle, where the paused preview's Play button would take the
 * press meant for it.
 */
export function newSocialSticker(
  kind: SocialKind,
  frame: Frame,
  profile: { name: string; pictureUrl: string | null }
) {
  const fields = {
    shape: kind,
    text: kind === "subscribe" ? undefined : defaultSocialText(kind),
    socialName: kind === "link-in-bio" ? undefined : profile.name.slice(0, SOCIAL_NAME_MAX),
    pictureUrl: kind === "link-in-bio" ? undefined : (profile.pictureUrl ?? undefined),
    socialPlatform: kind === "comment" || kind === "subscribe" ? ("tiktok" as const) : undefined,
    animation: "pop" as const,
  }
  const size = socialNaturalSize({ id: "new", kind: "shape", durationMs: 1, ...fields })
  const widthShare = Math.min(0.8, (Math.min(frame.width, frame.height) * 0.8) / frame.width)
  const heightShare = (widthShare * frame.width * (size.height / size.width)) / frame.height
  const top = kind === "subscribe" || kind === "link-in-bio" ? 0.62 : 0.14
  const y = Math.min(top, 1 - heightShare)
  return {
    ...fields,
    x: (1 - widthShare) / 2,
    y,
    toX: (1 + widthShare) / 2,
    toY: Math.min(1, y + heightShare),
  }
}

/**
 * The box's bottom edge moved so the box is the sticker's shape again, keeping
 * its top and width. Run after the words change, so a longer comment grows
 * its box instead of shrinking to fit the old one.
 */
export function fitSocialBox(clip: SocialClip, frame: Frame) {
  const size = socialNaturalSize(clip)
  const left = Math.min(clip.x ?? 0.1, clip.toX ?? 0.9)
  const right = Math.max(clip.x ?? 0.1, clip.toX ?? 0.9)
  const top = Math.min(clip.y ?? 0.2, clip.toY ?? 0.35)
  const heightShare = ((right - left) * frame.width * (size.height / size.width)) / frame.height
  return { x: left, toX: right, y: top, toY: Math.min(1, top + heightShare) }
}
