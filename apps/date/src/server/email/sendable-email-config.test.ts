import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { encryptSecret } from "@/server/auth/encryption"
import { type CustomShellDb } from "@/server/db"
import {
  getEmailSetupProblem,
  getSendableEmailConfig,
  saveEmailSender,
} from "@/server/email/settings"
import { customShellEmailSettings } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"

let client: PGlite
let db: CustomShellDb
let workspaceId: string
const saved = { ...process.env }

beforeEach(async () => {
  process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "test-encryption-key"
  process.env.CUSTOM_SHELL_API_ENV = "production"
  delete process.env.CUSTOM_SHELL_RESEND_API_KEY
  delete process.env.CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN
  const created = await createTestDatabase()
  client = created.client
  db = created.db as unknown as CustomShellDb
  const user = await insertUser(db, { email: "owner@example.test" })
  workspaceId = (await insertWorkspace(db, { userId: user.id })).id
})

afterEach(async () => {
  process.env = { ...saved }
  await client.close()
})

describe("the key a newsletter or test send uses", () => {
  it("uses the server's key when Settings → Email has none", async () => {
    process.env.CUSTOM_SHELL_RESEND_API_KEY = "re_server_key"
    await saveEmailSender(workspaceId, { fromEmail: "hello@example.test", fromName: "Tyler" }, db)

    const config = await getSendableEmailConfig(workspaceId, db)
    expect(config?.apiKey).toBe("re_server_key")
    expect(config?.from).toBe("Tyler <hello@example.test>")
  })

  it("never lends the server's key to a site on an app serving many sites", async () => {
    process.env.CUSTOM_SHELL_RESEND_API_KEY = "re_server_key"
    process.env.CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN = "example.test"
    await saveEmailSender(workspaceId, { fromEmail: "hello@example.test", fromName: "" }, db)

    expect(await getSendableEmailConfig(workspaceId, db)).toBeNull()
    expect(await getEmailSetupProblem(workspaceId, db)).toBe("EMAIL_KEY_MISSING")
  })

  it("prefers the key saved in Settings → Email", async () => {
    process.env.CUSTOM_SHELL_RESEND_API_KEY = "re_server_key"
    await saveEmailSender(workspaceId, { fromEmail: "hello@example.test", fromName: "" }, db)
    await db
      .update(customShellEmailSettings)
      .set({ resendApiKeyEncrypted: encryptSecret("re_saved_key") })
      .where(eq(customShellEmailSettings.workspaceId, workspaceId))

    expect((await getSendableEmailConfig(workspaceId, db))?.apiKey).toBe("re_saved_key")
  })
})

describe("which piece is missing", () => {
  it("names the from address when none is saved", async () => {
    process.env.CUSTOM_SHELL_RESEND_API_KEY = "re_server_key"
    expect(await getSendableEmailConfig(workspaceId, db)).toBeNull()
    expect(await getEmailSetupProblem(workspaceId, db)).toBe("EMAIL_FROM_MISSING")
  })

  it("names the key when the address is saved but there is no key anywhere", async () => {
    await saveEmailSender(workspaceId, { fromEmail: "hello@example.test", fromName: "" }, db)
    expect(await getSendableEmailConfig(workspaceId, db)).toBeNull()
    expect(await getEmailSetupProblem(workspaceId, db)).toBe("EMAIL_KEY_MISSING")
  })
})
