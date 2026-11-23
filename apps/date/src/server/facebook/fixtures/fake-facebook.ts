import sharp from "sharp"

import { FACEBOOK_PACKAGE, type PhoneActionKind } from "@/lib/dating/options"
import type { PhoneAnswer } from "@/server/phone/actions"
import type { ScreenNode } from "@/server/tinder/screen"
import { build, HEIGHT, homeScreen, otherApp, WIDTH, type BuiltScreen } from "@/server/tinder/fixtures/screens"

/**
 * A pretend Facebook with Dating inside it, on a pretend phone, for the
 * Facebook Dating walk tests (task "facebook/01-facebook-dating"). Built by
 * hand on 22 Oct 2026 before any real phone was read, from the same guesses
 * as `../screen-words.ts`. When the phone arrives, a real `read-screen` of
 * each screen replaces the guess, as `src/server/tinder/fixtures/screens.ts`
 * says for Tinder.
 *
 * Facebook opens on its feed. The walks go through the menu to Dating, whose
 * home has three tabs: Suggested (one long profile with Like and Pass
 * floating under it, and Second Look), Likes (people who liked you) and
 * Matches (new matches and conversations). Every screen is 1080 by 2400.
 * Photos are drawn as a grey square with a white dot whose place differs from
 * photo to photo, so two photos never look the same.
 */

type Screen =
  | "feed"
  | "menu"
  | "suggested"
  | "likes"
  | "liker"
  | "second-look"
  | "passed"
  | "like-sheet"
  | "match"
  | "matches"
  | "conversation"
  | "chat-menu"
  | "report-reasons"
  | "report-submit"
  | "report-done"
  | "pass-confirm"
  | "unmatch-confirm"
  | "settings"
  | "weekly"
  | "checkpoint"
  | "frozen"
  | "blank"

export type FakeProfile = {
  name: string
  age: number
  distance: string
  /** Lines under the name on the first screenful. */
  lines: string[]
  /** One question and its answer, on the second screenful. */
  question?: [string, string]
  bio: string
  photos: number
  mutualFriends?: number
  mutualNames?: string[]
  group?: string
  instagram?: number
  likesBack?: boolean
}

export type FakeLiker = FakeProfile & { comment?: string; commentOn?: "photo" | "answer" }
export type FakeChat = { name: string; preview: string; isNew: boolean; left?: boolean; bubbles: Array<{ direction: "in" | "out"; text?: string; media?: string }> }

export type FakeFacebookSetup = {
  profiles?: FakeProfile[]
  likers?: FakeLiker[]
  chats?: FakeChat[]
  /** People passed earlier, shown on Second Look. */
  passed?: FakeProfile[]
  weekly?: FakeProfile
  breakOn?: boolean
  discovery?: { distance: number; ageMin: number; ageMax: number }
  checkpoint?: boolean
  installed?: boolean
  /** Facebook shows Android's "isn't responding" this many times, once a walk opens Dating. */
  freezes?: number
  /** Facebook's screen comes back empty this many times in a row, once a walk opens Dating. */
  blanks?: number
  /** The main Like sends at once with no comment box, as Facebook may do. */
  likeWithoutSheet?: boolean
  /** Labels a new Facebook version dropped: the like and send buttons lose their names. */
  renamed?: Array<"like" | "send">
  /** Whose Facebook is signed in, as the menu shows it. */
  signedInAs?: string
  /** Pass asks "Are you sure?" and stays on the same person until answered. */
  passConfirm?: boolean
}

/** Where things sit on a profile's screens. */
const PHOTO_BOX: ScreenNode["bounds"] = [24, 320, 1056, 1500]
const PASS_BOX: ScreenNode["bounds"] = [150, 2160, 400, 2310]
const LIKE_BOX: ScreenNode["bounds"] = [680, 2160, 930, 2310]

/** The ends of the pretend sliders, which the walk only guesses. */
const ENDS = { distance: { min: 1, max: 160 }, age: { min: 18, max: 99 } }
const DISTANCE_TRACK: ScreenNode["bounds"] = [60, 760, 1020, 820]
const AGE_TRACK: ScreenNode["bounds"] = [60, 1060, 1020, 1120]

type Spec = Parameters<typeof build>[1][number]

const header: Spec[] = [
  { text: "Dating", bounds: [64, 60, 400, 140] },
  { desc: "Dating settings", cls: "ImageView", click: true, bounds: [960, 60, 1040, 140], tag: "settings" },
]

