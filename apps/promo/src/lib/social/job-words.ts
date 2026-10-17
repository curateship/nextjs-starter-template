import { formatDuration } from "@/lib/format/format-time"
import { WRITE_JOB_KINDS, type JobKind, type JobStatus } from "@/lib/social/options"
import { whenText } from "@/lib/social/wording"

/**
 * The words the Jobs dashboard uses for the browser program's queue.
 * Kept apart from the reads so each sentence is tested on its own.
 */

/**
 * How long the browser program may go without checking in before it counts
 * as stopped. It checks in every 15 seconds, so this is eight missed turns:
 * long enough that one slow database answer never reads as a stop.
 */
export const PROGRAM_STALE_MS = 2 * 60_000

/** What each kind of job does, as a person would say it. */
export const JOB_KIND_WORDS: Record<JobKind, string> = {
  search: "Search a keyword",
  thread: "Read a post's replies",
  comment: "Post a comment",
  reply: "Answer a reply",
  open: "Open a browser",
  close: "Close a browser",
  check: "See who is signed in",
  site_check: "Check what websites see",
  backup: "Back up a profile",
  restore: "Restore a profile",
  health: "Read karma and age",
  rules: "Read a subreddit's rules",
  comment_check: "Check a sent comment",
  profile_check: "Look at the profile as a stranger",
  warm_up: "Warm-up visit",
  submit: "Post of your own",
  delete_comment: "Delete a sent comment",
  edit_comment: "Edit a sent comment",
  help_read: "Read posts to help with",
  promo_threads: "Find a self-promotion thread",
  forget: "Delete a profile's sign-in",
  comment_link: "Find a phone comment's link",
  app_post: "Post a photo or video",
  app_profile: "Change a profile",
  inbox_read: "Read messages and comments",
  inbox_reply: "Answer a message or comment",
}

/**
 * A failed job that is safe to run again from the Jobs dashboard. Anything that
 * writes to Reddit is not: it may have gone out before it failed, so it is
 * tried again from the Comments screen, where the words are put back and
 * Post still needs a press.
 */
export function canRetryJob(kind: JobKind): boolean {
  return !WRITE_JOB_KINDS.includes(kind)
}

export type JobStatusInput = {
  status: JobStatus
  attempts: number
  maxAttempts: number
  lastError: string
  claimedAt: Date | null
  runAfter: Date | null
  finishedAt: Date | null
  /** Another job in the same browser is running, so this one waits its turn. */
  laneBusy: boolean
}

/**
 * One line on where a job has got to. A waiting job always says what it is
 * waiting for, because "queued" on its own is how searches sat for a day with
 * nobody able to tell why.
 */
export function jobStatusText(
  job: JobStatusInput,
  programRunning: boolean,
  now: Date = new Date()
): string {
  switch (job.status) {
    case "running":
      return job.claimedAt
        ? `Running for ${formatDuration(now.getTime() - job.claimedAt.getTime())}`
        : "Running"
    case "done":
      return "Done"
    case "failed":
      return job.lastError || "Failed, with no reason given."
    default: {
      if (!programRunning) return "Waiting. The browser program is not running."
      if (job.runAfter && job.runAfter > now) return `Waits until ${whenText(job.runAfter, now)}`
      if (job.laneBusy) return "Waits for the job ahead of it in the same browser"
      if (job.attempts > 0) {
        return `Try ${job.attempts + 1} of ${job.maxAttempts} next. Last try: ${job.lastError || "no reason given"}`
      }
      return "Next in line"
    }
  }
}

/** The line at the top of the Jobs dashboard about the browser program itself. */
export function programText(
  program: { running: boolean; seenAt: Date | null; startedAt: Date | null },
  waiting: number,
  now: Date = new Date()
): string {
  if (program.running && program.startedAt) {
    return `Running since ${whenText(program.startedAt, now)}. It takes the next job within 5 seconds of one being added.`
  }
  const jobs = `${waiting} ${waiting === 1 ? "job is" : "jobs are"} waiting`
  const last = program.seenAt ? ` It was last seen ${whenText(program.seenAt, now)}.` : ""
  return waiting
    ? `Not running, so nothing is searched, read or posted. ${jobs}.${last}`
    : `Not running. Nothing is waiting, so nothing is held up yet.${last}`
}
