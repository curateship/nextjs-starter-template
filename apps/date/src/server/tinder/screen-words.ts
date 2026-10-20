import type { NodeMatch } from "./screen"

/**
 * Every word, spoken label and view id the walks look for on Tinder's
 * screens, in one place.
 *
 * **Written before any real phone was read.** On 18 Oct 2026 there was no
 * phone yet, so these come from how Tinder's Android app is known to label
 * itself: its old view ids (`com.tinder:id/gamepad_like` and the rest) and
 * the words on its buttons. Each thing has several candidates so one renamed
 * label does not break a walk. The first run on the real phone is the proof:
 * a walk that cannot find a box stops with a picture of the screen, and the
 * fix is a line here. `workspace/docs/tinder/walks.md` says how to read a real
 * screen and refresh these.
 */

const r = (pattern: string) => new RegExp(pattern, "i")

export const TINDER_WORDS = {
  /** The heart button under a card. */
  like: {
    res: ["com.tinder:id/gamepad_like", "com.tinder:id/like_button"],
    desc: ["Like", r("^like( button)?$")],
  },
  /** The cross under a card. */
  pass: {
    res: ["com.tinder:id/gamepad_pass", "com.tinder:id/pass_button"],
    desc: ["Nope", "Pass", r("^(nope|pass)( button)?$")],
  },
  /** The star under a card. */
  superLike: {
    res: ["com.tinder:id/gamepad_super_like", "com.tinder:id/super_like_button"],
    desc: ["Super Like", r("^super ?like( button)?$")],
  },
  /**
   * Tinder's screen when the day's free Super Likes are gone, which offers to
   * sell more. The walk shuts it and likes the card instead; it never presses
   * anything on it but a way out.
   */
  superLikesGone: {
    text: [r("out of super ?likes"), r("(get|buy) (more )?super ?likes"), r("no super ?likes left")],
    desc: [r("out of super ?likes")],
  },
  /** Opens the full profile of the card in front. */
  openProfile: {
    res: ["com.tinder:id/recs_card_info_button", "com.tinder:id/info_button"],
    desc: [r("^(open|view|show) (full )?profile"), r("^profile info$"), r("^more info$"), r("^info$")],
  },
  /** Shuts the full profile and goes back to the card. */
  closeProfile: {
    res: ["com.tinder:id/profile_close_button", "com.tinder:id/collapse_button"],
    desc: [r("^(close|collapse)( profile)?$"), r("^back to (card|recs|swiping)$"), r("^hide profile$")],
  },
  /** The bottom tabs. */
  tabDiscover: {
    res: ["com.tinder:id/tab_recs", "com.tinder:id/navigation_recs"],
    desc: [r("^(home|discover|tinder|swipe|recs)$")],
  },
  tabChat: {
    res: ["com.tinder:id/tab_matches", "com.tinder:id/navigation_matches"],
    desc: [r("^(chat|chats|messages|matches)$")],
  },
  tabProfile: {
    res: ["com.tinder:id/tab_profile", "com.tinder:id/navigation_profile"],
    desc: [r("^(profile|my profile|account)$")],
  },
  /** On the Profile tab. */
  editProfile: {
    res: ["com.tinder:id/edit_profile_button"],
    desc: [r("^edit (profile|info)$")],
    text: [r("^edit (profile|info)$")],
  },
  /** The gear on the Profile tab that opens Tinder's settings, where the distance and ages are. */
  openSettings: {
    res: ["com.tinder:id/settings_button", "com.tinder:id/profile_settings"],
    desc: [r("^settings$"), r("^open settings$")],
    text: [r("^settings$")],
  },
  /** The distance slider's heading and the age slider's heading in Tinder's settings. */
  distanceHeading: { text: [r("^maximum distance$"), r("^distance preference$"), r("^distance$")] },
  ageHeading: { text: [r("^age range$"), r("^age preference$"), r("^show ages$")] },
  distanceSlider: { res: ["com.tinder:id/distance_seekbar", "com.tinder:id/discovery_distance_slider"] },
  ageSlider: { res: ["com.tinder:id/age_range_seekbar", "com.tinder:id/discovery_age_slider"] },
  /** Leaves Tinder's settings, which keeps what was set. */
  settingsDone: { text: [r("^done$")], desc: [r("^(done|navigate up|back)$")] },
  /** The section headings on the chat list. */
  newMatchesHeading: { text: [r("^new matches$")] },
  messagesHeading: { text: [r("^messages$")] },
  /** In a conversation. */
  messageInput: {
    res: ["com.tinder:id/chat_input_text", "com.tinder:id/message_input"],
    desc: [r("^(type a message|message)$")],
    text: [r("^type a message$")],
    hint: [r("^(type a message|message|say something)")],
  },
  send: {
    res: ["com.tinder:id/chat_send_button", "com.tinder:id/send_button"],
    desc: ["Send", r("^send( message)?$")],
    text: ["Send"],
  },
  chatMenu: {
    res: ["com.tinder:id/chat_toolbar_menu", "com.tinder:id/safety_toolkit_button"],
    desc: [r("^(more options|options|menu|safety toolkit|report or unmatch)$")],
  },
  unmatch: { text: [r("^unmatch( from .+)?$")], desc: [r("^unmatch$")] },
  confirmUnmatch: { text: [r("^(yes, )?unmatch$"), r("^confirm$"), r("^yes$")] },
  /** The full-screen "It's a Match!" and its way out. */
  matchScreen: { text: [r("it'?s a match"), r("^you matched")], desc: [r("it'?s a match")] },
  keepSwiping: {
    text: [r("^keep swiping$"), r("^back to tinder$"), r("^not now$")],
    desc: [r("^(close|keep swiping)$")],
  },
  /** Offers Tinder shows between cards, closed without buying anything. */
  dismissOffer: {
    text: [r("^(no thanks|maybe later|not now|not interested|skip|dismiss)$")],
    desc: [r("^(close|dismiss|no thanks)$")],
  },
} satisfies Record<string, NodeMatch>

