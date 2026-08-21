/**
 * How long any exchange request may take before it is given up on.
 *
 * **Why this exists.** `fetch` has no timeout of its own: a connection that
 * stalls mid-response never settles, and the promise never resolves. A page
 * whose loader waits on one of those does not fail — it hangs, showing a
 * spinner forever, and because the router is still waiting for that route
 * every other link on the page stops working too. A slow exchange should
 * make one panel say "the exchange did not answer", never freeze the app.
 *
 * Two lengths, because the risk is not the same in both directions:
 *
 * - **Reading** is safe to give up on. Nothing changed, the caller shows its
 *   error state, and the next poll tries again.
 * - **Acting** — placing, moving, cancelling — is not. Giving up does not
 *   call the order back; it only stops us waiting. So it gets far longer,
 *   and when it does fire the refusal says out loud that the order's fate is
 *   unknown, because that is the one thing the person needs to check.
 */

export const READ_TIMEOUT_MS = 15_000
export const ACT_TIMEOUT_MS = 45_000

/** The signal every exchange request carries. */
export function requestSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs)
}

/**
 * True when this error is a request that ran out of time rather than an
 * answer the exchange gave. `AbortSignal.timeout` raises a `TimeoutError`;
 * an abort raises `AbortError`.
 */
export function isTimeout(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "TimeoutError" || error.name === "AbortError"
  }
  const name = (error as { name?: unknown } | null)?.name
  return name === "TimeoutError" || name === "AbortError"
}
