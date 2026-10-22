import { eq } from "drizzle-orm"

import { swipedWord, type CardSource } from "@/lib/dating/options"
import { averageHash, cropScreenshot, keepPicture, looksSame, pictureBytes } from "@/server/phone/pictures"
import { sha256Hex } from "@/server/phone/signing"
import { findNode, isVisible, nodeWords, type ScreenNode, type ScreenRead } from "@/server/tinder/screen"
import { NAME_AGE_LINE } from "@/server/tinder/screen-words"
import { dateProfiles } from "@/server/tinder/schema"
import { recordMatchFromCard, recordSwipe, saveCard } from "@/server/tinder/store"
import { WalkError, type Seen, type WalkContext, type WalkKit } from "@/server/tinder/walks/kit"
import { parseProfileLines } from "@/server/tinder/walks/parse"

import {
  FACEBOOK_CHROME_LINES,
  FACEBOOK_DISTANCE_LINE,
  FACEBOOK_SECTION_HEADINGS,
  FACEBOOK_WORDS,
  MUTUAL_COUNT_LINE,
  MUTUAL_NAMES_LINE,
  onSuggested,
  onWeeklyMatch,
  outOfSuggestions,
  SHARED_GROUP_LINE,
  THEIR_COMMENT_LINE,
  WEEKLY_MATCH_CLOSE,
} from "../screen-words"

/**
 * Facebook Dating's cards (task "facebook/01-facebook-dating"): a suggested
 * profile, a person on the Likes you list (part 9), the weekly surprise match
 * (part 21) and Second Look (part 14), and liking, with a comment when the AI
 * wrote one (part 10), or passing.
 *
 * A Facebook Dating profile is one long page: photos, answers and details
 * one under another, with Like and Pass floating at the bottom. It is read by
 * scrolling to its end, keeping every photo once, then scrolling back to its
 * top, where its name is, so a swipe can check it is still the same person.
 */

/** A profile rarely runs past ten screenfuls. */
const MAX_SCROLLS = 10

/** Facebook Dating shows up to nine photos, and a few Instagram pictures. */
const MAX_PHOTOS = 9
const MAX_INSTAGRAM = 6

/** The top of a profile: the name and age line, the distance, and the like and pass buttons floating under it. */
type Face = { name: string; age: number | null; distance: string; verified: boolean; like: ScreenNode; pass: ScreenNode }

const chrome = (line: string) => FACEBOOK_CHROME_LINES.some((pattern) => pattern.test(line))

/** The person's own lines on a screen of their profile: no buttons, tabs or Facebook's words. */
function profileLines(screen: ScreenRead, buttonsTop: number): string[] {
  const top = Math.round(screen.screenHeight * 0.06)
  return screen.nodes
    .filter((node) => isVisible(node, screen) && node.text.trim() && node.bounds[1] >= top && node.bounds[3] <= buttonsTop && !node.click)
    .map((node) => node.text.trim())
    .filter((line) => !chrome(line))
}

/** The profile's top, or null when no name line or no Like and Pass are on screen. */
function readFacebookFace(screen: ScreenRead): Face | null {
  const like = findNode(screen, FACEBOOK_WORDS.like)
  const pass = findNode(screen, FACEBOOK_WORDS.pass)
  if (!like || !pass) return null
  const lines = profileLines(screen, Math.min(like.bounds[1], pass.bounds[1]))
  const nameLine = lines.find((line) => NAME_AGE_LINE.test(line) && !MUTUAL_COUNT_LINE.test(line))
  if (!nameLine) return null
  const found = NAME_AGE_LINE.exec(nameLine) as RegExpExecArray
  return {
    name: found[1].trim(),
    age: Number(found[2]),
    distance: lines.find((line) => FACEBOOK_DISTANCE_LINE.test(line)) ?? "",
    verified: screen.nodes.some((node) => isVisible(node, screen) && /^(photo )?verified$/i.test(node.desc.trim())),
    like,
    pass,
  }
}

/** A photo on the profile: a picture box most of the screen wide. Instagram's are smaller and say so. */
function pictureBoxes(screen: ScreenRead): { photos: ScreenNode[]; instagram: ScreenNode[] } {
  const visible = screen.nodes.filter((node) => isVisible(node, screen) && /image/i.test(node.cls))
  return {
    photos: visible.filter((node) => !/instagram/i.test(node.desc) && node.bounds[2] - node.bounds[0] >= screen.screenWidth * 0.8 && node.bounds[3] - node.bounds[1] >= screen.screenHeight * 0.25),
    instagram: visible.filter((node) => /instagram/i.test(node.desc) && node.bounds[2] - node.bounds[0] >= screen.screenWidth * 0.2),
  }
}