function tabs(selected: "suggested" | "likes" | "matches"): Spec[] {
  return [
    { text: "Suggested", click: true, selected: selected === "suggested", bounds: [40, 170, 360, 240], tag: "tab:suggested" },
    { text: "Likes", click: true, selected: selected === "likes", bounds: [380, 170, 700, 240], tag: "tab:likes" },
    { text: "Matches", click: true, selected: selected === "matches", bounds: [720, 170, 1040, 240], tag: "tab:matches" },
  ]
}

/** One screenful of a profile: the first, the answer and second photo, then the details. The last has no more under it. */
export function profilePage(profile: FakeProfile, page: number, chrome: Spec[], renamed: FakeFacebookSetup["renamed"] = []): BuiltScreen {
  const pages: Spec[][] = [
    [
      { cls: "ImageView", desc: `Photo 1 of ${profile.photos}`, bounds: PHOTO_BOX, tag: "photo:0" },
      { desc: "Like photo", cls: "ImageView", click: true, bounds: [940, 1400, 1040, 1490], tag: "like-item:photo" },
      { text: `${profile.name}, ${profile.age}`, bounds: [64, 1520, 600, 1600] },
      { text: profile.distance, bounds: [64, 1600, 700, 1650] },
      ...profile.lines.map((line, index) => ({ text: line, bounds: [64, 1660 + index * 60, 1000, 1710 + index * 60] }) as Spec),
    ],
    [
      ...(profile.question
        ? ([
            { text: profile.question[0], bounds: [64, 320, 1000, 380] },
            { text: profile.question[1], bounds: [64, 400, 900, 480] },
            { desc: "Like answer", cls: "ImageView", click: true, bounds: [940, 400, 1040, 480], tag: "like-item:answer" },
          ] as Spec[])
        : []),
      ...(profile.photos > 1 ? ([{ cls: "ImageView", desc: `Photo 2 of ${profile.photos}`, bounds: [24, 600, 1056, 1700], tag: "photo:1" }] as Spec[]) : []),
    ],
    [
      { text: "About me", bounds: [64, 320, 600, 380] },
      { text: profile.bio, bounds: [64, 400, 1000, 520] },
      ...(profile.mutualFriends ? ([{ text: `${profile.mutualFriends} mutual friend${profile.mutualFriends === 1 ? "" : "s"}`, bounds: [64, 560, 700, 620] }] as Spec[]) : []),
      ...(profile.mutualNames?.length ? ([{ text: `Mutual friends: ${profile.mutualNames.join(", ")}`, bounds: [64, 640, 1000, 700] }] as Spec[]) : []),
      ...(profile.group ? ([{ text: `You're both in ${profile.group}`, bounds: [64, 720, 1000, 780] }] as Spec[]) : []),
      ...(profile.instagram
        ? ([
            { text: "Instagram", bounds: [64, 820, 600, 880] },
            ...Array.from({ length: profile.instagram }, (_, index) => ({ cls: "ImageView", desc: "Instagram post", bounds: [24 + index * 340, 900, 340 + index * 340, 1220], tag: `insta:${index}` }) as Spec),
          ] as Spec[])
        : []),
      ...(profile.photos > 2 ? ([{ cls: "ImageView", desc: `Photo 3 of ${profile.photos}`, bounds: [24, 1260, 1056, 2100], tag: "photo:2" }] as Spec[]) : []),
    ],
  ]
  const body = pages[Math.min(page, pages.length - 1)]
  return build(FACEBOOK_PACKAGE, [
    ...chrome,
    ...body,
    { desc: "Pass", cls: "ImageView", click: true, bounds: PASS_BOX, tag: "pass" },
    { desc: renamed.includes("like") ? "Heart" : "Like", cls: "ImageView", click: true, bounds: LIKE_BOX, tag: "like" },
  ])
}

const PROFILE_PAGES = 3

