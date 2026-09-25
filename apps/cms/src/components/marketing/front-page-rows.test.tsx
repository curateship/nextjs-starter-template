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
        billingEnabled={false}
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
})
