import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { TradingSettings } from "@/components/trading-settings"
import { createDefaultShellConfig } from "@/lib/custom-shell"

describe("trading settings", () => {
  it("explains that order confirmation covers entries, exits, and cancel all", () => {
    const markup = renderToStaticMarkup(
      <TradingSettings
        config={createDefaultShellConfig()}
        isSaving={false}
        onConfigChange={() => {}}
        onSaveConfig={async () => true}
      />
    )

    expect(markup).toContain(
      "Ask me to confirm before entering, exiting, or cancelling all orders"
    )
  })
})
