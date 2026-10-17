import { createHash } from "node:crypto"

/**
 * A short fingerprint of a chapter's words, kept beside its audio, so the
 * editor can say when the words have changed since the audio was made.
 */
export function textHash(text: string): string {
  return createHash("sha256").update(text.replace(/\s+/g, " ").trim()).digest("hex")
}
