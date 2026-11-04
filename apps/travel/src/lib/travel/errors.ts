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
  tooManyDays: "A trip can have at most 60 days.",
  lastDay: "A trip needs at least one day.",
  tooManyActivities: "A trip can hold at most 500 activities.",
  typeNotFound: "That activity type no longer exists.",
  otherTypeStays: "Other can't be removed. Every activity with a removed type goes there.",
  tooManyTypes: "You can have at most 30 activity types.",
  savedPlaceNotFound: "That saved place no longer exists.",
  tooManySavedPlaces: "You can keep at most 500 saved places.",
  needsStartDate: "Add a start date to the trip first.",
  googleOff: "Google Maps isn't set up on this server yet. Add GOOGLE_MAPS_API_KEY to the app's settings.",
  googleFailed: "Google Maps didn't answer. Try again in a minute.",
  unsplashOff: "Unsplash isn't set up on this server yet. Add UNSPLASH_ACCESS_KEY to the app's settings.",
  unsplashFailed: "Unsplash didn't answer. Try again in a minute.",
  unsplashBadLink: "That photo didn't come from Unsplash's search. Pick it again from the search.",
  aiOff: "AI isn't set up on this server yet. Add an AI key in Settings → AI.",
  aiFailed: "The booking email couldn't be read. Check it's the whole email, then try again.",
  aiLimit: "This month's AI allowance is used up, so AI can't be used again until the 1st.",
  draftFailed: "The AI didn't send back a plan it could use. Try again in a minute.",
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
  undoGone: "That can't be undone any more. The activities have changed since.",
} as const

const KNOWN_MESSAGES = new Set<string>(Object.values(TRAVEL_ERRORS))

/** What to tell the person about a failed Travel request. */
export function getTravelErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message)) return message
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
