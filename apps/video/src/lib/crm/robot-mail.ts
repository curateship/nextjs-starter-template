/**
 * Whether mail was sent by a machine rather than a person (CRM task 38, part
 * 4; Tyler picked "Robots in their own view" on 25 Nov 2026): no-reply
 * notices, receipts and newsletters, which go to the Inbox's Other view so
 * All shows the mail people wrote.
 *
 * A fixed rule, careful on purpose, because a customer filed as a robot is the
 * failure to avoid. A wrong guess is one press to fix ("Not a robot"), and
 * that choice is kept for the address.
 */

/** An address whose name says nobody reads it: noreply@, no-reply@, donotreply@, do-not-reply@. */
export function isRobotAddress(email: string): boolean {
  const local = email.trim().toLowerCase().split("@")[0] ?? ""
  return /^(no-?reply|do-?not-?reply)([+._-].*)?$/.test(local)
}

/**
 * The headers mail from a machine carries, by name: `List-Unsubscribe` (a
 * mailing list or newsletter), `Auto-Submitted` other than "no" (an automatic
 * notice or reply), or `Precedence: bulk` or `list`. `read` answers a
 * header's value, or null when it is not there.
 */
export function hasRobotHeaders(read: (name: string) => string | null): boolean {
  if (read("list-unsubscribe")?.trim()) return true
  const auto = read("auto-submitted")?.trim().toLowerCase()
  if (auto && auto !== "no") return true
  const precedence = read("precedence")?.trim().toLowerCase()
  return precedence === "bulk" || precedence === "list"
}
