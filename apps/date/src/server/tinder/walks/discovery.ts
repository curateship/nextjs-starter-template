import { z } from "zod"

import { findNode, isVisible, type NodeMatch, type ScreenNode, type ScreenRead } from "../screen"
import { AGE_RANGE_VALUE, DISTANCE_VALUE, TINDER_SLIDERS, TINDER_WORDS } from "../screen-words"
import { onProfileTab, toProfileTab } from "./account"
import { onDiscover } from "../app-screens"
import { WalkError, type Seen, type WalkContext, type WalkKit } from "./kit"

/**
 * Sets Tinder's own distance and age range to Date's (part 4 of
 * "features/02-swiping-and-scoring"), so Tinder stops showing cards Date
 * would pass anyway, each a wasted swipe against the 60 an hour.
 *
 * Profile tab, the settings gear, then each slider is dragged and read back
 * until it says what Date asked for, then out of the settings and back to the
 * cards. Tinder's other filters are paid and are left alone.
 *
 * **Written before any real phone was read.** The settings screen is new to
 * the walks, so its words in `../screen-words.ts` and the slider ends in
 * `TINDER_SLIDERS` are guesses until the first run on Tyler's phone, with him
 * watching the screen window.
 */

export const discoveryInput = z.object({
  distanceKm: z.number().int().min(2).max(160),
  ageMin: z.number().int().min(18).max(99),
  ageMax: z.number().int().min(18).max(99),
})
export type DiscoveryInput = z.infer<typeof discoveryInput>

export const KM_PER_MILE = 1.609344

/** Moves of one thumb before the walk gives up on it. Each corrects its aim by how far the last one missed. */
const MOVES = 5

/** Scrolls down the app's settings looking for a slider. */
const SCROLLS = 4

export type Range = { min: number; max: number }

/** One slider on screen: its track, and the numbers its label shows (one for distance, two for ages). */
export type SliderRead = { track: ScreenNode; values: number[]; unit: "km" | "mi" | "age" }

export function readSlider(screen: ScreenRead, heading: NodeMatch, slider: NodeMatch, kind: "distance" | "age"): SliderRead | null {
  const title = findNode(screen, heading)
  if (!title) return null
  const visible = screen.nodes.filter((node) => isVisible(node, screen))
  const track =
    findNode(screen, slider) ??
    visible.filter((node) => /seekbar|slider/i.test(node.cls) && node.bounds[1] >= title.bounds[1]).sort((a, b) => a.bounds[1] - b.bounds[1])[0]
  if (!track) return null
  // The label is the first line after the heading, above the slider's foot, that reads as a value.
  for (const node of visible) {
    if (node.bounds[1] < title.bounds[1] || node.bounds[1] > track.bounds[3]) continue
    const text = node.text.trim()
    if (kind === "distance") {
      const found = DISTANCE_VALUE.exec(text)
      if (found) return { track, values: [Number(found[1])], unit: /^mi/i.test(found[2]) ? "mi" : "km" }
    } else {
      const found = AGE_RANGE_VALUE.exec(text)
      if (found) return { track, values: [Number(found[1]), Number(found[2])], unit: "age" }
    }
  }
  return null
}

/** Where on the track a value sits, by the guessed ends. The thumb's half-width is kept clear at each end. */
function xAt(track: ScreenNode, range: Range, value: number): number {
  const [left, top, right, bottom] = track.bounds
  const pad = (bottom - top) / 2
  const share = (Math.min(Math.max(value, range.min), range.max) - range.min) / (range.max - range.min)
  return left + pad + share * (right - left - 2 * pad)
}

/**
 * Drags one thumb of a slider until its value reads the target. A move that
 * lands short is aimed again by how far it missed. A thumb pushed to the end
 * of the track that still reads short of the target is at Tinder's own end,
 * and that end is kept.
 */
