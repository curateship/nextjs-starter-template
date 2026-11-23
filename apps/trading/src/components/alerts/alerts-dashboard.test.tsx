import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    search,
    to,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: React.ReactNode
    search?: { market?: string }
    to: string
  }) => (
    <a
      {...props}
      href={`${to}${search?.market ? `?market=${search.market}` : ""}`}
    >
      {children}
    </a>
  ),
}))

import { AlertsDashboard } from "@/components/alerts/alerts-dashboard"

describe("AlertsDashboard", () => {
  it("puts row controls in an Actions column and links the alert to Trade", () => {
    const markup = renderToStaticMarkup(
      <AlertsDashboard
        initial={{
          rules: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              userId: "22222222-2222-4222-8222-222222222222",
              name: "ETH breakout",
              coin: "ETH",
              kind: "price_level",
              operator: "crossing_up",
              level: 3_500,
              triggerMode: "once",
              status: "active",
              lastEvaluatedAt: "2026-07-14T12:00:00.000Z",
              lastTriggeredAt: null,
              createdAt: "2026-07-14T12:00:00.000Z",
              updatedAt: "2026-07-14T12:00:00.000Z",
            },
          ],
          markets: ["ETH"],
          marketsAvailable: true,
          workerOnline: true,
          workerActive: true,
          checkedAt: new Date("2026-07-14T12:00:10.000Z").getTime(),
        }}
      />
    )

    expect(markup).toContain(">Actions<")
    expect(markup).toContain('href="/trade?market=ETH"')

    const mainCell = markup.match(
      /<td[^>]*data-column="main"[^>]*>(.*?)<\/td>/
    )?.[1]
    expect(mainCell).not.toContain('aria-label="Edit ETH breakout"')

    const actionCell = markup.match(
      /<td[^>]*data-column="actions"[^>]*>(.*?)<\/td>/
    )?.[1]
    expect(actionCell).toContain('aria-label="Edit ETH breakout"')
    expect(actionCell).toContain('aria-label="Pause ETH breakout"')
    expect(actionCell).toContain('aria-label="Delete ETH breakout"')
  })
})