export class FakeFacebook {
  screen: Screen = "feed"
  foreground = FACEBOOK_PACKAGE
  profiles: FakeProfile[]
  likers: FakeLiker[]
  chats: FakeChat[]
  passed: FakeProfile[]
  weekly: FakeProfile | null
  page = 0
  /** The person a screen shows: on Likes, Second Look or the like sheet. */
  person: FakeProfile | null = null
  /** Where the like sheet came from, to go back there. */
  sheetFrom: Screen = "suggested"
  typed = ""
  openChat = -1
  breakOn: boolean
  discovery: { distance: number; ageMin: number; ageMax: number }
  freezes: number
  blanks: number
  inDating = false
  liked: Array<{ name: string; comment: string; on: string }> = []
  passedNow: string[] = []
  sent: string[] = []
  unmatched: string[] = []
  reported: string[] = []
  /** Anything pressed outside Dating. A walk must leave this empty. */
  outside: string[] = []
  steps: Array<{ kind: PhoneActionKind; payload: Record<string, unknown> }> = []
  private lastTags = new Map<string, string>()
  private lastNodes: ScreenNode[] = []
  private setup: FakeFacebookSetup

  constructor(setup: FakeFacebookSetup = {}) {
    this.setup = setup
    this.profiles = setup.profiles ?? []
    this.likers = setup.likers ?? []
    this.chats = setup.chats ?? []
    this.passed = setup.passed ?? []
    this.weekly = setup.weekly ?? null
    this.breakOn = setup.breakOn ?? false
    this.discovery = { ...(setup.discovery ?? { distance: 80, ageMin: 18, ageMax: 50 }) }
    this.freezes = setup.freezes ?? 0
    this.blanks = setup.blanks ?? 0
    if (setup.checkpoint) this.screen = "checkpoint"
  }

  private shown(): FakeProfile | null {
    if (this.screen === "suggested") return this.profiles[0] ?? null
    return this.person
  }

