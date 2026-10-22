import { findNode, isVisible, type ScreenNode, type ScreenRead } from "@/server/tinder/screen"
import { discoveryInput, KM_PER_MILE, readSlider, scrollTo, setThumb } from "@/server/tinder/walks/discovery"
import { WalkError, type Seen, type WalkContext, type WalkKit } from "@/server/tinder/walks/kit"

import { FACEBOOK_WORDS } from "../screen-words"
import { openDating } from "./card"

/**
 * Facebook Dating's own settings: its distance and ages set from Date's
 * (part 13 of "facebook/01-facebook-dating"), and its break switched on or
 * off for Pause and Resume (part 22). Both open Dating's settings from the
 * gear on Dating's home and read back what they set.
 *
 * Written before the settings screen was read on a phone. The slider ends
 * are guesses, the same as Tinder's; each move is aimed again from what it
 * reads back, so a wrong guess costs a few more moves, not a wrong setting.
 */

/** The ends of Facebook Dating's sliders, guessed: 1 to 160 kilometres (1 to 100 miles), ages 18 to 99. */
const FACEBOOK_SLIDERS = {
  km: { min: 1, max: 160 },
  mi: { min: 1, max: 100 },
  age: { min: 18, max: 99 },
} as const

async function toDatingSettings(ctx: WalkContext, kit: WalkKit): Promise<Seen> {
  const home = await openDating(ctx, kit)
  return kit.tap(kit.need(home, FACEBOOK_WORDS.datingSettings, "Dating's settings"), 1_200)
}

/** Out of Dating's settings by its own Done or back, which keeps what was set. */
async function leaveSettings(kit: WalkKit, seen: Seen): Promise<void> {
  const done = kit.find(seen, FACEBOOK_WORDS.settingsDone)
  await (done ? kit.tap(done, 900) : kit.back(900))
}

export async function setFacebookDiscovery(ctx: WalkContext, kit: WalkKit, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const parsed = discoveryInput.safeParse(input)
  if (!parsed.success) throw new WalkError("The distance and ages to set were not given.")
  const want = parsed.data
  const readDistance = (screen: ScreenRead) => readSlider(screen, FACEBOOK_WORDS.distanceHeading, FACEBOOK_WORDS.distanceSlider, "distance")
  const readAges = (screen: ScreenRead) => readSlider(screen, FACEBOOK_WORDS.ageHeading, FACEBOOK_WORDS.ageSlider, "age")

  let seen = await toDatingSettings(ctx, kit)
  seen = await scrollTo(kit, seen, readDistance, "the distance")
  const unit = readDistance(seen.screen)?.unit === "mi" ? "mi" : "km"
  const distance = unit === "mi" ? Math.max(1, Math.round(want.distanceKm / KM_PER_MILE)) : want.distanceKm
  seen = await setThumb(kit, seen, readDistance, 0, distance, FACEBOOK_SLIDERS[unit], "The distance")
  const distanceRead = readDistance(seen.screen)?.values[0] ?? distance

  seen = await scrollTo(kit, seen, readAges, "the age range")
  const ages = readAges(seen.screen)?.values ?? [0, 0]
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
  for (const [thumb, target, what] of order) seen = await setThumb(kit, seen, readAges, thumb, target, FACEBOOK_SLIDERS.age, what)
  const agesRead = readAges(seen.screen)?.values ?? [want.ageMin, want.ageMax]
  await leaveSettings(kit, seen)
  return { distance: `${distanceRead} ${unit}`, distanceKm: want.distanceKm, ageMin: agesRead[0], ageMax: agesRead[1] }
}

/** The break's switch: the switch on the same row as "Take a break". */
function breakSwitch(screen: ScreenRead): ScreenNode | null {
  const label = findNode(screen, FACEBOOK_WORDS.takeBreak)
  if (!label) return null
  const middle = (label.bounds[1] + label.bounds[3]) / 2
  return (
    screen.nodes.find((node) => isVisible(node, screen) && /switch|toggle|checkbox/i.test(node.cls) && node.bounds[1] <= middle && node.bounds[3] >= middle) ?? null
  )
}

/**
 * Turns Facebook Dating's break on or off (Tyler, 22 Oct 2026: "Yes, both
 * ways"), then reads the switch back. A switch that reads wrong after the tap
 * fails the walk with words, so the Phone panel says the profile may still be
 * hidden or showing.
 */
export async function setFacebookBreak(ctx: WalkContext, kit: WalkKit, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (typeof input.on !== "boolean") throw new WalkError("Whether to turn the break on or off was not given.")
  let seen = await toDatingSettings(ctx, kit)
  for (let scrolls = 0; scrolls < 4 && !breakSwitch(seen.screen); scrolls += 1) seen = await kit.scroll(seen, "up", 600)
  let toggle = breakSwitch(seen.screen)
  if (!toggle) throw new WalkError("Could not find Take a break in Facebook Dating's settings. The words for it may have changed.", seen.shot)
  if (toggle.checked !== input.on) {
    seen = await kit.tap(toggle, 1_200)
    // Facebook may ask before a break starts or ends; its yes is the only thing pressed.
    const confirm = kit.find(seen, { text: [/^(take a break|turn (on|off)|pause|resume|confirm|ok|yes)$/i] })
    if (confirm && !breakSwitch(seen.screen)) seen = await kit.tap(confirm, 1_200)
    toggle = breakSwitch(seen.screen)
  }
  if (!toggle || toggle.checked !== input.on) {
    throw new WalkError(`Facebook Dating's break still reads ${toggle?.checked ? "on" : "off"} after the tap, so your profile may still be ${input.on ? "showing" : "hidden"}.`, seen.shot)
  }
  await leaveSettings(kit, seen)
  return { breakOn: toggle.checked }
}
