import { createHmac, timingSafeEqual } from "node:crypto"

import { LIBRARY_SAYS } from "@/lib/note/library/notes"

/**
 * The Save from x.com button's key: a code made for one person from the
 * server's secret, built into that person's bookmark. The page the button
 * opens imports on arrival with no click, so without the key another site
 * could send a signed-in member there and import a post of its choosing into
 * their library. Nobody else can work the key out, and it never changes, so a
 * button dragged once keeps working. The same signing as the shell's
 * unsubscribe links (`src/server/email/unsubscribe.ts`).
 */

function signingKey() {
  const secret = process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
  if (!secret) throw new Error(LIBRARY_SAYS.saveKeyUnavailable)
  return secret
}

export function saveKeyFor(userId: string) {
  return createHmac("sha256", signingKey()).update(`note-save-from-x:${userId}`, "utf8").digest("hex").slice(0, 32)
}

export function requireSaveKey(userId: string, key: string) {
  const expected = Buffer.from(saveKeyFor(userId), "utf8")
  const given = Buffer.from(key, "utf8")
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new Error(LIBRARY_SAYS.saveKeyWrong)
  }
}
