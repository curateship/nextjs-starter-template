import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server"
import { isoBase64URL } from "@simplewebauthn/server/helpers"
import { and, desc, eq, gt, lte } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import {
  customShellPasskeyChallenges,
  customShellPasskeys,
  customShellUsers,
  type CustomShellUser,
} from "@/server/schema"
import { now, uuid } from "@/server/security"

/**
 * Who the browser signs for: the site's domain and exact address. Derived from
 * the request that started the ceremony, never configured separately, so dev
 * (localhost or 127.0.0.1) and prod each ask for passkeys under their own name
 * and the two can never be misconfigured apart.
 */
export type RelyingParty = {
  /** Shown by the browser's passkey prompt as who is asking. */
  name: string
  /** The domain a credential is scoped to (WebAuthn's rpID). */
  id: string
  /** The exact origin the signed response must come from. */
  origin: string
}

/**
 * A ceremony must finish in this window. Long enough for a fingerprint retry
 * or finding the right phone, short enough that a forgotten prompt does not
 * leave a signable challenge lying around.
 */
export const PASSKEY_CHALLENGE_MINUTES = 5

/** A registered passkey, as the Security tab lists it. */
export type PasskeyRow = {
  id: string
  name: string
  createdAt: Date
  lastUsedAt: Date | null
}

export async function listPasskeys(
  userId: string,
  database: CustomShellDb = db
): Promise<PasskeyRow[]> {
  const rows = await database
    .select({
      id: customShellPasskeys.id,
      name: customShellPasskeys.name,
      createdAt: customShellPasskeys.createdAt,
      lastUsedAt: customShellPasskeys.lastUsedAt,
    })
    .from(customShellPasskeys)
    .where(eq(customShellPasskeys.userId, userId))
    .orderBy(desc(customShellPasskeys.createdAt))

  return rows
}

/**
 * Issues a challenge row and hands back its id for the browser to return with
 * the signed response. The sweep first: nothing else ever clears abandoned
 * ceremonies, and this app has no background jobs.
 */
async function createChallenge(
  type: "registration" | "authentication",
  userId: string | null,
  challenge: string,
  database: CustomShellDb
) {
  const timestamp = now()
  await database
    .delete(customShellPasskeyChallenges)
    .where(lte(customShellPasskeyChallenges.expiresAt, timestamp))

  const id = uuid()
  await database.insert(customShellPasskeyChallenges).values({
    id,
    challenge,
    type,
    userId,
    expiresAt: new Date(
      timestamp.getTime() + PASSKEY_CHALLENGE_MINUTES * 60 * 1000
    ),
    createdAt: timestamp,
  })

  return id
}

/**
 * Spends a challenge. The delete is the guard: a challenge that is expired,
 * already spent, or of the other kind matches nothing — so no signed response
 * can ever be accepted twice, and a registration challenge can never be
 * replayed as a sign-in.
 */
async function consumeChallenge(
  id: string,
  type: "registration" | "authentication",
  database: CustomShellDb
) {
  const [consumed] = await database
    .delete(customShellPasskeyChallenges)
    .where(
      and(
        eq(customShellPasskeyChallenges.id, id),
        eq(customShellPasskeyChallenges.type, type),
        gt(customShellPasskeyChallenges.expiresAt, now())
      )
    )
    .returning()

  if (!consumed) {
    throw new Error("PASSKEY_ATTEMPT_EXPIRED")
  }

  return consumed
}

/**
 * Starts adding a passkey to a signed-in account: the options the browser
 * hands its authenticator, and the id of the challenge inside them.
 *
 * The account's existing credentials ride along as exclusions, so the same
 * device cannot be enrolled twice — the browser refuses on the spot instead of
 * a duplicate surfacing at save time.
 */
export async function startPasskeyRegistration(
  user: CustomShellUser,
  rp: RelyingParty,
  database: CustomShellDb = db
) {
  const existing = await database
    .select({
      credentialId: customShellPasskeys.credentialId,
      transports: customShellPasskeys.transports,
    })
    .from(customShellPasskeys)
    .where(eq(customShellPasskeys.userId, user.id))

  const options = await generateRegistrationOptions({
    rpName: rp.name,
    rpID: rp.id,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((row) => ({
      id: row.credentialId,
      transports: parseTransports(row.transports),
    })),
    authenticatorSelection: {
      // Discoverable, so the sign-in page can offer "use a passkey" without
      // asking for an email first; the browser lists what it holds.
      residentKey: "preferred",
      // The prompt must prove a person — fingerprint, face, or device PIN —
      // because this credential signs someone in outright, not as a 2nd step.
      userVerification: "required",
    },
  })

  const challengeId = await createChallenge(
    "registration",
    user.id,
    options.challenge,
    database
  )

  return { options, challengeId }
}

/**
 * Checks the browser's response and saves the credential. The challenge must
 * be one this account was issued — being signed in is not enough to attach a
 * response someone else's ceremony produced.
 */
