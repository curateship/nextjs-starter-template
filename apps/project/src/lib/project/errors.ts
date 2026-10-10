import { describeAuthError } from "@/lib/api/error-message"

/**
 * The sentences Project's server refuses with. They are thrown as the error's
 * message and shown to the person as they are, so each one says what happened
 * and, where there is one, what to do next.
 */
export const PROJECT_ERRORS = {
  noTeam: "You aren't on a team yet. Create one or accept an invite first.",
  alreadyOnTeam: "You're already on a team. Leave it before joining another.",
  notRunningTeam: "Only the team's owner and admins can do that.",
  ownerCantLeave:
    "The owner can't leave. Make someone else the owner first, then leave.",
  cantChangeOwner: "The owner's role can only change by handing the team over.",
  cantRemoveYourself: "Use Leave team to remove yourself.",
  personNotOnTeam: "That person isn't on your team.",
  alreadyOnYourTeam: "That person is already on your team.",
  inviteNotFound: "This invite no longer exists. Ask for a new one.",
  inviteExpired: "This invite has expired. Ask for a new one.",
  inviteWrongEmail:
    "This invite was sent to a different email address. Sign in with that address to accept it.",
  projectNotFound: "That project doesn't exist or you can't see it.",
  projectArchived: "This project is archived. Bring it back to change it.",
  taskNotFound: "That task doesn't exist or you can't see it.",
  notProjectMember: "Tasks can only be handed to members of the project.",
  stuckNeedsReason: "Say in a line why the task is stuck.",
  notAssignee: "Only the person the task is assigned to can do that.",
  nothingToHandBack: "This task wasn't handed to you by anyone.",
  cantDeleteTask: "Only the person who made the task, the owner or an admin can delete it.",
  tooManySteps: "A task can have at most 50 steps.",
  stepNotFound: "That step no longer exists.",
} as const

/** The shell's rate limiter refuses with this code rather than a sentence. */
const RATE_LIMITED =
  "Too many invites sent for now. Wait an hour, or ask them to check their spam folder."

const KNOWN_MESSAGES = new Set<string>(Object.values(PROJECT_ERRORS))

/** What to tell the person about a failed Project request. */
export function getProjectErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message)) return message
  if (message.includes("RATE_LIMITED")) return RATE_LIMITED
  return (
    describeAuthError(message) ??
    firstValidationMessage(message) ??
    "Something went wrong. Try again."
  )
}

/**
 * A refused input arrives as the checker's list of issues written out as JSON.
 * The first issue's sentence is one of ours from `rules.ts`, so it is shown.
 */
function firstValidationMessage(message: string): string | null {
  if (!message.startsWith("[")) return null
  try {
    const issues: unknown = JSON.parse(message)
    if (!Array.isArray(issues)) return null
    const first: unknown = issues[0]
    if (first && typeof first === "object" && "message" in first) {
      const text = (first as { message: unknown }).message
      return typeof text === "string" ? text : null
    }
    return null
  } catch {
    return null
  }
}
