import { PGlite } from "@electric-sql/pglite"
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

const request = vi.hoisted(() => ({ host: "" }))

vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeader: (name: string) => (name === "host" ? request.host : null),
}))

import { now } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellSettings, DEFAULT_SETTINGS_KEY } from "@/server/schema"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"
import { readBranding } from "@/server/shell-settings"
import { dropWorkspaceCache } from "@/server/workspaces/host"

const savedBaseDomain = process.env.CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN
let client: PGlite
let database: TestDatabase

beforeEach(async () => {
  request.host = ""
  process.env.CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN = "localhost"
  const testDatabase = await createTestDatabase()
  client = testDatabase.client
  database = testDatabase.db
  dropWorkspaceCache()
})

afterEach(async () => {
  dropWorkspaceCache()
  await client.close()
})

afterAll(() => {
  if (savedBaseDomain === undefined) {
    delete process.env.CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN
  } else {
    process.env.CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN = savedBaseDomain
  }
})

describe("public site branding", () => {
  it("combines app-wide type and corners with the domain's brand colour", async () => {
    const timestamp = now()
    await database.insert(customShellSettings).values({
      key: DEFAULT_SETTINGS_KEY,
      settings: {
        publicTheme: {
          brandColor: "#dc2626",
          brandOverrides: { darkColor: "#f87171" },
          canvasColor: "#f1f5f9",
          pageWidth: 960,
          mainSpacing: 24,
          contentAlignment: "right",
          headerBorder: false,
          footerBorder: true,
          colorScheme: "dark",
          font: "serif",
          radius: 4,
        },
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await insertWorkspace(database, {
      name: "Blue site",
      subdomain: "blue",
      settings: {
        publicTheme: {
          brandColor: "#2563eb",
          brandOverrides: { hoverColor: "#1d4ed8" },
        },
      },
    })
    request.host = "blue.localhost:3002"

    const branding = await readBranding(database as unknown as CustomShellDb)

    expect(branding.publicTheme).toEqual({
      brandColor: "#2563eb",
      brandOverrides: { hoverColor: "#1d4ed8" },
      canvasColor: "#f1f5f9",
      pageWidth: 960,
      mainSpacing: 24,
      contentAlignment: "right",
      headerBorder: false,
      footerBorder: true,
      colorScheme: "dark",
      font: "serif",
      radius: 4,
    })
  })
})
