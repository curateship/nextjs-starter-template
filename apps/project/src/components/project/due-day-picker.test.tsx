import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { DueDayPicker } from "@/components/project/due-day-picker"
import { TooltipProvider } from "@/components/ui/tooltip"

describe("the due day box", () => {
  it("writes the day short and cuts anything longer inside the box, so it fits beside the cross", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <DueDayPicker value="2026-10-27" onChange={() => {}} clearLabel="Clear the due date" />
      </TooltipProvider>
    )
    expect(html).toMatch(/<span class="[^"]*truncate[^"]*">Oct 27, 2026<\/span>/)
    expect(html).not.toContain("October 27th")
  })
})