  private built(): BuiltScreen {
    if (this.foreground !== FACEBOOK_PACKAGE) return this.foreground === "home" ? homeScreen() : otherApp(this.foreground)
    switch (this.screen) {
      case "feed":
        return build(FACEBOOK_PACKAGE, [
          { text: "facebook", bounds: [40, 60, 400, 140] },
          { desc: "Menu", cls: "ImageView", click: true, bounds: [960, 60, 1040, 140], tag: "menu" },
          // Facebook's feed has its own "Suggested for you", which is not Dating.
          { text: "Suggested for you", click: true, bounds: [64, 300, 600, 360], tag: "feed-suggested" },
          { text: "Sam shared a memory", bounds: [64, 400, 1000, 460] },
          { text: "Like", click: true, bounds: [64, 900, 300, 960], tag: "post-like" },
        ])
      case "menu":
        return build(FACEBOOK_PACKAGE, [
          { text: "Menu", bounds: [40, 60, 400, 140] },
          { text: this.setup.signedInAs ?? "Tyler Pham", desc: "Your profile", click: true, bounds: [64, 300, 700, 380], tag: "my-profile" },
          { text: "Groups", click: true, bounds: [64, 700, 500, 780], tag: "groups" },
          { text: "Dating", click: true, bounds: [64, 900, 500, 980], tag: "dating" },
          { text: "Marketplace", click: true, bounds: [64, 1100, 500, 1180], tag: "marketplace" },
        ])
      case "weekly": {
        const match = this.weekly as FakeProfile
        return build(FACEBOOK_PACKAGE, [
          { text: "Your weekly surprise match", bounds: [64, 60, 1000, 140] },
          { cls: "ImageView", desc: "Photo 1 of 1", bounds: PHOTO_BOX, tag: "photo:0" },
          { text: `${match.name}, ${match.age}`, bounds: [64, 1520, 600, 1600] },
          ...match.lines.map((line, index) => ({ text: line, bounds: [64, 1620 + index * 60, 1000, 1670 + index * 60] }) as Spec),
          { text: "Say hi", click: true, bounds: [100, 2100, 500, 2200], tag: "say-hi" },
          { text: "Not now", click: true, bounds: [580, 2100, 980, 2200], tag: "weekly-close" },
        ])
      }
      case "suggested": {
        const profile = this.profiles[0]
        const chrome = [...header, ...tabs("suggested"), { text: "Second Look", click: true, bounds: [700, 250, 1040, 300], tag: "second-look" } as Spec]
        if (!profile) return build(FACEBOOK_PACKAGE, [...chrome, { text: "You've seen everyone for now. Check back tomorrow.", bounds: [64, 900, 1000, 1000] }])
        return profilePage(profile, this.page, chrome, this.setup.renamed)
      }
      case "liker":
      case "passed":
        return profilePage(this.person as FakeProfile, this.page, [...header, { desc: "Back", cls: "ImageView", click: true, bounds: [0, 160, 120, 240], tag: "back" }], this.setup.renamed)
      case "likes": {
        if (!this.likers.length) return build(FACEBOOK_PACKAGE, [...header, ...tabs("likes"), { text: "No likes yet. When someone likes you, they show here.", bounds: [64, 900, 1000, 1000] }])
        return build(FACEBOOK_PACKAGE, [
          ...header,
          ...tabs("likes"),
          ...this.likers.flatMap((liker, index) => [
            { text: `${liker.name}, ${liker.age}`, click: true, bounds: [200, 400 + index * 220, 900, 470 + index * 220], tag: `liker:${liker.name}` } as Spec,
            ...(liker.comment
              ? ([{ text: `Commented on your ${liker.commentOn ?? "photo"}: "${liker.comment}"`, bounds: [200, 480 + index * 220, 1000, 540 + index * 220] }] as Spec[])
              : []),
          ]),
        ])
      }
      case "second-look":
        return build(FACEBOOK_PACKAGE, [
          ...header,
          { text: "Second Look", bounds: [64, 170, 600, 240] },
          ...this.passed.map((person, index) => ({ text: `${person.name}, ${person.age}`, click: true, bounds: [200, 400 + index * 200, 900, 470 + index * 200], tag: `passed:${person.name}` }) as Spec),
          { desc: "Back", cls: "ImageView", click: true, bounds: [0, 160, 60, 240], tag: "back" },
        ])
      case "like-sheet":
        return build(FACEBOOK_PACKAGE, [
          ...header,
          { text: `Send ${this.person?.name} a like`, bounds: [64, 1500, 1000, 1580] },
          { cls: "EditText", edit: true, click: true, hint: "Add a comment (optional)", text: this.typed, bounds: [64, 1620, 1016, 1760], tag: "comment" },
          { text: "Send like", click: true, bounds: [600, 1800, 1016, 1900], tag: "send-like" },
        ])
      case "match":
        return build(FACEBOOK_PACKAGE, [
          { text: "It's a match!", bounds: [200, 600, 880, 720] },
          { text: "Send a message", click: true, bounds: [200, 1900, 880, 2000], tag: "send-a-message" },
          { text: "Keep browsing", click: true, bounds: [200, 2050, 880, 2150], tag: "keep-browsing" },
        ])
      case "matches": {
        const fresh = this.chats.filter((chat) => chat.isNew)
        const talking = this.chats.filter((chat) => !chat.isNew)
        return build(FACEBOOK_PACKAGE, [
          ...header,
          ...tabs("matches"),
          { text: "New matches", bounds: [64, 280, 600, 340] },
          ...fresh.map((chat, index) => ({ text: chat.name, click: true, bounds: [40 + index * 260, 560, 260 + index * 260, 620], tag: `row:${chat.name}` }) as Spec),
          { text: "Conversations", bounds: [64, 700, 600, 760] },
          ...talking.flatMap((chat, index) => [
            { text: chat.name, click: true, bounds: [260, 820 + index * 200, 900, 880 + index * 200], tag: `row:${chat.name}` } as Spec,
            { text: chat.preview, bounds: [260, 890 + index * 200, 1000, 940 + index * 200] } as Spec,
          ]),
        ])
      }
      case "conversation": {
        const chat = this.chats[this.openChat]
        return build(FACEBOOK_PACKAGE, [
          { desc: "Dating conversation", cls: "ImageView", click: true, bounds: [0, 60, 120, 140], tag: "back" },
          { text: chat.name, bounds: [150, 60, 600, 140] },
          { desc: "More options", cls: "ImageView", click: true, bounds: [960, 60, 1040, 140], tag: "menu-chat" },
          ...(chat.left ? ([{ text: `${chat.name} is no longer available.`, bounds: [64, 300, 1000, 360] }] as Spec[]) : []),
          ...chat.bubbles.map((bubble, index) => {
            const top = 400 + index * 140
            const bounds: ScreenNode["bounds"] = bubble.direction === "in" ? [40, top, 600, top + 110] : [480, top, 1040, top + 110]
            return bubble.media ? ({ cls: "ImageView", desc: bubble.media, bounds } as Spec) : ({ text: bubble.text, bounds } as Spec)
          }),
          { cls: "EditText", edit: true, click: true, hint: "Message", text: this.typed, bounds: [40, 2200, 900, 2320], tag: "input" },
          { desc: this.setup.renamed?.includes("send") ? "Arrow" : "Send", cls: "ImageView", click: true, bounds: [920, 2200, 1040, 2320], tag: "send" },
        ])
      }
      case "chat-menu":
        return build(FACEBOOK_PACKAGE, [
          { text: "Dating", bounds: [64, 60, 400, 140] },
          { text: "Report", click: true, bounds: [64, 1800, 1000, 1880], tag: "report" },
          { text: "Unmatch", click: true, bounds: [64, 1920, 1000, 2000], tag: "unmatch" },
        ])
      case "report-reasons":
        return build(FACEBOOK_PACKAGE, [
          { text: "Dating", bounds: [64, 60, 400, 140] },
          { text: "Fake profile", click: true, bounds: [64, 600, 1000, 680], tag: "reason:fake" },
          { text: "Scam or fraud", click: true, bounds: [64, 720, 1000, 800], tag: "reason:scam" },
          { text: "Something else", click: true, bounds: [64, 840, 1000, 920], tag: "reason:other" },
        ])
      case "report-submit":
        return build(FACEBOOK_PACKAGE, [
          { text: "Dating", bounds: [64, 60, 400, 140] },
          { text: "Scam or fraud", bounds: [64, 600, 1000, 680] },
          { text: "Submit", click: true, bounds: [64, 1920, 1000, 2000], tag: "report-submit" },
        ])
      case "pass-confirm":
        return build(FACEBOOK_PACKAGE, [
          { text: "Dating", bounds: [64, 60, 400, 140] },
          { text: `Pass on ${(this.passFrom === "suggested" ? this.profiles[0] : this.person)?.name}?`, bounds: [64, 900, 1000, 980] },
          { text: "Pass", click: true, bounds: [600, 1100, 1000, 1180], tag: "pass-yes" },
          { text: "Cancel", click: true, bounds: [64, 1100, 500, 1180], tag: "pass-cancel" },
        ])
      case "report-done":
        return build(FACEBOOK_PACKAGE, [
          { text: "Dating", bounds: [64, 60, 400, 140] },
          { text: "Thanks for letting us know", bounds: [64, 600, 1000, 680] },
          { text: "Unmatch", click: true, bounds: [64, 1800, 1000, 1880], tag: "unmatch" },
          { text: "Done", click: true, bounds: [64, 1920, 1000, 2000], tag: "report-close" },
        ])
      case "unmatch-confirm":
        return build(FACEBOOK_PACKAGE, [
          { text: "Dating", bounds: [64, 60, 400, 140] },
          { text: `Unmatch ${this.chats[this.openChat]?.name}?`, bounds: [64, 900, 1000, 980] },
          { text: "Unmatch", click: true, bounds: [600, 1100, 1000, 1180], tag: "confirm-unmatch" },
          { text: "Cancel", click: true, bounds: [64, 1100, 500, 1180], tag: "cancel" },
        ])
      case "settings":
        return build(FACEBOOK_PACKAGE, [
          { text: "Dating settings", bounds: [64, 60, 600, 140] },
          { desc: "Back", cls: "ImageView", click: true, bounds: [0, 60, 60, 140], tag: "back" },
          { text: "Distance", bounds: [64, 620, 600, 680] },
          { text: `${this.discovery.distance} km`, bounds: [800, 620, 1016, 680] },
          { cls: "SeekBar", desc: "Distance", bounds: DISTANCE_TRACK, tag: "slider:distance" },
          { text: "Age range", bounds: [64, 920, 600, 980] },
          { text: `${this.discovery.ageMin} - ${this.discovery.ageMax}`, bounds: [800, 920, 1016, 980] },
          { cls: "SeekBar", desc: "Age range", bounds: AGE_TRACK, tag: "slider:age" },
          { text: "Take a break", bounds: [64, 1300, 800, 1380] },
          { cls: "Switch", click: true, checked: this.breakOn, bounds: [880, 1300, 1016, 1380], tag: "break" },
        ])
      case "checkpoint":
        return build(FACEBOOK_PACKAGE, [
          { text: "Help us confirm it's you", bounds: [64, 600, 1000, 700] },
          { text: "Continue", click: true, bounds: [64, 1800, 1000, 1900] },
        ])
      case "frozen":
        return build("android", [
          { text: "Facebook isn't responding", bounds: [100, 1000, 980, 1080] },
          { text: "Close app", click: true, bounds: [100, 1200, 980, 1280] },
          { text: "Wait", click: true, bounds: [100, 1320, 980, 1400] },
        ])
      case "blank":
        return build(FACEBOOK_PACKAGE, [{ cls: "View", bounds: [0, 0, WIDTH, HEIGHT] }])
    }
  }