export async function setThumb(
  kit: WalkKit,
  seen: Seen,
  read: (screen: ScreenRead) => SliderRead | null,
  thumb: 0 | 1,
  target: number,
  range: Range,
  what: string
): Promise<Seen> {
  let current = seen
  let slider = read(current.screen)
  if (!slider) throw new WalkError(`Could not read ${what} in ${kit.app.appName}'s settings. The words for it may have changed.`, current.shot)
  let aim = target
  for (let move = 0; move < MOVES; move += 1) {
    const now = slider.values[thumb]
    if (now === target) return current
    const y = (slider.track.bounds[1] + slider.track.bounds[3]) / 2
    const to = Math.min(Math.max(xAt(slider.track, range, aim), slider.track.bounds[0]), slider.track.bounds[2])
    current = await kit.drag({ x: xAt(slider.track, range, now), y }, { x: to, y })
    slider = read(current.screen)
    if (!slider) throw new WalkError(`${what} went off ${kit.app.appName}'s screen while it was being set.`, current.shot)
    const landed = slider.values[thumb]
    if (landed === target) return current
    const atEnd = (aim >= range.max && landed < target) || (aim <= range.min && landed > target)
    if (atEnd && landed === now) return current
    aim += target - landed
  }
  throw new WalkError(`${what} in ${kit.app.appName} reads ${slider.values[thumb]} after ${MOVES} tries to set it to ${target}. Nothing else was changed.`, current.shot)
}

/** Scrolls the app's settings until a slider is on screen. */
export async function scrollTo(kit: WalkKit, seen: Seen, read: (screen: ScreenRead) => SliderRead | null, what: string): Promise<Seen> {
  let current = seen
  for (let scrolls = 0; scrolls < SCROLLS && !read(current.screen); scrolls += 1) current = await kit.scroll(current, "up", 600)
  if (!read(current.screen)) throw new WalkError(`Could not find ${what} in ${kit.app.appName}'s settings. The words for it may have changed.`, current.shot)
  return current
}

export async function setDiscovery(_ctx: WalkContext, kit: WalkKit, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const parsed = discoveryInput.safeParse(input)
  if (!parsed.success) throw new WalkError("The distance and ages to set were not given.")
  const want = parsed.data
  const readDistance = (screen: ScreenRead) => readSlider(screen, TINDER_WORDS.distanceHeading, TINDER_WORDS.distanceSlider, "distance")
  const readAges = (screen: ScreenRead) => readSlider(screen, TINDER_WORDS.ageHeading, TINDER_WORDS.ageSlider, "age")

  const tab = await toProfileTab(kit)
  let seen = await kit.tap(kit.need(tab, TINDER_WORDS.openSettings, "the Settings button on the Profile tab"), 1_000)

  seen = await scrollTo(kit, seen, readDistance, "the distance")
  const unit = readDistance(seen.screen)?.unit === "mi" ? "mi" : "km"
  const distance = unit === "mi" ? Math.max(1, Math.round(want.distanceKm / KM_PER_MILE)) : want.distanceKm
  seen = await setThumb(kit, seen, readDistance, 0, distance, TINDER_SLIDERS[unit], "The distance")
  const distanceRead = readDistance(seen.screen)?.values[0] ?? distance

  seen = await scrollTo(kit, seen, readAges, "the age range")
  const ages = readAges(seen.screen)?.values ?? [0, 0]
  // The top thumb first when the new youngest is above the old oldest, so the thumbs never have to pass each other.
  const order: Array<[0 | 1, number, string]> =
    want.ageMin > ages[1]
      ? [
          [1, want.ageMax, "The oldest age"],
          [0, want.ageMin, "The youngest age"],
        ]
      : [
          [0, want.ageMin, "The youngest age"],
          [1, want.ageMax, "The oldest age"],
        ]
  for (const [thumb, target, what] of order) seen = await setThumb(kit, seen, readAges, thumb, target, TINDER_SLIDERS.age, what)
  const agesRead = readAges(seen.screen)?.values ?? [want.ageMin, want.ageMax]

  // Out of the settings, which keeps what was set, and back to the cards.
  for (let tries = 0; tries < 2 && !onProfileTab(seen.screen); tries += 1) {
    const done = kit.find(seen, TINDER_WORDS.settingsDone)
    seen = done ? await kit.tap(done, 900) : await kit.back(900)
  }
  const cards = kit.find(seen, TINDER_WORDS.tabDiscover)
  if (cards) {
    const back = await kit.tap(cards, 900)
    if (!onDiscover(back.screen)) await kit.dismissOffers(back)
  }
  return { distance: `${distanceRead} ${unit}`, distanceKm: want.distanceKm, ageMin: agesRead[0], ageMax: agesRead[1] }
}
