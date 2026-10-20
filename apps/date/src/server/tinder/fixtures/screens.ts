import type { ScreenNode, ScreenRead } from "../screen"

/**
 * Tinder's screens as the phone would read them, built by hand on 18 Oct 2026
 * before any real phone was read. Every walk is tested against these.
 *
 * They follow how Tinder's Android app is known to label itself, the same
 * guesses `../screen-words.ts` makes. When the phone arrives, a real
 * `read-screen` answer of each of these screens replaces the guess: save it
 * as JSON beside this file and point the matching builder at it, and any walk
 * that then fails shows exactly which label to change.
 *
 * Every screen is 1080 by 2400 pixels, a common Android phone.
 */

export const WIDTH = 1080
export const HEIGHT = 2400
export const TINDER = "com.tinder"

type Spec = Partial<Omit<ScreenNode, "id" | "bounds">> & { bounds: ScreenNode["bounds"]; tag?: string }

/** A screen plus, for the pretend phone, what each box does when tapped. */
export type BuiltScreen = { screen: ScreenRead; tags: Map<string, string> }

export function build(packageName: string, specs: Spec[]): BuiltScreen {
  const tags = new Map<string, string>()
  const nodes: ScreenNode[] = [
    { id: "n0", depth: 0, text: "", desc: "", hint: "", cls: "FrameLayout", res: "", bounds: [0, 0, WIDTH, HEIGHT], click: false, scroll: false, edit: false, selected: false, checked: false },
  ]
  specs.forEach((spec, index) => {
    const id = `n${index + 1}`
    const { tag, ...rest } = spec
    nodes.push({
      id,
      depth: 1,
      text: "",
      desc: "",
      hint: "",
      cls: "TextView",
      res: "",
      click: false,
      scroll: false,
      edit: false,
      selected: false,
      checked: false,
      ...rest,
    })
    if (tag) tags.set(id, tag)
  })
  return { screen: { package: packageName, screenWidth: WIDTH, screenHeight: HEIGHT, nodes, truncated: false }, tags }
}

const tabs: Spec[] = [
  { desc: "Home", cls: "ImageView", click: true, bounds: [0, 2260, 216, 2400], tag: "tab:discover" },
  { desc: "Explore", cls: "ImageView", click: true, bounds: [216, 2260, 432, 2400] },
  { desc: "Likes", cls: "ImageView", click: true, bounds: [432, 2260, 648, 2400] },
  { desc: "Chat", cls: "ImageView", click: true, bounds: [648, 2260, 864, 2400], tag: "tab:chat" },
  { desc: "Profile", cls: "ImageView", click: true, bounds: [864, 2260, 1080, 2400], tag: "tab:profile" },
]

/** Where the card's photo is. */
export const PHOTO_BOX: ScreenNode["bounds"] = [24, 200, 1056, 1900]

export type FakeCard = {
  name: string
  age: number
  distance: string
  verified: boolean
  /** Lines on the card's face under the name. */
  lines: string[]
  /** The full profile, screenful by screenful. */
  profilePages: string[][]
  photos: number
  /** A like on this card comes back "It's a Match!". */
  likesBack: boolean
  /** A different card with this card's name and age. */
  twinOf?: string
}

/** Tinder's Discover screen with a card in front. */
export function discover(card: FakeCard): BuiltScreen {
  return build(TINDER, [
    { text: "tinder", bounds: [400, 80, 680, 160] },
    { cls: "View", res: "com.tinder:id/recs_card", click: true, bounds: PHOTO_BOX, tag: "photo" },
    { text: `${card.name} ${card.age}`, bounds: [64, 1560, 620, 1650], tag: "name" },
    ...(card.verified ? [{ desc: "Verified", cls: "ImageView", bounds: [630, 1575, 690, 1635] } as Spec] : []),
    { text: "Recently Active", bounds: [64, 1650, 500, 1700] },
    { text: card.distance, bounds: [64, 1700, 700, 1750] },
    ...card.lines.map((line, index) => ({ text: line, bounds: [64, 1750 + index * 50, 1000, 1800 + index * 50] }) as Spec),
    { desc: "Open profile", cls: "ImageView", click: true, bounds: [960, 1580, 1040, 1660], tag: "open-profile" },
    { desc: "Rewind", cls: "ImageView", click: true, bounds: [60, 1960, 200, 2100] },
    { desc: "Nope", res: "com.tinder:id/gamepad_pass", cls: "ImageView", click: true, bounds: [230, 1940, 410, 2120], tag: "pass" },
    { desc: "Super Like", cls: "ImageView", click: true, bounds: [450, 1960, 630, 2100], tag: "super-like" },
    { desc: "Like", res: "com.tinder:id/gamepad_like", cls: "ImageView", click: true, bounds: [670, 1940, 850, 2120], tag: "like" },
    { desc: "Boost", cls: "ImageView", click: true, bounds: [880, 1960, 1020, 2100] },
    ...tabs,
  ])
}

