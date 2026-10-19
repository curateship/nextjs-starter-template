import sharp from "sharp"

import type { PhoneActionKind } from "@/lib/dating/options"
import type { PhoneAnswer } from "@/server/phone/actions"

import type { ScreenNode } from "../screen"
import {
  chatList,
  chatMenu,
  conversation,
  discover,
  EDIT_TILES,
  editProfile,
  fullProfile,
  HEIGHT,
  homeScreen,
  itsAMatch,
  nobodyNew,
  otherApp,
  outOfLikes,
  PHOTO_BOX,
  profileTab,
  signedOut,
  unmatchConfirm,
  verificationWall,
  WIDTH,
  type BuiltScreen,
  type FakeBubble,
  type FakeCard,
  type FakeChat,
} from "./screens"

/**
 * A pretend Tinder on a pretend phone, for the walk tests. It answers each
 * plain action the way the Date app on a real phone would: it changes its
 * screen for a tap, a swipe, back or typing, and sends back the screen and a
 * picture of it. Photos are drawn as a grey square with a white dot whose
 * place moves from photo to photo, so two photos never look the same.
 */

type Screen =
  | "discover"
  | "profile"
  | "match"
  | "out-of-likes"
  | "chats"
  | "conversation"
  | "menu"
  | "confirm"
  | "profile-tab"
  | "edit"
  | "verification"
  | "signed-out"

export type FakeTinderSetup = {
  cards?: FakeCard[]
  chats?: Array<FakeChat & { bubbles: FakeBubble[] }>
  likesLeft?: number
  me?: { name: string; age: number; photos: number; pages: string[][] }
  installed?: boolean
  signedIn?: boolean
  verificationWall?: boolean
  /** Another app stays in front, as if the phone was picked up. */
  otherAppInFront?: string
  /** Send is tapped but the message never shows in the chat. */
  sendSwallowed?: boolean
}

/** How much smaller the pictures are than the screen. */
const SCALE = 0.25

export class FakeTinder {
  screen: Screen = "discover"
  foreground = "com.tinder"
  cards: FakeCard[]
  chats: Array<FakeChat & { bubbles: FakeBubble[] }>
  cardIndex = 0
  photoIndex = 0
  profilePage = 0
  chatPage = 0
  openChat = -1
  chatScroll = 0
  editPage = 0
  typed = ""
  likesLeft: number
  liked: string[] = []
  passed: string[] = []
  unmatched: string[] = []
  sent: string[] = []
  steps: Array<{ kind: PhoneActionKind; payload: Record<string, unknown> }> = []
  private lastTags = new Map<string, string>()
  private lastNodes: ScreenNode[] = []

  private setup: FakeTinderSetup

  constructor(setup: FakeTinderSetup = {}) {
    this.setup = setup
    this.cards = setup.cards ?? []
    this.chats = setup.chats ?? []
    this.likesLeft = setup.likesLeft ?? 100
    if (setup.signedIn === false) this.screen = "signed-out"
    if (setup.verificationWall) this.screen = "verification"
    if (setup.otherAppInFront) this.foreground = setup.otherAppInFront
  }

  get card(): FakeCard | undefined {
    return this.cards[this.cardIndex]
  }

  private built(): BuiltScreen {
    if (this.foreground !== "com.tinder") {
      return this.foreground === "home" ? homeScreen() : otherApp(this.foreground)
    }
    switch (this.screen) {
      case "discover":
        return this.card ? discover(this.card) : nobodyNew()
      case "profile":
        return fullProfile(this.card as FakeCard, this.profilePage)
      case "match":
        return itsAMatch(this.cards[this.cardIndex - 1]?.name ?? "")
      case "out-of-likes":
        return outOfLikes()
      case "chats":
        return chatList(this.chats, this.chatPage)
      case "conversation": {
        const chat = this.chats[this.openChat]
        return conversation(chat.name, chat.bubbles, this.chatScroll * 4, this.typed)
      }
      case "menu":
        return chatMenu()
      case "confirm":
        return unmatchConfirm(this.chats[this.openChat]?.name ?? "")
      case "profile-tab":
        return profileTab(this.setup.me?.name ?? "Tyler", this.setup.me?.age ?? 30)
      case "edit":
        return editProfile(this.setup.me?.photos ?? 0, this.editPage, this.setup.me?.pages ?? [])
      case "verification":
        return verificationWall()
      case "signed-out":
        return signedOut()
    }
  }

