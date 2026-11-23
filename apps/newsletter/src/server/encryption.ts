import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function getEncryptionKey(): Buffer {
  const key = process.env.NEWSLETTER_ENCRYPTION_KEY
  if (!key) {
    throw new Error("NEWSLETTER_ENCRYPTION_KEY environment variable is not set")
  }
  return Buffer.from(key, "base64")
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns format: iv:authTag:ciphertext (all base64)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, "utf8", "base64")
  encrypted += cipher.final("base64")

  const authTag = cipher.getAuthTag()

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`
}

function decrypt(ciphertext: string): string {
  const key = getEncryptionKey()
  const [ivB64, authTagB64, encryptedB64] = ciphertext.split(":")

  if (!ivB64 || !authTagB64 || !encryptedB64) {
    throw new Error("Invalid encrypted value format")
  }

  const iv = Buffer.from(ivB64, "base64")
  const authTag = Buffer.from(authTagB64, "base64")

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encryptedB64, "base64", "utf8")
  decrypted += decipher.final("utf8")

  return decrypted
}

export function isEncrypted(value: string): boolean {
  const parts = value.split(":")
  if (parts.length !== 3) return false

  try {
    const iv = Buffer.from(parts[0], "base64")
    const authTag = Buffer.from(parts[1], "base64")
    return iv.length === IV_LENGTH && authTag.length === AUTH_TAG_LENGTH
  } catch {
    return false
  }
}

/**
 * Safely decrypt a value — returns the original string if it's not encrypted.
 */
export function safeDecrypt(value: string): string {
  if (!value || !isEncrypted(value)) {
    return value
  }
  try {
    return decrypt(value)
  } catch {
    return value
  }
}