/** A card's full profile, open over the card, at one screenful. */
export function fullProfile(card: FakeCard, page: number): BuiltScreen {
  const lines = card.profilePages[Math.min(page, card.profilePages.length - 1)] ?? []
  return build(TINDER, [
    { desc: "Close profile", cls: "ImageView", click: true, bounds: [960, 1500, 1040, 1580], tag: "close-profile" },
    { cls: "ScrollView", scroll: true, bounds: [0, 160, WIDTH, 2260] },
    ...lines.map((line, index) => ({ text: line, bounds: [64, 240 + index * 110, 1000, 330 + index * 110] }) as Spec),
    { text: `Report ${card.name}`, click: true, bounds: [64, 2150, 600, 2220] },
  ])
}

export function itsAMatch(name: string): BuiltScreen {
  return build(TINDER, [
    { text: "It's a Match!", bounds: [200, 600, 880, 720] },
    { text: `You and ${name} have liked each other.`, bounds: [120, 760, 960, 820] },
    { text: "Keep swiping", click: true, bounds: [200, 2000, 880, 2120], tag: "keep-swiping" },
  ])
}

export function outOfLikes(timer = "11:59:30"): BuiltScreen {
  return build(TINDER, [
    { text: "You're Out of Likes!", bounds: [140, 500, 940, 600] },
    { text: timer, bounds: [400, 640, 680, 720] },
    { text: "Get Tinder Plus", click: true, bounds: [200, 1800, 880, 1920] },
    { text: "No thanks", click: true, bounds: [200, 1960, 880, 2060] },
  ])
}

export function verificationWall(): BuiltScreen {
  return build(TINDER, [
    { text: "Verify it's you", bounds: [140, 500, 940, 600] },
    { text: "Take a quick video selfie to keep using Tinder.", bounds: [120, 640, 960, 760] },
    { text: "Verify", click: true, bounds: [200, 1900, 880, 2020] },
  ])
}

export function signedOut(): BuiltScreen {
  return build(TINDER, [
    { text: "tinder", bounds: [400, 700, 680, 820] },
    { text: "Create account", click: true, bounds: [140, 1700, 940, 1800] },
    { text: "Log in", click: true, bounds: [140, 1840, 940, 1940] },
    { text: "Trouble logging in?", click: true, bounds: [300, 2000, 780, 2060] },
  ])
}

export function nobodyNew(): BuiltScreen {
  return build(TINDER, [
    { text: "There's no one new around you.", bounds: [120, 1000, 960, 1100] },
    { text: "Expand your distance settings to see more people.", bounds: [120, 1120, 960, 1220] },
    ...tabs,
  ])
}

export function homeScreen(): BuiltScreen {
  return build("com.google.android.apps.nexuslauncher", [{ text: "Tinder", desc: "Tinder", click: true, bounds: [100, 1800, 300, 2000] }])
}

export function otherApp(packageName: string): BuiltScreen {
  return build(packageName, [{ text: "Chats", bounds: [64, 120, 400, 200] }])
}

export type FakeChat = { name: string; preview: string; isNew: boolean }

/** The Chat tab: new matches across the top, conversations under "Messages". */
export function chatList(chats: FakeChat[], page: number): BuiltScreen {
  const fresh = chats.filter((chat) => chat.isNew)
  const talking = chats.filter((chat) => !chat.isNew).slice(page * 6, page * 6 + 6)
  return build(TINDER, [
    { text: "New Matches", bounds: [64, 200, 600, 260] },
    ...fresh.slice(0, 4).flatMap(
      (chat, index) =>
        [
          { cls: "ImageView", click: true, bounds: [40 + index * 250, 280, 260 + index * 250, 500], tag: `avatar:${chat.name}` },
          { text: chat.name, click: true, bounds: [40 + index * 250, 510, 260 + index * 250, 560], tag: `row:${chat.name}` },
        ] as Spec[]
    ),
    { text: "Messages", bounds: [64, 640, 600, 700] },
    ...talking.flatMap(
      (chat, index) =>
        [
          { cls: "ImageView", click: true, bounds: [40, 740 + index * 220, 220, 920 + index * 220], tag: `avatar:${chat.name}` },
          { text: chat.name, click: true, bounds: [260, 750 + index * 220, 900, 810 + index * 220], tag: `row:${chat.name}` },
          { text: chat.preview, bounds: [260, 820 + index * 220, 1000, 880 + index * 220] },
        ] as Spec[]
    ),
    ...tabs,
  ])
}

export type FakeBubble = { direction: "in" | "out"; text: string }

