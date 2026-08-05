import { createServerFn } from "@tanstack/react-start"
import { getRequestHeader } from "@tanstack/react-start/server"
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server"
import { z } from "zod"

import { serializeUser, startWorkspaceFor } from "@/lib/api/auth"
import { purgeExpiredDeletions } from "@/server/account-deletion"
import { requestIp, requireAppOrigin } from "@/server/origin"
import {
  deletePasskey,
  finishPasskeyAuthentication,
  finishPasskeyRegistration as verifyAndSavePasskey,
  listPasskeys,
  startPasskeyAuthentication,
  startPasskeyRegistration,
  type RelyingParty,
} from "@/server/passkeys"
import { clearRateLimit, enforceRateLimit } from "@/server/rate-limit"
import { startSessionWithAlert } from "@/server/security-alerts"
import {
  describeRequestOrigin,
  requireOwnAccount,
  setSessionCookie,
} from "@/server/security"
import { readBranding } from "@/server/shell-settings"

/** One passkey as the Security tab shows it. */
export type PasskeyListItem = {
  id: string
  name: string
  createdAt: string
  lastUsedAt: string | null
}

const challengeIdSchema = z.string().min(1).max(36)
const passkeyNameSchema = z
  .string()
  .trim()
  .max(80)
  .transform((name) => name || "Passkey")

/**
 * The browser's signed responses. Only `id` is read before the WebAuthn
 * library verifies the whole thing, so only `id` is pinned down here.
 */
function isCredentialResponse(value: unknown) {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string"
  )
}

const registrationResponseSchema = z.custom<RegistrationResponseJSON>(
  isCredentialResponse
)
const authenticationResponseSchema = z.custom<AuthenticationResponseJSON>(
  isCredentialResponse
)

/**
 * Who the browser should be told is asking for the passkey. Built from the
 * request's own (already checked) origin rather than configuration, so the
 * domain a credential binds to is always the one on the address bar.
 */
async function requestRelyingParty(): Promise<RelyingParty> {
  requireAppOrigin()
  const origin = new URL(getRequestHeader("origin") ?? "")
  const { appName } = await readBranding()

  return {
    name: appName || origin.hostname,
    id: origin.hostname,
    origin: origin.origin,
  }
}

const loadPasskeysFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<PasskeyListItem[]> => {
    const user = await requireOwnAccount()
    const rows = await listPasskeys(user.id)

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    }))
  }
)

const beginPasskeyRegistrationFn = createServerFn({ method: "POST" }).handler(
  async () => {
    const rp = await requestRelyingParty()
    const user = await requireOwnAccount()

    // Every call writes a challenge row, so a runaway loop is capped. Keyed on
    // the account: this endpoint only works signed in.
    await enforceRateLimit(`passkey-register:${user.id}`, {
      maxAttempts: 10,
      windowSeconds: 60 * 60,
    })

    return startPasskeyRegistration(user, rp)
  }
)

const finishPasskeyRegistrationFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      challengeId: challengeIdSchema,
      response: registrationResponseSchema,
      name: passkeyNameSchema,
    })
  )
  .handler(async ({ data }): Promise<PasskeyListItem> => {
    const rp = await requestRelyingParty()
    const user = await requireOwnAccount()

    const saved = await verifyAndSavePasskey(
      user,
      data.challengeId,
      data.response,
      data.name,
      rp
    )

    return {
      id: saved.id,
      name: saved.name,
      createdAt: saved.createdAt.toISOString(),
      lastUsedAt: null,
    }
  })

const beginPasskeySignInFn = createServerFn({ method: "POST" }).handler(
  async () => {
    const rp = await requestRelyingParty()

    // Signed-out and cheap to call, so it gets the same kind of per-address
    // budget as the login form. Each call writes one challenge row.
    await enforceRateLimit(`passkey-options:${requestIp()}`, {
      maxAttempts: 20,
      windowSeconds: 15 * 60,
    })

    return startPasskeyAuthentication(rp)
  }
)

const finishPasskeySignInFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      challengeId: challengeIdSchema,
      response: authenticationResponseSchema,
    })
  )
  .handler(async ({ data }) => {
    const rp = await requestRelyingParty()

    // Counted like password attempts, and cleared on success for the same
    // reason: the limit exists for the hammering, not the household.
    const rateLimitKey = `passkey-login:${requestIp()}`
    await enforceRateLimit(rateLimitKey, {
      maxAttempts: 10,
      windowSeconds: 15 * 60,
    })

    const user = await finishPasskeyAuthentication(
      data.challengeId,
      data.response,
      rp
    )

    await clearRateLimit(rateLimitKey)
    // The same sweep every other way in does; this app has no background jobs.
    await purgeExpiredDeletions()

    const token = await startSessionWithAlert(user, describeRequestOrigin())
    await startWorkspaceFor(user.id)

    setSessionCookie(token)
    return serializeUser(user)
  })

const deletePasskeyFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ passkeyId: z.string().min(1).max(36) }))
  .handler(async ({ data }) => {
    requireAppOrigin()
    const user = await requireOwnAccount()
    await deletePasskey(user.id, data.passkeyId)
    return { ok: true }
  })

export function loadPasskeys() {
  return loadPasskeysFn()
}

export function beginPasskeyRegistration() {
  return beginPasskeyRegistrationFn()
}

export function finishPasskeyRegistration(data: {
  challengeId: string
  response: RegistrationResponseJSON
  name: string
}) {
  return finishPasskeyRegistrationFn({ data })
}

export function beginPasskeySignIn() {
  return beginPasskeySignInFn()
}

export function finishPasskeySignIn(data: {
  challengeId: string
  response: AuthenticationResponseJSON
}) {
  return finishPasskeySignInFn({ data })
}

export function removePasskey(passkeyId: string) {
  return deletePasskeyFn({ data: { passkeyId } })
}

