import { and, eq, ne } from "drizzle-orm"

import type { CardFlag, CardSource, DatingApp, MatchFlag, MessageKind } from "@/lib/dating/options"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { datePictures } from "@/server/phone/schema"
import { sha256Hex } from "@/server/phone/signing"
import { dateMatches, dateMessages, dateProfiles } from "@/server/tinder/schema"

import { dateAccounts } from "./schema"
import { messageHash } from "@/server/tinder/store"

/**
 * Sample cards and conversations, so the Dating dashboard can be looked at
 * before a phone is paired. Twelve cards and seven matches: one with a draft
 * waiting and two more to pick from, one flagged, one at five messages each
 * way, a new match with the AI's first message waiting, a date she said yes
 * to with its time and place, and a chat the AI read as over. Every row is marked as
 * a sample: the AI never reads one and no button on one reaches a phone.
 * Their pictures are simple drawings in `public/sample/dating/`, not photos of
 * anybody.
 *
 * A Facebook Dating profile gets Facebook's extras too (part 8 of
 * "facebook/01"): a like that came with a comment on Likes you, a card with
 * mutual friends, a shared group and Instagram pictures, a near miss for
 * Second Look, the weekly surprise match, someone already matched on another
 * profile, a call request, a scam to report and a photo in a chat.
 */

type SampleCard = {
  name: string
  age: number
  distance: string
  bio: string
  job: string
  school: string
  livesIn: string
  interests: string[]
  lookingFor: string
  /** Null for a card the AI has not read yet. */
  score: number | null
  read: string[]
  flags: CardFlag[]
  swipe: "none" | "like" | "pass"
  verified: boolean
  /** Facebook Dating's extras. */
  source?: CardSource
  theirComment?: string
  theirCommentOn?: string
  mutualFriends?: number
  mutualNames?: string[]
  sharedGroups?: string[]
  instagram?: boolean
  seenOn?: "passed" | "liked" | "matched" | "chatted"
}

