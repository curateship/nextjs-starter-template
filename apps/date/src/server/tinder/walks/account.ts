import { changeKey, sameWords } from "@/lib/dating/own-profile"
import { cropScreenshot, keepPicture, matchPictures, pictureBytes } from "@/server/phone/pictures"

import { center, findNode, isVisible, screenTexts, type NodeMatch, type ScreenNode, type ScreenRead } from "../screen"
import { NAME_AGE_LINE, TINDER_CHROME_LINES, TINDER_WORDS } from "../screen-words"
import type { OwnProfileChange } from "../schema"
import { keepReplaced, markApplied, photoTestMoved, readOwnRow, saveOwnProfile, type OwnProfileRecord, type PhotoTestStep } from "../store"

import { onDiscover } from "../app-screens"
import { WalkError, type Seen, type WalkContext, type WalkKit } from "./kit"
import { parseProfileLines, promptsOf, sectionText } from "./parse"

/** The Profile tab: its edit button with the bottom tabs under it. The edit screen itself has no tabs. */
export const onProfileTab = (screen: ScreenRead) =>
  Boolean(findNode(screen, TINDER_WORDS.editProfile) && findNode(screen, TINDER_WORDS.tabProfile))

export async function toProfileTab(kit: WalkKit): Promise<Seen> {
  return kit.goToTab(await kit.openApp(), TINDER_WORDS.tabProfile, onProfileTab, "Profile")
}

/** The "Name, 30" line on the Profile tab. */
function nameLine(screen: ScreenRead): RegExpExecArray | null {
  const line = screenTexts(screen, { top: 0, bottom: screen.screenHeight * 0.6 }).find((text) => NAME_AGE_LINE.test(text))
  return line ? NAME_AGE_LINE.exec(line) : null
}

/**
 * Opens Tinder and reads whose account is signed in from the Profile tab.
 * Signed out stops the phone, like every stop screen. Run on Resume too, to
 * see whether what stopped the phone has gone.
 */
export async function whoIsSignedIn(_ctx: WalkContext, kit: WalkKit): Promise<Record<string, unknown>> {
  const seen = await toProfileTab(kit)
  const found = nameLine(seen.screen)
  // Back to the cards, the screen every other walk starts from.
  const discover = kit.find(seen, TINDER_WORDS.tabDiscover)
  if (discover) {
    const back = await kit.tap(discover, 900)
    if (!onDiscover(back.screen)) await kit.dismissOffers(back)
  }
  return { name: found?.[1].trim() ?? "", age: found ? Number(found[2]) : null }
}

/** Photo tiles on the edit screen: picture boxes about a third of the screen wide, in rows. */
function photoTiles(screen: ScreenRead): ScreenNode[] {
  const { screenWidth: width, screenHeight: height } = screen
  const tiles = screen.nodes.filter((node) => {
    if (!isVisible(node, screen) || !/image/i.test(node.cls)) return false
    const [left, top, right, bottom] = node.bounds
    const tileWidth = right - left
    const tileHeight = bottom - top
    return tileWidth > width * 0.2 && tileWidth < width * 0.5 && tileHeight > tileWidth * 0.9 && top < height * 0.7
  })
  return tiles.sort((a, b) => a.bounds[1] - b.bounds[1] || a.bounds[0] - b.bounds[0]).slice(0, 9)
}

/** The edit screen, from the Profile tab's edit button, and the name the tab shows. */
async function openEditScreen(kit: WalkKit): Promise<{ seen: Seen; name: string }> {
  const tab = await toProfileTab(kit)
  const name = nameLine(tab.screen)?.[1].trim() ?? ""
  const seen = await kit.tap(kit.need(tab, TINDER_WORDS.editProfile, "Edit profile"), 1_200)
  if (!seen.shot) throw new WalkError("The phone did not send a picture of the screen, so the photos could not be seen.")
  return { seen, name }
}

