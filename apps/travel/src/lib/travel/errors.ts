import { describeAuthError } from "@/lib/api/error-message"

/**
 * The sentences Travel's server refuses with. They are thrown as the error's
 * message and shown to the person as they are, so each one says what happened
 * and, where there is one, what to do next.
 */
export const TRAVEL_ERRORS = {
  tripNotFound: "That trip doesn't exist or you can't see it.",
  activityNotFound: "That activity doesn't exist or you can't see it.",
  activityInBin: "That activity is in the trip's bin. Put it back from the Bin to open it.",
  dayOutOfRange: "That day isn't on this trip. Add a day first.",
  tripsPageLocked: "The page is locked. Unlock it from the ⋮ at the top first.",
  tripsPageTooLong: "The page is too long to save. Take something off it first.",
  tooManyDays: "A trip can have at most 60 days.",
  lastDay: "A trip needs at least one day.",
  tooManyActivities: "A trip can hold at most 500 activities.",
  typeNotFound: "That activity type no longer exists.",
  otherTypeStays: "Other can't be removed. Every activity with a removed type goes there.",
  tooManyTypes: "You can have at most 30 activity types.",
  savedPlaceNotFound: "That saved place no longer exists.",
  blocksLocked: "The trip's blocks are locked. Unlock them from the trip's ⋮ first.",
  tooManySavedPlaces: "You can keep at most 500 saved places.",
  needsStartDate: "Add a start date to the trip first.",
  googleOff: "Google Maps isn't set up on this server yet. Add GOOGLE_MAPS_API_KEY to the app's settings.",
  googleFailed: "Google Maps didn't answer. Try again in a minute.",
  googleLimit: "You've used today's 100 Google lookups. Try again tomorrow.",
  linkNotAddress: "That isn't a web address. Type one like example.com.",
  linkNotHttps: "That isn't a web page's address. Type one like example.com.",
  linkPrivate: "That address points inside a private network, so it can't be shown.",
  linkNotFound: "That website couldn't be found. Check the address.",
  unsplashOff: "Unsplash isn't set up on this server yet. Add UNSPLASH_ACCESS_KEY to the app's settings.",
  unsplashFailed: "Unsplash didn't answer. Try again in a minute.",
  unsplashBadLink: "That photo didn't come from Unsplash's search. Pick it again from the search.",
  aiOff: "AI isn't set up on this server yet. Add an AI key in Settings → AI.",
  aiFailed: "The booking email couldn't be read. Check it's the whole email, then try again.",
  aiLimit: "This month's AI allowance is used up, so AI can't be used again until the 1st.",
  draftFailed: "The AI didn't send back a plan it could use. Try again in a minute.",
  fillNoFreeTime: "That day has no free time of 45 minutes or more between 8 AM and 10 PM to fill.",
  fillNothingFits: "None of the AI's ideas fit the free time on that day. Try again in a minute.",
  fillNoGaps: "No day with plans has free time of 45 minutes or more between 8 AM and 10 PM. Draft a plan fills the empty days.",
  fillNothingFitsAnywhere: "None of the AI's ideas fit the free time on those days. Try again in a minute.",
  tipsNotesFull: "This activity's notes are too long to add tips to. Shorten them, then try again.",
  tipsFailed: "The AI didn't send back tips it could use. Try again in a minute.",
  draftNeedsDestination: "Give the trip a destination first, in Trip settings, so the AI knows where to plan.",
  draftNoEmptyDays: "Every day already has something on it. A drafted plan only fills days with nothing planned.",
  bookingEmailEmpty: "Paste the booking email first.",
  bookingEmailTooLong: "A booking email can be at most 20,000 characters. Paste just the booking part.",
  pictureNeedsCredit: "An Unsplash photo needs its photographer's credit. Pick it again from the search.",
  pictureNotYours: "That picture isn't in your media library. Upload it again.",
  unknownTimeZone: "The server doesn't know that time zone. Pick a nearby city in the same zone.",
  tooManySearches: "That's a lot of searches in a short while. Wait a few minutes, then try again.",
  noteNotFound: "That note no longer exists.",
  tooManyNotes: "A trip can hold at most 200 notes. Delete one to write another.",
  notMapsLink: "That isn't a Google Maps link. Copy the link from Share in Google Maps, then paste it.",
  mapsLinkNoPlace: "Google couldn't find a place from that link. Open the place itself in Google Maps and copy its link.",
  tooManyPhotos: "A card can hold at most 30 photos. Remove one to add another.",
  ideasFailed: "The AI didn't send back places it could use. Try again in a minute.",
  ideasNoneNew: "Every place the AI suggested is already on the trip. Try again for others.",
} as const

const KNOWN_MESSAGES = new Set<string>(Object.values(TRAVEL_ERRORS))

/**
 * A place added a second time is skipped, and the person is told where the
 * first one is (More Travel features part 3; Tyler: "Skip it, say where"),
 * such as "Kinkaku-ji is already on Day 2."
 */
export function alreadyOnTripMessage(title: string, day: number | null) {
  return `${title.slice(0, 200)} is already on ${day === null ? "Ideas" : `Day ${day}`}.`
}

const ALREADY_ON_TRIP = /^[\s\S]{1,200} is already on (Ideas|Day \d{1,2})\.$/

/** True for the message `alreadyOnTripMessage` writes, so a paste can list the place as skipped, not failed. */
export function isAlreadyOnTrip(message: string) {
  return ALREADY_ON_TRIP.test(message)
}

/** What to tell the person about a failed Travel request. */
export function getTravelErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message) || isAlreadyOnTrip(message)) return message
  return describeAuthError(message) ?? firstValidationMessage(message) ?? "Something went wrong. Try again."
}

/**
 * A refused input arrives as the checker's list of issues written out as JSON.
 * The first issue's sentence is shown when it is one of ours.
 */
function firstValidationMessage(message: string): string | null {
  if (!message.startsWith("[")) return null
  try {
    const issues: unknown = JSON.parse(message)
    if (!Array.isArray(issues)) return null
    const first: unknown = issues[0]
    if (first && typeof first === "object" && "message" in first) {
      const text = (first as { message: unknown }).message
      return typeof text === "string" && !text.startsWith("Invalid") && !text.startsWith("Too") ? text : null
    }
    return null
  } catch {
    return null
  }
}