  /** The picture of the screen: plain grey, with the card's photo or the chat pictures drawn in. */
  private async picture(): Promise<string> {
    const shapes: string[] = []
    const box = (bounds: ScreenNode["bounds"], grey: number, dot: number) => {
      const [left, top, right, bottom] = bounds.map((value) => value * SCALE)
      const width = right - left
      const height = bottom - top
      shapes.push(`<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="rgb(${grey},${grey},${grey})"/>`)
      const cx = left + width * (0.15 + ((dot * 0.37) % 0.7))
      const cy = top + height * (0.2 + ((dot * 0.23) % 0.6))
      shapes.push(`<circle cx="${cx}" cy="${cy}" r="${Math.min(width, height) * 0.18}" fill="white"/>`)
    }
    const seed = (name: string) => Array.from(name).reduce((sum, letter) => sum + letter.charCodeAt(0), 0)
    if (this.foreground === "com.tinder" && this.screen === "discover" && this.card) {
      box(PHOTO_BOX, 40 + (seed(this.card.twinOf ? `${this.card.name}-twin` : this.card.name) % 120), this.photoIndex + seed(this.card.name))
    }
    if (this.foreground === "com.tinder" && this.screen === "chats") {
      for (const node of this.lastNodes) {
        const tag = this.lastTags.get(node.id)
        if (tag?.startsWith("avatar:")) box(node.bounds, 60 + (seed(tag) % 150), seed(tag))
      }
    }
    if (this.foreground === "com.tinder" && this.screen === "edit" && this.editPage === 0) {
      EDIT_TILES.slice(0, this.setup.me?.photos ?? 0).forEach((bounds, index) => box(bounds, 50 + index * 40, index * 3))
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH * SCALE}" height="${HEIGHT * SCALE}"><rect width="100%" height="100%" fill="rgb(230,230,230)"/>${shapes.join("")}</svg>`
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
    // The smallest box under the finger that does something.
    const under = this.lastNodes
      .filter((node) => this.lastTags.has(node.id) && x >= node.bounds[0] && x <= node.bounds[2] && y >= node.bounds[1] && y <= node.bounds[3])
      .sort((a, b) => (a.bounds[2] - a.bounds[0]) * (a.bounds[3] - a.bounds[1]) - (b.bounds[2] - b.bounds[0]) * (b.bounds[3] - b.bounds[1]))
    return under[0] ? this.lastTags.get(under[0].id) : undefined
  }

  private tap(tag: string | undefined, x: number) {
    if (!tag) return
    if (tag === "photo") {
      const card = this.card
      if (!card) return
      this.photoIndex = x > WIDTH / 2 ? Math.min(this.photoIndex + 1, card.photos - 1) : Math.max(this.photoIndex - 1, 0)
    } else if (tag === "open-profile" || tag === "name") {
      this.screen = "profile"
      this.profilePage = 0
    } else if (tag === "close-profile") {
      this.screen = "discover"
    } else if (tag === "like" || tag === "pass") {
      const card = this.card
      if (!card) return
      if (tag === "like" && this.likesLeft <= 0) {
        this.screen = "out-of-likes"
        return
      }
      if (tag === "like") {
        this.likesLeft -= 1
        this.liked.push(card.name)
      } else {
        this.passed.push(card.name)
      }
      this.cardIndex += 1
      this.photoIndex = 0
      if (tag === "like" && card.likesBack) this.screen = "match"
    } else if (tag === "keep-swiping") {
      this.screen = "discover"
    } else if (tag === "tab:discover") {
      this.screen = "discover"
    } else if (tag === "tab:chat") {
      this.screen = "chats"
      this.chatPage = 0
    } else if (tag === "tab:profile") {
      this.screen = "profile-tab"
    } else if (tag.startsWith("row:") || tag.startsWith("avatar:")) {
      const name = tag.slice(tag.indexOf(":") + 1)
      this.openChat = this.chats.findIndex((chat) => chat.name === name)
      this.screen = "conversation"
      this.chatScroll = 0
      this.typed = ""
    } else if (tag === "send") {
      const chat = this.chats[this.openChat]
      if (chat && this.typed) {
        if (!this.setup.sendSwallowed) {
          chat.bubbles.push({ direction: "out", text: this.typed })
          this.sent.push(this.typed)
        }
        this.typed = ""
      }
    } else if (tag === "menu") {
      this.screen = "menu"
    } else if (tag === "unmatch") {
      this.screen = "confirm"
    } else if (tag === "confirm-unmatch") {
      const chat = this.chats[this.openChat]
      if (chat) this.unmatched.push(chat.name)
      this.chats = this.chats.filter((_, index) => index !== this.openChat)
      this.openChat = -1
      this.screen = "chats"
    } else if (tag === "edit-profile") {
      this.screen = "edit"
      this.editPage = 0
    } else if (tag === "back") {
      this.back()
    }
  }

