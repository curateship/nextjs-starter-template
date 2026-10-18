import { cropScreenshot, keepPicture } from "@/server/phone/pictures"

import { findNode, isVisible, screenTexts, type ScreenNode, type ScreenRead } from "../screen"
import { NAME_AGE_LINE, TINDER_CHROME_LINES, TINDER_WORDS } from "../screen-words"
import { saveOwnProfile } from "../store"
import { onDiscover, WalkError, type Seen, type WalkContext, type WalkKit } from "./kit"
import { parseProfileLines } from "./parse"

/** The Profile tab: its edit button with the bottom tabs under it. The edit screen itself has no tabs. */
const onProfileTab = (screen: ScreenRead) =>
  Boolean(findNode(screen, TINDER_WORDS.editProfile) && findNode(screen, TINDER_WORDS.tabProfile))

async function toProfileTab(kit: WalkKit): Promise<Seen> {
  return kit.goToTab(await kit.openTinder(), TINDER_WORDS.tabProfile, onProfileTab, "Profile")
}

/**
 * Opens Tinder and reads whose account is signed in from the Profile tab.
 * Signed out stops the phone, like every stop screen. Run on Resume too, to
 * see whether what stopped the phone has gone.
 */
export async function whoIsSignedIn(_ctx: WalkContext, kit: WalkKit): Promise<Record<string, unknown>> {
  const seen = await toProfileTab(kit)
  const line = screenTexts(seen.screen, { top: 0, bottom: seen.screen.screenHeight * 0.6 }).find((text) => NAME_AGE_LINE.test(text))
  const found = line ? NAME_AGE_LINE.exec(line) : null
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

/**
 * Reads the member's own profile from Tinder's edit screen: the photos in
 * their order, and every section of words. Nothing on the profile is changed.
 */
export async function readOwnProfile(ctx: WalkContext, kit: WalkKit): Promise<Record<string, unknown>> {
  const tab = await toProfileTab(kit)
  const nameLine = screenTexts(tab.screen, { top: 0, bottom: tab.screen.screenHeight * 0.6 }).find((text) => NAME_AGE_LINE.test(text))
  const name = nameLine ? (NAME_AGE_LINE.exec(nameLine)?.[1].trim() ?? "") : ""
  let seen = await kit.tap(kit.need(tab, TINDER_WORDS.editProfile, "Edit profile"), 1_200)
  if (!seen.shot) throw new WalkError("The phone did not send a picture of the screen, so the photos could not be kept.")

  const photoIds: string[] = []
  for (const tile of photoTiles(seen.screen)) {
    const photo = await cropScreenshot(seen.shot, tile.bounds, seen.screen.screenWidth)
    photoIds.push(await keepPicture(ctx.phone.userId, photo, "photo", ctx.db, ctx.now()))
  }

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
  // Out of the edit screen without saving anything: back, never Done or Save.
  for (let tries = 0; tries < 2 && !onProfileTab(seen.screen); tries += 1) seen = await kit.back(800)

  const parsed = parseProfileLines([], lines)
  await saveOwnProfile(
    { userId: ctx.phone.userId, workspaceId: ctx.phone.workspaceId, phoneId: ctx.phone.id },
    { name, photoIds, bio: parsed.bio, sections: parsed.sections, texts: lines },
    ctx.db,
    ctx.now()
  )
  return { photos: photoIds.length, lines: lines.length }
}
