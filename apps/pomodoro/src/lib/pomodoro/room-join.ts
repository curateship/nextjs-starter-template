/**
 * A refusal that carries its own sentence for the member (admin task 05): a
 * suspension, or a pause switch. The text after the marker is shown as it
 * stands.
 */
export const ROOM_REFUSAL = "ROOM_REFUSED: "

/** The two pause switches, as the member reads them. */
export const NEW_ROOMS_PAUSED = "New rooms are paused for a little while."
export const CHAT_PAUSED = "Chat is paused for a little while."

export function roomRefusalSentence(cause: unknown) {
  const text = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : ""
  const at = text.indexOf(ROOM_REFUSAL)
  return at === -1 ? null : text.slice(at + ROOM_REFUSAL.length).trim()
}

/** What a refused join says, on the card that was pressed and in the toast. */
export function joinRefusalMessage(cause: unknown) {
  const text = cause instanceof Error ? cause.message : ""
  const refusal = roomRefusalSentence(cause)
  if (refusal) return refusal
  return text.includes("ROOM_LOCKED")
    ? "That room is mid-focus. Join again during its break."
    : text.includes("ROOM_CLOSED")
      ? "That room has ended."
      : text.includes("ROOM_BANNED")
        ? "You can't join that room."
        : text.includes("ROOM_FULL")
          ? "This room is full."
          : "This room is not available to join."
}
