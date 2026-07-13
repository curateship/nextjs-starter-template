import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { OneClickPanel } from "@/components/trading/one-click-panel"

describe("one-click order row", () => {
  it("shows one action for the selected side before the template dropdown", () => {
    const markup = renderToStaticMarkup(
      <OneClickPanel
        side="buy"
        walletId={null}
        isPaper={false}
        market="ETH"
        marketRow={null}
        markPx={0}
        equity={0}
        disabledReason="Connect a wallet"
        confirmationEnabled={false}
        onNotify={() => {}}
      />
    )

    expect(markup).toContain("1-Click Long")
    expect(markup).not.toContain("1-Click Short")
    expect(markup.indexOf("1-Click Long")).toBeLessThan(
      markup.indexOf('aria-label="One-click order template"')
    )
  })
})
