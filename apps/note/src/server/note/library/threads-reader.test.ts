import { afterEach, describe, expect, it, vi } from "vitest"

import { readThreadsPage, readThreadsPost } from "@/server/note/library/threads-reader"
import { LIBRARY_SAYS } from "@/lib/note/library/notes"

/**
 * Reading a Threads post from the page Threads sends a link preview fetcher.
 * The pages here copy the tags a real one carried on 20 Oct 2026; nothing
 * reaches the network.
 */

const POST_PAGE = `<html><head>
<meta property="og:site_name" content="Threads" />
<meta property="og:title" content="Adam Mosseri (&#064;mosseri) on Threads" />
<meta property="og:description" content="- Head of Instagram
- Product Manager
- Designer (and Manager)
- Bartender &amp; Waiter" />
<meta property="og:url" content="https://www.threads.com/&#064;mosseri/post/Cw1dvVTLesB" />
<meta property="og:image" content="https://scontent.example/card.jpg" />
</head></html>`

const LOG_IN_PAGE = `<html><head>
<meta property="og:title" content="Threads &#x2022; Log in" />
<meta property="og:description" content="Join Threads to share ideas, ask questions, post random thoughts, find your people and more." />
<meta property="og:url" content="https://www.threads.com/" />
</head></html>`

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("readThreadsPage", () => {
  it("reads the author's name and handle and the post's words in full", () => {
    const read = readThreadsPage(POST_PAGE, "Cw1dvVTLesB")
    expect(read.found).toBe(true)
    if (!read.found) return
    expect(read.post.authorName).toBe("Adam Mosseri")
    expect(read.post.authorHandle).toBe("mosseri")
    expect(read.post.text).toBe("- Head of Instagram\n- Product Manager\n- Designer (and Manager)\n- Bartender & Waiter")
    expect(read.post.url).toBe("https://www.threads.com/@mosseri/post/Cw1dvVTLesB")
    // The preview picture is a card of the words, so it is not kept.
    expect(read.post.pictures).toEqual([])
    expect(read.post.video).toBeNull()
  })

  it("finds nothing on the log-in page a private or deleted post gets", () => {
    expect(readThreadsPage(LOG_IN_PAGE, "Cw1dvVTLesB").found).toBe(false)
  })
})

describe("readThreadsPost", () => {
  function answer(body: string, url = "https://www.threads.com/@mosseri/post/Cw1dvVTLesB", status = 200) {
    const response = new Response(body, { status })
    Object.defineProperty(response, "url", { value: url })
    return response
  }

  it("asks Threads itself, as a link preview fetcher, and reads the post", async () => {
    const fetched = vi.fn(async () => answer(POST_PAGE))
    vi.stubGlobal("fetch", fetched)
    const post = await readThreadsPost("https://www.threads.com/@mosseri/post/Cw1dvVTLesB")
    expect(post.authorHandle).toBe("mosseri")
    const [address, options] = fetched.mock.calls[0] as unknown as [string, RequestInit]
    expect(address).toBe("https://www.threads.com/@mosseri/post/Cw1dvVTLesB")
    expect((options.headers as Record<string, string>)["user-agent"]).toContain("facebookexternalhit")
  })

  it("says the post could not be read when Threads shows the log-in page or answers from elsewhere", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer(LOG_IN_PAGE)))
    await expect(readThreadsPost("https://www.threads.com/@mosseri/post/Cw1dvVTLesB")).rejects.toThrow(
      LIBRARY_SAYS.threadsUnreadable
    )
    vi.stubGlobal("fetch", vi.fn(async () => answer(POST_PAGE, "https://evil.example/post")))
    await expect(readThreadsPost("https://www.threads.com/@mosseri/post/Cw1dvVTLesB")).rejects.toThrow(
      LIBRARY_SAYS.threadsUnreadable
    )
  })

  it("says Threads is busy on a refusal, and never fetches an address it did not build", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer("", undefined, 429)))
    await expect(readThreadsPost("https://www.threads.com/@mosseri/post/Cw1dvVTLesB")).rejects.toThrow(
      LIBRARY_SAYS.threadsBusy
    )
    const fetched = vi.fn()
    vi.stubGlobal("fetch", fetched)
    await expect(readThreadsPost("https://evil.example/@mosseri/post/Cw1dvVTLesB")).rejects.toThrow(LIBRARY_SAYS.notALink)
    expect(fetched).not.toHaveBeenCalled()
  })
})
