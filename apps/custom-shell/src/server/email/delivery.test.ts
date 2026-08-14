import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import {
  getEmailDeliveryStatus,
  getEmailSettingsStatus,
  setEmailApiKey,
} from "@/server/email/settings"
import { customShellEmailSettings, customShellWorkspaces } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  emailIsOff,
  emailLinkStatusLine,
  emailOffConsequence,
  emailStatusLine,
} from "@/lib/email/email-delivery"

/**
 * The question this covers is "can this app send an email at all", which is
 * not the same as "has this workspace saved a key" — the app's own sign-in and
 * password-reset mails take the one key there is wherever it was typed, or the
 * server's own environment variable.
 */

const ENV_KEY = "CUSTOM_SHELL_RESEND_API_KEY"
const ENV_MODE = "CUSTOM_SHELL_API_ENV"
const originalKey = process.env[ENV_KEY]
const originalMode = process.env[ENV_MODE]

describe("whether email is on", () => {
  let db: CustomShellDb
  let workspaceId: string

  beforeEach(async () => {
    process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "test-encryption-key"
    delete process.env[ENV_KEY]
    delete process.env[ENV_MODE]

    db = (await createTestDatabase()).db as unknown as CustomShellDb
    const user = await insertUser(db, { email: "owner@example.com" })
    workspaceId = "ws-1"
    await db.insert(customShellWorkspaces).values({
      id: workspaceId,
      userId: user.id,
      name: "Test",
      settings: {},
      subdomain: `w-${Math.random().toString(36).slice(2, 10)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  afterEach(() => {
    restore(ENV_KEY, originalKey)
    restore(ENV_MODE, originalMode)
  })

  it("says nothing can send when there is no key anywhere", async () => {
    const status = await getEmailDeliveryStatus(db)
    expect(status.source).toBeNull()
    expect(emailIsOff(status)).toBe(true)
  })

  it("finds a key saved on a settings tab", async () => {
    await setEmailApiKey(workspaceId, "re_saved_key", db)

    const status = await getEmailDeliveryStatus(db)
    expect(status.source).toBe("settings")
    expect(emailIsOff(status)).toBe(false)
  })

  it("falls back to the server's own key, the way sending does", async () => {
    process.env[ENV_KEY] = "re_environment_key"

    expect((await getEmailDeliveryStatus(db)).source).toBe("environment")
  })

  it("counts a key it can no longer read as no key", async () => {
    await setEmailApiKey(workspaceId, "re_saved_key", db)
    // What a changed encryption secret leaves behind: a row with a key in it
    // that nothing can unscramble, which sends exactly as well as an empty one.
    await db
      .update(customShellEmailSettings)
      .set({ resendApiKeyEncrypted: "not-decryptable" })
      .where(eq(customShellEmailSettings.workspaceId, workspaceId))

    expect((await getEmailDeliveryStatus(db)).source).toBeNull()
  })

  it("never hands the key itself to the settings page", async () => {
    await setEmailApiKey(workspaceId, "re_saved_key_1234", db)

    const status = await getEmailSettingsStatus(workspaceId, db)
    expect(JSON.stringify(status)).not.toContain("re_saved_key_1234")
    expect(status.maskedKey).toBe("••••1234")
    expect(status.delivery.source).toBe("settings")
    expect(status.links.address).toBe("http://localhost:3002")
  })

  it("says only what a key saved here really covers", async () => {
    await setEmailApiKey(workspaceId, "re_saved_key", db)

    const { on, line } = emailStatusLine(
      await getEmailSettingsStatus(workspaceId, db)
    )
    expect(on).toBe(true)
    // A second workspace saving a key later takes over the app's own sign-in
    // and reset mails, so this must not claim to cover everything it sends.
    expect(line).toContain("This workspace's emails")
  })

  it("tells a workspace with an empty tab that email still works", async () => {
    // The server's own key sends this app's sign-in and reset mails; this
    // workspace's newsletters still need a key here, and the line says so.
    process.env[ENV_KEY] = "re_environment_key"

    const status = await getEmailSettingsStatus(workspaceId, db)
    expect(status.keyConfigured).toBe(false)

    const { on, line } = emailStatusLine(status)
    expect(on).toBe(true)
    expect(line).toContain("Email is on")
    expect(line).toContain("newsletters")
  })

  it("leads with the warning when there is no key", async () => {
    const status = await getEmailSettingsStatus(workspaceId, db)

    const { on, line } = emailStatusLine(status)
    expect(on).toBe(false)
    expect(line.startsWith("Email is off.")).toBe(true)
  })
})

describe("where email links lead", () => {
  it("warns when the app is using its local fallback", () => {
    const { on, line } = emailLinkStatusLine({
      links: {
        address: "http://localhost:3002",
        configured: false,
        production: false,
        usableForLinks: false,
      },
    })

    expect(on).toBe(false)
    expect(line).toContain("http://localhost:3002")
    expect(line).toContain("CUSTOM_SHELL_APP_URL")
  })

  it("shows a configured public address without a warning", () => {
    const { on, line } = emailLinkStatusLine({
      links: {
        address: "https://app.example.com",
        configured: true,
        production: true,
        usableForLinks: true,
      },
    })

    expect(on).toBe(true)
    expect(line).toBe("Email links point to https://app.example.com.")
  })

  it("says a live server is refusing links while its address is missing", () => {
    const { on, line } = emailLinkStatusLine({
      links: {
        address: "http://localhost:3002",
        configured: false,
        production: true,
        usableForLinks: false,
      },
    })

    expect(on).toBe(false)
    expect(line).toContain("cannot be built on this live server")
    expect(line).toContain("CUSTOM_SHELL_APP_URL is missing")
  })
})

describe("what being off costs", () => {
  it("says sign-ups fail on a live server", () => {
    expect(emailOffConsequence({ source: null, failsWithoutKey: true })).toContain(
      "Nobody can sign up"
    )
  })

  it("says links go to the log anywhere else", () => {
    expect(
      emailOffConsequence({ source: null, failsWithoutKey: false })
    ).toContain("server log")
  })
})

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}