const CARDS: SampleCard[] = [
  { name: "Maya", age: 29, distance: "3 kilometres away", bio: "Weekend climber, weekday baker. Looking for someone to split a croissant with.", job: "Graphic designer at Studio North", school: "OCAD University", livesIn: "Toronto", interests: ["Climbing", "Baking", "Film photography"], lookingFor: "Long-term partner", score: 86, read: ["A climber and baker with a playful bio.", "Outdoorsy, which you asked for.", "Nothing that clashes with your dealbreakers."], flags: [], swipe: "like", verified: true },
  { name: "Ines", age: 31, distance: "5 kilometres away", bio: "Architect. I will judge your bookshelf, kindly.", job: "Architect", school: "University of Toronto", livesIn: "Toronto", interests: ["Reading", "Cycling", "Museums"], lookingFor: "Long-term, open to short", score: 78, read: ["A reader who cycles to work.", "Dry humour in the bio.", "Lives close by."], flags: [], swipe: "like", verified: true },
  { name: "Priya", age: 27, distance: "12 kilometres away", bio: "", job: "", school: "", livesIn: "Mississauga", interests: ["Travel"], lookingFor: "Still figuring it out", score: 41, read: ["Little to go on: no bio and one line.", "Photos are mostly group shots.", "Hard to tell what she wants."], flags: ["no_bio"], swipe: "pass", verified: false },
  { name: "Clara", age: 33, distance: "2 kilometres away", bio: "Trail runner, dog person, terrible at mini golf.", job: "Nurse", school: "", livesIn: "Toronto", interests: ["Running", "Dogs", "Hiking"], lookingFor: "Long-term partner", score: 91, read: ["Runs trails and has a dog.", "Very outdoorsy, a strong fit.", "Close by and verified."], flags: [], swipe: "like", verified: true },
  { name: "Leah", age: 28, distance: "8 kilometres away", bio: "Smoke-free? Me neither. Kidding. Mostly.", job: "Bartender", school: "", livesIn: "Toronto", interests: ["Music", "Cocktails"], lookingFor: "Short-term fun", score: 22, read: ["Jokes about smoking in the bio.", "Hits your dealbreaker on smoking.", "Wants something short."], flags: ["dealbreaker"], swipe: "pass", verified: false },
  { name: "Sofia", age: 30, distance: "4 kilometres away", bio: "Learning Japanese, failing at sourdough, winning at board games.", job: "Product manager", school: "McGill University", livesIn: "Toronto", interests: ["Board games", "Languages", "Cooking"], lookingFor: "Long-term partner", score: 74, read: ["Curious, learns languages.", "Board games and cooking, a good match for dates at home.", "Clear about wanting something long-term."], flags: [], swipe: "like", verified: true },
  { name: "Hana", age: 26, distance: "6 kilometres away", bio: "Photos are all from one trip. I promise I leave the house.", job: "Teacher", school: "", livesIn: "Toronto", interests: ["Travel", "Swimming"], lookingFor: "Long-term, open to short", score: 63, read: ["Warm, self-aware bio.", "Photos all from one trip.", "Some outdoors, not much else to go on."], flags: ["photos_filtered"], swipe: "like", verified: false },
  { name: "Zoe", age: 35, distance: "1 kilometre away", bio: "Cellist. Coffee snob. Will walk anywhere.", job: "Musician", school: "The Royal Conservatory", livesIn: "Toronto", interests: ["Music", "Coffee", "Walking"], lookingFor: "Long-term partner", score: 70, read: ["A cellist who walks everywhere.", "Coffee dates would fit.", "Right at the top of your age range."], flags: [], swipe: "none", verified: true },
  { name: "Amara", age: 32, distance: "15 kilometres away", bio: "Kayaking, camping, and too many houseplants.", job: "Engineer", school: "University of Waterloo", livesIn: "Oakville", interests: ["Kayaking", "Camping", "Plants"], lookingFor: "Long-term partner", score: 88, read: ["Kayaks and camps.", "A strong outdoors fit.", "Lives a little further out."], flags: [], swipe: "like", verified: true },
  { name: "Elle", age: 24, distance: "9 kilometres away", bio: "Here for a good time. Swipe right if you have a boat.", job: "", school: "", livesIn: "Toronto", interests: ["Boats", "Parties"], lookingFor: "Short-term fun", score: 18, read: ["Wants something casual.", "Little in common with what you wrote.", "Photos look heavily edited."], flags: ["photos_generated"], swipe: "pass", verified: false },
  { name: "Noor", age: 29, distance: "3 kilometres away", bio: "Bouldering most evenings. Ask me about my worst fall.", job: "Data analyst", school: "York University", livesIn: "Toronto", interests: ["Bouldering", "Podcasts", "Ramen"], lookingFor: "Long-term partner", score: 84, read: ["Boulders most evenings.", "Shares your love of the outdoors.", "Funny, easy opener in her bio."], flags: [], swipe: "like", verified: true },
  { name: "Ruth", age: 30, distance: "7 kilometres away", bio: "Gardener, reader of very long novels, maker of very short jokes.", job: "Librarian", school: "", livesIn: "Toronto", interests: ["Gardening", "Reading"], lookingFor: "Long-term partner", score: null, read: [], flags: [], swipe: "none", verified: false },
]

type SampleChat = {
  cardIndex: number
  messages: Array<["in" | "out", string] | ["in" | "out", string, MessageKind]>
  draft?: string
  draftKind?: "reply" | "opener" | "nudge"
  /** Two more drafts, as "Show 3" leaves them. */
  choices?: string[]
  flagged?: MatchFlag
  proposed?: boolean
  unread?: number
  facts?: string[]
  /** Their line saying the chat is over. */
  ended?: string
  /** They said yes to the date: their line, number, and the time and place set, in days from now. */
  accepted?: { line: string; number: string; inDays: number | null; place: string; brief: string[] }
}