function needShot(seen: Seen): Buffer {
  if (!seen.shot) throw new WalkError("The phone did not send a picture of the screen, so the photos could not be kept.")
  return seen.shot
}

/** Keeps each picture once: one that looks like a kept one is the same picture seen again after a scroll. */
async function keepNew(kept: Buffer[], seen: Seen, boxes: ScreenNode[], cap: number): Promise<number> {
  let added = 0
  for (const box of boxes) {
    if (kept.length >= cap) break
    const crop = await cropScreenshot(needShot(seen), box.bounds, seen.screen.screenWidth)
    let known = false
    for (const old of kept) {
      if (await looksSame(crop, old)) {
        known = true
        break
      }
    }
    if (known) continue
    kept.push(crop)
    added += 1
  }
  return added
}

/**
 * Mutual friends and shared groups (part 11), only from Facebook's own lines:
 * "3 mutual friends", "Mutual friends: Sam, Alex and Jo" and "You're both in
 * Toronto Climbers". Lines under a heading are never taken for names, because
 * a person's own words there would count toward the 3 that mean pass.
 */
function mutualsOf(lines: string[]): { mutualFriends: number | null; mutualNames: string[]; sharedGroups: string[] } {
  let mutualFriends: number | null = null
  const mutualNames: string[] = []
  const sharedGroups: string[] = []
  for (const line of lines) {
    const count = MUTUAL_COUNT_LINE.exec(line)
    if (count) mutualFriends = Number(count[1])
    const named = MUTUAL_NAMES_LINE.exec(line)
    if (named) mutualNames.push(...named[1].split(/,\s*|\s+and\s+/).map((name) => name.trim()).filter(Boolean))
    const group = SHARED_GROUP_LINE.exec(line)
    if (group) sharedGroups.push(group[1].trim())
  }
  const names = Array.from(new Set(mutualNames)).slice(0, 20)
  return { mutualFriends: mutualFriends ?? (names.length ? names.length : null), mutualNames: names, sharedGroups: Array.from(new Set(sharedGroups)).slice(0, 10) }
}

/** Scrolls the profile in front back to its top, where its name line is. */
async function toTop(kit: WalkKit, seen: Seen): Promise<Seen> {
  let current = seen
  for (let scrolls = 0; scrolls <= MAX_SCROLLS && !readFacebookFace(current.screen); scrolls += 1) current = await kit.scroll(current, "down", 500)
  if (!readFacebookFace(current.screen)) throw new WalkError("Could not get back to the top of the profile in front.", current.shot)
  return current
}

/**
 * Reads the profile on screen to its end and saves it as a card, then
 * leaves the phone at its top. A weekly match's or a Likes you person's
 * extras come in `extra`.
 */
