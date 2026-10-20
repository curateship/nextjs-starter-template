/**
 * Extras: the clothing, backdrops, props and hair looks an actor can be
 * dressed and placed with (see workspace/docs/extras.md). Everything the
 * browser and the server must agree on lives here: the kinds, the board's
 * size, and the words each extra adds to a prompt.
 */

/** Never narrow this list: saved extras of a kind taken off it would break. */
export const EXTRA_KINDS = ["clothing", "backdrop", "prop", "hair"] as const
export type ExtraKind = (typeof EXTRA_KINDS)[number]

export const EXTRA_KIND_LABELS: Record<
  ExtraKind,
  { tab: string; one: string; none: string }
> = {
  clothing: { tab: "Clothing", one: "clothing", none: "No clothing yet" },
  backdrop: { tab: "Backdrop", one: "backdrop", none: "No backdrops yet" },
  prop: { tab: "Props", one: "prop", none: "No props yet" },
  hair: { tab: "Hair and makeup", one: "hair look", none: "No hair looks yet" },
}

/**
 * The picked extra of each kind, by id. Saved on the project, so a series
 * keeps the same outfit and place, and sent with a first frame.
 */
export type ExtraPicks = Partial<Record<ExtraKind, string>>

/** One extra as a first frame or a Veo piece was sent it. */
export type SentExtra = { kind: ExtraKind; extra_id: string; media_id: string }

/**
 * What goes on the person board after the actor's angles, in this order.
 * The backdrop is the place, not the person, so it goes as its own picture.
 */
const BOARD_EXTRA_KINDS = ["clothing", "hair", "prop"] as const

/** A board is a 2 by 2 grid. Tyler's number, 19 Oct 2026. */
export const BOARD_TILES = 4
export const BOARD_FULL_MESSAGE = `A board holds ${BOARD_TILES} pictures. Take one off first.`
export const EXTRA_NOT_FOUND_MESSAGE = "That extra is no longer there."
export const EXTRA_PICTURE_MISSING_MESSAGE = "Pick a picture, or press Draw with AI."

/** How many board tiles the extras picked take: every kind but the backdrop. */
export function boardExtraCount(picks: ExtraPicks) {
  return BOARD_EXTRA_KINDS.filter((kind) => picks[kind]).length
}

/**
 * Veo takes reference pictures on 8 second clips only (Google's Veo page,
 * read 19 Oct 2026), so a 4 or 6 second piece is sent the words alone.
 */
export const VEO_REFERENCE_SECONDS = 8

function sentence(text: string) {
  const trimmed = text.trim().replace(/\s+/g, " ")
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

/** The line an extra adds to a prompt, such as "Wearing: green wool jacket." */
export function extraLine(kind: ExtraKind, prompt: string) {
  const lead = {
    clothing: "Wearing",
    hair: "Hair and makeup",
    prop: "Holding",
    backdrop: "The place is",
  }[kind]
  return `${lead}: ${sentence(prompt)}`
}

/** The line a Veo prompt opens the person's words with. */
export function personLine(prompt: string) {
  return `The person is: ${sentence(prompt)}`
}

/** Sorts extras into the order they are sent: the board's kinds, then the backdrop. */
export function sendingOrder<Extra extends { kind: ExtraKind }>(extras: Extra[]) {
  const order: ExtraKind[] = [...BOARD_EXTRA_KINDS, "backdrop"]
  return [...extras].sort(
    (left, right) => order.indexOf(left.kind) - order.indexOf(right.kind)
  )
}

const TILE_NAMES: Record<Exclude<ExtraKind, "backdrop">, string> = {
  clothing: "their clothing",
  hair: "their hair and makeup",
  prop: "what they hold",
}

/**
 * What a first frame's prompt says about the pictures it was sent beyond the
 * actor's own description: the board's tiles by name, then the place. One
 * picture of the actor and no extras says nothing, so that request is exactly
 * what it always was.
 */
export function firstFramePictureLines(options: {
  actorName: string
  /** The actor's angles by their sheet labels, main first. */
  angles: string[]
  /** The extras sent, in sending order. */
  extras: { kind: ExtraKind; name: string }[]
}) {
  const onBoard = options.extras.filter(
    (extra): extra is { kind: Exclude<ExtraKind, "backdrop">; name: string } =>
      extra.kind !== "backdrop"
  )
  const backdrop = options.extras.find((extra) => extra.kind === "backdrop")
  const tiles = [
    ...options.angles,
    ...onBoard.map((extra) => `${TILE_NAMES[extra.kind]} (${extra.name})`),
  ]
  const lines: string[] = []
  if (tiles.length > 1) {
    lines.push(
      `The first picture is a board of one person, ${options.actorName}: ${tiles
        .map((tile, index) => `tile ${index + 1} ${tile}`)
        .join(", ")}. Draw one person, not the board.`
    )
  }
  if (backdrop) {
    lines.push(
      `The second picture is the place to put ${options.actorName} in: ${backdrop.name}.`
    )
  }
  return lines
}

/**
 * What a Veo prompt says about its reference pictures, when it has any: the
 * first is the person (a board when there was more than one picture of them),
 * and the last is the place when a backdrop was sent.
 */
export function veoReferenceLine(options: { board: boolean; backdrop: boolean }) {
  const person = options.board
    ? "The first reference picture is a board of one person from several sides and what they wear and hold: show that one person, never the board."
    : "The first reference picture shows the person."
  return options.backdrop
    ? `${person} The last reference picture is the place.`
    : person
}

/**
 * Names the extras a frame or a shot was made with, by their names today. One
 * deleted since is "a removed extra".
 */
export function describeExtras(
  sent: SentExtra[],
  current: { id: string; name: string }[]
) {
  return sent.map(
    (extra) =>
      current.find((candidate) => candidate.id === extra.extra_id)?.name ??
      "a removed extra"
  )
}

/** What Draw with AI is asked for, so each kind comes out on its own. */
export function extraDrawPrompt(kind: ExtraKind, prompt: string) {
  const ask = {
    clothing:
      "Draw this outfit on its own, laid out flat or on an invisible mannequin, on a plain light background. No person, no face and no text.",
    backdrop:
      "Draw this place as an empty background for a video, with nobody in it and no text.",
    prop: "Draw this object on its own on a plain light background, with no person and no text.",
    hair: "Draw this hairstyle and makeup on a plain, featureless mannequin head against a plain light background, with no text.",
  }[kind]
  return `${ask} ${sentence(prompt)}`
}
