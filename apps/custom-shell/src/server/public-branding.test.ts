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

const workspaceOptions = vi.hoisted(() => ({ siteBranding: false }))
const request = vi.hoisted(() => ({ host: "" }))
const appPublicTheme = vi.hoisted(() => ({
  brandColor: "#123456",
  brandOverrides: { darkColor: "#abcdef" },
  canvasColor: "#f5f5f5",
  pageWidth: 960,
  mainSpacing: 24,
  contentAlignment: "center",
  backgroundPattern: "none",
  backgroundPatternSize: "medium",
  backgroundPatternOpacity: 8,
  buttonStyle: "solid",
  buttonCasing: "as-written",
  headerBorder: true,
  footerBorder: true,
  colorScheme: "dark",
  useCustomFont: false,
  font: "serif",
  radius: 4,
}))

/**
 * The app fixture above as the shell reads it: every value the app names, over
 * the shell's own starting look, with the app's plain canvas hex read as the
 * custom colour it draws.
 */
function normalizedAppPublicTheme() {
  return {
    ...createDefaultPublicTheme(),
    ...appPublicTheme,
    canvasColor: { mode: "custom", strength: 60, color: "#f5f5f5" },
  }
}

vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeader: (name: string) => (name === "host" ? request.host : null),
  getRequestProtocol: () => "http",
}))

vi.mock("@/app/options", () => ({
  appOptions: { publicTheme: appPublicTheme, workspaces: workspaceOptions },
}))

import { createDefaultPublicTheme } from "@/lib/public-theme"
import { now } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellSettings, DEFAULT_SETTINGS_KEY } from "@/server/schema"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"
import {
  parseShellGlobals,
  readBranding,
  shellGlobalsForWrite,
} from "@/server/shell-settings"
import { setPageVisibility } from "@/server/content/pages"
import { dropWorkspaceCache } from "@/server/workspaces/host"

const savedBaseDomain = process.env.CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN
let client: PGlite
let database: TestDatabase