const CHATS: SampleChat[] = [
  {
    cardIndex: 0,
    messages: [
      ["out", "A croissant split is a big commitment. Almond or plain?"],
      ["in", "Almond, obviously. Plain is for cowards"],
      ["out", "Bold. Where's the best one in the city?"],
    ],
  },
  {
    cardIndex: 1,
    messages: [
      ["out", "Okay, what's the first thing you'd judge on my bookshelf?"],
      ["in", "Whether the spines are broken. Unread books make me nervous"],
      ["out", "Mine are cracked to bits, I read in the bath"],
      ["in", "That's a different crime entirely"],
    ],
    draft: "Fair. I'll plead guilty to the bath and innocent to everything else. What are you reading right now?",
    choices: ["Bath reading is a sport. What's on your nightstand?", "I'll take that as a compliment to my commitment"],
    facts: ["An architect", "Judges bookshelves by their spines"],
    unread: 1,
  },
  {
    cardIndex: 8,
    messages: [
      ["in", "Hey! Nice paddling photo"],
      ["out", "Thanks! Georgian Bay last summer"],
      ["in", "are you a bot? your replies are suspiciously fast"],
    ],
    flagged: "asked_if_bot",
    unread: 1,
  },
  {
    cardIndex: 10,
    messages: [
      ["out", "Okay I have to ask. Worst fall?"],
      ["in", "Off the top of a V3 onto a crash pad that wasn't there"],
      ["out", "That's not a fall, that's a story"],
      ["in", "Haha I still have the bruise to prove it"],
      ["out", "Where do you climb?"],
      ["in", "Basecamp mostly, sometimes the Junction"],
      ["out", "No way, Basecamp is mine too"],
      ["in", "Then how have we never met"],
      ["out", "I'm the one falling off the purple route"],
      ["in", "I've definitely watched you fall then"],
    ],
    draft: "We should fix that properly. Drink after a climb sometime? I'm on 416 555 0100 if that's easier",
    proposed: false,
    facts: ["Climbs at Basecamp, sometimes the Junction", "Fell off a V3 onto a missing crash pad"],
    unread: 1,
  },
  {
    // A new match nobody has written to: the AI's first message waits.
    cardIndex: 3,
    messages: [],
    draft: "Terrible at mini golf is a bold claim. Worst hole you've ever played?",
    draftKind: "opener",
  },
  {
    // A date she said yes to, with a time and place set, warming up as it went.
    cardIndex: 5,
    messages: [
      ["out", "How's the sourdough going?"],
      ["in", "Badly"],
      ["out", "Name the starter, it helps"],
      ["in", "It's called Gerald now"],
      ["out", "Gerald sounds reliable"],
      ["in", "Gerald has let me down twice this week but I believe in him"],
      ["out", "Board game rec while Gerald rises?"],
      ["in", "Cascadia, every time. I'll teach you, I'm very patient and only slightly competitive"],
      ["out", "Deal. Coffee and a game sometime? I'm on 416 555 0100"],
      ["in", "Yes! I'd love that. I'm 647 555 0182, text me and we'll pick a day"],
      ["out", "Texting you now"],
      ["in", "Got it! Thursday works for me, there's a board game cafe on Bloor I love"],
    ],
    proposed: true,
    facts: ["Learning Japanese", "Her sourdough starter is called Gerald", "Favourite board game is Cascadia"],
    accepted: {
      line: "Yes! I'd love that. I'm 647 555 0182, text me and we'll pick a day",
      number: "647 555 0182",
      inDays: 3,
      place: "Snakes & Lattes, Bloor St",
      brief: ["Her sourdough starter is called Gerald", "She'll teach you Cascadia", "Learning Japanese"],
    },
  },
  {
    // A chat the AI read as over.
    cardIndex: 6,
    messages: [
      ["out", "Which trip were all the photos from?"],
      ["in", "Lisbon! Best week of my life"],
      ["out", "Lisbon's on my list. Drink sometime and you can sell me on it?"],
      ["in", "Sorry, I've started seeing someone. Good luck though!"],
    ],
    ended: "Sorry, I've started seeing someone. Good luck though!",
  },
]

/**
 * Facebook Dating's own samples, after the twelve above. They reuse the
 * twelve drawings, so their pictures are the drawing of the card numbered
 * the same less twelve.
 */
