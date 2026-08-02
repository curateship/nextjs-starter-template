import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { decryptSecret, encryptSecret } from "@/server/encryption"

const ENV_NAME = "CUSTOM_SHELL_SECRET_ENCRYPTION_KEY"
const originalSecret = process.env[ENV_NAME]

describe("secret encryption", () => {
  beforeEach(() => {
    process.env[ENV_NAME] = "test-secret-any-string-works"
  })

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env[ENV_NAME]
    } else {
      process.env[ENV_NAME] = originalSecret
    }
  })

  it("round-trips a value", () => {
    const stored = encryptSecret("sk-ant-example-1234")
    expect(stored).not.toContain("sk-ant-example-1234")
    expect(decryptSecret(stored)).toBe("sk-ant-example-1234")
  })

  it("never produces the same ciphertext twice for one value", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"))
  })

  it("rejects a tampered value", () => {
    const stored = encryptSecret("sk-ant-example-1234")
    const [iv, tag, data] = stored.split(".")
    const flipped =
      data[0] === "A" ? `B${data.slice(1)}` : `A${data.slice(1)}`
    expect(() => decryptSecret([iv, tag, flipped].join("."))).toThrow(
      "SECRET_UNREADABLE"
    )
  })

  it("rejects a stored value that is not in the encrypted format", () => {
    expect(() => decryptSecret("sk-ant-plaintext-row")).toThrow(
      "SECRET_UNREADABLE"
    )
  })

  it("cannot decrypt after the encryption secret changes", () => {
    const stored = encryptSecret("sk-ant-example-1234")
    process.env[ENV_NAME] = "a-different-secret"
    expect(() => decryptSecret(stored)).toThrow("SECRET_UNREADABLE")
  })

  it("fails loudly with no encryption secret configured", () => {
    delete process.env[ENV_NAME]
    expect(() => encryptSecret("sk-ant-example-1234")).toThrow(
      "ENCRYPTION_NOT_CONFIGURED"
    )
    const stored = "x.y.z"
    expect(() => decryptSecret(stored)).toThrow("ENCRYPTION_NOT_CONFIGURED")
  })
})