async function readProfileHere(
  ctx: WalkContext,
  kit: WalkKit,
  start: Seen,
  extra: { source: CardSource; theirComment?: string; theirCommentOn?: string }
): Promise<{ profileId: string; name: string; age: number | null; photos: number; instagram: number }> {
  const face = readFacebookFace(start.screen)
  if (!face) throw new WalkError("No profile was in front on Facebook Dating.", start.shot)
  const buttonsTop = Math.min(face.like.bounds[1], face.pass.bounds[1])
  const lines: string[] = []
  const seenLines = new Set<string>()
  const photos: Buffer[] = []
  const instagram: Buffer[] = []
  const collect = async (seen: Seen) => {
    let added = 0
    for (const line of profileLines(seen.screen, buttonsTop)) {
      if (seenLines.has(line)) continue
      seenLines.add(line)
      lines.push(line)
      added += 1
    }
    const boxes = pictureBoxes(seen.screen)
    added += await keepNew(photos, seen, boxes.photos, MAX_PHOTOS)
    added += await keepNew(instagram, seen, boxes.instagram, MAX_INSTAGRAM)
    return added
  }
  let seen = start
  await collect(seen)
  for (let scrolls = 0; scrolls < MAX_SCROLLS; scrolls += 1) {
    seen = await kit.scroll(seen, "up", 600)
    if (!(await collect(seen))) break
  }
  const top = readFacebookFace((await toTop(kit, seen)).screen)
  if (top && top.name.toLowerCase() !== face.name.toLowerCase()) {
    throw new WalkError(`The profile changed to ${top.name} while ${face.name} was being read. Nothing was saved or swiped.`, kit.lastSeen?.shot)
  }

  const nameLine = lines.find((line) => NAME_AGE_LINE.test(line)) ?? ""
  const rest = lines.filter((line) => line !== nameLine && line !== face.distance)
  const parsed = parseProfileLines([], rest, { headings: FACEBOOK_SECTION_HEADINGS, chrome: FACEBOOK_CHROME_LINES, distance: FACEBOOK_DISTANCE_LINE })
  const photoIds: string[] = []
  for (const photo of photos) photoIds.push(await keepPicture(ctx.phone.userId, photo, "photo", ctx.db, ctx.now()))
  const instagramPhotoIds: string[] = []
  for (const picture of instagram) instagramPhotoIds.push(await keepPicture(ctx.phone.userId, picture, "photo", ctx.db, ctx.now()))
  const first = photos[0] ?? null
  const profileId = await saveCard(
    { userId: ctx.phone.userId, workspaceId: ctx.phone.workspaceId, phoneId: ctx.phone.id, accountId: ctx.phone.accountId },
    {
      name: face.name,
      age: face.age,
      distance: face.distance,
      verified: face.verified,
      ...parsed,
      texts: Array.from(new Set([face.distance, ...rest].filter(Boolean))),
      photoIds,
      firstPhotoSha: first ? sha256Hex(first) : "",
      faceHash: first ? await averageHash(first) : "",
      ...mutualsOf(rest),
      instagramPhotoIds,
      source: extra.source,
      theirComment: extra.theirComment ?? "",
      theirCommentOn: extra.theirCommentOn ?? "",
    },
    ctx.db,
    ctx.now()
  )
  return { profileId, name: face.name, age: face.age, photos: photos.length, instagram: instagram.length }
}

/**
 * Facebook opened on Dating, with the weekly surprise match taken first when
 * Facebook shows it (part 21): the match is read as a card from its screen,
 * kept as a match so the AI writes its opener, and its screen shut by its
 * way out. Nothing on it is ever sent from the phone.
 */
export async function openDating(ctx: WalkContext, kit: WalkKit): Promise<Seen> {
  const seen = await kit.openApp()
  return onWeeklyMatch(seen.screen) ? takeWeeklyMatch(ctx, kit, seen) : seen
}

async function takeWeeklyMatch(ctx: WalkContext, kit: WalkKit, seen: Seen): Promise<Seen> {
  const close = kit.find(seen, WEEKLY_MATCH_CLOSE) ?? kit.find(seen, FACEBOOK_WORDS.keepBrowsing)
  const lines = profileLines(seen.screen, close ? close.bounds[1] : Math.round(seen.screen.screenHeight * 0.88)).filter((line) => !FACEBOOK_WORDS.weeklyMatch.text.some((pattern) => pattern.test(line)))
  const nameLine = lines.find((line) => NAME_AGE_LINE.test(line))
  if (nameLine) {
    const found = NAME_AGE_LINE.exec(nameLine) as RegExpExecArray
    const photos: Buffer[] = []
    await keepNew(photos, seen, pictureBoxes(seen.screen).photos, 1)
    const rest = lines.filter((line) => line !== nameLine)
    const distance = rest.find((line) => FACEBOOK_DISTANCE_LINE.test(line)) ?? ""
    const parsed = parseProfileLines([], rest, { headings: FACEBOOK_SECTION_HEADINGS, chrome: FACEBOOK_CHROME_LINES, distance: FACEBOOK_DISTANCE_LINE })
    const first = photos[0] ?? null
    const profileId = await saveCard(
      { userId: ctx.phone.userId, workspaceId: ctx.phone.workspaceId, phoneId: ctx.phone.id, accountId: ctx.phone.accountId },
      {
        name: found[1].trim(),
        age: Number(found[2]),
        distance,
        verified: false,
        ...parsed,
        texts: rest,
        photoIds: first ? [await keepPicture(ctx.phone.userId, first, "photo", ctx.db, ctx.now())] : [],
        firstPhotoSha: first ? sha256Hex(first) : "",
        faceHash: first ? await averageHash(first) : "",
        ...mutualsOf(rest),
        source: "weekly",
      },
      ctx.db,
      ctx.now()
    )
    await recordMatchFromCard(profileId, ctx.db, ctx.now())
  }
  const after = close ? await kit.tap(close, 1_000) : await kit.back(1_000)
  if (onWeeklyMatch(after.screen)) throw new WalkError("Facebook's weekly match would not shut. Nothing was sent.", after.shot)
  return after
}

