/**
 * Date's server functions say what went wrong in words a person can act on,
 * such as "Date is switched off for Pixel 8a. Switch it on on the Phone screen
 * first." Those are thrown as plain errors with a full sentence and reach the
 * screen as they are. Anything else, a database error or a slip in the code,
 * is logged here and reaches the screen as one plain sentence, so nothing
 * from inside the server is ever shown.
 */
export async function inWords<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (isSentence(error) || isGuardCode(error)) throw error
    console.error("A Dating request failed", error)
    throw new Error("Date could not do that. It is in the server's log.")
  }
}

function isSentence(error: unknown): boolean {
  if (!(error instanceof Error) || error.constructor !== Error) return false
  const message = error.message.trim()
  return /^[A-Z0-9"$]/.test(message) && /[.?!]$/.test(message) && !message.includes("\n") && message.length < 600
}

function isGuardCode(error: unknown): boolean {
  return error instanceof Error && /^(AUTH_REQUIRED|FORBIDDEN|ENCRYPTION_NOT_CONFIGURED)$/.test(error.message)
}
