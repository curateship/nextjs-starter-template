import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core"

import type {
  CardFlag,
  CardSource,
  DraftKind,
  MatchFlag,
  OpenerStyle,
  MessageKind,
  MessageSender,
  MessageStatus,
  SwipeDecision,
  WalkKind,
  WalkStatus,
} from "@/lib/dating/options"
import { dateAccounts } from "@/server/dating/schema"
import { datePhones } from "@/server/phone/schema"
import { customShellUsers, customShellWorkspaces } from "@/server/schema"

/**
 * What Date reads off Tinder and does there: the cards it read, the matches
 * and their messages, the member's own profile, and the job list of walks.
 * The SQL is `drizzle/0097_date_tinder.sql`, `drizzle/0100_date_chats.sql`,
 * `drizzle/0103_date_first_look_model.sql` and
 * `drizzle/0104_date_forget_passed_photos.sql`, and the own profile's Apply
 * and Undo `drizzle/0109_date_profile_apply.sql`. Every record belongs to one
 * profile (`accountId`, `drizzle/0108_date_profiles.sql`), and goes with it.
 * Facebook Dating's additions (task "facebook/01") are `drizzle/0115` to
 * `drizzle/0122`. Stored fields are never renamed.
 */

/** One section of a profile as Tinder lays it out, such as "About me" or "Interests". */
export type ProfileSection = { heading: string; items: string[] }

/** Accounts a card links to. Empty when the card shows none. */
export type ProfileHandles = { instagram?: string; spotifyArtists?: string[]; anthem?: string }

/**
 * One thing a match told the member, read from the chat. `edited` means the
 * member wrote or changed it, so the AI leaves it alone. A fact the member
 * deleted is kept as `deleted`, hidden, so the AI does not add it back.
 */
export type MatchFact = { id: string; text: string; edited: boolean; deleted?: boolean }

/** One of the member's Tinder prompts: the question Tinder asks and their answer. */
export type ProfilePrompt = { question: string; answer: string }

/**
 * The AI's suggestions for the member's own profile. Nothing changes on the
 * phone until the member presses Apply on one of them.
 */
export type OwnProfileReview = {
  /** The photos as they stood when the AI looked, which `photoOrder` numbers from 1. */
  photoIds: string[]
  photoOrder: Array<{ photo: number; why: string }>
  bio: string
  /** A new answer for each prompt, or `keep` when the old one is better or About me is too thin to answer from. */
  prompts: Array<{ question: string; answer: string; keep: boolean }>
  notes: string[]
}

/**
 * One change the phone can make to the member's own profile: the photo
 * order (as picture ids), the bio, or one prompt's answer. The same shape
 * holds what was there before an Apply, for Undo.
 */
export type OwnProfileChange =
  | { kind: "photos"; photoIds: string[] }
  | { kind: "bio"; bio: string }
  | { kind: "prompt"; question: string; answer: string }

/** What happened to the same person on another of the member's profiles (part 15 of "facebook/01"). */
export type SeenOutcome = "passed" | "liked" | "matched" | "chatted"