beforeEach(async () => {
  workspaceOptions.siteBranding = false
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
  it("keeps each site's images when the app enables site branding", async () => {
    workspaceOptions.siteBranding = true
    const timestamp = now()
    await database.insert(customShellSettings).values({
      key: DEFAULT_SETTINGS_KEY,
      settings: { logo: "https://media.example.test/default.png" },
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await insertWorkspace(database, {
      name: "Alpha", subdomain: "alpha",
      settings: {
        favicon: "https://media.example.test/alpha-icon.png",
        logo: "https://media.example.test/alpha.png",
        logoDark: "https://media.example.test/alpha-dark.png",
        shareImage: "https://media.example.test/alpha-share.png",
      },
    })
    await insertWorkspace(database, { name: "Beta", subdomain: "beta" })
    request.host = "alpha.localhost:3002"
    expect(await readBranding(database as unknown as CustomShellDb)).toMatchObject({
      favicon: "https://media.example.test/alpha-icon.png",
      faviconSet: null,
      logo: "https://media.example.test/alpha.png",
      logoDark: "https://media.example.test/alpha-dark.png",
      shareImage: "https://media.example.test/alpha-share.png",
    })
    request.host = "beta.localhost:3002"
    expect(await readBranding(database as unknown as CustomShellDb)).toMatchObject({
      logo: "https://media.example.test/default.png",
      logoDark: "", shareImage: "",
    })
  })


  it("carries the app-wide public header layout and user panel into public branding", async () => {
    const timestamp = now()
    await database.insert(customShellSettings).values({
      key: DEFAULT_SETTINGS_KEY,
      settings: {
        publicHeader: {
          sticky: true,
          menuAlignment: "center",
          logoSize: "small",
        },
        publicUserPanel: {
          login: { label: "Log in", href: "/login", style: "ghost" },
          links: [{ id: "profile", label: "Profile", href: "/account" }],
        },
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    const branding = await readBranding(database as unknown as CustomShellDb)

    expect(branding.publicHeader).toEqual({
      sticky: true,
      menuAlignment: "center",
      logoSize: "small",
      fullWidth: false,
      width: null,
      blur: "medium",
      logoGap: 0,
    })
    expect(branding.publicUserPanel.login).toMatchObject({
      label: "Log in",
      style: "ghost",
    })
    expect(branding.publicUserPanel.register.label).toBe("Create an account")
    expect(branding.publicUserPanel.links).toEqual([
      { id: "profile", label: "Profile", href: "/account", icon: "" },
    ])
    expect(
      shellGlobalsForWrite({
        publicHeader: {
          sticky: true,
          menuAlignment: "center",
          logoSize: "large",
        },
      }).publicHeader
    ).toEqual({
      sticky: true,
      menuAlignment: "center",
      logoSize: "large",
      fullWidth: false,
      width: null,
      blur: "medium",
      logoGap: 0,
    })
  })

  it("uses the single site's public links on the platform address", async () => {
    process.env.CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN = ""
    request.host = "localhost:3002"
    const timestamp = now()
    await database.insert(customShellSettings).values({
      key: DEFAULT_SETTINGS_KEY,
      settings: {
        publicNavigation: [{ label: "About", href: "/about" }],
        publicFooter: [{ label: "Privacy", href: "/privacy" }],
        publicFooterCopyright: "Single site copyright",
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await insertWorkspace(database, {
      name: "Single public site",
      settings: {
        publicNavigation: [{ label: "Wrong menu", href: "/wrong" }],
        publicFooter: [{ label: "Wrong footer", href: "/wrong" }],
        publicFooterCopyright: "Wrong copyright",
      },
    })

    const branding = await readBranding(database as unknown as CustomShellDb)

    expect(branding.publicNavigation).toEqual([
      { type: "search", visible: true },
      { label: "About", href: "/about" },
    ])
    expect(branding.publicFooter).toEqual([
      { label: "Privacy", href: "/privacy" },
    ])
    expect(branding.publicFooterCopyright).toBe("Single site copyright")
  })

  it("returns app-wide front page rows in order and drops incomplete rows", async () => {
    const timestamp = now()
    await database.insert(customShellSettings).values({
      key: DEFAULT_SETTINGS_KEY,
      settings: {
        frontPageRows: [
          {
            id: "welcome",
            heading: "Welcome",
            intro: "Start here.",
            kind: "text",
            layout: "narrow",
          },
          {
            id: "blank",
            heading: " ",
            intro: "This row is incomplete.",
            kind: "text",
            layout: "wide",
          },
          {
            id: "plans",
            heading: "Plans",
            intro: "Choose what works.",
            kind: "plans",
            layout: "wide",
          },
          {
            id: "empty-faq",
            heading: "Empty questions",
            intro: "Nothing complete lives here.",
            kind: "faq",
            layout: "wide",
            items: [{ id: "empty", question: "Question", answer: "" }],
          },
          {
            id: "faq",
            heading: "Questions",
            intro: "Answers before signup.",
            kind: "faq",
            layout: "narrow",
            items: [
              {
                id: "billing",
                question: "How does billing work?",
                answer: "Choose a public plan.",
              },
            ],
          },
        ],
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    const branding = await readBranding(database as unknown as CustomShellDb)

    expect(branding.frontPageRows.map((row) => row.id)).toEqual([
      "welcome",
      "plans",
      "faq",
    ])
  })

  it("uses app-wide icons, social metadata, and system copy on public domains", async () => {
    const timestamp = now()
    const light = {
      source: "https://media.example.test/owner/favicon.png",
      icon16: "https://media.example.test/owner/favicons/v1/light-16.png",
      icon32: "https://media.example.test/owner/favicons/v1/light-32.png",
      appleTouchIcon:
        "https://media.example.test/owner/favicons/v1/light-180.png",
      icon512: "https://media.example.test/owner/favicons/v1/light-512.png",
    }
    await database.insert(customShellSettings).values({
      key: DEFAULT_SETTINGS_KEY,
      settings: {
        favicon: light.source,
        faviconDark: "https://media.example.test/owner/favicon-dark.png",
        faviconSet: { light },
        shareImage: "https://media.example.test/owner/share.png",
        shareImageVersion: "2026-09-02T12:00:00.000Z",
        socialCardType: "summary_large_image",
        socialHandle: "custom_shell",
        publicSeo: {
          homeTitle: "Public home",
          homeDescription: "The public front page.",
          writtenTitleTemplate: "{{page_title}} | {{site_title}}",
          writtenDescriptionTemplate: "Read {{page_title}}.",
          siteDescription: "The public site default.",
        },
        publicSystemCopy: {
          notFoundHeading: "Lost?",
          notFoundBody: "Try the front page.",
          maintenanceHeading: "Taking a short break",
          maintenanceBody: "Back at noon.",
        },
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await insertWorkspace(database, {
      name: "Public site",
      subdomain: "public",
      settings: { favicon: "https://media.example.test/site-icon.png" },
    })
    request.host = "public.localhost:3002"

    const branding = await readBranding(database as unknown as CustomShellDb)

    expect(branding).toMatchObject({
      favicon: light.source,
      faviconDark: "https://media.example.test/owner/favicon-dark.png",
      faviconSet: { light },
      shareImage:
        "https://media.example.test/owner/share.png?v=2026-09-02T12%3A00%3A00.000Z",
      socialCardType: "summary_large_image",
      socialHandle: "custom_shell",
      publicOrigin: "http://public.localhost:3002",
      publicSeo: {
        homeTitle: "Public home",
        homeDescription: "The public front page.",
        writtenTitleTemplate: "{{page_title}} | {{site_title}}",
        writtenDescriptionTemplate: "Read {{page_title}}.",
        siteDescription: "The public site default.",
      },
      publicSystemCopy: {
        notFoundHeading: "Lost?",
        notFoundBody: "Try the front page.",
        maintenanceHeading: "Taking a short break",
        maintenanceBody: "Back at noon.",
      },
      publicSearchEnabled: true,
    })
  })

  it("does not offer a site's search page after it is switched off", async () => {
    const workspace = await insertWorkspace(database, {
      name: "Private search",
      subdomain: "private-search",
      settings: {},
    })
    request.host = "private-search.localhost:3002"

    const testDb = database as unknown as CustomShellDb
    expect((await readBranding(testDb)).publicSearchEnabled).toBe(true)
    await setPageVisibility(
      workspace.id,
      { path: "/search", visibility: "off" },
      testDb
    )

    expect((await readBranding(testDb)).publicSearchEnabled).toBe(false)
  })

  it("keeps a hidden row out of what a visitor is served", async () => {
    const timestamp = now()
    await database.insert(customShellSettings).values({
      key: DEFAULT_SETTINGS_KEY,
      settings: {
        frontPageRows: [
          { id: "shown", heading: "Shown", kind: "text" },
          { id: "staged", heading: "Staged", kind: "text", hidden: true },
        ],
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    const branding = await readBranding(database as unknown as CustomShellDb)

    // The visitor's data carries one row. The staged one is not hidden with a
    // class, it is not in the response at all, so its words cannot be read out
    // of the page source before it is ready.
    expect(branding.frontPageRows.map((row) => row.heading)).toEqual(["Shown"])
    expect(JSON.stringify(branding)).not.toContain("Staged")

    // The admin's own read still has both, so the editor can list it.
    const globals = parseShellGlobals({
      frontPageRows: [
        { id: "shown", heading: "Shown", kind: "text" },
        { id: "staged", heading: "Staged", kind: "text", hidden: true },
      ],
    })
    expect(globals.frontPageRows.map((row) => row.heading)).toEqual([
      "Shown",
      "Staged",
    ])
  })

  it("carries an admin's saved presets through a global write", () => {
    const written = shellGlobalsForWrite({
      appName: "Bookshelf",
      publicThemePresets: [
        { id: "mine", name: "Summer", theme: { radius: 4 } },
        { id: "mine", name: "Duplicate id", theme: {} },
      ],
    }).publicThemePresets

    expect(written).toHaveLength(1)
    expect(written[0]).toMatchObject({ id: "mine", name: "Summer" })
    expect(written[0].theme.radius).toBe(4)
  })

  it("keeps app theme defaults out of unrelated global writes", () => {
    expect(shellGlobalsForWrite({ appName: "Bookshelf" }).publicTheme).toEqual(
      {}
    )
    expect(
      shellGlobalsForWrite({
        appName: "Bookshelf",
        publicTheme: { font: "mono" },
      }).publicTheme
    ).toEqual({ font: "mono" })
  })

  it("uses the app's public theme when the site has nothing saved", async () => {
    await insertWorkspace(database, {
      name: "Fresh site",
      subdomain: "fresh",
      settings: {},
    })
    request.host = "fresh.localhost:3002"

    const branding = await readBranding(database as unknown as CustomShellDb)

    expect(branding.publicTheme).toEqual(normalizedAppPublicTheme())
  })

  it("combines saved app-wide values with the site's brand", async () => {
    const timestamp = now()
    await database.insert(customShellSettings).values({
      key: DEFAULT_SETTINGS_KEY,
      settings: { publicTheme: { font: "mono" } },
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
      ...normalizedAppPublicTheme(),
      brandColor: "#2563eb",
      brandOverrides: { hoverColor: "#1d4ed8" },
      font: "mono",
    })
  })

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
      ...createDefaultPublicTheme(),
      brandColor: "#2563eb",
      brandOverrides: { hoverColor: "#1d4ed8" },
      // Saved as a plain hex before the canvas gained its mode picker.
      canvasColor: { mode: "custom", strength: 60, color: "#f1f5f9" },
      pageWidth: 960,
      mainSpacing: 24,
      contentAlignment: "right",
      backgroundPattern: "none",
      backgroundPatternSize: "medium",
      backgroundPatternOpacity: 8,
      buttonStyle: "solid",
      buttonCasing: "as-written",
      headerBorder: false,
      footerBorder: true,
      colorScheme: "dark",
      useCustomFont: false,
      font: "serif",
      radius: 4,
    })
  })
})