const FACEBOOK_CARDS: SampleCard[] = [
  { name: "Mila", age: 30, distance: "4 kilometres away", bio: "Croissant ranker, river swimmer, owner of one opinionated cat.", job: "Pastry chef", school: "", livesIn: "Toronto", interests: ["Baking", "Swimming", "Cats"], lookingFor: "Long-term partner", score: 82, read: ["A pastry chef who swims in the lake.", "Liked you first, with a question.", "Close by."], flags: [], swipe: "none", verified: true, source: "likes_you", theirComment: "Okay but which bakery is the best one?", theirCommentOn: "answer" },
  { name: "Lena", age: 28, distance: "6 kilometres away", bio: "My cat has more followers than me and she knows it.", job: "Vet tech", school: "", livesIn: "Toronto", interests: ["Animals", "Hiking"], lookingFor: "Long-term, open to short", score: 67, read: ["Funny bio about her cat.", "Close to what you want, just under your line.", "Lives nearby."], flags: [], swipe: "pass", verified: false },
  { name: "Tess", age: 27, distance: "5 kilometres away", bio: "Teacher by day, karaoke menace by night.", job: "Teacher", school: "", livesIn: "Toronto", interests: ["Karaoke", "Hiking"], lookingFor: "Long-term partner", score: 76, read: ["A teacher who loves karaoke.", "Facebook's surprise match this week.", "Easy first message: her song."], flags: [], swipe: "none", verified: true, source: "weekly" },
  { name: "Rosa", age: 31, distance: "3 kilometres away", bio: "Runner, reader, Sunday market regular.", job: "Physiotherapist", school: "", livesIn: "Toronto", interests: ["Running", "Markets"], lookingFor: "Long-term partner", score: 80, read: ["Runs and reads.", "Sunday markets fit your weekends.", "Asked for a call already."], flags: [], swipe: "like", verified: true },
  { name: "Vera", age: 26, distance: "18 kilometres away", bio: "Crypto, travel, good vibes only.", job: "Entrepreneur", school: "", livesIn: "Mississauga", interests: ["Crypto", "Travel"], lookingFor: "Short-term fun", score: 30, read: ["Vague bio about crypto.", "Few real details.", "Far away."], flags: [], swipe: "like", verified: false },
]

/** What Facebook adds to the twelve: mutual friends, a group and Instagram on Zoe; Ruth already met on another profile. */
const FACEBOOK_TOUCHES: Record<number, Partial<SampleCard>> = {
  7: { mutualFriends: 2, mutualNames: ["Sam", "Priya"], sharedGroups: ["Toronto Climbers"], instagram: true },
  11: { seenOn: "matched" },
}

const FACEBOOK_CHATS: SampleChat[] = [
  {
    // The weekly surprise match: the AI's first message waits.
    cardIndex: 14,
    messages: [],
    draft: "Facebook says we're this week's surprise. Important question first: what's your karaoke song?",
    draftKind: "opener",
  },
  {
    cardIndex: 15,
    messages: [
      ["out", "Which market is the Sunday one?"],
      ["in", "St. Lawrence, every week"],
      ["in", "Want to FaceTime tonight instead of all this typing?"],
    ],
    flagged: "asked_for_call",
    unread: 1,
  },
  {
    cardIndex: 16,
    messages: [
      ["in", "Hey handsome"],
      ["out", "Hi Vera! How's your week going?"],
      ["in", "I can't talk here, add me on Telegram and can you send $40 for a gift card?"],
    ],
    flagged: "scam",
    unread: 1,
  },
]

const samplePath = (card: number, photo: number) => `/sample/dating/person-${String((card % 12) + 1).padStart(2, "0")}-${photo}.svg`

/** Whose samples: the profile they go into, its app, and its member and site. */
export type SampleOwner = { id: string; userId: string; workspaceId: string; app?: DatingApp }

/**
 * Adds the sample cards and conversations to one profile. Any already there
 * are removed first, so pressing it twice never doubles them. The drawings
 * are kept once per member, so two profiles' samples share them.
 */
