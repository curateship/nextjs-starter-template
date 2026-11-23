/**
 * The sentences "Message the owner" can say to a visitor, written once.
 *
 * Browser-safe on purpose: the form reads them to decide what to show, and the
 * server throws them. A server module imported by the form would pull the
 * server's own code into the page.
 */

/** A listing with no owner, a draft, another site's, or the switch off. */
export const OWNER_MESSAGES_CLOSED = "This listing is not taking messages."

/** The email to the owner did not go, or something else went wrong. */
export const OWNER_MESSAGE_FAILED =
  "Your message could not be sent. Please try again later."

export const OWNER_MESSAGE_NEEDS_NAME =
  "Give your name, so the owner knows who is asking."
export const OWNER_MESSAGE_BAD_EMAIL = "That does not look like an email address."
export const OWNER_MESSAGE_NEEDS_TEXT = "Write your message."
export const OWNER_MESSAGE_VISITOR_BUSY =
  "You have sent a lot of messages in the last hour. Please wait an hour and try again."
export const OWNER_MESSAGE_LISTING_BUSY =
  "This listing has had a lot of messages in the last hour. Please try again later."

const VISITOR_SENTENCES = new Set([
  OWNER_MESSAGES_CLOSED,
  OWNER_MESSAGE_FAILED,
  OWNER_MESSAGE_NEEDS_NAME,
  OWNER_MESSAGE_BAD_EMAIL,
  OWNER_MESSAGE_NEEDS_TEXT,
  OWNER_MESSAGE_VISITOR_BUSY,
  OWNER_MESSAGE_LISTING_BUSY,
])

/**
 * What the visitor is shown for a failure: one of the sentences above, the
 * human check's own, or the plain "could not be sent". Anything else is a
 * fault, and its words stay on the server.
 */
export function getOwnerMessageErrorMessage(error: unknown) {
  const message =
    typeof error === "string" ? error : error instanceof Error ? error.message : ""
  if (message.includes("HUMAN_CHECK_FAILED")) {
    return "We could not confirm you are a person. Please try again."
  }
  return VISITOR_SENTENCES.has(message) ? message : OWNER_MESSAGE_FAILED
}
