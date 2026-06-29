import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

// AES-256-GCM encryption for secrets stored at rest (e.g. proxy passwords).
// The key comes from ANTIDETECT_ENCRYPTION_KEY (64 hex chars = 32 bytes); there is
// no fallback on purpose — a missing/short key fails fast rather than silently
// using a weak default. Generate one with: openssl rand -hex 32

function getKey(): Buffer {
  const hex = process.env.ANTIDETECT_ENCRYPTION_KEY
  if (!hex) {
    throw new Error("ANTIDETECT_ENCRYPTION_KEY is not set")
  }
  const key = Buffer.from(hex, "hex")
  if (key.length !== 32) {
    throw new Error(
      "ANTIDETECT_ENCRYPTION_KEY must be 64 hex characters (32 bytes)"
    )
  }
  return key
}

// Encrypts a secret. Returns "iv:authTag:ciphertext" (all hex), or null for
// empty input. A fresh random 96-bit IV per call guarantees nonce uniqueness.
export function encryptSecret(
  plaintext: string | null | undefined
): string | null {
  if (!plaintext) return null
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString(
    "hex"
  )}`
}

// Reverses encryptSecret. The auth tag makes tampering throw rather than return
// garbage. Used when handing a proxy's credentials to the browser engine.
export function decryptSecret(
  payload: string | null | undefined
): string | null {
  if (!payload) return null
  const [ivHex, tagHex, dataHex] = payload.split(":")
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Malformed encrypted secret")
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivHex, "hex")
  )
  decipher.setAuthTag(Buffer.from(tagHex, "hex"))
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8")
}
