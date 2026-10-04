import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { FrontPageRows } from "@/components/marketing/front-page-rows"
import {
  frontPageHeroRunsUnderMenu,
  normalizeFrontPageRows,
} from "@/lib/pages/front-page"

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

  it("draws a divider with no words, and leaves the h1 on the first row that has some", () => {
    const rows = normalizeFrontPageRows([
      {
        id: "top",
        heading: "Top divider",
        kind: "divider",
        dividerStyle: "dots",
      },
      { id: "welcome", heading: "Welcome", intro: "Start here.", kind: "text" },
      { id: "rule", heading: "Rule", kind: "divider" },
      { id: "gap", heading: "Gap", kind: "divider", dividerStyle: "space" },
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

    // A divider's name is only for the settings list, so none of the three
    // reaches the page.
    expect(markup).not.toContain("Top divider")
    expect(markup).not.toContain("Rule")
    expect(markup).not.toContain("Gap")
    // The divider above it does not take the page's main heading.
    expect(markup).toContain("<h1")
    expect(markup.match(/<h1/g)).toHaveLength(1)
    expect(markup).toContain("Welcome")
    // A line, three dots, and a space that draws nothing.
    expect(markup).toContain("<hr")
    expect(markup.match(/border-radius:50%|rounded-full/g)).toHaveLength(3)
    expect(markup).toContain('data-front-page-row="divider"')
  })

  it("paints a divider from its own shade, not the site's divider colour", () => {
    const rows = normalizeFrontPageRows([
      { id: "faint", heading: "Faint", kind: "divider", dividerShade: 10 },
      { id: "dark", heading: "Dark", kind: "divider", dividerShade: 80 },
      {
        id: "dots",
        heading: "Dots",
        kind: "divider",
        dividerStyle: "dots",
        dividerShade: 45,
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

    // A share of the theme's own grey, so it still follows light and dark.
    expect(markup).toContain(
      "color-mix(in oklab, var(--muted-foreground) 10%, transparent)"
    )
    expect(markup).toContain(
      "color-mix(in oklab, var(--muted-foreground) 80%, transparent)"
    )
    // Each of the three dots takes the same shade.
    expect(
      markup.match(
        /color-mix\(in oklab, var\(--muted-foreground\) 45%, transparent\)/g
      )
    ).toHaveLength(3)
    // Nothing reads the site-wide divider token any more.
    expect(markup).not.toContain("bg-border")
  })

  it("gives a space divider the height it was set, and 70% of it on a phone", () => {
    const rows = normalizeFrontPageRows([
      { id: "a", heading: "A", kind: "divider", dividerStyle: "space" },
      {
        id: "b",
        heading: "B",
        kind: "divider",
        dividerStyle: "space",
        dividerSpace: 200,
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

    // Left alone, a space divider is still the 64px it has always drawn.
    expect(markup).toContain("--divider-space:64px")
    expect(markup).toContain("--divider-space-phone:45px")
    expect(markup).toContain("--divider-space:200px")
    expect(markup).toContain("--divider-space-phone:140px")
  })

  it("reads a missing or silly space as 64px", () => {
    const rows = normalizeFrontPageRows([
      { id: "none", heading: "None", kind: "divider", dividerStyle: "space" },
      {
        id: "high",
        heading: "High",
        kind: "divider",
        dividerStyle: "space",
        dividerSpace: 9000,
      },
      {
        id: "low",
        heading: "Low",
        kind: "divider",
        dividerStyle: "space",
        dividerSpace: -40,
      },
      {
        id: "junk",
        heading: "Junk",
        kind: "divider",
        dividerStyle: "space",
        dividerSpace: "tall",
      },
    ])

    expect(
      rows.map((row) => row.kind === "divider" && row.dividerSpace)
    ).toEqual([64, 240, 0, 64])
  })

  it("reads a missing or silly shade as the theme's own 10%", () => {
    const rows = normalizeFrontPageRows([
      { id: "none", heading: "None", kind: "divider" },
      { id: "high", heading: "High", kind: "divider", dividerShade: 4000 },
      { id: "low", heading: "Low", kind: "divider", dividerShade: -20 },
      { id: "junk", heading: "Junk", kind: "divider", dividerShade: "dark" },
    ])

    expect(rows.map((row) => row.kind === "divider" && row.dividerShade)).toEqual(
      [10, 100, 0, 10]
    )
  })

  it("reads an unknown divider style as a line", () => {
    const [row] = normalizeFrontPageRows([
      { id: "d", heading: "D", kind: "divider", dividerStyle: "sparkles" },
    ])

    expect(row).toMatchObject({ kind: "divider", dividerStyle: "line" })
  })

  it("steps a whole-screen row out to the window, and keeps words off its edge", () => {
    const rows = normalizeFrontPageRows([
      { id: "rule", heading: "Rule", kind: "divider", layout: "full" },
      { id: "words", heading: "Words", kind: "text", layout: "full" },
      { id: "normal", heading: "Normal", kind: "text", layout: "wide" },
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
    const classOf = (kind: string, layout: string) =>
      markup.match(
        new RegExp(
          `<section class="([^"]*)"[^>]*data-front-page-row="${kind}"[^>]*data-front-page-layout="${layout}"`
        )
      )?.[1] ?? ""

    // Half the window less half the column is the distance to each edge.
    const rule = classOf("divider", "full")
    const words = classOf("text", "full")
    const normal = classOf("text", "wide")
    for (const stepped of [rule, words]) {
      expect(stepped).toContain("w-screen")
      expect(stepped).toContain("mx-[calc(50%-50vw)]")
    }
    // A divider has no words, so its line keeps the whole width. A row that
    // does have words puts the page's own 16px edge back.
    expect(rule).not.toContain("px-4")
    expect(words).toContain("px-4")
    // The row left on Full width did not grow a breakout.
    expect(normal).not.toContain("w-screen")
    expect(normal).not.toContain("mx-[calc(50%-50vw)]")
  })

  it("paints a hero's own colour as a band and keeps a bad one out", () => {
    const rows = normalizeFrontPageRows([
      {
        id: "hero",
        heading: "Open your shop this week",
        kind: "hero",
        background: "#0F172A",
        backgroundUnderMenu: true,
      },
      {
        id: "second",
        heading: "Later on",
        kind: "hero",
        background: "red",
        backgroundUnderMenu: true,
      },
    ])

    // A 6-digit hex is kept, lower-cased. Anything else is no colour at all,
    // so a name or a `var(...)` can never reach a visitor's stylesheet.
    expect(rows[0]).toMatchObject({
      background: "#0f172a",
      backgroundUnderMenu: true,
    })
    expect(rows[1]).toMatchObject({ background: "" })

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

    // A hex is one fixed colour, so both modes get the same value.
    expect(markup).toContain("--shell-hero-band-light:#0f172a")
    expect(markup).toContain("--shell-hero-band-dark:#0f172a")
    // The band climbs past the menu, so the colour passes behind it.
    expect(markup).toContain("var(--shell-hero-rise, 0px)")
    expect(frontPageHeroRunsUnderMenu(rows)).toBe(true)
  })

  it("gives the hero its own air, set per row and smaller on a phone", () => {
    const rows = normalizeFrontPageRows([
      { id: "default", heading: "Left alone", kind: "hero" },
      { id: "roomy", heading: "More room", kind: "hero", spacing: 120 },
      { id: "tight", heading: "None at all", kind: "hero", spacing: 0 },
    ])

    // A hero saved before the slider existed keeps the 64 it always drew.
    expect(rows[0]).toMatchObject({ spacing: 64 })
    expect(rows[1]).toMatchObject({ spacing: 120 })
    expect(rows[2]).toMatchObject({ spacing: 0 })

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
    const sections = markup.split("<section").slice(1)

    // The default writes nothing, so theme.css keeps its own numbers.
    expect(sections[0]).not.toContain("--shell-hero-space")
    // A chosen number travels as two, and the phone one is three quarters of
    // the desktop one, so a phone never draws a desktop's worth of air.
    expect(sections[1]).toContain("--shell-hero-space:120px")
    expect(sections[1]).toContain("--shell-hero-space-phone:90px")
    expect(sections[2]).toContain("--shell-hero-space:0px")
    expect(sections[2]).toContain("--shell-hero-space-phone:0px")

    // The air is the hero's, never the row's.
    for (const section of sections) {
      const openingTag = section.slice(0, section.indexOf(">"))
      expect(openingTag).not.toContain("py-12")
    }
  })

  it("only lets the top row carry its colour behind the menu", () => {
    const rows = normalizeFrontPageRows([
      { id: "words", heading: "First", kind: "text" },
      {
        id: "hero",
        heading: "Second",
        kind: "hero",
        background: "#0f172a",
        backgroundUnderMenu: true,
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

    // The band is still painted, it just starts at the row rather than above
    // it, because this hero is not the one the menu sits over.
    // A hex is one fixed colour, so both modes get the same value.
    expect(markup).toContain("--shell-hero-band-light:#0f172a")
    expect(markup).toContain("--shell-hero-band-dark:#0f172a")
    expect(markup).not.toContain("var(--shell-hero-rise, 0px)")
    expect(frontPageHeroRunsUnderMenu(rows)).toBe(false)
  })

  it("reads an unknown layout as the usual full width", () => {
    const [row] = normalizeFrontPageRows([
      { id: "x", heading: "X", kind: "text", layout: "enormous" },
    ])

    expect(row).toMatchObject({ layout: "wide" })
  })
})