/** Cuts every photo tile out of the screen's picture. */
async function cropTiles(seen: Seen, tiles: ScreenNode[]): Promise<Buffer[]> {
  const shot = seen.shot
  if (!shot) throw new WalkError("The phone did not send a picture of the screen, so the photos could not be seen.")
  return Promise.all(tiles.map((tile) => cropScreenshot(shot, tile.bounds, seen.screen.screenWidth)))
}

/** The pictures Date already keeps for these ids, in order. A picture that is gone fails the walk. */
async function knownPhotos(ctx: WalkContext, ids: string[]): Promise<Buffer[]> {
  const photos = await Promise.all(ids.map((id) => pictureBytes(ctx.phone.userId, id, ctx.db)))
  if (photos.some((photo) => !photo)) throw new WalkError("A photo Date kept of your profile is gone. Read your profile again first.")
  return photos as Buffer[]
}

/**
 * Keeps the photos read off the edit screen. A photo that looks like one
 * Date already keeps of this profile keeps that one's id, so a photo the
 * phone moved is still the same photo to the suggestions and the
 * first-photo test.
 */
async function keepOwnPhotos(ctx: WalkContext, crops: Buffer[], knownIds: string[]): Promise<string[]> {
  const known = await Promise.all(knownIds.map((id) => pictureBytes(ctx.phone.userId, id, ctx.db)))
  const usable = knownIds.flatMap((id, index) => (known[index] ? [{ id, jpeg: known[index] as Buffer }] : []))
  const matched = await matchPictures(
    crops,
    usable.map((photo) => photo.jpeg)
  )
  return Promise.all(crops.map((crop, index) => (matched[index] >= 0 ? usable[matched[index]].id : keepPicture(ctx.phone.userId, crop, "photo", ctx.db, ctx.now()))))
}

/**
 * Reads the member's own profile from Tinder's edit screen: the photos in
 * their order, and every section of words. Leaves by back, never Done or
 * Save, so nothing on the profile is changed.
 */
async function readEditScreen(ctx: WalkContext, kit: WalkKit, knownIds: string[]): Promise<OwnProfileRecord> {
  const opened = await openEditScreen(kit)
  let seen = opened.seen
  const photoIds = await keepOwnPhotos(ctx, await cropTiles(seen, photoTiles(seen.screen)), knownIds)

  const lines: string[] = []
  const known = new Set<string>()
  const collect = (screen: ScreenRead) => {
    let added = 0
    for (const line of screenTexts(screen)) {
      if (known.has(line) || TINDER_CHROME_LINES.some((pattern) => pattern.test(line))) continue
      known.add(line)
      lines.push(line)
      added += 1
    }
    return added
  }
  collect(seen.screen)
  for (let scrolls = 0; scrolls < 6; scrolls += 1) {
    seen = await kit.scroll(seen, "up", 600)
    if (!collect(seen.screen)) break
  }
  for (let tries = 0; tries < 2 && !onProfileTab(seen.screen); tries += 1) seen = await kit.back(800)

  const parsed = parseProfileLines([], lines)
  return { name: opened.name, photoIds, bio: parsed.bio, sections: parsed.sections, texts: lines }
}

function owner(ctx: WalkContext) {
  return { userId: ctx.phone.userId, workspaceId: ctx.phone.workspaceId, phoneId: ctx.phone.id, accountId: ctx.phone.accountId }
}

/** Reads the member's own profile. Nothing on the profile is changed; the AI reviews it again. */
export async function readOwnProfile(ctx: WalkContext, kit: WalkKit): Promise<Record<string, unknown>> {
  const own = await readOwnRow(ctx.phone.accountId, ctx.db)
  const read = await readEditScreen(ctx, kit, own?.photoIds ?? [])
  await saveOwnProfile(owner(ctx), read, ctx.db, ctx.now())
  return { photos: read.photoIds.length, lines: read.texts.length }
}