  /** The picture of the screen: the profile's photo, and Instagram pictures, drawn differently for each. */
  private async picture(): Promise<string> {
    const scale = 0.25
    const shapes: string[] = []
    const seed = (name: string) => Array.from(name).reduce((sum, letter) => sum + letter.charCodeAt(0), 0)
    const box = (bounds: ScreenNode["bounds"], grey: number, dot: number) => {
      const [left, top, right, bottom] = bounds.map((value) => value * scale)
      const width = right - left
      const height = bottom - top
      shapes.push(`<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="rgb(${grey},${grey},${grey})"/>`)
      shapes.push(`<circle cx="${left + width * (0.15 + ((dot * 0.37) % 0.7))}" cy="${top + height * (0.2 + ((dot * 0.23) % 0.6))}" r="${Math.min(width, height) * 0.18}" fill="white"/>`)
    }
    const person = this.screen === "weekly" ? this.weekly : this.shown()
    if (this.foreground === FACEBOOK_PACKAGE && person) {
      for (const node of this.lastNodes) {
        const tag = this.lastTags.get(node.id)
        if (tag?.startsWith("photo:")) {
          const index = Number(tag.slice(6))
          box(node.bounds, 40 + ((seed(person.name) + index * 37) % 160), seed(person.name) + index * 3)
        } else if (tag?.startsWith("insta:")) {
          box(node.bounds, 200 - ((seed(person.name) + Number(tag.slice(6)) * 53) % 120), seed(person.name) * 7 + Number(tag.slice(6)) * 5)
        }
      }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH * scale}" height="${HEIGHT * scale}"><rect width="100%" height="100%" fill="rgb(230,230,230)"/>${shapes.join("")}</svg>`
    return (await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer()).toString("base64")
  }

