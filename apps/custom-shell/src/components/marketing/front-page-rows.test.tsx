import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { FrontPageRows } from "@/components/marketing/front-page-rows"
import { normalizeFrontPageRows } from "@/lib/pages/front-page"

describe("front page content blocks", () => {
  it("renders testimonials, FAQ entries, logos, and screenshots in row order", () => {
    const rows = normalizeFrontPageRows([
      {
        id: "testimonials",
        heading: "Customer stories",
        kind: "testimonials",
        items: [
          {
            id: "ava",
            quote: "It made the work simple.",
            name: "Ava",
            role: "Founder",
            picture: "https://media.example.test/ava.png",
          },
        ],
      },
      {
        id: "faq",
        heading: "Common questions",
        kind: "faq",
        items: [
          {
            id: "price",
            question: "How much does it cost?",
            answer: "Choose the plan that fits.",
          },
        ],
      },
      {
        id: "logos",
        heading: "Trusted by",
        kind: "logos",
        items: [
          {
            id: "acme",
            image: "https://media.example.test/acme.png",
            alt: "Acme",
          },
        ],
      },
      {
        id: "screenshots",
        heading: "Product tour",
        kind: "screenshots",
        items: [
          {
            id: "dashboard",
            image: "https://media.example.test/dashboard.png",
            caption: "The dashboard overview",
          },
        ],
      },
    ])
    const markup = renderToStaticMarkup(
      <FrontPageRows
        rows={rows}
        plans={[]}
        trialUsed={false}
        interval="monthly"
        onIntervalChange={vi.fn()}
        onSelectPlan={vi.fn()}
      />
    )

    expect(markup).toContain("It made the work simple.")
    expect(markup).toContain("How much does it cost?")
    expect(markup).toContain('alt="Acme"')
    expect(markup).toContain('alt="The dashboard overview"')
    expect(markup.indexOf("Customer stories")).toBeLessThan(
      markup.indexOf("Common questions")
    )
    expect(markup.indexOf("Common questions")).toBeLessThan(
      markup.indexOf("Trusted by")
    )
    expect(markup.indexOf("Trusted by")).toBeLessThan(
      markup.indexOf("Product tour")
    )
  })

  it("puts a hero's words before its picture, with its button and stars", () => {
    const rows = normalizeFrontPageRows([
      {
        id: "hero",
        heading: "Run your whole shop here",
        intro: "One place for orders, people and payments.",
        kind: "hero",
        image: "https://media.example.test/hero.png",
        alt: "The orders screen",
        buttonLabel: "Start free",
        // An address on another site, so the button is a plain link. An
        // address on this site would be the router's `Link`, which needs a
        // router this test does not stand up.
        buttonHref: "https://example.test/start",
        note: "Trusted by 850 customers",
        stars: 5,
      },
    ])
    const markup = renderToStaticMarkup(
      <FrontPageRows
        rows={rows}
        plans={[]}
        trialUsed={false}
        interval="monthly"
        onIntervalChange={vi.fn()}
        onSelectPlan={vi.fn()}
      />
    )

    expect(markup).toContain("md:grid-cols-2")
    expect(markup).toContain("<h1")
    expect(markup).toContain("Start free")
    expect(markup).toContain('aria-label="Rated 5 out of 5"')
    expect(markup).toContain("Trusted by 850 customers")
    expect(markup.indexOf("Run your whole shop here")).toBeLessThan(
      markup.indexOf('alt="The orders screen"')
    )
    // The heading is drawn once, inside the left column, not above the row
    // as well.
    expect(markup.split("Run your whole shop here")).toHaveLength(2)
  })

  it("draws a hero with no picture as one column", () => {
    const rows = normalizeFrontPageRows([
      { id: "hero", heading: "No picture here", kind: "hero" },
    ])
    const markup = renderToStaticMarkup(
      <FrontPageRows
        rows={rows}
        plans={[]}
        trialUsed={false}
        interval="monthly"
        onIntervalChange={vi.fn()}
        onSelectPlan={vi.fn()}
      />
    )

    expect(rows).toHaveLength(1)
    expect(markup).toContain("No picture here")
    expect(markup).not.toContain("md:grid-cols-2")
    expect(markup).not.toContain("<img")
  })

  it("drops a hero button that has only half its pair, and an unsafe link", () => {
    const [labelOnly, hrefOnly, unsafe] = normalizeFrontPageRows([
      { id: "a", heading: "A", kind: "hero", buttonLabel: "Press" },
      { id: "b", heading: "B", kind: "hero", buttonHref: "/register" },
      {
        id: "c",
        heading: "C",
        kind: "hero",
        buttonLabel: "Press",
        buttonHref: "javascript:alert(1)",
      },
    ])

    expect(labelOnly).toMatchObject({ buttonLabel: "", buttonHref: "" })
    expect(hrefOnly).toMatchObject({ buttonLabel: "", buttonHref: "" })
    expect(unsafe).toMatchObject({ buttonLabel: "", buttonHref: "" })

    // The pair together, and a link inside this app, are kept.
    expect(
      normalizeFrontPageRows([
        {
          id: "d",
          heading: "D",
          kind: "hero",
          buttonLabel: "Press",
          buttonHref: "/register",
        },
      ])[0]
    ).toMatchObject({ buttonLabel: "Press", buttonHref: "/register" })
  })
})
