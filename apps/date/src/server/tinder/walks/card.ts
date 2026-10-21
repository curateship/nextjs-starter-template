import { eq } from "drizzle-orm"

import { swipedWord } from "@/lib/dating/options"
import { cropScreenshot, keepPicture, looksSame, pictureBytes } from "@/server/phone/pictures"
import { sha256Hex } from "@/server/phone/signing"

import { allWords, findNode, screenTexts } from "../screen"
import { NOBODY_NEW, TINDER_CHROME_LINES, TINDER_WORDS } from "../screen-words"
import { dateProfiles } from "../schema"
import { recordMatchFromCard, recordSwipe, saveCard } from "../store"
import { onDiscover, WalkError, type Seen, type WalkContext, type WalkKit } from "./kit"
import { parseProfileLines, readCardFace, type CardFace } from "./parse"

/** Tinder shows nine photos at most. */
const MAX_PHOTOS = 9

/** A full profile rarely runs past six screenfuls. */
const MAX_PROFILE_SCROLLS = 6

async function toDiscover(kit: WalkKit): Promise<Seen | { nobody: string }> {
  const opened = await kit.openTinder()
  const nobody = NOBODY_NEW.find((pattern) => pattern.test(allWords(opened.screen)))
  if (nobody) return { nobody: allWords(opened.screen).slice(0, 300) }
  const seen = await kit.goToTab(opened, TINDER_WORDS.tabDiscover, onDiscover, "Discover")
  const after = NOBODY_NEW.find((pattern) => pattern.test(allWords(seen.screen)))
  if (after) return { nobody: allWords(seen.screen).slice(0, 300) }
  return seen
}

function needShot(seen: Seen): Buffer {
  if (!seen.shot) throw new WalkError("The phone did not send a picture of the screen, so the photos could not be kept.")
  return seen.shot
}

/**
 * Reads the card in front: its name, age, distance and badge, every photo by
 * tapping through them until the first comes back or nothing moves, and the
 * full profile by opening it and scrolling to the bottom. Saves the card and
 * leaves the phone on the same card, ready to swipe.
 */
export async function readCard(ctx: WalkContext, kit: WalkKit): Promise<Record<string, unknown>> {
  const arrived = await toDiscover(kit)
  if ("nobody" in arrived) return { empty: true, words: arrived.nobody }
  let seen = arrived
  const face = readCardFace(seen.screen)
  if (!face) throw new WalkError("No card was in front on Tinder's Discover screen.", seen.shot)

  // The photos, by tapping the right of the picture.
  const photos: Buffer[] = [await cropScreenshot(needShot(seen), face.photoBox, seen.screen.screenWidth)]
  const [left, top, right, bottom] = face.photoBox
  for (let index = 1; index < MAX_PHOTOS; index += 1) {
    seen = await kit.tapAt(left + (right - left) * 0.85, top + (bottom - top) * 0.4, 500)
    if (!onDiscover(seen.screen)) break
    const photo = await cropScreenshot(needShot(seen), face.photoBox, seen.screen.screenWidth)
    if ((await looksSame(photo, photos[photos.length - 1])) || (await looksSame(photo, photos[0]))) break
    photos.push(photo)
  }
  if (!onDiscover(seen.screen)) seen = await backToCard(kit, seen)

  // The full profile.
  const profileLines = await readFullProfile(kit, seen, face)
  const card = readCardFace(kit.lastSeen?.screen ?? seen.screen)
  if (card && card.name.toLowerCase() !== face.name.toLowerCase()) {
    throw new WalkError(`The card changed to ${card.name} while ${face.name} was being read. Nothing was saved or swiped.`, kit.lastSeen?.shot)
  }

  const parsed = parseProfileLines(face.lines, profileLines)
  const photoIds: string[] = []
  for (const photo of photos) photoIds.push(await keepPicture(ctx.phone.userId, photo, "photo", ctx.db, ctx.now()))
  const texts = Array.from(new Set([face.distance, ...face.lines, ...profileLines].filter(Boolean)))

  const profileId = await saveCard(
    { userId: ctx.phone.userId, workspaceId: ctx.phone.workspaceId, phoneId: ctx.phone.id, accountId: ctx.phone.accountId },
    {
      name: face.name,
      age: face.age,
      distance: face.distance,
      verified: face.verified,
      ...parsed,
      texts,
      photoIds,
      firstPhotoSha: sha256Hex(photos[0]),
    },
    ctx.db,
    ctx.now()
  )
  return { profileId, name: face.name, age: face.age, photos: photos.length, profileOpened: profileLines.length > 0 }
}

