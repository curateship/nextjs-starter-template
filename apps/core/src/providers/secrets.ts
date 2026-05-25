import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

const algorithm = "aes-256-gcm"
const ivLength = 12
const tagLength = 16

export function encryptProviderSecret(secret: string) {
  const iv = randomBytes(ivLength)
  const cipher = createCipheriv(algorithm, getKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ])

  return [
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ].join(":")
}

export function decryptProviderSecret(value: string) {
  const [ivBase64, tagBase64, encryptedBase64] = value.split(":")
  const iv = Buffer.from(ivBase64 || "", "base64")
  const tag = Buffer.from(tagBase64 || "", "base64")
  if (!encryptedBase64 || iv.length !== ivLength || tag.length !== tagLength) {
    throw new Error("Invalid encrypted provider secret.")
  }

  const decipher = createDecipheriv(algorithm, getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64")),
    decipher.final(),
  ]).toString("utf8")
}

function getKey() {
  const secret = process.env.CORE_PROVIDER_ENCRYPTION_KEY
  if (!secret) {
    throw new Error("CORE_PROVIDER_ENCRYPTION_KEY is required.")
  }
  if (secret.length < 32) {
    throw new Error("CORE_PROVIDER_ENCRYPTION_KEY must be at least 32 characters.")
  }
  return createHash("sha256").update(secret, "utf8").digest()
}
