import { describeAuthError } from "@/lib/api/error-message"

/**
 * The sentences Fitness's server refuses with. They are thrown as the error's
 * message and shown to the person as they are, so each one says what happened
 * and, where there is one, what to do next.
 */
export const FITNESS_ERRORS = {
  programNotFound: "That program doesn't exist or you can't see it.",
  programArchived: "This program is archived. Bring it back to change it.",
  routineTypeNotLive: "That routine type isn't ready yet. Pick Strength training.",
  nameNeeded: "Give it a name.",
  wrongRoutineType: "That lift belongs to another routine type, so this program can't use it.",
  exerciseNotFound: "That exercise doesn't exist or you can't see it.",
  builtInExercise: "Built-in exercises can't be changed. Add your own instead.",
  exerciseHasSets:
    "This exercise has logged sets, so it can't be deleted. Its history would go with it.",
  weekDayNotFound: "That workout day no longer exists.",
  templateNotFound: "That starter week no longer exists. Pick another.",
  planExerciseNotFound: "That exercise is no longer in the plan.",
  scheduledNotFound: "That workout is no longer on the calendar.",
  dayTaken: "There's already a workout on that day. Move that one first.",
  movePast: "A workout can only move to today or a later day.",
  workoutNotFound: "That workout doesn't exist or you can't see it.",
  notYourWorkout: "Only the person who trained can change a workout. A coach can read it.",
  nothingLogged: "Tick at least one set before finishing. A workout with nothing ticked is thrown away when you leave it.",
  workoutFinished: "This workout is finished. Open it from History to change it.",
  setNotFound: "That set no longer exists.",
  alreadyPaused: "This program is already paused.",
  notPaused: "This program isn't paused.",
  pauseOrder: "The pause has to end on or after the day it starts.",
  photoNotFound: "That photo doesn't exist or you can't see it.",
  photoTooBig: "That photo is over 15 MB. Pick a smaller one.",
  photoType: "Pick a JPEG, PNG, WebP or HEIC photo.",
  storageOff: "Photo storage isn't set up yet. The site admin turns it on in Settings, Storage.",
  importUnreadable:
    "That file isn't a Strong or Hevy export. Export it again from the app and pick the .csv file.",
  importTooManyLifts: "That file names over 300 lifts that aren't in the library. Match more of them to library lifts, or import a shorter date range.",
  pictureNotYours: "Pick a picture from your own uploads.",
  importTooBig: "That file is over 5 MB. Export a shorter date range.",
  shareOff: "This program isn't shared any more.",
  notACoach: "Only a coach can do that.",
  notYourClient: "That person isn't one of your clients.",
  clientIsYou: "You can't be your own client.",
  clientNotMember: "That email belongs to an account that can't be coached.",
  coachNotFound: "That coach is no longer linked to you.",
  aiNoKey: "AI isn't set up yet. The site admin adds a key in Settings, AI.",
  aiFailed: "The AI couldn't build a plan this time. Try again.",
} as const

const KNOWN_MESSAGES = new Set<string>(Object.values(FITNESS_ERRORS))

/** What to tell the person about a failed Fitness request. */
export function getFitnessErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  if (KNOWN_MESSAGES.has(message)) return message
  if (message.includes("RATE_LIMITED")) return "That's a lot in a short time. Wait a while, then try again."
  return describeAuthError(message) ?? firstValidationMessage(message) ?? "Something went wrong. Try again."
}

/** A refused input arrives as zod's list of issues; the first one is enough. */
function firstValidationMessage(message: string) {
  if (!message.startsWith("[")) return null
  try {
    const issues = JSON.parse(message) as { message?: string }[]
    const first = issues[0]?.message
    return first ? first : null
  } catch {
    return null
  }
}