/** Dating's Suggested profiles, from wherever Dating opened. */
async function toSuggested(ctx: WalkContext, kit: WalkKit): Promise<Seen | { nobody: string }> {
  const opened = await openDating(ctx, kit)
  const nobody = outOfSuggestions(opened.screen)
  if (nobody) return { nobody }
  const seen = await kit.goToTab(opened, FACEBOOK_WORDS.tabSuggested, (screen) => onSuggested(screen) || outOfSuggestions(screen) !== null, "Suggested")
  const after = outOfSuggestions(seen.screen)
  return after ? { nobody: after } : seen
}

/** A row on the Likes you list or Second Look: the person's "Name, 27" line, and what they wrote with their like. */
type PersonRow = { name: string; age: number | null; node: ScreenNode; comment: string; commentOn: string }

function personRows(screen: ScreenRead): PersonRow[] {
  const rows: PersonRow[] = []
  const visible = screen.nodes.filter((node) => isVisible(node, screen) && node.bounds[1] > screen.screenHeight * 0.12)
  for (let index = 0; index < visible.length; index += 1) {
    const node = visible[index]
    const found = NAME_AGE_LINE.exec(nodeWords(node))
    if (!found || chrome(nodeWords(node))) continue
    const next = visible[index + 1] ? nodeWords(visible[index + 1]) : ""
    const comment = THEIR_COMMENT_LINE.exec(next)
    rows.push({ name: found[1].trim(), age: Number(found[2]), node, comment: comment ? comment[2].trim() : "", commentOn: comment ? comment[1].toLowerCase() : "" })
  }
  return rows
}

/** A list of people (Likes you or Second Look) rather than one profile: no Like and Pass under it. */
function onPeopleList(screen: ScreenRead): boolean {
  return !onSuggested(screen) && (Boolean(findNode(screen, FACEBOOK_WORDS.likesYouEmpty)) || personRows(screen).length > 0)
}

/** Opens the Likes you list (part 9). Null when nobody is on it. */
async function toLikesYou(ctx: WalkContext, kit: WalkKit): Promise<Seen | null> {
  const opened = await openDating(ctx, kit)
  const seen = await kit.goToTab(opened, FACEBOOK_WORDS.tabLikes, onPeopleList, "Likes")
  return kit.has(seen, FACEBOOK_WORDS.likesYouEmpty) ? null : seen
}

/** Opens Second Look's list of people passed (part 14). */
async function toSecondLook(ctx: WalkContext, kit: WalkKit): Promise<Seen> {
  const suggested = await toSuggested(ctx, kit)
  const seen = "nobody" in suggested ? kit.lastSeen : suggested
  if (!seen) throw new WalkError("Facebook Dating did not show its Suggested tab, so Second Look could not be opened.")
  const list = await kit.tap(kit.need(seen, FACEBOOK_WORDS.secondLook, "Second Look"), 1_200)
  if (!onPeopleList(list.screen)) throw new WalkError("Second Look did not open its list of people.", list.shot)
  return list
}

/** Opens one person from a list by their name and age, and checks their profile's top says the same. */
async function openPerson(kit: WalkKit, list: Seen, name: string, age: number | null, where: string): Promise<Seen> {
  let seen = list
  for (let scrolls = 0; scrolls <= 4; scrolls += 1) {
    const row = personRows(seen.screen).find((item) => item.name.toLowerCase() === name.toLowerCase() && (age === null || item.age === age))
    if (row) {
      const opened = await kit.tap(row.node, 1_200)
      const face = readFacebookFace(opened.screen)
      if (!face || face.name.toLowerCase() !== name.toLowerCase()) throw new WalkError(`Opened someone from ${where}, but it is not ${name}. Nothing was done.`, opened.shot)
      return opened
    }
    if (scrolls < 4) seen = await kit.scroll(seen, "up", 600)
  }
  throw new WalkError(`${name} is not on ${where} any more.`, seen.shot)
}

/**
 * Reads the profile in front on Suggested, or with `likesYou` the first
 * person on the Likes you list with what they wrote with their like. Saves it
 * and leaves the phone at its top. Nobody to show is not an error.
 */