/** Saves the edit screen through its Done, and is back on the Profile tab. */
async function saveEdits(kit: WalkKit, seen: Seen): Promise<Seen> {
  let current = await kit.commit(kit.need(seen, TINDER_WORDS.editDone, "Done on the edit screen"), 1_200)
  for (let tries = 0; tries < 2 && !onProfileTab(current.screen); tries += 1) current = await kit.back(800)
  if (!onProfileTab(current.screen)) throw new WalkError("Could not get back to the Profile tab after saving.", current.shot)
  return current
}

/** Scrolls the edit screen down until `find` sees what it looks for, six screenfuls at most. */
async function scrollTo(kit: WalkKit, start: Seen, find: (screen: ScreenRead) => ScreenNode | null, what: string): Promise<{ seen: Seen; node: ScreenNode }> {
  let seen = start
  for (let scrolls = 0; scrolls <= 6; scrolls += 1) {
    const node = find(seen.screen)
    if (node) return { seen, node }
    if (scrolls < 6) seen = await kit.scroll(seen, "up", 600)
  }
  throw new WalkError(`Could not find ${what} on Tinder's edit screen. The words for it may have changed.`, seen.shot)
}

/** The first box that takes typing below a heading. */
function boxBelow(screen: ScreenRead, heading: NodeMatch): ScreenNode | null {
  const top = findNode(screen, heading)
  if (!top) return null
  return (
    screen.nodes
      .filter((node) => node.edit && isVisible(node, screen) && node.bounds[1] >= top.bounds[3] - 4)
      .sort((a, b) => a.bounds[1] - b.bounds[1])[0] ?? null
  )
}

/** Reads the profile back after a change, keeps it with the AI's suggestions, and returns it to be checked. */
async function readBack(ctx: WalkContext, kit: WalkKit, knownIds: string[]): Promise<OwnProfileRecord> {
  const read = await readEditScreen(ctx, kit, knownIds)
  await saveOwnProfile(owner(ctx), read, ctx.db, ctx.now(), true)
  return read
}

function inputText(value: unknown, what: string): string {
  if (typeof value !== "string") throw new WalkError(`The walk was not given ${what}.`)
  return value
}

/** How long the finger rests on a photo before dragging it, so Tinder picks it up. */
const PHOTO_HOLD_MS = 600

/**
 * Puts the member's photos in the order given, as picture ids from a read of
 * the profile. Each photo on the edit screen is matched to Date's own copy by
 * how it looks; the first photo out of place is long-pressed and dragged to
 * its place, and the screen is matched again, until the order is right. Then
 * Done, and the profile is read back and must show that order.
 *
 * A first-photo test's move (`photoTest`) is recorded on the test. Any other
 * is an Apply, or an Undo when `undo` is set.
 */
export async function reorderPhotos(ctx: WalkContext, kit: WalkKit, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const target = Array.isArray(input.photoIds) ? input.photoIds.filter((id): id is string => typeof id === "string") : []
  if (!target.length) throw new WalkError("The walk was not given an order for the photos.")
  const photos = await knownPhotos(ctx, target)
  let { seen } = await openEditScreen(kit)

  let replaced: string[] | null = null
  for (let moves = 0; ; moves += 1) {
    const tiles = photoTiles(seen.screen)
    if (tiles.length !== target.length) {
      throw new WalkError(`Tinder shows ${tiles.length} photos and Date expected ${target.length}. Read your profile again, then try once more.`, seen.shot)
    }
    const at = await matchPictures(await cropTiles(seen, tiles), photos)
    if (at.includes(-1)) throw new WalkError("A photo on Tinder is not one Date read. Read your profile again, then try once more.", seen.shot)
    replaced ??= at.map((photo) => target[photo])
    const wrong = at.findIndex((photo, tile) => photo !== tile)
    if (wrong === -1) break
    if (moves >= target.length) throw new WalkError("The photos did not land where they were dragged. Nothing was saved.", seen.shot)
    seen = await kit.drag(center(tiles[at.indexOf(wrong)].bounds), center(tiles[wrong].bounds), 1_000, PHOTO_HOLD_MS)
  }

  const test = input.photoTest as { rowId?: unknown; step?: unknown } | undefined
  const forTest = test && typeof test.rowId === "string" && (test.step === "week" || test.step === "winner" || test.step === "restore")
  if (!forTest && input.undo !== true) await keepReplaced(ctx.phone.accountId, { kind: "photos", photoIds: replaced ?? target }, ctx.db)
  await saveEdits(kit, seen)
  const read = await readBack(ctx, kit, target)
  if (read.photoIds.join() !== target.join()) throw new WalkError("After saving, your profile on Tinder does not show the photos in the new order.")

  if (forTest) await photoTestMoved(ctx.phone.accountId, test.rowId as string, test.step as PhotoTestStep, ctx.db, ctx.now())
  else await markApplied(ctx.phone.accountId, "photos", input.undo === true, ctx.db, ctx.now())
  return { photos: target.length }
}