/** One conversation, showing up to seven messages ending `fromEnd` messages before the newest. */
export function conversation(name: string, bubbles: FakeBubble[], fromEnd: number, typed: string): BuiltScreen {
  const end = Math.max(bubbles.length - fromEnd, 0)
  const shown = bubbles.slice(Math.max(end - 7, 0), end)
  return build(TINDER, [
    { desc: "Back", cls: "ImageView", click: true, bounds: [20, 100, 120, 200], tag: "back" },
    { text: name, bounds: [200, 110, 700, 190] },
    { desc: "Safety Toolkit", cls: "ImageView", click: true, bounds: [960, 100, 1060, 200], tag: "menu" },
    { text: "Today 7:42 PM", bounds: [380, 280, 700, 330] },
    ...shown.map(
      (bubble, index) =>
        ({
          text: bubble.text,
          bounds: bubble.direction === "in" ? [40, 360 + index * 220, 700, 540 + index * 220] : [380, 360 + index * 220, 1040, 540 + index * 220],
        }) as Spec
    ),
    {
      cls: "EditText",
      edit: true,
      click: true,
      text: typed,
      hint: "Type a message",
      bounds: [40, 2160, 860, 2280],
      tag: "input",
    },
    { desc: "Send", cls: "ImageView", click: true, bounds: [880, 2160, 1040, 2280], tag: "send" },
  ])
}

export function chatMenu(): BuiltScreen {
  return build(TINDER, [
    { text: "Report", click: true, bounds: [64, 1700, 1016, 1800] },
    { text: "Unmatch", click: true, bounds: [64, 1820, 1016, 1920], tag: "unmatch" },
    { text: "Cancel", click: true, bounds: [64, 1940, 1016, 2040], tag: "back" },
  ])
}

export function unmatchConfirm(name: string): BuiltScreen {
  return build(TINDER, [
    { text: `Unmatch ${name}?`, bounds: [140, 900, 940, 1000] },
    { text: "Yes, unmatch", click: true, bounds: [140, 1300, 940, 1400], tag: "confirm-unmatch" },
    { text: "Cancel", click: true, bounds: [140, 1420, 940, 1520], tag: "back" },
  ])
}

/** Tinder's offer when the day's Super Likes are gone. "Buy" is tagged so a test can prove it was never pressed. */
export function outOfSuperLikes(): BuiltScreen {
  return build(TINDER, [
    { text: "You're out of Super Likes", bounds: [140, 500, 940, 600] },
    { text: "Get more Super Likes and stand out.", bounds: [120, 640, 960, 720] },
    { text: "Buy 5 Super Likes for $9.99", click: true, bounds: [200, 1800, 880, 1920], tag: "buy" },
    { text: "No thanks", click: true, bounds: [200, 1960, 880, 2060], tag: "no-thanks" },
  ])
}

/** Where the two sliders sit on the settings screen. */
export const DISTANCE_TRACK: ScreenNode["bounds"] = [64, 760, 1016, 840]
export const AGE_TRACK: ScreenNode["bounds"] = [64, 1060, 1016, 1140]

export type FakeDiscovery = { distance: number; unit: "km" | "mi"; ageMin: number; ageMax: number }

/** Tinder's settings, opened from the gear on the Profile tab: the distance and the age range. */
export function discoverySettings(discovery: FakeDiscovery): BuiltScreen {
  return build(TINDER, [
    { desc: "Navigate up", cls: "ImageView", click: true, bounds: [20, 100, 120, 200], tag: "back" },
    { text: "Settings", bounds: [200, 110, 700, 190] },
    { text: "Done", click: true, bounds: [880, 110, 1040, 190], tag: "settings-done" },
    { text: "Discovery Settings", bounds: [64, 560, 700, 620] },
    { text: "Maximum Distance", bounds: [64, 660, 600, 720] },
    { text: `${discovery.distance} ${discovery.unit}`, bounds: [800, 660, 1016, 720] },
    { cls: "android.widget.SeekBar", click: true, bounds: DISTANCE_TRACK, tag: "slider:distance" },
    { text: "Age Range", bounds: [64, 960, 600, 1020] },
    { text: `${discovery.ageMin} - ${discovery.ageMax}`, bounds: [760, 960, 1016, 1020] },
    { cls: "com.google.android.material.slider.RangeSlider", click: true, bounds: AGE_TRACK, tag: "slider:age" },
  ])
}

export function profileTab(name: string, age: number): BuiltScreen {
  return build(TINDER, [
    { desc: "Settings", cls: "ImageView", click: true, bounds: [960, 100, 1060, 200], tag: "settings" },
    { cls: "ImageView", bounds: [390, 300, 690, 600] },
    { text: `${name}, ${age}`, bounds: [300, 640, 780, 720] },
    { desc: "Edit profile", text: "Edit profile", click: true, bounds: [340, 760, 740, 840], tag: "edit-profile" },
    ...tabs,
  ])
}

export const EDIT_TILES: ScreenNode["bounds"][] = [
  [40, 220, 360, 640],
  [380, 220, 700, 640],
  [720, 220, 1040, 640],
  [40, 660, 360, 1080],
]

export function editProfile(photos: number, page: number, pages: string[][]): BuiltScreen {
  const lines = pages[Math.min(page, pages.length - 1)] ?? []
  return build(TINDER, [
    { text: "Edit Info", bounds: [400, 100, 680, 180] },
    ...(page === 0
      ? EDIT_TILES.slice(0, photos).map((bounds) => ({ cls: "ImageView", click: true, bounds }) as Spec)
      : []),
    ...lines.map((line, index) => ({ text: line, bounds: [64, 1200 + index * 110, 1000, 1290 + index * 110] }) as Spec),
  ])
}
