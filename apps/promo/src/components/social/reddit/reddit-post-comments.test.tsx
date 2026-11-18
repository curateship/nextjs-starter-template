// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import type { OwnPostRow } from "@/lib/api/social/reddit/own-posts"

const answerOnOwnPost = vi.fn(async (_data: unknown) => ({ jobId: "j", runAfter: null }))
const checkOwnPosts = vi.fn(async (_ids: unknown) => ({ queued: 1, skipped: 0 }))
vi.mock("@/lib/api/social/reddit/own-posts", () => ({
  answerOnOwnPost: (data: unknown) => answerOnOwnPost(data),
  checkOwnPosts: (ids: unknown) => checkOwnPosts(ids),
  getOwnPostErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}))

const { RedditPostCommentsDialog } = await import("./reddit-post-comments")

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  answerOnOwnPost.mockClear()
  checkOwnPosts.mockClear()
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  document.body.innerHTML = ""
})

const url = (id: string) => `https://www.reddit.com/r/SaaS/comments/abc/i_built_a_board/${id}/`
const post: OwnPostRow = {
  id: "p1",
  title: "I built a board",
  body: "",
  subreddit: "SaaS",
  postUrl: "https://www.reddit.com/r/SaaS/comments/abc/i_built_a_board/",
  postedAt: new Date("2099-01-01T10:00:00Z"),
  account: { id: "a1", handle: "a_persona" },
  project: { id: "pr1", name: "Taskly" },
  sentBy: null,
  upvotes: 12,
  commentCount: 5,
  checkedAt: new Date(),
  checkError: "",
  checking: false,
  comments: [
    { author: "answered", text: "Does it sync?", score: 3, url: url("c1"), own: false, answer: { text: "It does.", url: url("a1"), postedAt: new Date() } },
    { author: "waiting", text: "Price?", score: 1, url: url("c2"), own: false, answer: { waiting: true, runAfter: null, text: "Free." } },
    { author: "failed", text: "Mobile?", score: 1, url: url("c3"), own: false, answer: { failed: true, reason: "reply: the box never showed", text: "Soon." } },
    { author: "fresh", text: "Nice work.", score: 0, url: url("c4"), own: false, answer: null },
    { author: "a_persona", text: "Thanks all!", score: 2, url: url("c5"), own: true, answer: null },
  ],
}

function draw(guest = false) {
  act(() =>
    root.render(
      <TooltipProvider>
        <RedditPostCommentsDialog post={post} guest={guest} onClose={() => undefined} onChanged={async () => undefined} />
      </TooltipProvider>
    )
  )
  return document.body.textContent ?? ""
}

describe("the comments under one of your own Reddit posts", () => {
  it("shows each comment with your answer, the one on its way, a failed one with why, or a box, and leaves your own out", () => {
    const text = draw()
    expect(text).toContain("12 upvotes and 5 comments")
    expect(text).toContain("Your answer, sent")
    expect(text).toContain("It does.")
    expect(text).toContain("Your answer is next in line for the browser.")
    expect(text).toContain("The last answer did not send.")
    expect(text).toContain("reply: the box never showed")
    expect(text).toContain("Your answer to u/fresh")
    expect(text).not.toContain("Thanks all!")
    // The failed one keeps its box, so there are two Answer buttons: fresh and failed.
    const answers = [...document.querySelectorAll("button")].filter((button) => button.textContent === "Answer")
    expect(answers).toHaveLength(2)
    expect([...document.querySelectorAll("button")].some((button) => button.textContent?.includes("Read again"))).toBe(true)
  })

  it("sends what was typed for that comment, and reads the post again on Read again", async () => {
    draw()
    const box = document.getElementById(`post-answer-${url("c4")}`) as HTMLTextAreaElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
      setter?.call(box, "Thank you!")
      box.dispatchEvent(new Event("input", { bubbles: true }))
    })
    const answer = [...document.querySelectorAll("button")].filter((button) => button.textContent === "Answer").at(-1)
    await act(async () => answer?.click())
    expect(answerOnOwnPost).toHaveBeenCalledWith({ postId: "p1", commentUrl: url("c4"), text: "Thank you!" })
    const again = [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Read again"))
    await act(async () => again?.click())
    expect(checkOwnPosts).toHaveBeenCalledWith(["p1"])
  })

  it("gives a guest the comments and answers but no box and no Read again", () => {
    const text = draw(true)
    expect(text).toContain("It does.")
    expect([...document.querySelectorAll("button")].some((button) => button.textContent === "Answer")).toBe(false)
    expect([...document.querySelectorAll("button")].some((button) => button.textContent?.includes("Read again"))).toBe(false)
  })
})
