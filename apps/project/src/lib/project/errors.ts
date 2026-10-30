import { describeAuthError } from "@/lib/api/error-message"

/**
 * The sentences Project's server refuses with. They are thrown as the error's
 * message and shown to the person as they are, so each one says what happened
 * and, where there is one, what to do next.
 */
export const PROJECT_ERRORS = {
  noTeam: "You aren't on a team yet. The site admin adds you to one.",
  notRunningTeam: "Only the site admin can do that.",
  teamNotFound: "That team no longer exists.",
  teamNotEmpty:
    "The team still has people or open projects. Remove the people and archive the projects first.",
  noTeamNamed: "Open the team from Teams, then try again.",
  emailOnATeam: "That email is already on a team.",
  emailNotAnEmployee:
    "That email belongs to an account that isn't an employee, so it can't join a team.",
  inviteNotSent: "The invite email couldn't be sent. Check Settings → Email, then try again.",
  joinNeedsName: "Type your name.",
  joinEmailTaken:
    "That email already has an account. Ask the site admin to add it to the team instead.",
  alreadySignedIn: "They've already set their password, so there's no invite to send again.",
  onlySiteAdminSettings: "Only the site admin changes a project's settings.",
  siteAdminNoCheckin: "The site admin oversees the team, so there's no check-in to do.",
  personNotOnTeam: "That person isn't on your team.",
  projectNotFound: "That project doesn't exist or you can't see it.",
  projectArchived: "This project is archived. Bring it back to change it.",
  taskNotFound: "That task doesn't exist or you can't see it.",
  taskInBin: "That task is in the project's bin. Bring it back from the Bin to open it.",
  notProjectMember: "Tasks can only be handed to members of the project.",
  stuckNeedsReason: "Say in a line why the task is stuck.",
  notAssignee: "Only the person the task is assigned to can do that.",
  clockNotYours: "Only the person the task is assigned to, or the site admin, can run its clock.",
  nothingToHandBack: "This task wasn't handed to you by anyone.",
  cantDeleteTask: "Only the person who made the task or the site admin can delete it.",
  tooManySteps: "A task can have at most 50 steps.",
  stepNotFound: "That step no longer exists.",
  alreadyCheckedIn: "You've already checked in today. Change today's picks below.",
  notCheckedIn: "Check in first, then change today's picks.",
  answerEveryLeftover:
    "Answer each task from your last check-in: carry it over or drop it with a reason.",
  pickedAndDropped: "A task can't be picked and dropped on the same check-in.",
  taskAlreadyDone: "That task is already Done, so there's nothing to pick.",
  tooManyPicks: "One check-in can pick at most 100 tasks.",
  unknownTimeZone:
    "The server doesn't know that time zone. Pick a nearby city in the same zone.",
  tagNotOnProject: "You can only tag people who are on this project.",
  messageNotFound: "That message no longer exists.",
  notYourMessage: "Only the person who wrote a message can edit it.",
  cantDeleteMessage:
    "Only the person who wrote a message or the site admin can delete it.",
  tooManyFiles: "A task can hold at most 10 files. Delete one to add another.",
  fileTooBig: "A file can be at most 10 MB.",
  fileEmpty: "That file is empty.",
  teamFilesFull:
    "Your team has used all 5 GB of its file space. Delete some files to make room.",
  fileNotFound: "That file doesn't exist or you can't see it.",
  cantDeleteFile:
    "Only the person who added a file or the site admin can delete it.",
  fileStorageOff: "File storage isn't set up on this server yet, so files can't be added.",
  fileNotSaved: "The file couldn't be saved. Try again.",
  tooManyUploads: "That's a lot of files in a short while. Wait a few minutes, then add the rest.",
  fileNotRemoved: "The file couldn't be removed from storage, so nothing was deleted. Try again.",
  labelNotFound: "That tag no longer exists.",
  labelNameTaken: "Your team already has a tag with that name.",
  tooManyLabels: "A team can have at most 100 tags. Delete one in Team settings to make another.",
  personalProject: "That's a Just me list, which only its person and the site admin see, so it can't be shared or changed.",
  cantWaitOnItself: "A task can't wait on itself.",
  waitingLoop: "That task is already waiting on this one, so this one can't wait on it.",
  tooManyWaits: "A task can wait on at most 10 tasks. Take one off to add another.",
  reminderInThePast: "Pick today or a later day for the reminder.",
  stepListNotFound: "That step list no longer exists.",
  stepListNameTaken: "Your team already has a step list with that name.",
  tooManyStepLists: "A team can have at most 100 step lists. Delete one to save another.",
  noStepsToSave: "Add some steps first, then save them as a list.",
  behindBeforeSlowing: "Behind has to start at the same number of late tasks as Slowing down, or more.",
  leadNotMember: "Only someone on the project can lead it.",
  milestoneNotFound: "That milestone no longer exists.",
  tooManyMilestones: "A project can have at most 30 milestones.",
  wholeTeamProject:
    "Everyone on the team is on this project. Turn off \"Everyone on the team\" in Project settings first.",
  timeOffBackwards: "The last day off can't be before the first.",
  timeOffTooLong: "Time off can cover at most a year at once.",
  timeOffNotFound: "That time off no longer exists.",
  handOverToSelf: "Pick someone else to hand the tasks to.",
  joinLinkNotFound: "This join link no longer works. Ask the team for a new one.",
  joinLinkExpired: "This join link has expired. Ask the team for a new one.",
  joinLinkBusy: "Too many people have joined through this link today. Ask the team to let you in tomorrow, or for an invite.",
  tooManyLines: "Paste at most 50 lines at once, one task per line.",
  notInThisProject: "Those tasks aren't all in this project. Reload the page and try again.",
  meetingNotFound: "That meeting doesn't exist any more.",
  cantChangeMeeting:
    "Only the person who made the meeting or the site admin can change or delete it.",
  tooManyMeetings: "A team can have at most 200 meetings. Delete old ones to make another.",
  photoNotYours: "Pick a photo you uploaded yourself.",
  tooManyMeetingSaves: "That's a lot of meeting changes in an hour. Wait a while, then try again.",
  notInvitedToMeeting: "Only people invited to the meeting can answer it.",
  meetingNotOnDay: "The meeting doesn't fall on that day. Pick it again on the calendar.",
  cantChangeMeetingNotes:
    "Only the person who made the meeting or the site admin can change its notes.",
  meetingNotesChanged:
    "The task was made, but someone changed the notes meanwhile, so that line wasn't linked to it.",
  tagNotOnTeam: "You can only tag people on your team.",
  noBlockerHere: "There's no blocker there to answer.",
  stuckTaskNotYours: "Only people on that task's project can reply about it.",
  tooManyReplies: "That's a lot of replies in an hour. Wait a while, then try again.",
  notTodaysPicks: "Those tasks aren't all in today's picks. Reload the page and try again.",
  notMyTasks: "Those tasks aren't all yours any more. Reload the page and try again.",
  weekTooFarBack: "My week goes back 12 weeks at most.",
  holidayTaken: "There's already a holiday on that day.",
  holidayInThePast: "Pick today or a later day for a holiday.",
  holidayNotFound: "That holiday no longer exists.",
  tooManyHolidays: "A team can have at most 100 holidays. Delete old ones to add another.",
  cantThankYourself: "You can't thank yourself for a task.",
  nothingToThank: "Only a Done task with someone assigned can be thanked.",
  cantAskForReview: "Only the person who handed the task out or made it can ask for a review.",
  notWaitingForReview: "This task isn't waiting for a review any more.",
  cantReview: "Only the person reviewing this task or the site admin can confirm it or send it back.",
  cantAskForTime: "Only the person doing this task can ask for more time.",
  askNeedsDueDate: "This task has no due date to move. Set one yourself instead.",
  askForLaterDay: "Pick a day after the task's due date.",
  askOnDoneTask: "This task is Done, so it needs no more time.",
  noTimeAsked: "Nobody is waiting for an answer about more time on this task.",
  cantAnswerTime: "Only the person who handed this task out or the site admin can answer.",
  typeNotFound: "That task template no longer exists.",
  typeNameTaken: "Your team already has a task template with that name.",
  tooManyTypes: "A team can have at most 50 task templates.",
  typeArchived: "That task template is archived. Bring it back in Team settings to use it.",
  typeNotOffered: "This project doesn't offer that task template. Tick it in Project settings first.",
  fieldNotFound: "That field no longer exists.",
  fieldNameTaken: "This template already has a field with that name.",
  tooManyFields: "A task template can have at most 30 fields.",
  tooManyChoices: "A dropdown can have at most 50 choices.",
  choiceNameTaken: "Two choices can't have the same name.",
  choiceNotFound: "Pick one of the field's choices.",
  fieldKindLocked: "Tasks already have a value in this field, so its kind can't change.",
  showWhenWrong: "A field can only depend on a Dropdown field of the same type, and one of its choices.",
  showWhenLoop: "That dropdown already depends on this field, so this field can't depend on it.",
  fieldNotOnType: "That field isn't on this task's template.",
  fileFieldWhenMade: "A File field can't be needed when the task is made, because files are added after.",
  notAFileField: "That field doesn't take files.",
  fieldTooLong: "That's too long for this field.",
  fieldNumber: "Type a number.",
  fieldLink: "A link must start with https://.",
  fieldDate: "Pick a date from the calendar.",
  fieldValueWrong: "That value doesn't fit this field.",
  fieldPersonNotOnProject: "Pick someone who is on this project.",
  cantChangeType: "Only whoever handed the task out or the site admin can change its template.",
  messageEmpty: "Write the message or add a file first.",
  tooManyMessageFiles: "A message can carry at most 5 files. Send the rest in another message.",
  replyNotInChat: "The message you're replying to isn't in this chat any more.",
  linkNotVisible: "You can only link tasks you can see that aren't in a bin.",
  noAnnouncement: "There's no announcement up right now.",
  tooManyAnnouncements: "That's a lot of announcements in an hour. Wait a while, then post again.",
  noteVersionNotFound: "That version of the notes no longer exists.",
  notAPoll: "That message isn't a poll.",
  startAfterDue: "The start day can't be after the due day. Move the due day first.",
  dueTimeNeedsDate: "Pick a due date first, then the time it's due by.",
  planNotYours: "You can only plan your own open tasks. Close the window and open it again to see them.",
  pollInTask: "A poll goes in a project's chat, not a task's.",
  pollChoiceGone: "That choice isn't on the poll.",
  linkedAddressUnknown:
    "That address isn't a Video project or a Promo project. Copy it from the address bar while the video is open in Video's editor, or while the project is open in Promo.",
  linkedAppNotSetUp:
    "That app isn't connected to Project on this server yet. Its address and key go in Project's server settings.",
  linkedOpenNotAllowed: "Only the person the task is assigned to, or the site admin, can open its record.",
  noLinkedRecord: "This task doesn't point at a record any more. Close it and open it again.",
  linkedWhileViewingAs: "Stop viewing the app as someone else first, so the record opens as you.",
  cityNotFound: "We couldn't find that city. Try its name alone, such as Toronto.",
  weatherUnavailable: "The weather service didn't answer. Try again in a minute.",
  habitNotFound: "That habit no longer exists. Reload the page to see your habits.",
  tooManyHabits: "A routine can have at most 12 habits. Retire one to add another.",
  habitDayGone: "Only today can be ticked.",
  journalDayGone: "That day has passed, so it can't be changed now. Reload the page to see today.",
  rateFirst: "Pick how your day went, from 1 to 10, first.",
} as const

/**
 * Refusals that carry a field's own name, such as "Fill in Final cut first."
 * (`src/lib/project/task-fields.ts` writes them).
 */
const NAMED_REFUSALS = [
  /^Fill in .{1,80} first\.$/,
  /^That list has \d+ steps? and this task has room for \d+ more, since a task can have at most 50\.$/,
  /^Only (the person assigned|whoever handed the task out) or the site admin can change .{1,80}\.$/,
]

/** The shell's rate limiter refuses with this code rather than a sentence. */
const RATE_LIMITED =
  "Too many invites sent for now. Wait an hour, or ask them to check their spam folder."

const KNOWN_MESSAGES = new Set<string>(Object.values(PROJECT_ERRORS))

/** What to tell the person about a failed Project request. */
export function getProjectErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message)) return message
  if (NAMED_REFUSALS.some((pattern) => pattern.test(message))) return message
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
