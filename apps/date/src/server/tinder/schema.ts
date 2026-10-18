import { boolean, index, integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core"

import type {
  CardFlag,
  MatchFlag,
  MessageSender,
  MessageStatus,
  SwipeDecision,
  WalkKind,
  WalkStatus,
} from "@/lib/dating/options"
import { datePhones } from "@/server/phone/schema"
import { customShellUsers, customShellWorkspaces } from "@/server/schema"

/**
 * What Date reads off Tinder and does there: the cards it read, the matches
 * and their messages, the member's own profile, and the job list of walks.
 * The SQL is `drizzle/0097_date_tinder.sql`. Stored fields are never renamed.
 */

/** One section of a profile as Tinder lays it out, such as "About me" or "Interests". */
export type ProfileSection = { heading: string; items: string[] }

/** Accounts a card links to. Empty when the card shows none. */
export type ProfileHandles = { instagram?: string; spotifyArtists?: string[]; anthem?: string }

/** The AI's suggestions for the member's own profile. Suggestions only; nothing is changed on the phone. */
export type OwnProfileReview = {
  photoOrder: Array<{ photo: number; why: string }>
  bio: string
  notes: string[]
}

/** One card read off Tinder's Discover screen. */
export const dateProfiles = pgTable(
  "date_profiles",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    /** Null for sample cards, which no phone read. */
    phoneId: varchar("phone_id", { length: 36 }).references(() => datePhones.id, { onDelete: "set null" }),
    name: varchar("name", { length: 120 }).notNull(),
    age: integer("age"),
    /** As Tinder words it, such as "3 kilometres away". */
    distance: varchar("distance", { length: 60 }).notNull().default(""),
    verified: boolean("verified").notNull().default(false),
    bio: text("bio").notNull().default(""),
    job: text("job").notNull().default(""),
    school: text("school").notNull().default(""),
    livesIn: text("lives_in").notNull().default(""),
    sections: jsonb("sections").$type<ProfileSection[]>().notNull().default([]),
    handles: jsonb("handles").$type<ProfileHandles>().notNull().default({}),
    /** Every line read off the card and its profile, in order, so the AI sees all of it. */
    texts: jsonb("texts").$type<string[]>().notNull().default([]),
    photoIds: jsonb("photo_ids").$type<string[]>().notNull().default([]),
    /** The same person read twice before a swipe is one card, told by name, age and first photo. */
    fingerprint: varchar("fingerprint", { length: 64 }).notNull().default(""),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
    swipe: varchar("swipe", { length: 10 }).$type<SwipeDecision>().notNull().default("none"),
    swipedBy: varchar("swiped_by", { length: 10 }).$type<"member" | "ai">(),
    swipedAt: timestamp("swiped_at", { withTimezone: true }),
    aiScore: integer("ai_score"),
    aiRead: jsonb("ai_read").$type<string[]>().notNull().default([]),
    aiFlags: jsonb("ai_flags").$type<CardFlag[]>().notNull().default([]),
    /** The member's own dealbreakers this card hits, in the AI's words. */
    aiDealbreakers: jsonb("ai_dealbreakers").$type<string[]>().notNull().default([]),
    aiReadAt: timestamp("ai_read_at", { withTimezone: true }),
    /** When an AI read was started, so two passes never pay for the same card twice. */
    aiStartedAt: timestamp("ai_started_at", { withTimezone: true }),
    /** Why the AI's last try at this card failed, in words, or empty. */
    aiError: text("ai_error").notNull().default(""),
    sample: boolean("sample").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_date_profiles_user_read").on(table.userId, table.workspaceId, table.readAt.desc())]
)

/** One match: a person who liked back, and the conversation with them. */
export const dateMatches = pgTable(
  "date_matches",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    phoneId: varchar("phone_id", { length: 36 }).references(() => datePhones.id, { onDelete: "set null" }),
    /** The card this match came from, when Date read and swiped it. */
    profileId: varchar("profile_id", { length: 36 }).references(() => dateProfiles.id, { onDelete: "set null" }),
    theirName: varchar("their_name", { length: 120 }).notNull(),
    photoId: varchar("photo_id", { length: 36 }),
    /** A fingerprint of their picture in the chat list, telling two people of one name apart. */
    avatarHash: varchar("avatar_hash", { length: 16 }).notNull().default(""),
    matchedAt: timestamp("matched_at", { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    /** The last line the chat list showed, to notice a new message without opening the chat. */
    lastPreview: text("last_preview").notNull().default(""),
    /** The chat list showed something new; the conversation is read on the next pass. */
    needsRead: boolean("needs_read").notNull().default(false),
    unreadCount: integer("unread_count").notNull().default(0),
    messagesFromThem: integer("messages_from_them").notNull().default(0),
    messagesFromUs: integer("messages_from_us").notNull().default(0),
    draft: text("draft").notNull().default(""),
    draftMadeAt: timestamp("draft_made_at", { withTimezone: true }),
    /** The message the draft answers. A newer message from them means a new draft. */
    draftForMessageId: varchar("draft_for_message_id", { length: 36 }),
    draftProposesDate: boolean("draft_proposes_date").notNull().default(false),
    /** With the automate switch on: when the AI's draft goes out, 10 to 90 minutes after theirs. */
    draftSendAt: timestamp("draft_send_at", { withTimezone: true }),
    aiStartedAt: timestamp("ai_started_at", { withTimezone: true }),
    /** Why the AI's last draft failed, in words, or empty. */
    aiError: text("ai_error").notNull().default(""),
    flaggedReason: varchar("flagged_reason", { length: 20 }).$type<MatchFlag>(),
    /** The fact about the member the AI needs before it can answer. */
    askQuestion: text("ask_question").notNull().default(""),
    dateProposedAt: timestamp("date_proposed_at", { withTimezone: true }),
    unmatchedAt: timestamp("unmatched_at", { withTimezone: true }),
    sample: boolean("sample").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_date_matches_user").on(table.userId, table.workspaceId, table.lastMessageAt.desc())]
)

/** One message in a match's conversation, theirs or ours, in the order Tinder shows them. */
export const dateMessages = pgTable(
  "date_messages",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    matchId: varchar("match_id", { length: 36 })
      .notNull()
      .references(() => dateMatches.id, { onDelete: "cascade" }),
    direction: varchar("direction", { length: 3 }).$type<"in" | "out">().notNull(),
    sentBy: varchar("sent_by", { length: 10 }).$type<MessageSender>().notNull(),
    text: text("text").notNull(),
    /** The words' hash, so the same message is never sent twice. */
    hash: varchar("hash", { length: 64 }).notNull(),
    status: varchar("status", { length: 10 }).$type<MessageStatus>().notNull().default("sent"),
    /** Why it was not sent, in words. */
    error: text("error").notNull().default(""),
    proposesDate: boolean("proposes_date").notNull().default(false),
    /** Its place in the conversation; larger is later. */
    position: integer("position").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_date_messages_match").on(table.matchId, table.position)]
)

/** The member's own Tinder profile as last read, and the AI's suggestions for it. One per phone. */
export const dateOwnProfiles = pgTable("date_own_profile", {
  phoneId: varchar("phone_id", { length: 36 })
    .primaryKey()
    .references(() => datePhones.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => customShellUsers.id, { onDelete: "cascade" }),
  workspaceId: varchar("workspace_id", { length: 36 })
    .notNull()
    .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull().default(""),
  photoIds: jsonb("photo_ids").$type<string[]>().notNull().default([]),
  bio: text("bio").notNull().default(""),
  sections: jsonb("sections").$type<ProfileSection[]>().notNull().default([]),
  texts: jsonb("texts").$type<string[]>().notNull().default([]),
  readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  review: jsonb("review").$type<OwnProfileReview | null>(),
  reviewMadeAt: timestamp("review_made_at", { withTimezone: true }),
  aiStartedAt: timestamp("ai_started_at", { withTimezone: true }),
  aiError: text("ai_error").notNull().default(""),
})

/**
 * The job list: one Tinder walk for one phone. The dashboard and the AI ask
 * for walks here and nowhere else, and a phone runs one walk at a time.
 * `leaseUntil` is how long the process running it may keep it; a walk past
 * its lease was dropped by a restart and is marked stopped part-way.
 */
export const dateWalks = pgTable(
  "date_walks",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    phoneId: varchar("phone_id", { length: 36 })
      .notNull()
      .references(() => datePhones.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 30 }).$type<WalkKind>().notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    status: varchar("status", { length: 20 }).$type<WalkStatus>().notNull().default("waiting"),
    result: jsonb("result").$type<Record<string, unknown> | null>(),
    error: text("error").notNull().default(""),
    askedBy: varchar("asked_by", { length: 10 }).$type<"member" | "ai">().notNull(),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [index("ix_date_walks_phone").on(table.phoneId, table.status, table.createdAt)]
)
