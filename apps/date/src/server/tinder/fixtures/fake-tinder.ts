import sharp from "sharp"

import type { PhoneActionKind } from "@/lib/dating/options"
import type { PhoneAnswer } from "@/server/phone/actions"

import type { ScreenNode } from "../screen"
import {
  AGE_TRACK,
  chatList,
  chatMenu,
  conversation,
  discover,
  discoverySettings,
  DISTANCE_TRACK,
  EDIT_TILES,
  editProfile,
  promptEditor,
  fullProfile,
  HEIGHT,
  homeScreen,
  itsAMatch,
  nobodyNew,
  otherApp,
  outOfLikes,
  outOfSuperLikes,
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
  type FakeDiscovery,
  type FakeEdit,
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
  | "prompt"
  | "verification"
  | "signed-out"
  | "super-out"
  | "settings"

export type FakeTinderSetup = {
  cards?: FakeCard[]
  chats?: Array<FakeChat & { bubbles: FakeBubble[] }>
  likesLeft?: number
  superLikesLeft?: number
  /** Tinder's own distance and ages, as its settings screen shows them. */
  discovery?: FakeDiscovery
  /** The member's own profile: how many photos, each drawn differently, and the words on the edit screen. */
  me?: { name: string; age: number; photos: number; bio?: string; prompts?: FakeEdit["prompts"]; sections?: FakeEdit["sections"] }
  /** A dragged photo swaps places with the one it is dropped on, instead of being put in front of it. */
  photoDragSwaps?: boolean
  /** Done on the edit screen leaves it without saving anything. */
  editsNotSaved?: boolean
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

/** The real ends of the pretend sliders. The walk only guesses them, and aims from what it reads back. */
const SLIDER_ENDS = { km: { min: 2, max: 160 }, mi: { min: 1, max: 100 }, age: { min: 18, max: 100 } }

/** The value under a finger on a slider track, with no room kept for the thumb, unlike the walk's guess. */
function valueAt(track: ScreenNode["bounds"], ends: { min: number; max: number }, x: number): number {
  const share = Math.min(Math.max((x - track[0]) / (track[2] - track[0]), 0), 1)
  return Math.round(ends.min + share * (ends.max - ends.min))
}

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
  /** The member's own profile as saved on Tinder. Photos are numbers, each drawn differently. */
  mine: FakeEdit
  /** What the edit screen holds before Done. */
  editing: FakeEdit
  openPrompt = -1
  promptTyped = ""
  likesLeft: number
  superLikesLeft: number
  discovery: FakeDiscovery
  liked: string[] = []
  superLiked: string[] = []
  /** Every buy button pressed. A walk must leave this empty. */
  bought: string[] = []
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
    this.superLikesLeft = setup.superLikesLeft ?? 1
    this.discovery = { ...(setup.discovery ?? { distance: 80, unit: "km", ageMin: 18, ageMax: 50 }) }
    if (setup.signedIn === false) this.screen = "signed-out"
    if (setup.verificationWall) this.screen = "verification"
    if (setup.otherAppInFront) this.foreground = setup.otherAppInFront
    const me = setup.me
    this.mine = {
      photos: Array.from({ length: me?.photos ?? 0 }, (_, index) => index),
      bio: me?.bio ?? "",
      prompts: (me?.prompts ?? []).map((prompt) => ({ ...prompt })),
      sections: me?.sections ?? [],
    }
    this.editing = this.copyOfMine()
  }

  private copyOfMine(): FakeEdit {
    return { ...this.mine, photos: [...this.mine.photos], prompts: this.mine.prompts.map((prompt) => ({ ...prompt })) }
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
        return editProfile(this.editing, this.editPage)
      case "prompt":
        return promptEditor(this.editing.prompts[this.openPrompt]?.question ?? "", this.promptTyped)
      case "verification":
        return verificationWall()
      case "signed-out":
        return signedOut()
      case "super-out":
        return outOfSuperLikes()
      case "settings":
        return discoverySettings(this.discovery)
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
      this.editing.photos.forEach((photo, index) => box(EDIT_TILES[index], 50 + photo * 40, photo * 3))
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
    } else if (tag === "super-like") {
      const card = this.card
      if (!card) return
      if (this.superLikesLeft <= 0) {
        this.screen = "super-out"
        return
      }
      this.superLikesLeft -= 1
      this.superLiked.push(card.name)
      this.cardIndex += 1
      this.photoIndex = 0
      if (card.likesBack) this.screen = "match"
    } else if (tag === "buy") {
      this.bought.push("Super Likes")
    } else if (tag === "no-thanks") {
      this.screen = "discover"
    } else if (tag === "settings") {
      this.screen = "settings"
    } else if (tag === "settings-done") {
      this.screen = "profile-tab"
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
      this.editing = this.copyOfMine()
    } else if (tag === "edit-done") {
      if (!this.setup.editsNotSaved) this.mine = this.editing
      this.editing = this.copyOfMine()
      this.screen = "profile-tab"
    } else if (tag.startsWith("prompt:")) {
      this.openPrompt = Number(tag.slice("prompt:".length))
      this.promptTyped = this.editing.prompts[this.openPrompt]?.answer ?? ""
      this.screen = "prompt"
    } else if (tag === "prompt-done") {
      const prompt = this.editing.prompts[this.openPrompt]
      if (prompt) prompt.answer = this.promptTyped
      this.screen = "edit"
    } else if (tag === "back") {
      this.back()
    }
  }

  private back() {
    if (this.screen === "profile") this.screen = "discover"
    else if (this.screen === "conversation") this.screen = "chats"
    else if (this.screen === "menu" || this.screen === "confirm") this.screen = "conversation"
    else if (this.screen === "edit") {
      // Back leaves without saving.
      this.editing = this.copyOfMine()
      this.screen = "profile-tab"
    } else if (this.screen === "prompt") this.screen = "edit"
    else if (this.screen === "match") this.screen = "discover"
    else if (this.screen === "super-out") this.screen = "discover"
    else if (this.screen === "settings") this.screen = "profile-tab"
    else this.foreground = "home"
  }

  /** A finger dragged along a slider: the distance thumb, or whichever age thumb is nearer where it started. */
  private drag(tag: string | undefined, x1: number, x2: number) {
    if (tag === "slider:distance") {
      this.discovery.distance = valueAt(DISTANCE_TRACK, SLIDER_ENDS[this.discovery.unit], x2)
    } else if (tag === "slider:age") {
      const ends = SLIDER_ENDS.age
      const at = (value: number) => AGE_TRACK[0] + ((value - ends.min) / (ends.max - ends.min)) * (AGE_TRACK[2] - AGE_TRACK[0])
      const value = valueAt(AGE_TRACK, ends, x2)
      // The thumbs never pass each other.
      if (Math.abs(x1 - at(this.discovery.ageMin)) <= Math.abs(x1 - at(this.discovery.ageMax))) this.discovery.ageMin = Math.min(value, this.discovery.ageMax)
      else this.discovery.ageMax = Math.max(value, this.discovery.ageMin)
    }
  }

  /** A photo long-pressed on one tile and let go on another: put in front of it, or swapped with it. */
  private movePhoto(from: string | undefined, to: string | undefined) {
    if (!from?.startsWith("tile:") || !to?.startsWith("tile:")) return
    const a = Number(from.slice(5))
    const b = Number(to.slice(5))
    const photos = this.editing.photos
    if (this.setup.photoDragSwaps) {
      ;[photos[a], photos[b]] = [photos[b], photos[a]]
    } else {
      const [moved] = photos.splice(a, 1)
      photos.splice(b, 0, moved)
    }
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
        if (this.screen === "settings") {
          this.drag(this.tagAt(Number(payload.x1), Number(payload.y1)), Number(payload.x1), Number(payload.x2))
          return this.answer({ done: true }, thenRead)
        }
        const up = Number(payload.y2) < Number(payload.y1)
        if (this.screen === "profile" && up) this.profilePage += 1
        if (this.screen === "chats") this.chatPage = up ? this.chatPage + 1 : Math.max(this.chatPage - 1, 0)
        if (this.screen === "edit" && Number(payload.holdMs) > 0) {
          this.movePhoto(this.tagAt(Number(payload.x1), Number(payload.y1)), this.tagAt(Number(payload.x2), Number(payload.y2)))
          return this.answer({ done: true }, thenRead)
        }
        if (this.screen === "edit") this.editPage = up ? this.editPage + 1 : Math.max(this.editPage - 1, 0)
        if (this.screen === "conversation" && !up) {
          const chat = this.chats[this.openChat]
          if (chat && (this.chatScroll + 1) * 4 < chat.bubbles.length) this.chatScroll += 1
        }
        return this.answer({ done: true }, thenRead)
      }
      case "type": {
        const tag = typeof payload.node === "string" ? this.lastTags.get(payload.node) : undefined
        if (tag === "input") this.typed = String(payload.text)
        else if (tag === "bio") this.editing.bio = String(payload.text)
        else if (tag === "prompt-answer") this.promptTyped = String(payload.text)
        else throw new Error("The phone found no box to type into.")
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
