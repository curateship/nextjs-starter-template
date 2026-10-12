import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"
import type { FindStatus } from "@/lib/social/options"

import {
  cleanLinkUrl,
  fetchLinkPage,
  LinkReadError,
  readDueLinkPages,
  summarisePage,
  type FetchOnce,
} from "./link-page"
import { promoFinds, promoKeywords } from "./schema"

/**
 * Reading the page a Reddit link post points to. Every address here is
 * written as a number, so nothing is looked up, and every request goes to a
 * fake, so nothing leaves this machine.
 */

const PAGE = `<html><head><title>Ignored when there is a share title</title>
<meta property="og:title" content="We cut our churn in half">
<meta name="description" content="A description."></head>
<body><nav><p>Home, About, Pricing, Blog and a long list of other links nobody reads first</p></nav>
<p>By Ann</p>
<p>Last year we lost one customer in five every month, and this is the story of what we changed &amp; what it cost.</p>
<p>Second paragraph.</p></body></html>`

function htmlAnswer(body = PAGE) {
  return {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: Buffer.from(body),
  }
}

describe("which links are worth reading", () => {
  it("keeps an ordinary web page outside Reddit", () => {
    expect(cleanLinkUrl("https://example.com/blog/churn#top")).toBe("https://example.com/blog/churn")
  })

  it("drops Reddit itself, pictures, video and anything not on the web", () => {
    for (const url of [
      "https://www.reddit.com/r/SaaS/comments/abc/",
      "https://i.redd.it/abc.png",
      "https://v.redd.it/abc",
      "https://i.imgur.com/abc.jpg",
      "https://www.youtube.com/watch?v=abc",
      "https://example.com/photo.JPG",
      "ftp://example.com/file",
      "javascript:alert(1)",
      "https://user:pass@example.com/",
      "not an address",
      "",
    ]) {
      expect(cleanLinkUrl(url)).toBe("")
    }
  })
})

describe("refusing a link that points inside the network", () => {
  const neverAsked: FetchOnce = vi.fn(async () => htmlAnswer())

  async function refusal(url: string, fetchOnce: FetchOnce = neverAsked) {
    try {
      await fetchLinkPage(url, fetchOnce)
    } catch (error) {
      return error
    }
    throw new Error(`${url} was read`)
  }

  it("refuses cloud metadata, this machine and the private ranges, before asking", async () => {
    for (const url of [
      "http://169.254.169.254/latest/meta-data/",
      "http://127.0.0.1/",
      "http://10.0.0.5/",
      "http://192.168.1.1/",
      "http://172.16.0.1/",
      "http://[::1]/",
      "http://[fd00::1]/",
    ]) {
      const error = await refusal(url)
      expect(error).toBeInstanceOf(LinkReadError)
      expect((error as LinkReadError).insideNetwork).toBe(true)
      expect((error as LinkReadError).message).toContain("points inside the network")
    }
    expect(neverAsked).not.toHaveBeenCalled()
  })

  it("refuses this machine written as an IPv6 address carrying an IPv4 one", async () => {
    // A URL parser writes [::ffff:127.0.0.1] as [::ffff:7f00:1], which a
    // check for the dotted form alone would let through.
    expect(new URL("http://[::ffff:127.0.0.1]/").hostname).toBe("[::ffff:7f00:1]")
    expect(((await refusal("http://[::ffff:127.0.0.1]/")) as LinkReadError).insideNetwork).toBe(true)
  })

  it("refuses a public page that redirects inside the network", async () => {
    const fetchOnce: FetchOnce = vi.fn(async (url: URL) =>
      url.hostname === "93.184.216.34"
        ? { status: 302, headers: { location: "http://169.254.169.254/" }, body: Buffer.alloc(0) }
        : htmlAnswer()
    )
    const error = (await refusal("http://93.184.216.34/start", fetchOnce)) as LinkReadError
    expect(error.insideNetwork).toBe(true)
    // Only the public hop was ever asked.
    expect(fetchOnce).toHaveBeenCalledTimes(1)
  })

  it("connects to the address it checked", async () => {
    const fetchOnce: FetchOnce = vi.fn(async () => htmlAnswer())
    await fetchLinkPage("http://93.184.216.34/post", fetchOnce)
    expect(fetchOnce).toHaveBeenCalledWith(expect.any(URL), "93.184.216.34", expect.any(Number))
  })

  it("refuses an unusual port and a name and password, without asking", async () => {
    expect(((await refusal("http://93.184.216.34:6379/")) as Error).message).toContain("port 6379")
    expect(((await refusal("http://a:b@93.184.216.34/")) as Error).message).toContain("name and password")
    expect(neverAsked).not.toHaveBeenCalled()
  })
})