export async function readFacebookCard(ctx: WalkContext, kit: WalkKit, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (input.likesYou === true) {
    const list = await toLikesYou(ctx, kit)
    if (!list) return { empty: true, likesYou: true, words: "Nobody is on Likes you." }
    const row = personRows(list.screen)[0]
    if (!row) return { empty: true, likesYou: true, words: "Nobody is on Likes you." }
    const opened = await openPerson(kit, list, row.name, row.age, "Likes you")
    const read = await readProfileHere(ctx, kit, opened, { source: "likes_you", theirComment: row.comment, theirCommentOn: row.commentOn })
    return { ...read, likesYou: true, theirComment: row.comment }
  }
  const arrived = await toSuggested(ctx, kit)
  if ("nobody" in arrived) return { empty: true, outOfSuggestions: true, words: arrived.nobody }
  return readProfileHere(ctx, kit, arrived, { source: "card" })
}

/** Checks the profile on screen is still the one that was read: name, age and one of its photos. */
async function checkSamePerson(ctx: WalkContext, seen: Seen, profile: typeof dateProfiles.$inferSelect): Promise<Face> {
  const face = readFacebookFace(seen.screen)
  if (!face) throw new WalkError(`No profile was in front, so ${profile.name} was not swiped.`, seen.shot)
  if (face.name.toLowerCase() !== profile.name.toLowerCase() || (profile.age !== null && face.age !== profile.age)) {
    throw new WalkError(`The profile in front is ${face.name}${face.age ? ` ${face.age}` : ""} now, not ${profile.name}. Nothing was swiped.`, seen.shot)
  }
  const box = pictureBoxes(seen.screen).photos[0]
  if (profile.photoIds.length && box && seen.shot) {
    const now = await cropScreenshot(seen.shot, box.bounds, seen.screen.screenWidth)
    for (const id of profile.photoIds) {
      const kept = await pictureBytes(ctx.phone.userId, id, ctx.db)
      if (kept && (await looksSame(now, kept))) return face
    }
    throw new WalkError(`The profile in front is called ${profile.name}, but its photos are not the ones that were read. Nothing was swiped.`, seen.shot)
  }
  return face
}

/**
 * Whether Facebook moved on after a like or pass: someone else in front,
 * nobody left to suggest, or back on Likes you or Second Look without them.
 * A screen that only hides them, such as a photo opened full size or a box
 * asking to confirm, is not proof, and the swipe is not recorded.
 */
function movedOn(after: Seen, face: Face): boolean {
  const same = (name: string, age: number | null) => name.toLowerCase() === face.name.toLowerCase() && age === face.age
  const next = readFacebookFace(after.screen)
  if (next) return !same(next.name, next.age)
  if (outOfSuggestions(after.screen)) return true
  const list = onPeopleList(after.screen) || Boolean(findNode(after.screen, FACEBOOK_WORDS.secondLook))
  return list && !personRows(after.screen).some((row) => same(row.name, row.age))
}

/**
 * The heart the comment goes with: beside the answer it is about when it is
 * about an answer, else the main Like. The answer is found by its words,
 * scrolling down the profile.
 */
async function likeTarget(kit: WalkKit, seen: Seen, face: Face, about: string): Promise<{ node: ScreenNode; seen: Seen }> {
  const words = about.trim().toLowerCase()
  if (!words || words === "photo") return { node: face.like, seen }
  let current = seen
  for (let scrolls = 0; scrolls < MAX_SCROLLS; scrolls += 1) {
    const answer = current.screen.nodes.find((node) => isVisible(node, current.screen) && node.text.trim().toLowerCase() === words)
    if (answer) {
      // The heart nearest the answer, above or below it.
      const middle = (answer.bounds[1] + answer.bounds[3]) / 2
      const hearts = current.screen.nodes.filter((node) => isVisible(node, current.screen) && FACEBOOK_WORDS.likeItem.desc.some((pattern) => pattern.test(node.desc)))
      const heart = hearts.sort((a, b) => Math.abs((a.bounds[1] + a.bounds[3]) / 2 - middle) - Math.abs((b.bounds[1] + b.bounds[3]) / 2 - middle))[0]
      if (heart) return { node: heart, seen: current }
      break
    }
    current = await kit.scroll(current, "up", 500)
  }
  // The answer could not be found again: the comment goes with the main Like, from the top.
  const top = await toTop(kit, current)
  return { node: readFacebookFace(top.screen)?.like ?? face.like, seen: top }
}