  private async answer(extra: Record<string, unknown>, withScreen: boolean): Promise<PhoneAnswer> {
    if (!withScreen) return { answer: extra, screenshot: null }
    const { screen, tags } = this.built()
    this.lastTags = tags
    this.lastNodes = screen.nodes
    return { answer: { ...extra, screen }, screenshot: await this.picture() }
  }

  private tagAt(x: number, y: number, nodeId?: unknown): string | undefined {
    if (typeof nodeId === "string") return this.lastTags.get(nodeId)
    const under = this.lastNodes
      .filter((node) => this.lastTags.has(node.id) && x >= node.bounds[0] && x <= node.bounds[2] && y >= node.bounds[1] && y <= node.bounds[3])
      .sort((a, b) => (a.bounds[2] - a.bounds[0]) * (a.bounds[3] - a.bounds[1]) - (b.bounds[2] - b.bounds[0]) * (b.bounds[3] - b.bounds[1]))
    return under[0] ? this.lastTags.get(under[0].id) : undefined
  }

  /** Into Dating: the weekly match first when there is one, else Suggested. A freeze or a blank shows from here, as set up. */
  private enterDating() {
    this.inDating = true
    this.page = 0
    if (this.freezes > 0) {
      this.freezes -= 1
      this.screen = "frozen"
    } else if (this.blanks > 0) {
      this.screen = "blank"
    } else {
      this.screen = this.weekly ? "weekly" : "suggested"
    }
  }

  /** After a like or pass on the profile in front: the next one, or back to the list it came from. */
  private swiped(person: FakeProfile, like: boolean) {
    if (this.screen === "suggested" || this.sheetFrom === "suggested") this.profiles = this.profiles.slice(1)
    if (this.sheetFrom === "liker" || this.screen === "liker") this.likers = this.likers.filter((liker) => liker.name !== person.name)
    if (this.sheetFrom === "passed" || this.screen === "passed") this.passed = this.passed.filter((item) => item.name !== person.name)
    const backTo: Screen = this.sheetFrom === "liker" || this.screen === "liker" ? "likes" : this.sheetFrom === "passed" || this.screen === "passed" ? "second-look" : "suggested"
    this.page = 0
    this.person = null
    this.typed = ""
    const matched = like && (person.likesBack || backTo === "likes")
    this.screen = matched ? "match" : backTo
    this.sheetFrom = backTo
  }

