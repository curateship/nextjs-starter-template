import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const ENCRYPTION_VERSION = "v1"
const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

export const CURRENT_KEY_VERSION = 1

export function getMasterKey(): Buffer {
  const raw = process.env.TRADING_MASTER_KEY
  if (!raw) {
    throw new Error(
      "TRADING_MASTER_KEY is not set. Generate one with: openssl rand -base64 32"
    )
  }
  const key = Buffer.from(raw, "base64")
  if (key.length !== 32) {
    throw new Error("TRADING_MASTER_KEY must be 32 bytes, base64-encoded")
  }
  return key
}

export function encryptPrivateKey(
  privateKey: string,
  masterKey: Buffer = getMasterKey()
): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, masterKey, iv)
  const ciphertext = Buffer.concat([
    cipher.update(privateKey, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return [
    ENCRYPTION_VERSION,
    iv.toString("base64"),
    ciphertext.toString("base64"),
    authTag.toString("base64"),
  ].join(":")
}

export function decryptPrivateKey(
  encrypted: string,
  masterKey: Buffer = getMasterKey()
): string {
  const parts = encrypted.split(":")
  if (parts.length !== 4 || parts[0] !== ENCRYPTION_VERSION) {
    throw new Error("Unsupported encrypted key format")
  }
  const iv = Buffer.from(parts[1], "base64")
  const ciphertext = Buffer.from(parts[2], "base64")
  const authTag = Buffer.from(parts[3], "base64")
  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Malformed encrypted key")
  }
  const decipher = createDecipheriv(ALGORITHM, masterKey, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8")
}
