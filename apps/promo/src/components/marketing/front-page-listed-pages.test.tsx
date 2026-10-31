import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// A card is a link to its page, and an internal link is TanStack's `Link`,
// which needs a router this test has no reason to build. The anchor is all
// this test is reading.
vi.mock("@/components/shell/public-navigation", () => ({
  SavedLink: ({
    href,
    children,
    ...props
  }: { href: string } & React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

import { FrontPageListedPages } from "@/components/marketing/front-page-content-blocks"
import type { FrontPageListedPage } from "@/lib/pages/front-page"

const pages: FrontPageListedPage[] = [
  {
    id: "about",
    path: "/about",
    title: "About us",
    description: "Who we are.",
    image: "https://media.example.test/about.png",
    imageAlt: "The office",
  },
  {
    id: "help",
    path: "/help",
    title: "Help",
    description: "",
    image: "",
    imageAlt: "",
  },
]

describe("a Pages list block", () => {
  /**
   * The gap between the cards is the site's Content spacing, which is what
   * `theme.css` says that setting is: the space at the sides of public content
   * and between the cards in every grid on it. It was a fixed 12px on a phone
   * and 16px on a desktop, so a site asking for 40px of air got 16 and a flat
   * site still had its cards 16px apart.
   */
  it("spaces its cards by Content spacing rather than a fixed number", () => {
    const markup = renderToStaticMarkup(<FrontPageListedPages pages={pages} />)

    expect(markup).toContain("gap:var(--shell-gutter")
    expect(markup).not.toContain("gap-3")
    expect(markup).not.toContain("md:gap-4")
  })

  it("draws one card per page, with its description and a plain panel where it has no picture", () => {
    const markup = renderToStaticMarkup(<FrontPageListedPages pages={pages} />)

    expect(markup).toContain('href="/about"')
    expect(markup).toContain("About us")
    expect(markup).toContain("Who we are.")
    expect(markup).toContain('href="/help"')
    // One picture, for the one page that has one.
    expect(markup.match(/<img/g)).toHaveLength(1)
  })

  it("draws nothing at all when no page is picked", () => {
    expect(renderToStaticMarkup(<FrontPageListedPages pages={[]} />)).toBe("")
  })
})
