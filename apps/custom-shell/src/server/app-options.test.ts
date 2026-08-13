import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"

import {
  appAutomationExecutors,
  appBackgroundWorkers,
  appSitemapEntries,
  appSiteSearchResults,
  appTrustsOrigin,
  notifyAppAuthEvent,
} from "@/server/app-options"

/**
 * The server-side half of app options, checked the same way as the other half
 * in `src/lib/app-options.test.ts`: an option nobody set means exactly what the
 * shell did before it existed, and the app's file stays on the right side of
 * the lines it is near.
 *
 * The default is checked by passing an empty object rather than by reading this
 * app's own answers, so the check keeps working inside an app that has set the
 * option.
 */

describe("an option nobody set means what the shell always did", () => {
  it("adds no automation executors of its own", () => {
    expect(appAutomationExecutors({})).toEqual({})
  })

  it("runs no background workers of its own", () => {
    expect(appBackgroundWorkers({})).toEqual([])
  })

  it("vouches for no extra addresses", () => {
    // False is what keeps `requireAppOrigin` the check it always was: only the
    // configured addresses pass until an app says otherwise.
    expect(appTrustsOrigin("https://somebody-elses-site.com", {})).toBe(false)
  })

  it("adds no sitemap rows of its own", async () => {
    await expect(appSitemapEntries("site-1", {})).resolves.toEqual([])
  })

  it("adds no search results of its own", async () => {
    await expect(
      appSiteSearchResults("site-1", "parking", 40, {})
    ).resolves.toEqual([])
  })

  it("has nobody to tell when an account is made or signed in to", async () => {
    // Nothing to assert but that an app which set nothing is left alone.
    await expect(
      notifyAppAuthEvent({ kind: "signin", userId: "user-1" }, {})
    ).resolves.toBeUndefined()
  })
})

describe("an app's answer wins", () => {
  it("hands over the app's own executors", () => {
    const executors = {
      sendSms: async () => ({ type: "next" as const, summary: "Sent." }),
    }
    expect(appAutomationExecutors({ automations: { executors } })).toBe(
      executors
    )
  })

  it("hands over the app's own background workers", () => {
    const workers = [{ name: "video-media", tick: async () => {} }]
    expect(appBackgroundWorkers({ background: { workers } })).toBe(workers)
  })

  it("lets the app vouch for an address of its own", () => {
    const options = {
      security: { isTrustedOrigin: (o: string) => o === "https://alpha.test" },
    }
    expect(appTrustsOrigin("https://alpha.test", options)).toBe(true)
    expect(appTrustsOrigin("https://beta.test", options)).toBe(false)
  })

  it("hands the resolved site to the app's sitemap read", async () => {
    const extraEntries = vi.fn(async (workspaceId: string) => [
      { path: `/from-${workspaceId}` },
    ])

    await expect(
      appSitemapEntries("alpha", { sitemap: { extraEntries } })
    ).resolves.toEqual([{ path: "/from-alpha" }])
    expect(extraEntries).toHaveBeenCalledWith("alpha")
  })

  it("hands the resolved site, words and bound to every search source", async () => {
    const source = vi.fn(async (workspaceId: string, query: string) => [
      {
        type: "Listing",
        title: query,
        snippet: "",
        path: `/from-${workspaceId}`,
      },
    ])

    await expect(
      appSiteSearchResults("alpha", "parking", 20, {
        search: { sources: [source] },
      })
    ).resolves.toEqual([
      {
        type: "Listing",
        title: "parking",
        snippet: "",
        path: "/from-alpha",
      },
    ])
    expect(source).toHaveBeenCalledWith("alpha", "parking", 20)
  })

  it("tells the app who registered and who signed in", async () => {
    const seen: string[] = []
    const options = {
      auth: {
        onAuthEvent: async (event: { kind: string; userId: string }) => {
          seen.push(`${event.kind}:${event.userId}`)
        },
      },
    }

    await notifyAppAuthEvent({ kind: "register", userId: "user-1" }, options)
    await notifyAppAuthEvent({ kind: "signin", userId: "user-2" }, options)

    expect(seen).toEqual(["register:user-1", "signin:user-2"])
  })

  it("never lets a broken hook break a sign-in", async () => {
    // The account or the session already exists by the time the hook runs, so
    // a throw here would fail something that genuinely worked. It is logged
    // instead — quietly dropping it would hide a hook that stopped running.
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    const options = {
      auth: {
        onAuthEvent: async () => {
          throw new Error("the app's hook is broken")
        },
      },
    }

    await expect(
      notifyAppAuthEvent({ kind: "signin", userId: "user-1" }, options)
    ).resolves.toBeUndefined()
    expect(errors).toHaveBeenCalledOnce()

    errors.mockRestore()
  })
})

describe("the app's server options file stays on its own side of the line", () => {
  const source = () =>
    readFileSync(join(process.cwd(), "src/app/server-options.ts"), "utf8")

  it("leaves new doors to src/lib/api, where guards.test can see them", () => {
    // An endpoint declared in src/app would be invisible to the guard scanner,
    // which only walks src/lib/api — an unguarded door nobody is told about.
    // This file may reach the database, which is exactly why it must not also
    // be an address the open internet can call.
    expect(source()).not.toContain("createServerFn")
  })
})
