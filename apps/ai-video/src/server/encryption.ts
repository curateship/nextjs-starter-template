import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"

// AES-256-GCM encryption for secrets at rest (provider API keys). The 32-byte
// key is derived from AI_VIDEO_SECRET_ENCRYPTION_KEY so the env value can be any
// string. When that env var is unset (e.g. local dev) encryption is skipped and
// values are stored as-is — set it in production to encrypt at rest.

function encryptionKey(): Buffer | null {
  const secret = process.env.AI_VIDEO_SECRET_ENCRYPTION_KEY
  if (!secret) return null
  return createHash("sha256").update(secret).digest() // 32 bytes
}

export function isEncryptionConfigured(): boolean {
  return encryptionKey() !== null
}

// Stored format: base64(iv).base64(authTag).base64(ciphertext).
const ENCRYPTED_RE = /^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/

export function looksEncrypted(value: string): boolean {
  return ENCRYPTED_RE.test(value)
}

// Encrypts a secret; throws if no key is configured (callers should guard with
// isEncryptionConfigured and store plaintext otherwise).
export function encryptSecret(plaintext: string): string {
  const key = encryptionKey()
  if (!key) throw new Error("Secret encryption is not configured")
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

// Decrypts a value produced by encryptSecret. Returns null if the value isn't
// in encrypted form, the key is missing, or the ciphertext fails the auth tag
// (wrong key / tampered).
export function decryptSecret(stored: string): string | null {
  const key = encryptionKey()
  if (!key || !looksEncrypted(stored)) return null
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
    return null
  }
}
