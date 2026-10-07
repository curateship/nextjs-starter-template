/** What a refused join says, on the card that was pressed and in the toast. */
export function joinRefusalMessage(cause: unknown) {
  const text = cause instanceof Error ? cause.message : ""
  return text.includes("ROOM_LOCKED")
    ? "That room is mid-focus. Join again during its break."
    : text.includes("ROOM_CLOSED")
      ? "That room has ended."
      : text.includes("ROOM_BANNED")
        ? "You can't join that room."
        : "This room is not available to join."
}