/**
 * Lines on a card or profile that are Tinder's own words rather than the
 * person's, left out of what is stored as the card's text.
 */
export const TINDER_CHROME_LINES = [
  r("^tinder$"),
  r("^recently active$"),
  r("^active (now|today)$"),
  r("^(new here|nearby)$"),
  r("^(like|nope|pass|super like|rewind|boost)$"),
  r("^(home|discover|explore|likes|chat|chats|messages|matches|profile)$"),
  r("^report .+$"),
  r("^share .+'s profile$"),
  r("^block .+$"),
]

/** Where a line says how far away someone is: "3 kilometres away", "12 miles away". */
export const DISTANCE_LINE = r("^\\d+\\s*(miles?|mi|kilomet(re|er)s?|km)\\s+away$")

/** A card's name line, "Maya 27" or "Maya, 27", when the age is on the same line. */
export const NAME_AGE_LINE = /^(.+?)[,\s]+(\d{2})$/

/** The badge on a verified card. */
export const VERIFIED_LABEL = { desc: [r("^(photo )?verified$"), r("verified badge")] } satisfies NodeMatch

/**
 * Headings Tinder puts over parts of a full profile. A line matching one of
 * these starts a section; the lines under it are its items.
 */
export const SECTION_HEADINGS = [
  "About me",
  "Looking for",
  "Relationship goals",
  "Relationship type",
  "Basics",
  "More about me",
  "Lifestyle",
  "Interests",
  "Passions",
  "Languages I know",
  "Lives in",
  "Job title",
  "Company",
  "School",
  "Instagram",
  "Top Spotify Artists",
  "My anthem",
  "Pronouns",
  "Prompts",
] as const

/** Screens where Tinder has nobody new to show. Not an error: the loop pauses with these words. */
export const NOBODY_NEW = [
  r("(there'?s|there is) no one new around you"),
  r("you'?ve seen everyone"),
  r("out of (potential )?matches"),
  r("expand your (distance|search|settings)"),
  r("we'?ve run out of"),
]

/**
 * Words in a chat that are Tinder's, not a message: the date lines between
 * messages, "Sent" and "Seen". A date line is a whole line of day and time,
 * such as "Today 7:42 PM" or "Sat 3:15 PM", so a message that only starts
 * with a day, such as "Saturday?", is still a message.
 */
export const CHAT_CHROME_LINES = [
  r("^(today|yesterday)$"),
  r("^(today|yesterday|mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\\s+\\d{1,2}:\\d{2}\\s*(am|pm)?$"),
  r("^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\s+\\d{1,2}(,\\s*\\d{4})?(,?\\s+\\d{1,2}:\\d{2}\\s*(am|pm)?)?$"),
  r("^\\d{1,2}:\\d{2}\\s*(am|pm)?$"),
  r("^\\d{1,2}/\\d{1,2}(/\\d{2,4})?(,?\\s+\\d{1,2}:\\d{2}\\s*(am|pm)?)?$"),
  r("^(sent|seen|delivered|read)( \\d.*)?$"),
  r("^you matched with .+"),
  r("^type a message$"),
  r("^send$"),
]

/** A slider's value as Tinder writes it beside the slider: "25 km", "16 mi", "100+ km". */
export const DISTANCE_VALUE = /^(\d{1,3})\+?\s*(km|mi|kilomet(?:re|er)s?|miles?)\+?$/i

/** The age slider's value: "28 - 36", "28-36", "28 – 55+". */
export const AGE_RANGE_VALUE = /^(\d{2})\s*[-–]\s*(\d{2,3})\+?$/

/**
 * The ends of Tinder's two sliders, guessed until a real phone reads them:
 * the distance from 2 to 160 kilometres (1 to 100 miles) and the ages from 18
 * to 100. They are only used to aim. The walk corrects its aim from what each
 * move reads back, so a wrong guess costs a few more moves, not a wrong
 * setting. A value past the slider's real end is set to the end.
 */
export const TINDER_SLIDERS = {
  km: { min: 2, max: 160 },
  mi: { min: 1, max: 100 },
  age: { min: 18, max: 100 },
} as const