/** Taps Like and sends it, with the comment typed into Facebook's box when there is one. */
async function sendLike(kit: WalkKit, target: ScreenNode, comment: string, name: string): Promise<{ after: Seen; commented: boolean }> {
  // Facebook may take the like on this tap, with no box for a comment, so it can't be taken back either.
  let sheet = await kit.commit(target, 1_000)
  const send = kit.find(sheet, FACEBOOK_WORDS.sendLike)
  if (!send) return { after: sheet, commented: false }
  let commented = false
  if (comment) {
    const box = kit.need(sheet, FACEBOOK_WORDS.likeComment, "the box for a comment with the like")
    sheet = await kit.type(box, comment)
    if (!sheet.screen.nodes.some((node) => node.edit && node.text.trim() === comment.trim())) {
      throw new WalkError(`The comment did not go into Facebook's box, so ${name} was not liked.`, sheet.shot)
    }
    commented = true
  }
  const after = await kit.commit(kit.need(sheet, FACEBOOK_WORDS.sendLike, "Send like"), 1_200)
  return { after, commented }
}

/**
 * Likes or passes the profile in front, once it is checked to still be the
 * one that was read. A Likes you person is opened from that list first, and
 * a Second Look like (`secondLook`) from Second Look's list; a Second Look
 * like turns the AI's pass into the member's like. A like on a card the AI
 * wrote a comment for carries it. "It's a match" becomes a match at once.
 */
export async function facebookSwipe(
  ctx: WalkContext,
  kit: WalkKit,
  decision: "like" | "pass",
  input: Record<string, unknown>,
  askedBy: "member" | "ai"
): Promise<Record<string, unknown>> {
  const profileId = typeof input.profileId === "string" ? input.profileId : ""
  const secondLook = input.secondLook === true && decision === "like"
  const [profile] = await ctx.db.select().from(dateProfiles).where(eq(dateProfiles.id, profileId)).limit(1)
  if (!profile || profile.accountId !== ctx.phone.accountId) throw new WalkError("That card is gone.")
  if (secondLook ? profile.swipe !== "pass" : profile.swipe !== "none") {
    throw new WalkError(`${profile.name} was already ${profile.swipe === "none" ? "left alone" : swipedWord(profile.swipe)}. Nothing was swiped again.`)
  }

  let seen: Seen
  if (secondLook) {
    seen = await openPerson(kit, await toSecondLook(ctx, kit), profile.name, profile.age, "Second Look")
  } else if (profile.source === "likes_you") {
    const list = await toLikesYou(ctx, kit)
    if (!list) throw new WalkError(`${profile.name} is not on Likes you any more, so nothing was swiped.`)
    seen = await openPerson(kit, list, profile.name, profile.age, "Likes you")
  } else {
    const arrived = await toSuggested(ctx, kit)
    if ("nobody" in arrived) throw new WalkError(`Facebook Dating has nobody in front, so ${profile.name} was not swiped.`)
    seen = await toTop(kit, arrived)
  }
  const face = await checkSamePerson(ctx, seen, profile)

  let after: Seen
  let commented = false
  if (decision === "pass") {
    after = await kit.commit(face.pass, 1_200)
  } else {
    const comment = profile.likeComment.trim()
    const target = comment ? await likeTarget(kit, seen, face, profile.likeCommentOn) : { node: face.like, seen }
    const sent = await sendLike(kit, target.node, comment, profile.name)
    after = sent.after
    commented = sent.commented
  }

  let matchId: string | null = null
  if (decision === "like" && kit.has(after, FACEBOOK_WORDS.matchScreen)) {
    matchId = await recordMatchFromCard(profile.id, ctx.db, ctx.now())
    const out = kit.find(after, FACEBOOK_WORDS.keepBrowsing)
    after = out ? await kit.tap(out, 900) : await kit.back(900)
  }
  if (!matchId && !movedOn(after, face)) {
    throw new WalkError(`Facebook did not move on from ${profile.name} after the tap, so the ${decision} may not have gone through. It was not recorded.`, after.shot)
  }
  const now = ctx.now()
  if (secondLook) {
    await ctx.db.update(dateProfiles).set({ swipe: "like", swipedBy: "member", swipedAt: now, secondLookAt: now, updatedAt: now }).where(eq(dateProfiles.id, profile.id))
  } else {
    await recordSwipe(profile.id, decision, askedBy, ctx.db, now)
  }
  if (decision === "like" && !commented && profile.likeComment) {
    // Facebook took the like without asking for a comment: what was written never went.
    await ctx.db.update(dateProfiles).set({ likeComment: "", updatedAt: now }).where(eq(dateProfiles.id, profile.id))
  }
  return { profileId: profile.id, swipe: decision, matched: matchId !== null, matchId, commented, secondLook }
}