/**
 * Opens the card's full profile, scrolls it to the bottom collecting every
 * line once, and shuts it again. A card whose profile will not open is kept
 * with what its face says.
 */
async function readFullProfile(kit: WalkKit, seen: Seen, face: CardFace): Promise<string[]> {
  const button = kit.find(seen, TINDER_WORDS.openProfile) ?? findNode(seen.screen, { text: [face.name] })
  if (!button) return []
  let current = await kit.tap(button, 900)
  if (onDiscover(current.screen) && !kit.has(current, TINDER_WORDS.closeProfile)) return []

  const lines: string[] = []
  const seenLines = new Set<string>()
  const collect = (screen: Seen["screen"]) => {
    let added = 0
    for (const line of screenTexts(screen)) {
      if (seenLines.has(line) || TINDER_CHROME_LINES.some((pattern) => pattern.test(line))) continue
      seenLines.add(line)
      lines.push(line)
      added += 1
    }
    return added
  }
  collect(current.screen)
  for (let scrolls = 0; scrolls < MAX_PROFILE_SCROLLS; scrolls += 1) {
    current = await kit.scroll(current, "up", 600)
    if (!collect(current.screen)) break
  }
  await backToCard(kit, current)
  return lines
}

/** Shuts a full profile or anything else over the card. Never presses back on the card itself, which would leave Tinder. */
async function backToCard(kit: WalkKit, seen: Seen): Promise<Seen> {
  let current = seen
  for (let tries = 0; tries < 2 && !onDiscover(current.screen); tries += 1) {
    const close = kit.find(current, TINDER_WORDS.closeProfile)
    current = close ? await kit.tap(close, 800) : await kit.back(800)
  }
  if (!onDiscover(current.screen)) {
    throw new WalkError("Could not get back to the card after reading its profile.", current.shot)
  }
  return current
}

/**
 * Likes, Super Likes or passes the card in front, once the card is checked to
 * still be the one that was read: same name, same age, and one of its photos
 * on screen. Anything else and nothing is swiped. A like that comes back
 * "It's a Match!" becomes a match at once.
 *
 * A Super Like with none left today brings up Tinder's offer to sell more.
 * Nothing is bought: the offer is shut and the card is liked instead, and
 * recorded as a like. A card with no Super Like button is liked too.
 */