/** One card read off the app's cards, Facebook's Likes you list or its weekly match. */
export const dateProfiles = pgTable(
  "date_profiles",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    accountId: varchar("account_id", { length: 36 })
      .notNull()
      .references(() => dateAccounts.id, { onDelete: "cascade" }),
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
    /** A pass's photos were deleted 30 days after it, and `photoIds` emptied. The name, age, score and read stay. */
    photosForgottenAt: timestamp("photos_forgotten_at", { withTimezone: true }),
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
    /** The model whose score counts: the first look's, or Opus's when it looked again. Null when no AI read the card. */
    aiModel: varchar("ai_model", { length: 40 }),
    /** When an AI read was started, so two passes never pay for the same card twice. */
    aiStartedAt: timestamp("ai_started_at", { withTimezone: true }),
    /** Why the AI's last try at this card failed, in words, or empty. */
    aiError: text("ai_error").notNull().default(""),
    sample: boolean("sample").notNull().default(false),
    /** Where the card came from: the cards in front, Facebook's Likes you list, or its weekly surprise match (0115). */
    source: varchar("source", { length: 12 }).$type<CardSource>().notNull().default("card"),
    /** The comment they sent with their like, and the photo or answer it was on (0115, part 16). */
    theirComment: text("their_comment").notNull().default(""),
    theirCommentOn: text("their_comment_on").notNull().default(""),
    /** The comment the AI wrote and sent with our like, and what it was about (0116, part 10). */
    likeComment: text("like_comment").notNull().default(""),
    likeCommentOn: text("like_comment_on").notNull().default(""),
    /** Mutual friends Facebook shows, null when it shows none; their names when shown, and the groups you share (0117, part 11). */
    mutualFriends: integer("mutual_friends"),
    mutualNames: jsonb("mutual_names").$type<string[]>().notNull().default([]),
    sharedGroups: jsonb("shared_groups").$type<string[]>().notNull().default([]),
    /** The Instagram pictures the card shows, given to the AI as extra photos (0118, part 12). */
    instagramPhotoIds: jsonb("instagram_photo_ids").$type<string[]>().notNull().default([]),
    /** The member liked this card from Second Look after the AI passed it (0119, part 14). */
    secondLookAt: timestamp("second_look_at", { withTimezone: true }),
    /** The first photo's look, to find the same person on the member's other profiles (0120, part 15). */
    faceHash: varchar("face_hash", { length: 16 }).notNull().default(""),
    seenOnAccountId: varchar("seen_on_account_id", { length: 36 }),
    seenOnOutcome: varchar("seen_on_outcome", { length: 10 }).$type<SeenOutcome>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ix_date_profiles_user_read").on(table.userId, table.workspaceId, table.readAt.desc()),
    index("ix_date_profiles_account_read").on(table.accountId, table.readAt.desc()),
  ]
)

/** One match: a person who liked back, and the conversation with them. */
export const dateMatches = pgTable(
  "date_matches",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    accountId: varchar("account_id", { length: 36 })
      .notNull()
      .references(() => dateAccounts.id, { onDelete: "cascade" }),
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
    /** Who unmatched: the member, through the dashboard, or them, seen as gone from Tinder's chat list. */
    unmatchedBy: varchar("unmatched_by", { length: 10 }).$type<"member" | "them">(),
    /** Complete reads of the chat list in a row that did not show this match. Two mean they unmatched. */
    missingReads: integer("missing_reads").notNull().default(0),
    /** What they told you, read from the chat by the AI. The member may edit or delete each one. */
    facts: jsonb("facts").$type<MatchFact[]>().notNull().default([]),
    /** The chat's messages up to this place have been read for facts and a yes to a date. */
    notesReadThrough: integer("notes_read_through").notNull().default(0),
    notesStartedAt: timestamp("notes_started_at", { withTimezone: true }),
    /** What the waiting draft is: an answer, a first message, or the one follow-up on a quiet chat. */
    draftKind: varchar("draft_kind", { length: 10 }).$type<DraftKind>().notNull().default("reply"),
    /** An opener's kind, so Date can count which kinds get replies. */
    draftOpenerStyle: varchar("draft_opener_style", { length: 20 }).$type<OpenerStyle>(),
    /** Two more drafts "Show 3" wrote. Automate never sends these; it sends `draft`. */
    draftChoices: jsonb("draft_choices").$type<string[]>().notNull().default([]),
    /**
     * The message the member dismissed the AI's draft for, or "opener" for a
     * first message. The background pass writes no new draft until a newer
     * message moves the chat on.
     */
    draftDismissedFor: varchar("draft_dismissed_for", { length: 36 }),
    /** The one follow-up on a quiet chat was drafted. There is never a second. */
    nudgedAt: timestamp("nudged_at", { withTimezone: true }),
    /** The AI read the chat as over, and the line of theirs that says so. */
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endedLine: text("ended_line").notNull().default(""),
    /** They said yes to the drink or coffee the member offered, and the number they sent, if any. */
    dateAcceptedAt: timestamp("date_accepted_at", { withTimezone: true }),
    dateAcceptedLine: text("date_accepted_line").notNull().default(""),
    theirNumber: varchar("their_number", { length: 40 }).notNull().default(""),
    movedToTextAt: timestamp("moved_to_text_at", { withTimezone: true }),
    /** The brief before a date: three lines from the chat, picked once. */
    briefLines: jsonb("brief_lines").$type<string[]>().notNull().default([]),
    briefMadeAt: timestamp("brief_made_at", { withTimezone: true }),
    /** The date's time and place, typed by the member. The AI never sets these. */
    dateAt: timestamp("date_at", { withTimezone: true }),
    datePlace: text("date_place").notNull().default(""),
    /** The event Date made in the member's Google Calendar for this date. */
    googleEventId: varchar("google_event_id", { length: 200 }).notNull().default(""),
    /** The member took this chat over: the AI writes nothing here. */
    aiOff: boolean("ai_off").notNull().default(false),
    /** The member's note to the AI about this chat only. */
    memberNote: text("member_note").notNull().default(""),
    /** The phone reported them to Facebook as a scam and unmatched (0122, part 20). */
    reportedAt: timestamp("reported_at", { withTimezone: true }),
    sample: boolean("sample").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ix_date_matches_user").on(table.userId, table.workspaceId, table.lastMessageAt.desc()),
    index("ix_date_matches_account").on(table.accountId, table.lastMessageAt.desc()),
  ]
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
    /** A photo, voice note, sticker, video or GIF is kept as what it was, with words saying so in `text` (0121, part 17). */
    kind: varchar("kind", { length: 10 }).$type<MessageKind>().notNull().default("text"),
    text: text("text").notNull(),
    /** The words' hash, so the same message is never sent twice. */
    hash: varchar("hash", { length: 64 }).notNull(),
    status: varchar("status", { length: 10 }).$type<MessageStatus>().notNull().default("sent"),
    /** Why it was not sent, in words. */
    error: text("error").notNull().default(""),
    proposesDate: boolean("proposes_date").notNull().default(false),
    /** Its place in the conversation; larger is later. */
    position: integer("position").notNull(),
    /** The AI's draft as it stood when the member pressed Send. Equal to `text` means sent unchanged. */
    draftText: text("draft_text"),
    /** An opener's kind, carried from the draft it was sent from. */
    openerStyle: varchar("opener_style", { length: 20 }).$type<OpenerStyle>(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_date_messages_match").on(table.matchId, table.position)]
)

