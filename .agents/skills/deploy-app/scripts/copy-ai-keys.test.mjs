import assert from "node:assert/strict"
import { test } from "node:test"

import { comparePlan, decryptSecret, describePlan, encryptSecret, maskKey, wantedKeys } from "./copy-ai-keys.mjs"

test("encrypts the way the app reads it back, and only with the same secret", () => {
  const stored = encryptSecret("made-up-1234", "live secret")
  assert.match(stored, /^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/)
  assert.equal(decryptSecret(stored, "live secret"), "made-up-1234")
  assert.equal(decryptSecret(stored, "local secret"), null)
  assert.equal(decryptSecret("not encrypted", "live secret"), null)
})

test("takes only the providers with a key in secrets.env", () => {
  assert.deepEqual(wantedKeys({ ANTHROPIC_API_KEY: " made-up-1 ", OPENAI_API_KEY: "", GEMINI_API_KEY: "g-2", OTHER: "x" }), { anthropic: "made-up-1", gemini: "g-2" })
})

test("adds a missing key, keeps a matching one and replaces a different or unreadable one", () => {
  const plan = comparePlan({ anthropic: "aaaa1111", openai: "bbbb2222", gemini: "cccc3333", elevenlabs: "dddd4444" }, { openai: "bbbb2222", gemini: "old-9999", elevenlabs: null })
  assert.deepEqual(
    plan.map(({ provider, action, was }) => [provider, action, was]),
    [
      ["anthropic", "add", undefined],
      ["openai", "same", undefined],
      ["gemini", "replace", "••••9999"],
      ["elevenlabs", "replace", "unreadable"],
    ]
  )
  assert.equal(describePlan(plan), "anthropic ••••1111 added, openai ••••2222 already there, gemini ••••3333 replaces ••••9999, elevenlabs ••••4444 replaces unreadable")
})

test("never shows more than the last four characters", () => {
  assert.equal(maskKey("made-up-value-abcd"), "••••abcd")
})
