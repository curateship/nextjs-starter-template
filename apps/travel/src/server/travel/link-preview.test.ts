import { describe, expect, it } from "vitest"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { cleanNoteBody } from "@/lib/travel/note-blocks"
import { resolvePublicWebhookTarget } from "@/server/automations/net-guard"
import { loadLinkPreview, readPagePreview, type FetchPage } from "@/server/travel/link-preview"

/** The shell's real check, with a name lookup that answers from this list instead of the network. */
function resolveFrom(addresses: Record<string, string>) {
  return (value: string) =>
    resolvePublicWebhookTarget(value, async (hostname) => {
      const address = addresses[hostname]
      if (!address) throw new Error("not found")
      return [{ address, family: 4 as const }]
    })
}

const PUBLIC = { "www.example.com": "93.184.216.34", "example.org": "93.184.216.35", "inside.example.com": "10.0.0.5" }

/** Pages by address: a redirect, a page, or a failure. */
function pages(answers: Record<string, { status?: number; location?: string; type?: string; body?: string } | "down">) {
  const asked: string[] = []
  const fetch: FetchPage = async (target) => {
    asked.push(target.url.toString())
    const answer = answers[target.url.toString()]
    if (!answer || answer === "down") throw new Error("no answer")
    return { status: answer.status ?? 200, location: answer.location ?? null, type: answer.type ?? "text/html; charset=utf-8", body: answer.body ?? "" }
  }
  return { fetch, asked }
}

const ARTICLE = `<html><head>
  <title>Ignored when og:title is there</title>
  <meta property="og:title" content="Best ramen in Tokyo &amp; Kyoto">
  <meta content="/pictures/ramen.jpg" property="og:image" />
  <meta property='og:site_name' content='Eat Japan'>
</head><body>…</body></html>`

describe("reading a page (Travel features 4, part 5)", () => {
  it("takes the page's title, picture and site name, with the picture made a full address", () => {
    expect(readPagePreview(ARTICLE, new URL("https://www.example.com/ramen"))).toEqual({
      url: "https://www.example.com/ramen",
      title: "Best ramen in Tokyo & Kyoto",
      image: "https://www.example.com/pictures/ramen.jpg",
      site: "Eat Japan",
    })
  })

  it("falls back to the <title> and the site's own name", () => {
    expect(readPagePreview("<title> Plain page </title>", new URL("https://www.example.com/a"))).toEqual({
      url: "https://www.example.com/a",
      title: "Plain page",
      image: null,
      site: "example.com",
    })
  })

  it("drops a picture that isn't https", () => {
    const page = '<meta property="og:image" content="http://cdn.example.com/a.jpg">'
    expect(readPagePreview(page, new URL("https://www.example.com/a")).image).toBeNull()
  })
})

describe("loadLinkPreview", () => {
  const resolve = resolveFrom(PUBLIC)

  it("reads a page after following a redirect", async () => {
    const { fetch } = pages({
      "https://www.example.com/short": { status: 301, location: "/ramen" },
      "https://www.example.com/ramen": { body: ARTICLE },
    })
    const card = await loadLinkPreview("https://www.example.com/short#top", { resolve, fetch })
    expect(card).toMatchObject({ url: "https://www.example.com/ramen", title: "Best ramen in Tokyo & Kyoto", site: "Eat Japan" })
  })

  it("puts https:// in front of a bare address", async () => {
    const { fetch, asked } = pages({ "https://www.example.com/ramen": { body: ARTICLE } })
    expect((await loadLinkPreview("www.example.com/ramen", { resolve, fetch })).title).toBe("Best ramen in Tokyo & Kyoto")
    expect(asked).toEqual(["https://www.example.com/ramen"])
    await expect(loadLinkPreview("ramen", { resolve, fetch })).rejects.toThrow(TRAVEL_ERRORS.linkNotAddress)
  })

  it("reads an http address as https", async () => {
    const { fetch, asked } = pages({ "https://www.example.com/ramen": { body: ARTICLE } })
    expect((await loadLinkPreview("http://www.example.com/ramen", { resolve, fetch })).url).toBe("https://www.example.com/ramen")
    expect(asked).toEqual(["https://www.example.com/ramen"])
  })

  it("refuses an address that isn't a web page's, isn't an address, or points inside a private network", async () => {
    const { fetch, asked } = pages({})
    await expect(loadLinkPreview("ftp://www.example.com/", { resolve, fetch })).rejects.toThrow(TRAVEL_ERRORS.linkNotHttps)
    await expect(loadLinkPreview("not a link", { resolve, fetch })).rejects.toThrow(TRAVEL_ERRORS.linkNotAddress)
    await expect(loadLinkPreview("https://localhost:3026/", { resolve, fetch })).rejects.toThrow(TRAVEL_ERRORS.linkPrivate)
    await expect(loadLinkPreview("https://192.168.1.1/", { resolve, fetch })).rejects.toThrow(TRAVEL_ERRORS.linkPrivate)
    // A public-looking name that looks up to a private address is refused too.
    await expect(loadLinkPreview("https://inside.example.com/", { resolve, fetch })).rejects.toThrow(TRAVEL_ERRORS.linkPrivate)
    await expect(loadLinkPreview("https://nowhere.example.net/", { resolve, fetch })).rejects.toThrow(TRAVEL_ERRORS.linkNotFound)
    expect(asked).toEqual([])
  })

  it("never follows a redirect into a private network, and stops after 3 redirects", async () => {
    const intoPrivate = pages({ "https://www.example.com/go": { status: 302, location: "https://inside.example.com/admin" } })
    expect(await loadLinkPreview("https://www.example.com/go", { resolve, fetch: intoPrivate.fetch })).toEqual({
      url: "https://www.example.com/go",
      title: null,
      image: null,
      site: "example.com",
    })
    expect(intoPrivate.asked).toEqual(["https://www.example.com/go"])

    const loop = pages({ "https://example.org/a": { status: 302, location: "https://example.org/a" } })
    const card = await loadLinkPreview("https://example.org/a", { resolve, fetch: loop.fetch })
    expect(card.title).toBeNull()
    expect(loop.asked).toHaveLength(4)
  })

  it("still makes a card from the address when the page is down or isn't a page", async () => {
    const down = pages({ "https://example.org/a": "down" })
    expect(await loadLinkPreview("https://example.org/a", { resolve, fetch: down.fetch })).toEqual({
      url: "https://example.org/a",
      title: null,
      image: null,
      site: "example.org",
    })
    const pdf = pages({ "https://example.org/menu.pdf": { type: "application/pdf", body: "%PDF" } })
    expect((await loadLinkPreview("https://example.org/menu.pdf", { resolve, fetch: pdf.fetch })).site).toBe("example.org")
  })
})

describe("a saved Link block", () => {
  it("keeps a checked link and drops one that isn't https", () => {
    const body = cleanNoteBody({
      type: "doc",
      content: [
        { type: "noteLink", attrs: { url: "https://example.org/a", title: "  A page ", image: "javascript:alert(1)", site: "", extra: 1 } },
        { type: "noteLink", attrs: { url: "http://example.org/b" } },
      ],
    })
    expect(body.content).toEqual([
      { type: "noteLink", attrs: { url: "https://example.org/a", title: "A page", image: null, site: "example.org" } },
    ])
  })
})
