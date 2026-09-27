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

  it("draws an email form in place of a button when the hero asks for one", () => {
    const rows = normalizeFrontPageRows([
      {
        id: "hero",
        heading: "Open your shop this week",
        kind: "hero",
        action: "email",
        buttonLabel: "Subscribe",
        // An email form has no link of its own: its box is the action.
        buttonHref: "https://example.test/ignored",
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

    expect(rows[0]).toMatchObject({
      action: "email",
      buttonLabel: "Subscribe",
      buttonHref: "",
    })
    expect(markup).toContain('type="email"')
    expect(markup).toContain("Enter your email")
    expect(markup).toContain("Subscribe")
    expect(markup).not.toContain("<a")
  })

  it("asks for a button unless the hero says otherwise", () => {
    const [saved] = normalizeFrontPageRows([
      { id: "hero", heading: "A", kind: "hero" },
    ])

    expect(saved).toMatchObject({ action: "button" })
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

  it("gives a row its own alignment and leaves switched-off parts out", () => {
    const rows = normalizeFrontPageRows([
      {
        id: "hero",
        heading: "Open your shop this week",
        intro: "Nobody should read this line.",
        kind: "hero",
        alignment: "center",
        image: "https://media.example.test/shop.png",
        alt: "The shop",
        buttonLabel: "Press",
        buttonHref: "/register",
        note: "Trusted by 200 shops",
        stars: 4,
        showIntro: false,
        showImage: false,
        showAction: false,
        showStars: false,
        showNote: false,
      },
      {
        id: "faq",
        heading: "Common questions",
        kind: "faq",
        showNumbers: false,
        items: [
          {
            id: "price",
            question: "How much does it cost?",
            answer: "Choose the plan that fits.",
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

    expect(rows[0]).toMatchObject({ alignment: "center", showImage: false })
    expect(rows[1]).toMatchObject({ alignment: "inherit", showNumbers: false })
    expect(markup).toContain('data-front-page-alignment="center"')
    expect(markup).toContain("justify-self-center")
    expect(markup).toContain("Open your shop this week")
    expect(markup).not.toContain("Nobody should read this line.")
    expect(markup).not.toContain("The shop")
    expect(markup).not.toContain("Press")
    expect(markup).not.toContain("Trusted by 200 shops")
    expect(markup).not.toContain("Q1")
    expect(markup).toContain("How much does it cost?")
  })

  /**
   * A row of an app's own kind can carry the way to the whole list it shows a
   * handful of. The shell draws it beside the heading, so an app does not have
   * to draw a heading of its own to hang a button on, and a row that names none
   * gets a plain heading.
   */
  it("puts an app row's own button beside its heading", () => {
    const rows = normalizeFrontPageRows([
      {
        id: "listings",
        heading: "Listings",
        kind: "app",
        appKind: "listings",
        settings: {},
      },
      {
        id: "cards",
        heading: "Categories",
        kind: "app",
        appKind: "categories",
        settings: {},
      },
    ])
    const markup = renderToStaticMarkup(
      <FrontPageRows
        rows={rows}
        appRowData={{
          // A full address rather than a path, because a path is drawn with
          // the router's own Link and this renders without a router.
          listings: {
            action: {
              label: "Browse directory",
              href: "https://example.test/directory",
            },
          },
          cards: { cards: [] },
        }}
        plans={[]}
        trialUsed={false}
        interval="monthly"
        onIntervalChange={vi.fn()}
        onSelectPlan={vi.fn()}
      />
    )

    expect(markup).toContain("Browse directory")
    expect(markup).toContain('href="https://example.test/directory"')
    // The row that named none has its heading and nothing else.
    expect(markup).toContain("Categories")
    expect(markup.match(/Browse directory/g)).toHaveLength(1)
  })
})