/** The member's own profile on the app as last read, and the AI's suggestions for it. One per profile. */
export const dateOwnProfiles = pgTable("date_own_profile", {
  accountId: varchar("account_id", { length: 36 })
    .primaryKey()
    .references(() => dateAccounts.id, { onDelete: "cascade" }),
  phoneId: varchar("phone_id", { length: 36 })
    .notNull()
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
  /** What the last Apply replaced, for Undo. Cleared once Undo has put it back. */
  before: jsonb("before").$type<OwnProfileChange | null>(),
  /** When each change was last applied by the phone, by `changeKey`, as ISO times. */
  appliedAt: jsonb("applied_at").$type<Record<string, string>>().notNull().default({}),
})

/**
 * The first-photo test, one row per week: each of the member's top 3 photos
 * is put first for a week, and the likes and matches of that week are
 * counted. The rows of one test share `testId`. `drizzle/0111_date_photo_tests.sql`.
 */
export const datePhotoTests = pgTable(
  "date_photo_tests",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    testId: varchar("test_id", { length: 36 }).notNull(),
    accountId: varchar("account_id", { length: 36 })
      .notNull()
      .references(() => dateAccounts.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    /** 1, 2 or 3: the photo's place in the order when the test started, and the week it is first. */
    place: integer("place").notNull(),
    photoId: varchar("photo_id", { length: 36 }).notNull(),
    /** The whole order when the test started, as picture ids. The same on every row of one test. */
    originalOrder: jsonb("original_order").$type<string[]>().notNull().default([]),
    /** The phone read the photo back first, and its week began. */
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    likes: integer("likes").notNull().default(0),
    matches: integer("matches").notNull().default(0),
    /** The week with the most matches per 100 likes, put first when the test ends. */
    winner: boolean("winner").notNull().default(false),
    /** The phone read the winner back first. Only on the winner's row. */
    putFirstAt: timestamp("put_first_at", { withTimezone: true }),
    /** The member stopped the test. Set on every row of the test. */
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    /** After a stop, the phone read the original order back. Set on every row of the test. */
    restoredAt: timestamp("restored_at", { withTimezone: true }),
    /** When the phone was last asked to move a photo for this row, so a failed move is tried again an hour later, not every pass. */
    askedAt: timestamp("asked_at", { withTimezone: true }),
    /** Why the last move could not be put on the phone's list, in words, or empty. */
    moveError: text("move_error").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ix_date_photo_tests_account").on(table.accountId, table.createdAt.desc()),
    uniqueIndex("ux_date_photo_tests_week").on(table.testId, table.place),
  ]
)

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
    accountId: varchar("account_id", { length: 36 })
      .notNull()
      .references(() => dateAccounts.id, { onDelete: "cascade" }),
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
