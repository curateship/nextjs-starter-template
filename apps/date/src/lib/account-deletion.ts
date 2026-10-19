/**
 * How long a deleted account can be brought back before it is really gone.
 *
 * One number in one place: the purge's own cut-off, the sentence in the delete
 * confirmation, and the date the admin table and the sign-in page show all read
 * it from here, so the promise made to the person and the rule the server
 * enforces cannot drift apart.
 *
 * It sits in a plain module with no server imports because the pages need it
 * too, and importing the server's account rules into the browser bundle would
 * drag argon2 and node:crypto along with it.
 */
export const ACCOUNT_RESTORE_DAYS = 30

/**
 * The status an account carries while it is on its way out. Lives here with the
 * window so the server guards and the screens that read a status agree on the
 * one spelling.
 */
export const PENDING_DELETION = "pending_deletion"

export function isPendingDeletion(account: { status: string }) {
  return account.status === PENDING_DELETION
}

const DAY_MS = 24 * 60 * 60 * 1000

/** The moment a marked account stops being restorable and becomes purgeable. */
export function restoreDeadline(deletedAt: string | Date) {
  const marked = typeof deletedAt === "string" ? new Date(deletedAt) : deletedAt
  return new Date(marked.getTime() + ACCOUNT_RESTORE_DAYS * DAY_MS)
}
