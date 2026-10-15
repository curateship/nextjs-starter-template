import { createHmac } from "node:crypto"
import { and, eq, inArray } from "drizzle-orm"

import { decryptSecret, encryptSecret } from "@/server/auth/encryption"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { promoAccounts } from "./schema"

/**
 * An account's authenticator codes, the six digits an app such as Google
 * Authenticator shows, so a sign-in that asks for one finishes from Promo.
 *
 * The secret is the one the network shows when two-factor is switched on,
 * as letters or as the `otpauth://` link inside its QR code. It is kept
 * encrypted with the server's key, the same way a browser window's password
 * is, and is never sent to a page again: only the current code is.
 *
 * The codes are RFC 6238's: HMAC-SHA1 over 30-second steps, six digits,
 * which is what Reddit, Instagram and TikTok use.
 */

const STEP_SECONDS = 30
const DIGITS = 6
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

function base32Bytes(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "")
  if (!clean || /[^A-Z2-7]/.test(clean)) throw new Error("That is not an authenticator secret.")
  let bits = ""
  for (const letter of clean) bits += BASE32.indexOf(letter).toString(2).padStart(5, "0")
  const bytes: number[] = []
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(parseInt(bits.slice(index, index + 8), 2))
  return Buffer.from(bytes)
}

/**
 * The secret's letters, from the letters themselves or from an
 * `otpauth://totp/...?secret=...` link. A link asking for anything other than
 * six digits every 30 seconds with SHA1 is refused, because the codes shown
 * would be wrong.
 */
export function readSecret(input: string): string {
  const trimmed = input.trim()
  if (!trimmed.toLowerCase().startsWith("otpauth://")) {
    base32Bytes(trimmed)
    return trimmed.toUpperCase().replace(/[\s-]/g, "")
  }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error("That is not an authenticator secret.")
  }
  const secret = url.searchParams.get("secret") ?? ""
  const digits = url.searchParams.get("digits") ?? "6"
  const period = url.searchParams.get("period") ?? "30"
  const algorithm = (url.searchParams.get("algorithm") ?? "SHA1").toUpperCase()
  if (url.hostname !== "totp" || digits !== "6" || period !== "30" || algorithm !== "SHA1") {
    throw new Error("That link asks for a kind of code Promo does not make. Paste the secret letters instead.")
  }
  base32Bytes(secret)
  return secret.toUpperCase()
}

/** The code for a moment, from raw key bytes. Exported for the RFC's own test values. */
export function codeAt(key: Buffer, at: Date, digits = DIGITS): string {
  const counter = Math.floor(at.getTime() / 1000 / STEP_SECONDS)
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const hash = createHmac("sha1", key).update(message).digest()
  const offset = hash[hash.length - 1] & 0x0f
  const number = (hash.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits
  return String(number).padStart(digits, "0")
}

export function totpCode(secret: string, at: Date = new Date()): string {
  return codeAt(base32Bytes(secret), at)
}

/** Saves an account's secret, encrypted. Refused for an account that is not the person's. */
export async function saveTwoFactor(
  userId: string,
  accountId: string,
  input: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const secret = readSecret(input)
  const updated = await db
    .update(promoAccounts)
    .set({ totpSecretEncrypted: encryptSecret(secret), updatedAt: new Date() })
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .returning({ id: promoAccounts.id })
  if (!updated.length) throw new Error("That account is not there any more.")
}

export async function removeTwoFactor(userId: string, accountId: string, db: CustomShellDb = defaultDb): Promise<void> {
  await db
    .update(promoAccounts)
    .set({ totpSecretEncrypted: "", updatedAt: new Date() })
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
}

export type CurrentCode = { accountId: string; handle: string; code: string; secondsLeft: number }

/** The current code of each of these accounts that has a secret saved. */
export async function currentCodes(
  userId: string,
  where: { accountIds: string[] } | { phoneId: string },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<CurrentCode[]> {
  if ("accountIds" in where && !where.accountIds.length) return []
  const rows = await db
    .select({ id: promoAccounts.id, handle: promoAccounts.handle, secret: promoAccounts.totpSecretEncrypted })
    .from(promoAccounts)
    .where(
      and(
        eq(promoAccounts.userId, userId),
        "phoneId" in where ? eq(promoAccounts.phoneId, where.phoneId) : inArray(promoAccounts.id, where.accountIds)
      )
    )
  const secondsLeft = STEP_SECONDS - (Math.floor(now.getTime() / 1000) % STEP_SECONDS)
  const codes: CurrentCode[] = []
  for (const row of rows) {
    if (!row.secret) continue
    try {
      codes.push({ accountId: row.id, handle: row.handle, code: totpCode(decryptSecret(row.secret), now), secondsLeft })
    } catch (error) {
      // A secret the server's key cannot open, after the key changed, is left
      // out rather than taking the others down; it is saved again by hand.
      console.error(`Could not read the authenticator secret of account ${row.id}`, error)
    }
  }
  return codes
}