export async function addSamples(account: SampleOwner, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  await removeSamples(account, db)
  const { userId, workspaceId } = account
  const facebook = account.app === "facebook"
  const cards = facebook ? [...CARDS.map((card, index) => ({ ...card, ...FACEBOOK_TOUCHES[index] })), ...FACEBOOK_CARDS] : CARDS
  const chats = facebook ? [...CHATS.map((chat, index) => (index === 0 ? { ...chat, messages: [...chat.messages, ["in", "Sent a photo", "photo"] as ["in", string, MessageKind]] } : chat)), ...FACEBOOK_CHATS] : CHATS
  // Clara liked you first on Facebook, with a comment the opener answers.
  if (facebook) {
    cards[3] = { ...cards[3], source: "likes_you", theirComment: "Your dog has better photos than you do", theirCommentOn: "photo" }
    chats[4] = { ...chats[4], draft: "In my defence, he's had more practice. What's your dog's name?" }
  }
  // Ruth was matched on the member's other profile, when there is one.
  const [other] = facebook
    ? await db.select({ id: dateAccounts.id }).from(dateAccounts).where(and(eq(dateAccounts.userId, userId), eq(dateAccounts.workspaceId, workspaceId), ne(dateAccounts.id, account.id))).limit(1)
    : []

  const pictureIds = new Map<string, string>()
  for (let card = 0; card < CARDS.length; card += 1) {
    for (const photo of [1, 2]) {
      const path = samplePath(card, photo)
      const sha256 = sha256Hex(`sample:${path}`)
      await db.insert(datePictures).values({ id: uuid(), userId, kind: "sample", sha256, samplePath: path, createdAt: now }).onConflictDoNothing()
      const [kept] = await db.select({ id: datePictures.id }).from(datePictures).where(and(eq(datePictures.userId, userId), eq(datePictures.sha256, sha256))).limit(1)
      pictureIds.set(path, kept.id)
    }
  }

  const profileIds: string[] = []
  for (const [index, card] of cards.entries()) {
    const id = uuid()
    profileIds.push(id)
    const readAt = new Date(now.getTime() - (cards.length - index) * 7 * 60_000)
    const scored = card.score !== null
    await db.insert(dateProfiles).values({
      id,
      userId,
      workspaceId,
      accountId: account.id,
      phoneId: null,
      name: card.name,
      age: card.age,
      distance: card.distance,
      verified: card.verified,
      bio: card.bio,
      job: card.job,
      school: card.school,
      livesIn: card.livesIn,
      sections: [
        ...(card.bio ? [{ heading: "About me", items: [card.bio] }] : []),
        { heading: "Looking for", items: [card.lookingFor] },
        { heading: "Interests", items: card.interests },
      ],
      handles: {},
      texts: [card.distance, card.job, card.school, `Lives in ${card.livesIn}`, card.bio, ...card.interests].filter(Boolean),
      photoIds: [pictureIds.get(samplePath(index, 1)) as string, pictureIds.get(samplePath(index, 2)) as string],
      fingerprint: sha256Hex(`sample:${card.name}`),
      readAt,
      swipe: card.swipe,
      swipedBy: card.swipe === "none" ? null : "ai",
      swipedAt: card.swipe === "none" ? null : new Date(readAt.getTime() + 20_000),
      aiScore: scored ? card.score : null,
      aiRead: card.read,
      aiFlags: card.flags,
      aiDealbreakers: card.flags.includes("dealbreaker") ? ["Smokers"] : [],
      aiReadAt: scored ? new Date(readAt.getTime() + 10_000) : null,
      source: card.source ?? "card",
      theirComment: card.theirComment ?? "",
      theirCommentOn: card.theirCommentOn ?? "",
      mutualFriends: card.mutualFriends ?? null,
      mutualNames: card.mutualNames ?? [],
      sharedGroups: card.sharedGroups ?? [],
      instagramPhotoIds: card.instagram ? [pictureIds.get(samplePath(index + 1, 1)) as string] : [],
      seenOnAccountId: card.seenOn ? (other?.id ?? null) : null,
      seenOnOutcome: card.seenOn ?? null,
      sample: true,
      createdAt: readAt,
      updatedAt: readAt,
    })
  }

  for (const [index, chat] of chats.entries()) {
    const card = cards[chat.cardIndex]
    const matchId = uuid()
    const matchedAt = new Date(now.getTime() - (chats.length - index) * 3 * 3_600_000)
    const lastAt = new Date(now.getTime() - (chats.length - index) * 20 * 60_000)
    const fromThem = chat.messages.filter(([direction]) => direction === "in").length
    const accepted = chat.accepted
    const dateAt = accepted?.inDays != null ? new Date(new Date(now.getTime() + accepted.inDays * 86_400_000).setHours(19, 0, 0, 0)) : null
    await db.insert(dateMatches).values({
      id: matchId,
      userId,
      workspaceId,
      accountId: account.id,
      phoneId: null,
      profileId: profileIds[chat.cardIndex],
      theirName: card.name,
      photoId: pictureIds.get(samplePath(chat.cardIndex, 1)) ?? null,
      matchedAt,
      lastMessageAt: chat.messages.length ? lastAt : null,
      lastPreview: chat.messages[chat.messages.length - 1]?.[1] ?? "",
      unreadCount: chat.unread ?? 0,
      messagesFromThem: fromThem,
      messagesFromUs: chat.messages.length - fromThem,
      draft: chat.draft ?? "",
      draftMadeAt: chat.draft ? lastAt : null,
      draftProposesDate: Boolean(chat.draft && /drink|coffee|number|\d{3} \d{3}/i.test(chat.draft)),
      draftKind: chat.draftKind ?? "reply",
      draftOpenerStyle: chat.draftKind === "opener" ? "prompt_question" : null,
      draftChoices: chat.choices ?? [],
      flaggedReason: chat.flagged ?? null,
      dateProposedAt: chat.proposed ? lastAt : null,
      facts: (chat.facts ?? []).map((text) => ({ id: uuid(), text, edited: false })),
      endedAt: chat.ended ? lastAt : null,
      endedLine: chat.ended ?? "",
      dateAcceptedAt: accepted ? lastAt : null,
      dateAcceptedLine: accepted?.line ?? "",
      theirNumber: accepted?.number ?? "",
      dateAt,
      datePlace: dateAt ? (accepted?.place ?? "") : "",
      briefLines: accepted?.brief ?? [],
      briefMadeAt: accepted ? lastAt : null,
      sample: true,
      createdAt: matchedAt,
      updatedAt: lastAt,
    })
    for (const [position, [direction, text, kind]] of chat.messages.entries()) {
      // Their answers come sooner as a chat warms up: the gaps shrink from about 40 minutes to 5.
      const at = new Date(matchedAt.getTime() + chat.messages.slice(0, position + 1).reduce((sum, _, step) => sum + Math.max(5, 40 - step * 4), 0) * 60_000)
      await db.insert(dateMessages).values({
        id: uuid(),
        userId,
        matchId,
        direction,
        sentBy: direction === "in" ? "them" : position % 3 === 2 ? "ai" : "member",
        kind: kind ?? "text",
        text,
        hash: messageHash(text),
        status: "sent",
        position: position + 1,
        sentAt: at,
        createdAt: at,
      })
    }
  }
}

/**
 * Deletes one profile's sample cards and conversations, and nothing else.
 * The drawings go once no profile of the member's has samples left.
 */
export async function removeSamples(account: SampleOwner, db: CustomShellDb = defaultDb): Promise<void> {
  await db.delete(dateMatches).where(and(eq(dateMatches.accountId, account.id), eq(dateMatches.sample, true)))
  await db.delete(dateProfiles).where(and(eq(dateProfiles.accountId, account.id), eq(dateProfiles.sample, true)))
  const [left] = await db
    .select({ id: dateProfiles.id })
    .from(dateProfiles)
    .where(and(eq(dateProfiles.userId, account.userId), eq(dateProfiles.sample, true)))
    .limit(1)
  // Sample pictures are drawings with no file in R2, so the rows are all there is to remove.
  if (!left) await db.delete(datePictures).where(and(eq(datePictures.userId, account.userId), eq(datePictures.kind, "sample")))
}