  private tap(tag: string | undefined) {
    if (!tag) return
    if (this.screen === "frozen" || this.screen === "blank") return
    if (tag === "post-like" || tag === "groups" || tag === "marketplace" || tag === "feed-suggested" || tag === "my-profile") {
      this.outside.push(tag)
      return
    }
    if (tag === "menu") this.screen = "menu"
    else if (tag === "dating") this.enterDating()
    else if (tag === "weekly-close") {
      this.weekly = null
      this.screen = "suggested"
    } else if (tag === "say-hi") this.outside.push("say-hi")
    else if (tag === "tab:suggested") {
      this.screen = "suggested"
      this.page = 0
    } else if (tag === "tab:likes") this.screen = "likes"
    else if (tag === "tab:matches") this.screen = "matches"
    else if (tag === "second-look") this.screen = "second-look"
    else if (tag === "settings") this.screen = "settings"
    else if (tag.startsWith("liker:")) {
      this.person = this.likers.find((liker) => liker.name === tag.slice(6)) ?? null
      this.screen = "liker"
      this.page = 0
    } else if (tag.startsWith("passed:")) {
      this.person = this.passed.find((item) => item.name === tag.slice(7)) ?? null
      this.screen = "passed"
      this.page = 0
    } else if (tag === "pass") {
      const person = this.shown()
      if (!person) return
      if (this.setup.passConfirm) {
        this.passFrom = this.screen
        this.screen = "pass-confirm"
        return
      }
      this.passedNow.push(person.name)
      this.swiped(person, false)
    } else if (tag === "like" || tag.startsWith("like-item:")) {
      const person = this.shown()
      if (!person) return
      this.sheetFrom = this.screen
      if (this.setup.likeWithoutSheet && tag === "like") {
        this.liked.push({ name: person.name, comment: "", on: "" })
        this.swiped(person, true)
        return
      }
      this.person = person
      this.typed = ""
      this.screen = "like-sheet"
      this.lastLikeOn = tag.startsWith("like-item:") ? tag.slice(10) : ""
    } else if (tag === "send-like") {
      const person = this.person as FakeProfile
      this.liked.push({ name: person.name, comment: this.typed, on: this.lastLikeOn })
      this.swiped(person, true)
    } else if (tag === "keep-browsing") {
      this.screen = this.sheetFrom === "liker" ? "likes" : this.sheetFrom === "passed" ? "second-look" : "suggested"
    } else if (tag.startsWith("row:")) {
      this.openChat = this.chats.findIndex((chat) => chat.name === tag.slice(4))
      this.typed = ""
      this.screen = "conversation"
    } else if (tag === "send") {
      const chat = this.chats[this.openChat]
      if (chat && this.typed) {
        chat.bubbles.push({ direction: "out", text: this.typed })
        this.sent.push(this.typed)
        this.typed = ""
      }
    } else if (tag === "menu-chat") this.screen = "chat-menu"
    else if (tag === "report") this.screen = "report-reasons"
    else if (tag === "reason:scam") this.screen = "report-submit"
    else if (tag === "report-submit") {
      this.reported.push(this.chats[this.openChat]?.name ?? "")
      this.screen = "report-done"
    } else if (tag === "report-close") this.screen = "conversation"
    else if (tag === "unmatch") this.screen = "unmatch-confirm"
    else if (tag === "confirm-unmatch") {
      const chat = this.chats[this.openChat]
      if (chat) this.unmatched.push(chat.name)
      this.chats = this.chats.filter((_, index) => index !== this.openChat)
      this.openChat = -1
      this.screen = "matches"
    } else if (tag === "cancel") this.screen = "conversation"
    else if (tag === "break") this.breakOn = !this.breakOn
    else if (tag === "back") this.back()
  }

  private lastLikeOn = ""
  /** Where a pass that asked "Are you sure?" came from. */
  private passFrom: Screen = "suggested"

  private back() {
    if (this.screen === "menu") this.screen = "feed"
    else if (this.screen === "liker") this.screen = "likes"
    else if (this.screen === "passed") this.screen = "second-look"
    else if (this.screen === "second-look") this.screen = "suggested"
    else if (this.screen === "like-sheet") this.screen = this.sheetFrom
    else if (this.screen === "match") this.screen = "suggested"
    else if (this.screen === "conversation") this.screen = "matches"
    else if (this.screen === "chat-menu" || this.screen === "report-reasons" || this.screen === "report-submit" || this.screen === "report-done" || this.screen === "unmatch-confirm") this.screen = "conversation"
    else if (this.screen === "pass-confirm") this.screen = this.passFrom
    else if (this.screen === "settings") this.screen = "suggested"
    else if (this.screen === "weekly") {
      this.weekly = null
      this.screen = "suggested"
    } else if (this.screen === "suggested" || this.screen === "likes" || this.screen === "matches") {
      // Back out of Dating lands on Facebook's feed.
      this.inDating = false
      this.screen = "feed"
    } else this.foreground = "home"
  }