  private back() {
    if (this.screen === "profile") this.screen = "discover"
    else if (this.screen === "conversation") this.screen = "chats"
    else if (this.screen === "menu" || this.screen === "confirm") this.screen = "conversation"
    else if (this.screen === "edit") this.screen = "profile-tab"
    else if (this.screen === "match") this.screen = "discover"
    else this.foreground = "home"
  }

  /** The phone's side of one plain action. */
  drive = async (kind: PhoneActionKind, payload: Record<string, unknown>): Promise<PhoneAnswer> => {
    this.steps.push({ kind, payload })
    const thenRead = payload.thenRead === true
    switch (kind) {
      case "open-app": {
        if (this.setup.installed === false) return this.answer({ installed: false, opened: false }, false)
        if (!this.setup.otherAppInFront) this.foreground = "com.tinder"
        return this.answer({ installed: true, opened: true }, thenRead)
      }
      case "read-screen":
        return this.answer({}, true)
      case "screenshot":
        return { answer: { screenWidth: WIDTH, screenHeight: HEIGHT }, screenshot: await this.picture() }
      case "tap":
        this.tap(this.tagAt(Number(payload.x), Number(payload.y), payload.node), Number(payload.x))
        return this.answer({ done: true }, thenRead)
      case "swipe": {
        const up = Number(payload.y2) < Number(payload.y1)
        if (this.screen === "profile" && up) this.profilePage += 1
        if (this.screen === "chats") this.chatPage = up ? this.chatPage + 1 : Math.max(this.chatPage - 1, 0)
        if (this.screen === "edit" && up) this.editPage += 1
        if (this.screen === "conversation" && !up) {
          const chat = this.chats[this.openChat]
          if (chat && (this.chatScroll + 1) * 4 < chat.bubbles.length) this.chatScroll += 1
        }
        return this.answer({ done: true }, thenRead)
      }
      case "type": {
        const tag = typeof payload.node === "string" ? this.lastTags.get(payload.node) : undefined
        if (tag !== "input") throw new Error("The phone found no box to type into.")
        this.typed = String(payload.text)
        return this.answer({ done: true }, thenRead)
      }
      case "back":
        this.back()
        return this.answer({ done: true }, thenRead)
      case "home":
        this.foreground = "home"
        return this.answer({ done: true }, thenRead)
    }
  }
}

/** A card for a test, with sensible lines and a two-screen profile. */
export function fakeCard(name: string, overrides: Partial<FakeCard> = {}): FakeCard {
  return {
    name,
    age: 27,
    distance: "3 kilometres away",
    verified: true,
    lines: ["Graphic designer at Studio North", "University of Toronto"],
    profilePages: [
      [`${name} 27`, "About me", `Coffee first, then climbing. Looking for someone to explore the city's bakeries with.`, "Looking for", "Long-term partner"],
      ["Looking for", "Long-term partner", "Interests", "Climbing", "Baking", "Instagram", `${name.toLowerCase()}.draws`, "Top Spotify Artists", "Phoebe Bridgers", "Bon Iver"],
      ["Top Spotify Artists", "Phoebe Bridgers", "Bon Iver"],
    ],
    photos: 4,
    likesBack: false,
    ...overrides,
  }
}