/** Types a new bio into the About me box, saves, and reads the profile back to check it. */
export async function setBio(ctx: WalkContext, kit: WalkKit, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const bio = inputText(input.bio, "a bio")
  const own = await readOwnRow(ctx.phone.accountId, ctx.db)
  const opened = await openEditScreen(kit)
  const found = await scrollTo(kit, opened.seen, (screen) => boxBelow(screen, TINDER_WORDS.aboutMeHeading), "the About me box")
  const replaced: OwnProfileChange = { kind: "bio", bio: found.node.text }
  const typed = await kit.type(found.node, bio)
  if (input.undo !== true) await keepReplaced(ctx.phone.accountId, replaced, ctx.db)
  await saveEdits(kit, typed)

  const read = await readBack(ctx, kit, own?.photoIds ?? [])
  if (!sameWords(sectionText(read.sections, "About me"), bio)) throw new WalkError("After saving, your profile on Tinder does not show the new bio.")
  await markApplied(ctx.phone.accountId, "bio", input.undo === true, ctx.db, ctx.now())
  return { characters: bio.length }
}

/**
 * Opens one prompt by its question, types the new answer on its own screen,
 * saves both screens, and reads the profile back to check it. Only the
 * answer changes; the question stays.
 */
export async function setPrompt(ctx: WalkContext, kit: WalkKit, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const question = inputText(input.question, "a prompt's question")
  const answer = inputText(input.answer, "an answer")
  const own = await readOwnRow(ctx.phone.accountId, ctx.db)
  const opened = await openEditScreen(kit)
  const found = await scrollTo(kit, opened.seen, (screen) => findNode(screen, { text: [question] }), `the prompt "${question}"`)

  const promptScreen = await kit.tap(found.node, 1_000)
  const box =
    findNode(promptScreen.screen, TINDER_WORDS.promptAnswer) ??
    promptScreen.screen.nodes.find((node) => node.edit && isVisible(node, promptScreen.screen)) ??
    null
  if (!box) throw new WalkError(`Could not find the box for the answer to "${question}". The words for it may have changed.`, promptScreen.shot)
  const replaced: OwnProfileChange = { kind: "prompt", question, answer: box.text }
  const typed = await kit.type(box, answer)
  if (input.undo !== true) await keepReplaced(ctx.phone.accountId, replaced, ctx.db)
  const backOnEdit = await kit.commit(kit.need(typed, TINDER_WORDS.editDone, "Done on the prompt's screen"), 1_000)
  await saveEdits(kit, backOnEdit)

  const read = await readBack(ctx, kit, own?.photoIds ?? [])
  const shown = promptsOf(read.sections).find((prompt) => sameWords(prompt.question, question))
  if (!shown || !sameWords(shown.answer, answer)) throw new WalkError(`After saving, your profile on Tinder does not show the new answer to "${question}".`)
  await markApplied(ctx.phone.accountId, changeKey(replaced), input.undo === true, ctx.db, ctx.now())
  return { characters: answer.length }
}