export async function finishPasskeyRegistration(
  user: CustomShellUser,
  challengeId: string,
  response: RegistrationResponseJSON,
  name: string,
  rp: RelyingParty,
  database: CustomShellDb = db
): Promise<PasskeyRow> {
  const consumed = await consumeChallenge(challengeId, "registration", database)
  if (consumed.userId !== user.id) {
    throw new Error("PASSKEY_ATTEMPT_EXPIRED")
  }

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: consumed.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
    })
  } catch {
    // The library throws on anything malformed or mis-signed. One code for all
    // of it: to the person at the keyboard, the passkey did not take.
    throw new Error("PASSKEY_FAILED")
  }

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("PASSKEY_FAILED")
  }

  const { credential } = verification.registrationInfo
  const timestamp = now()
  const row = {
    id: uuid(),
    userId: user.id,
    credentialId: credential.id,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports?.length
      ? JSON.stringify(credential.transports)
      : null,
    name,
    createdAt: timestamp,
    lastUsedAt: null,
  }

  // A credential id is world-unique, so a conflict means this authenticator is
  // already enrolled — on this account or another one. Refused rather than
  // moved: signing in must never silently change which account a key opens.
  const [saved] = await database
    .insert(customShellPasskeys)
    .values(row)
    .onConflictDoNothing({ target: customShellPasskeys.credentialId })
    .returning()

  if (!saved) {
    throw new Error("PASSKEY_EXISTS")
  }

  return {
    id: saved.id,
    name: saved.name,
    createdAt: saved.createdAt,
    lastUsedAt: saved.lastUsedAt,
  }
}

/**
 * Starts a passkey sign-in for whoever is at the keyboard. No email is asked
 * for and no credential list is sent — the browser offers what it holds for
 * this site, so the page cannot be used to probe which accounts have passkeys.
 */
export async function startPasskeyAuthentication(
  rp: RelyingParty,
  database: CustomShellDb = db
) {
  const options = await generateAuthenticationOptions({
    rpID: rp.id,
    userVerification: "required",
  })

  const challengeId = await createChallenge(
    "authentication",
    null,
    options.challenge,
    database
  )

  return { options, challengeId }
}

/**
 * Checks a signed sign-in response and answers whose account it opens.
 *
 * The account checks sit before the signature check on purpose: a suspended
 * account with a perfectly valid passkey is still refused, and told why, the
 * same way the password form would tell them.
 */
export async function finishPasskeyAuthentication(
  challengeId: string,
  response: AuthenticationResponseJSON,
  rp: RelyingParty,
  database: CustomShellDb = db
): Promise<CustomShellUser> {
  const consumed = await consumeChallenge(
    challengeId,
    "authentication",
    database
  )

  const [passkey] = await database
    .select()
    .from(customShellPasskeys)
    .where(eq(customShellPasskeys.credentialId, response.id))
    .limit(1)

  if (!passkey) {
    throw new Error("PASSKEY_NOT_RECOGNISED")
  }

  const [user] = await database
    .select()
    .from(customShellUsers)
    .where(eq(customShellUsers.id, passkey.userId))
    .limit(1)

  if (!user) {
    throw new Error("PASSKEY_NOT_RECOGNISED")
  }
  if (user.status === "suspended") {
    throw new Error("ACCOUNT_SUSPENDED")
  }
  // No restore path here — bringing a deleted account back stays a deliberate
  // act on the password form, where the restore button lives.
  if (user.status === "pending_deletion") {
    throw new Error("ACCOUNT_PENDING_DELETION")
  }
  if (!user.emailVerifiedAt) {
    throw new Error("EMAIL_NOT_VERIFIED")
  }

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: consumed.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      credential: {
        id: passkey.credentialId,
        publicKey: isoBase64URL.toBuffer(passkey.publicKey),
        counter: passkey.counter,
        transports: parseTransports(passkey.transports),
      },
    })
  } catch {
    throw new Error("PASSKEY_FAILED")
  }

  if (!verification.verified) {
    throw new Error("PASSKEY_FAILED")
  }

  await database
    .update(customShellPasskeys)
    .set({
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: now(),
    })
    .where(eq(customShellPasskeys.id, passkey.id))

  return user
}

/**
 * Removes one passkey. The where clause is the whole guard: it matches only a
 * row this account owns, so a guessed id cannot take away someone else's key.
 * Removing the last one is fine — the password is the standing way back in.
 */
export async function deletePasskey(
  userId: string,
  passkeyId: string,
  database: CustomShellDb = db
) {
  const [deleted] = await database
    .delete(customShellPasskeys)
    .where(
      and(
        eq(customShellPasskeys.id, passkeyId),
        eq(customShellPasskeys.userId, userId)
      )
    )
    .returning({ id: customShellPasskeys.id })

  if (!deleted) {
    throw new Error("PASSKEY_NOT_FOUND")
  }
}

/** The stored transports list, or undefined when none were recorded. */
function parseTransports(
  stored: string | null
): AuthenticatorTransportFuture[] | undefined {
  if (!stored) {
    return undefined
  }

  try {
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed)
      ? (parsed.filter(
          (item): item is AuthenticatorTransportFuture =>
            typeof item === "string"
        ) as AuthenticatorTransportFuture[])
      : undefined
  } catch {
    return undefined
  }
}