  private drag(tag: string | undefined, x1: number, x2: number) {
    const valueAt = (track: ScreenNode["bounds"], ends: { min: number; max: number }, x: number) =>
      Math.round(ends.min + Math.min(Math.max((x - track[0]) / (track[2] - track[0]), 0), 1) * (ends.max - ends.min))
    if (tag === "slider:distance") this.discovery.distance = valueAt(DISTANCE_TRACK, ENDS.distance, x2)
    else if (tag === "slider:age") {
      const at = (value: number) => AGE_TRACK[0] + ((value - ENDS.age.min) / (ENDS.age.max - ENDS.age.min)) * (AGE_TRACK[2] - AGE_TRACK[0])
      const value = valueAt(AGE_TRACK, ENDS.age, x2)
      if (Math.abs(x1 - at(this.discovery.ageMin)) <= Math.abs(x1 - at(this.discovery.ageMax))) this.discovery.ageMin = Math.min(value, this.discovery.ageMax)
      else this.discovery.ageMax = Math.max(value, this.discovery.ageMin)
    }
  }

  drive = async (kind: PhoneActionKind, payload: Record<string, unknown>): Promise<PhoneAnswer> => {
    this.steps.push({ kind, payload })
    const thenRead = payload.thenRead === true
    switch (kind) {
      case "open-app": {
        if (this.setup.installed === false) return this.answer({ installed: false, opened: false }, false)
        if (this.foreground !== FACEBOOK_PACKAGE) {
          this.foreground = FACEBOOK_PACKAGE
          if (this.screen === "frozen") this.screen = "feed"
        }
        return this.answer({ installed: true, opened: true }, thenRead)
      }
      case "read-screen":
        // A screen still drawing has drawn by the second look, once.
        if (this.screen === "blank" && this.blanks > 0) {
          this.blanks -= 1
          if (this.blanks === 0) this.screen = this.weekly ? "weekly" : "suggested"
          else return this.answer({}, true)
        }
        return this.answer({}, true)
      case "screenshot":
        return { answer: { screenWidth: WIDTH, screenHeight: HEIGHT }, screenshot: await this.picture() }
      case "tap":
        this.tap(this.tagAt(Number(payload.x), Number(payload.y), payload.node))
        return this.answer({ done: true }, thenRead)
      case "swipe": {
        if (this.screen === "settings") {
          this.drag(this.tagAt(Number(payload.x1), Number(payload.y1)), Number(payload.x1), Number(payload.x2))
          return this.answer({ done: true }, thenRead)
        }
        const up = Number(payload.y2) < Number(payload.y1)
        if (this.screen === "suggested" || this.screen === "liker" || this.screen === "passed") this.page = up ? Math.min(this.page + 1, PROFILE_PAGES - 1) : Math.max(this.page - 1, 0)
        return this.answer({ done: true }, thenRead)
      }
      case "type": {
        const tag = typeof payload.node === "string" ? this.lastTags.get(payload.node) : undefined
        if (tag === "input" || tag === "comment") this.typed = String(payload.text)
        else throw new Error("The phone found no box to type into.")
        return this.answer({ done: true }, thenRead)
      }
      case "back":
        this.back()
        return this.answer({ done: true }, thenRead)
      case "home":
        this.foreground = "home"
        return this.answer({ done: true }, thenRead)
      case "close-app":
        this.foreground = "home"
        this.screen = "feed"
        return this.answer({ closed: true }, thenRead)
    }
  }

}

/** A profile for a test, with sensible lines, an answer, three photos and two Instagram pictures. */
export function fakeProfile(name: string, overrides: Partial<FakeProfile> = {}): FakeProfile {
  return {
    name,
    age: 29,
    distance: "12 kilometres away",
    lines: ["Nurse at St. Mike's", "Lives in Toronto"],
    question: ["My ideal Sunday", "Bakery crawl, then a long walk by the lake"],
    bio: "Climber, baker, terrible at mini golf. Looking for someone to share the last croissant with.",
    photos: 3,
    instagram: 2,
    ...overrides,
  }
}
