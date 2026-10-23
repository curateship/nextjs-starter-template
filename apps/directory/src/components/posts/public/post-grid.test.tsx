import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// A real Link needs a router, and this is about the card's own layout.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string
    params: { slug: string }
  } & React.ComponentProps<"a">) => (
    <a href={to.replace("$slug", params.slug)} {...rest}>
      {children}
    </a>
  ),
}))

import { PostGrid } from "@/components/posts/public/post-grid"
import type { PublicPostCard } from "@/lib/api/posts/public"

const base: PublicPostCard = {
  id: "post-1",
  title: "Toronto's Best Sandwich Shops",
  slug: "best-sandwich-shops",
  summary: "Where to find the city's best sandwiches.",
  coverImage: "https://media.test/sandwich.jpg",
  publishedAt: new Date("2026-09-18T12:00:00.000Z"),
  readMinutes: 5,
  category: { name: "Best of", slug: "best-of" },
}

function markupOf(post: PublicPostCard) {
  return renderToStaticMarkup(
    <PostGrid posts={[post]} siteName="Eat Drink Toronto" emptyMessage="none" />
  )
}

describe("post card", () => {
  it("puts the category, the read time and the site name on the photo", () => {
    const markup = markupOf(base)

    expect(markup).toContain("Best of")
    expect(markup).toContain("5 min read")
    expect(markup).toContain("Eat Drink Toronto")
    expect(markup).toContain("Sep 18, 2026")
    expect(markup).toContain("/api/v1/media/resized?src=")
  })

  it("keeps both chips above the title when a post has no photo", () => {
    const markup = markupOf({ ...base, coverImage: "" })

    expect(markup).not.toContain("<img")
    expect(markup).toContain("Best of")
    expect(markup).toContain("5 min read")
    expect(markup).toContain("Eat Drink Toronto")
  })

  it("drops the category pill when a post is in no category", () => {
    const markup = markupOf({ ...base, category: null })

    expect(markup).not.toContain("Best of")
    expect(markup).toContain("5 min read")
  })

  it("says what it was given when there is nothing to draw", () => {
    const markup = renderToStaticMarkup(
      <PostGrid posts={[]} siteName="Eat Drink Toronto" emptyMessage="none" />
    )

    expect(markup).toContain("none")
  })
})