describe("reading a public page", () => {
  it("keeps the share title and the first real paragraph, not the menu or the byline", async () => {
    const page = await fetchLinkPage("http://93.184.216.34/post", async () => htmlAnswer())
    expect(page).toEqual({
      url: "http://93.184.216.34/post",
      title: "We cut our churn in half",
      text: "Last year we lost one customer in five every month, and this is the story of what we changed & what it cost.",
    })
  })

  it("follows a redirect and says where it ended up", async () => {
    const page = await fetchLinkPage("http://93.184.216.34/short", async (url) =>
      url.pathname === "/short"
        ? { status: 301, headers: { location: "/long" }, body: Buffer.alloc(0) }
        : htmlAnswer()
    )
    expect(page.url).toBe("http://93.184.216.34/long")
  })

  it("gives up after three redirects", async () => {
    await expect(
      fetchLinkPage("http://93.184.216.34/a", async () => ({
        status: 302,
        headers: { location: "/a" },
        body: Buffer.alloc(0),
      }))
    ).rejects.toThrow("redirected more than 3 times")
  })

  it("says what came back when it is not a web page or not a success", async () => {
    await expect(
      fetchLinkPage("http://93.184.216.34/f", async () => ({
        status: 200,
        headers: { "content-type": "application/pdf" },
        body: Buffer.alloc(0),
      }))
    ).rejects.toThrow("not a web page (application/pdf)")
    await expect(
      fetchLinkPage("http://93.184.216.34/f", async () => ({ status: 403, headers: {}, body: Buffer.alloc(0) }))
    ).rejects.toThrow("The page answered 403.")
  })

  it("falls back to the page's description, and caps a long paragraph at a word", () => {
    expect(summarisePage('<title>T</title><meta content="Short and plain." name="description">', "u")?.text).toBe(
      "Short and plain."
    )
    const long = summarisePage(`<p>${"word ".repeat(400)}</p>`, "u")
    expect(long?.text.length).toBeLessThanOrEqual(1_001)
    expect(long?.text.endsWith("word…")).toBe(true)
  })

  it("has nothing to say about a page that only draws itself with JavaScript", () => {
    expect(summarisePage("<html><body><div id=root></div><script>app()</script></body></html>", "u")).toBeNull()
  })

  it("keeps a script's own < signs and a footnote out of the paragraph", () => {
    const page = summarisePage(
      `<script>if (a<b) go("</p>")</script><!-- <p>not this</p> -->
      <p>The tracker has watched Amazon prices since 2008<sup>[1]</sup>, and it emails you when one drops.</p>`,
      "u"
    )
    expect(page?.text).toBe("The tracker has watched Amazon prices since 2008, and it emails you when one drops.")
  })

  // Each of these took between 6 seconds and 3.5 minutes on the patterns this
  // replaced, holding the whole server while it ran.
  it.each(["<p>x ", "<sup>x ", "<p ", "<title ", "<meta ", "<!--"])(
    "reads half a megabyte of %j at once",
    (unit) => {
      const started = performance.now()
      summarisePage(unit.repeat(Math.floor((512 * 1024) / unit.length)), "u")
      expect(performance.now() - started).toBeLessThan(1_000)
    }
  )
})

describe("the regular pass over link posts", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let keywordId: string
  const NOW = new Date("2099-06-01T12:00:00.000Z")

  beforeEach(async () => {
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    keywordId = uuid()
    await db.insert(promoKeywords).values({ id: keywordId, userId, term: "a term" })
  })

  afterEach(async () => {
    await client.close()
  })

  async function find(linkUrl: string, overrides: { body?: string; status?: FindStatus } = {}) {
    const id = uuid()
    await db.insert(promoFinds).values({
      id,
      userId,
      keywordId,
      redditId: `t3_${id.slice(0, 8)}`,
      permalink: `/r/x/comments/${id.slice(0, 8)}/`,
      linkUrl,
      body: overrides.body ?? "",
      status: overrides.status ?? "new",
    })
    return id
  }

  async function row(id: string) {
    const [found] = await db.select().from(promoFinds).where(eq(promoFinds.id, id))
    return found
  }

  it("stores the page for a link post and why not for one that failed", async () => {
    const good = await find("https://example.com/good")
    const bad = await find("https://example.com/bad")
    const read = async (url: string) => {
      if (url.endsWith("bad")) throw new LinkReadError("The page answered 403.")
      return { url, title: "Good", text: "Words." }
    }

    expect(await readDueLinkPages(db, NOW, read)).toEqual({ read: 1, failed: 1, refused: 0 })
    expect(await row(good)).toMatchObject({
      linkPage: { url: "https://example.com/good", title: "Good", text: "Words." },
      linkReadAt: NOW,
      linkError: "",
    })
    expect(await row(bad)).toMatchObject({ linkPage: null, linkReadAt: NOW, linkError: "The page answered 403." })

    // Tried once, never again.
    expect(await readDueLinkPages(db, NOW, read)).toEqual({ read: 0, failed: 0, refused: 0 })
  })

  it("records a link inside the network as refused, on the post and in the log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const inside = await find("http://169.254.169.254/latest/meta-data/")

    // The real reader, so the refusal is the guard's own.
    expect(await readDueLinkPages(db, NOW)).toEqual({ read: 0, failed: 0, refused: 1 })
    expect((await row(inside)).linkError).toContain("points inside the network")
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("169.254.169.254"))
    warn.mockRestore()
  })

  it("leaves alone a post with words, a skipped post and a commented one", async () => {
    await find("https://example.com/a", { body: "The post's own words." })
    await find("https://example.com/b", { status: "skipped" })
    await find("https://example.com/c", { status: "commented" })
    const read = vi.fn(async (url: string) => ({ url, title: "", text: "" }))

    expect(await readDueLinkPages(db, NOW, read)).toEqual({ read: 0, failed: 0, refused: 0 })
    expect(read).not.toHaveBeenCalled()
  })
})
