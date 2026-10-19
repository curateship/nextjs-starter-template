import { afterEach, describe, expect, it, vi } from "vitest"

import { articleText, articleTitle, fetchArticle } from "@/server/note/posts/article"
import { POST_SAYS } from "@/lib/note/posts/posts"

/**
 * Bringing in an article: only a public page is opened, every redirect is
 * checked again before it is followed, and only the readable words are kept.
 */

const publicHost = async () => ["93.184.215.14"]
const body = "<p>" + "Real words about growing a newsletter. ".repeat(10) + "</p>"

afterEach(() => {
  vi.restoreAllMocks()
})

function html(inner: string, status = 200, headers: Record<string, string> = { "content-type": "text/html" }) {
  return new Response(inner, { status, headers })
}

describe("articleText", () => {
  it("keeps the article and leaves out scripts, menus and footers", () => {
    const page = `<html><head><title>Ignored</title><script>var x = "<p>no</p>"</script></head>
      <body><nav>Home | About</nav><article><h1>How to grow</h1><p>First &amp; best.</p><ul><li>One</li><li>Two</li></ul></article><footer>© me</footer></body></html>`
    expect(articleText(page)).toBe("How to grow\nFirst & best.\n• One\n• Two")
  })

  it("stays quick on a page built to slow it down", () => {
    // Before 19 Oct 2026 these took seconds each, and a 2MB page minutes.
    const traps = [
      "<meta " + 'property="og:title" '.repeat(100_000),
      "<nav ".repeat(400_000),
      "<!-- ".repeat(400_000),
      "<a ".repeat(600_000),
      "<article ".repeat(200_000),
    ]
    for (const trap of traps) {
      const started = performance.now()
      articleTitle(trap)
      articleText(trap)
      expect(performance.now() - started).toBeLessThan(1_000)
    }
  })

  it("reads the title from the page's share card first", () => {
    expect(articleTitle('<meta property="og:title" content="Grow &amp; win"><title>Other</title>')).toBe("Grow & win")
    expect(articleTitle("<title> Plain   title </title>")).toBe("Plain title")
  })
})

describe("fetchArticle", () => {
  it("brings in a public page's words", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(html(`<html><body><article>${body}</article></body></html>`))
    const article = await fetchArticle("https://blog.example/post", publicHost)
    expect(article.text).toContain("Real words about growing a newsletter.")
  })

  it("asks for a plain http link over https", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(html(`<html><body><article>${body}</article></body></html>`))
    await fetchArticle("http://blog.example/post", publicHost)
    expect(String(fetcher.mock.calls[0][0])).toBe("https://blog.example/post")
  })

  it("refuses a page whose name points inside the network", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch")
    await expect(fetchArticle("https://inside.example/post", async () => ["10.0.0.5"])).rejects.toThrow(
      POST_SAYS.notAnArticle
    )
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("checks a redirect's new address before following it", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(html("", 302, { location: "https://localhost/admin" }))
    await expect(fetchArticle("https://blog.example/post", publicHost)).rejects.toThrow(POST_SAYS.notAnArticle)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("refuses something that is not a page of words", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(html("%PDF", 200, { "content-type": "application/pdf" }))
    await expect(fetchArticle("https://blog.example/file.pdf", publicHost)).rejects.toThrow(POST_SAYS.notAnArticle)
  })

  it("refuses a video site", async () => {
    await expect(fetchArticle("https://www.youtube.com/watch?v=abc", publicHost)).rejects.toThrow(
      POST_SAYS.notAnArticle
    )
  })
})
