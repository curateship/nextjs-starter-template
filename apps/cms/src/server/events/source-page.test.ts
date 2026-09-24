import { describe, expect, it, vi } from "vitest"

import {
  pageText,
  readSourcePage,
  type SourcePageDependencies,
} from "@/server/events/source-page"

/**
 * Reading the page an admin typed into the Draft events step, without letting
 * that address reach inside the server's own network.
 */

function deps(
  overrides: Partial<SourcePageDependencies> = {}
): SourcePageDependencies {
  return {
    resolve: vi.fn(async () => [{ address: "93.184.215.14", family: 4 }]),
    get: vi.fn(async () => ({
      status: 200,
      location: null,
      contentType: "text/html; charset=utf-8",
      body: "<p>Fri Oct 2 &amp; Sat Oct 3</p>",
    })),
    timeoutMs: 1_000,
    ...overrides,
  }
}

describe("readSourcePage", () => {
  it("reads a public page as text", async () => {
    expect(await readSourcePage("https://venue.example/gigs", deps())).toEqual({
      url: "https://venue.example/gigs",
      text: "Fri Oct 2 & Sat Oct 3",
    })
  })

  it("refuses a name that points inside the network, before connecting", async () => {
    const get = vi.fn()
    await expect(
      readSourcePage(
        "https://sneaky.example/",
        deps({
          resolve: async () => [{ address: "10.0.0.5", family: 4 }],
          get,
        })
      )
    ).rejects.toThrow("points to a private or internal address")
    expect(get).not.toHaveBeenCalled()
  })

  it("checks a redirect's new address the same way", async () => {
    const resolve = vi.fn(async (hostname: string) =>
      hostname === "venue.example"
        ? [{ address: "93.184.215.14", family: 4 }]
        : [{ address: "127.0.0.1", family: 4 }]
    )
    const get = vi.fn(async () => ({
      status: 302,
      location: "https://inside.example/admin",
      contentType: "",
      body: "",
    }))
    await expect(
      readSourcePage("https://venue.example/", deps({ resolve, get }))
    ).rejects.toThrow("inside.example points to a private or internal address")
    expect(get).toHaveBeenCalledTimes(1)
  })

  it("says a refused redirect was a redirect, not the address typed", async () => {
    const get = vi.fn(async () => ({
      status: 301,
      location: "http://venue.example/gigs",
      contentType: "",
      body: "",
    }))
    await expect(
      readSourcePage("https://venue.example/gigs", deps({ get }))
    ).rejects.toThrow(
      "The page sent the step on to http://venue.example/gigs. The page's address must start with https://."
    )
  })

  it("refuses a redirect to an address that is not one", async () => {
    const get = vi.fn(async () => ({
      status: 302,
      location: "https://[bad",
      contentType: "",
      body: "",
    }))
    await expect(
      readSourcePage("https://venue.example/", deps({ get }))
    ).rejects.toThrow("venue.example sent a redirect to an address that is not one.")
  })

  it("refuses http and localhost addresses outright", async () => {
    await expect(
      readSourcePage("http://venue.example/", deps())
    ).rejects.toThrow("must start with https://")
    await expect(
      readSourcePage("https://localhost/", deps())
    ).rejects.toThrow("private or internal address")
  })

  it("says which status a failed page answered with", async () => {
    await expect(
      readSourcePage(
        "https://venue.example/",
        deps({
          get: async () => ({
            status: 404,
            location: null,
            contentType: "text/html",
            body: "",
          }),
        })
      )
    ).rejects.toThrow("venue.example answered with HTTP 404")
  })

  it("refuses a file that is not a page or a feed", async () => {
    await expect(
      readSourcePage(
        "https://venue.example/poster.pdf",
        deps({
          get: async () => ({
            status: 200,
            location: null,
            contentType: "application/pdf",
            body: "%PDF",
          }),
        })
      )
    ).rejects.toThrow("The address is a application/pdf file")
  })
})

describe("pageText", () => {
  it("keeps the words and the event markup, and drops scripts and styles", () => {
    const text = pageText(`
      <html><head><style>p { color: red }</style>
      <script>track()</script>
      <script type="application/ld+json">{"@type":"Event","startDate":"2026-10-02T21:00"}</script>
      </head><body><h1>What's on</h1><p>Fri Oct 2<br>The Rusty Nails</p></body></html>`)
    expect(text).toContain('"startDate":"2026-10-02T21:00"')
    expect(text).toContain("What's on\nFri Oct 2\nThe Rusty Nails")
    expect(text).not.toContain("track()")
    expect(text).not.toContain("color: red")
  })

  it("reads a feed whose descriptions are HTML written as text", () => {
    const text = pageText(
      "<rss><channel><item><title>Open mic</title><description>&lt;p&gt;Thursday &lt;b&gt;8pm&lt;/b&gt;&lt;/p&gt;</description></item></channel></rss>"
    )
    expect(text).toBe("Open mic Thursday 8pm")
  })
})