export async function swipe(
  ctx: WalkContext,
  kit: WalkKit,
  decision: "like" | "super" | "pass",
  input: Record<string, unknown>,
  askedBy: "member" | "ai"
): Promise<Record<string, unknown>> {
  const profileId = typeof input.profileId === "string" ? input.profileId : ""
  const [profile] = await ctx.db.select().from(dateProfiles).where(eq(dateProfiles.id, profileId)).limit(1)
  if (!profile || profile.accountId !== ctx.phone.accountId) throw new WalkError("That card is gone.")
  if (profile.swipe !== "none") throw new WalkError(`${profile.name} was already ${swipedWord(profile.swipe)}. Nothing was swiped again.`)

  const arrived = await toDiscover(kit)
  if ("nobody" in arrived) throw new WalkError(`Tinder has nobody in front, so ${profile.name} was not swiped.`)
  const seen = arrived
  const face = readCardFace(seen.screen)
  if (!face) throw new WalkError("No card was in front, so nothing was swiped.", seen.shot)
  if (face.name.toLowerCase() !== profile.name.toLowerCase() || (profile.age !== null && face.age !== profile.age)) {
    throw new WalkError(
      `The card in front is ${face.name}${face.age ? ` ${face.age}` : ""} now, not ${profile.name}. Nothing was swiped.`,
      seen.shot
    )
  }
  if (profile.photoIds.length && seen.shot) {
    const now = await cropScreenshot(seen.shot, face.photoBox, seen.screen.screenWidth)
    let same = false
    for (const id of profile.photoIds) {
      const kept = await pictureBytes(ctx.phone.userId, id, ctx.db)
      if (kept && (await looksSame(now, kept))) {
        same = true
        break
      }
    }
    if (!same) {
      throw new WalkError(`The card in front is called ${profile.name}, but its photos are not the ones that were read. Nothing was swiped.`, seen.shot)
    }
  }

  let done = decision
  let superLikesGone = false
  let after: Seen
  if (decision === "super") {
    const star = kit.find(seen, TINDER_WORDS.superLike)
    after = star ? await kit.tap(star, 1_200) : await kit.tap(face.like, 1_200)
    if (!star) done = "like"
    if (star && kit.has(after, TINDER_WORDS.superLikesGone)) {
      superLikesGone = true
      after = await shutSuperLikeOffer(kit, after, profile.name)
      const again = readCardFace(after.screen)
      if (!again || again.name.toLowerCase() !== face.name.toLowerCase() || again.age !== face.age) {
        throw new WalkError(`After Tinder's Super Like offer, the card in front is not ${profile.name}. Nothing was bought or swiped.`, after.shot)
      }
      done = "like"
      after = await kit.tap(again.like, 1_200)
    }
  } else {
    after = await kit.tap(decision === "like" ? face.like : face.pass, 1_200)
  }
  let matchId: string | null = null
  if (done !== "pass" && kit.has(after, TINDER_WORDS.matchScreen)) {
    matchId = await recordMatchFromCard(profile.id, ctx.db, ctx.now())
    const out = kit.find(after, TINDER_WORDS.keepSwiping)
    after = out ? await kit.tap(out, 900) : await kit.back(900)
  }
  after = await kit.dismissOffers(after)

  const next = readCardFace(after.screen)
  if (!matchId && next && next.name.toLowerCase() === face.name.toLowerCase() && next.age === face.age && after.shot) {
    const still = await cropScreenshot(after.shot, next.photoBox, after.screen.screenWidth)
    const before = seen.shot ? await cropScreenshot(seen.shot, face.photoBox, seen.screen.screenWidth) : null
    if (before && (await looksSame(still, before))) {
      throw new WalkError(`Tinder still shows ${profile.name} after the tap, so the ${done === "super" ? "Super Like" : done} may not have gone through. It was not recorded.`, after.shot)
    }
  }
  await recordSwipe(profile.id, done, askedBy, ctx.db, ctx.now())
  return { profileId: profile.id, swipe: done, matched: matchId !== null, matchId, superLikesGone }
}

/**
 * Shuts Tinder's "out of Super Likes" offer by its way out: "No thanks" and
 * the like, or back. Only words that mean no are ever tapped, so nothing on
 * the offer can be bought.
 */
async function shutSuperLikeOffer(kit: WalkKit, seen: Seen, name: string): Promise<Seen> {
  let current = seen
  for (let tries = 0; tries < 2 && !onDiscover(current.screen); tries += 1) {
    const no = kit.find(current, TINDER_WORDS.dismissOffer)
    current = no ? await kit.tap(no, 900) : await kit.back(900)
  }
  if (!onDiscover(current.screen)) {
    throw new WalkError(`Tinder's offer to buy Super Likes would not shut, so ${name} was not swiped. Nothing was bought.`, current.shot)
  }
  return current
}
