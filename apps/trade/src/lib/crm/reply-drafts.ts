/**
 * The half-written replies, one per conversation, for as long as the CRM
 * screen is open.
 *
 * Switching conversation used to empty the box, so three paragraphs went in
 * the bin the moment you clicked another thread to check a date. The words are
 * held here instead, by conversation id, and put back when you come back.
 *
 * In memory only. A reload clears them, which is the deliberate line: a draft
 * that survives a reload needs its own column, its own cleanup and an answer
 * for two admins typing in one conversation.
 *
 * An empty box is not a draft. Nothing is stored for one, so a row never shows
 * a draft mark for words that were deleted again.
 */
export type ReplyDrafts = Readonly<Record<string, string>>

/**
 * The new text, or a function from the text already there to the new text.
 *
 * The function form is for Draft with AI, which adds to whatever is in the box
 * at the moment it lands rather than to whatever was there when it was
 * pressed.
 */
export type ReplyDraftUpdate = string | ((current: string) => string)

export const noReplyDrafts: ReplyDrafts = {}

/** What is in the box for this conversation, and "" when there is nothing. */
export function replyDraftFor(
  drafts: ReplyDrafts,
  threadId: string | null
): string {
  if (!threadId) return ""
  return drafts[threadId] ?? ""
}

/** Whether this conversation has words waiting in it. */
export function hasReplyDraft(drafts: ReplyDrafts, threadId: string): boolean {
  return (drafts[threadId] ?? "") !== ""
}

/**
 * The drafts after one conversation's box changed.
 *
 * Returns the same object when nothing changed, so typing in one conversation
 * never redraws the inbox rows of the others.
 */
export function applyReplyDraft(
  drafts: ReplyDrafts,
  threadId: string,
  update: ReplyDraftUpdate
): ReplyDrafts {
  const current = replyDraftFor(drafts, threadId)
  const next = typeof update === "function" ? update(current) : update
  if (next === current) return drafts

  // Whitespace alone is nothing to come back to, and Send refuses it too, so
  // it is dropped rather than kept as an invisible draft with a row mark.
  if (!next.trim()) {
    if (!(threadId in drafts)) return drafts
    const rest = { ...drafts }
    delete rest[threadId]
    return rest
  }

  return { ...drafts, [threadId]: next }
}
