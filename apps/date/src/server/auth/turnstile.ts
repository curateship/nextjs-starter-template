/**
 * Cloudflare Turnstile — the quiet human-check on the sign-up and
 * forgotten-password forms.
 *
 * Both keys have to be set for the check to run. With either one missing, which
 * is how local development is left, the check is skipped and the two forms
 * behave exactly as they did before. That escape hatch is for dev only: a
 * production server missing a key is a production server with no bot protection
 * at all, which is why the README says so in as many words.
 */
const VERIFY_ENDPOINT =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify"

/** Cloudflare answers well inside a second; this is the give-up point. */
const TIMEOUT_MS = 5_000

/**
 * The public half of the key pair, or null when the check is switched off.
 *
 * Only handed out when the secret is present too, so the browser is never shown
 * a widget whose answer this server has no way to check.
 */
export function getHumanCheckSiteKey() {
  const siteKey = process.env.CUSTOM_SHELL_TURNSTILE_SITE_KEY
  return siteKey && process.env.CUSTOM_SHELL_TURNSTILE_SECRET_KEY
    ? siteKey
    : null
}

/**
 * Refuses the request unless Cloudflare confirms the widget's answer.
 *
 * Fails closed, unlike the breached-password check: waving everything through
 * the moment the check cannot be reached would hand a bot exactly the opening
 * this exists to close. When Cloudflare is unreachable the widget almost
 * certainly failed to load anyway, so there was no token to send.
 */
export async function enforceHumanCheck(token: string | undefined) {
  const secretKey = process.env.CUSTOM_SHELL_TURNSTILE_SECRET_KEY
  if (!secretKey || !getHumanCheckSiteKey()) {
    return
  }

  if (!token) {
    throw new Error("HUMAN_CHECK_FAILED")
  }

  let verdict: { success?: boolean; "error-codes"?: string[] }
  try {
    const response = await fetch(VERIFY_ENDPOINT, {
      method: "POST",
      // The caller's IP is deliberately left out. Cloudflare rejects a token
      // whose IP does not match, and behind a proxy the address this server
      // sees is often not the one the browser was challenged on — which, on a
      // check that fails closed, would lock real people out.
      body: new URLSearchParams({ secret: secretKey, response: token }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    verdict = await response.json()
  } catch (error) {
    console.warn(
      `[custom-shell] human check could not be verified: ${String(error)}`
    )
    throw new Error("HUMAN_CHECK_FAILED")
  }

  if (!verdict.success) {
    // The reasons name the misconfiguration — a wrong secret reads as
    // "invalid-input-secret" — and never carry the secret itself. Without them
    // a bad key looks identical to a bot, and every real person is turned away
    // with nothing in the log to explain it.
    console.warn(
      `[custom-shell] human check refused: ${(verdict["error-codes"] ?? []).join(", ") || "no reason given"}`
    )
    throw new Error("HUMAN_CHECK_FAILED")
  }
}
