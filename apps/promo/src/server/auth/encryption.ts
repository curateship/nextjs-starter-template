import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"

// AES-256-GCM encryption for secrets at rest (AI provider API keys). The
// 32-byte key is derived from CUSTOM_SHELL_SECRET_ENCRYPTION_KEY so the env
// value can be any string. Losing that env value makes every stored secret
// unreadable — recovery is pasting the secret again, never decryption.

function encryptionKey(): Buffer | null {
  const secret = process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
  if (!secret) return null
  return createHash("sha256").update(secret).digest() // 32 bytes
}

// Stored format: base64(iv).base64(authTag).base64(ciphertext).
const ENCRYPTED_RE = /^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/

function looksEncrypted(value: string): boolean {
  return ENCRYPTED_RE.test(value)
}

/**
 * Encrypts a secret; throws when no encryption key is configured. That throw
 * is load-bearing: nothing may ever store a secret as plain text instead.
 */
export function encryptSecret(plaintext: string): string {
  const key = encryptionKey()
  if (!key) throw new Error("ENCRYPTION_NOT_CONFIGURED")
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".")
}

/**
 * Decrypts a value produced by `encryptSecret`. A stored value that is not in
 * the canonical encrypted format is invalid state, not a plaintext fallback.
 */
export function decryptSecret(stored: string): string {
  const key = encryptionKey()
  if (!key) throw new Error("ENCRYPTION_NOT_CONFIGURED")
  if (!looksEncrypted(stored)) throw new Error("SECRET_UNREADABLE")
  const [ivB64, tagB64, dataB64] = stored.split(".")
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivB64, "base64")
    )
    decipher.setAuthTag(Buffer.from(tagB64, "base64"))
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8")
  } catch {
    // Tampered ciphertext and a changed encryption secret both land here: the
    // GCM auth tag no longer matches, so there is nothing safe to return.
    throw new Error("SECRET_UNREADABLE")
  }
}
