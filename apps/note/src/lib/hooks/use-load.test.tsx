// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { useLoad } from "@/lib/hooks/use-load"

type Seen = { data: string | null; setData: (value: string) => void }

/** Draws whatever the hook holds on its first and every later draw. */
function Probe({
  load,
  remember,
  seen,
}: {
  load: () => Promise<string>
  remember?: string
  seen: Seen[]
}) {
  const read = useLoad(load, () => "failed", { remember })
  seen.push({ data: read.data, setData: read.setData })
  return <p>{read.data ?? "nothing yet"}</p>
}

const never = () => new Promise<string>(() => undefined)

describe("useLoad remember", () => {
  let host: HTMLDivElement

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement("div")
    document.body.appendChild(host)
  })

  afterEach(() => {
    document.body.replaceChildren()
  })

  async function show(load: () => Promise<string>, remember?: string) {
    const seen: Seen[] = []
    const root = createRoot(host)
    await act(async () => root.render(<Probe load={load} remember={remember} seen={seen} />))
    return { seen, root }
  }

  it("draws the last visit's read on the first draw of the next visit", async () => {
    const first = await show(() => Promise.resolve("left page"), "test-page")
    expect(host.textContent).toBe("left page")
    await act(async () => first.root.unmount())

    // The next read never lands, so only the kept copy can be on screen.
    const second = await show(never, "test-page")
    expect(second.seen[0]?.data).toBe("left page")
    await act(async () => second.root.unmount())
  })

  it("keeps what setData changed, so coming back never shows an older page", async () => {
    const first = await show(() => Promise.resolve("before"), "test-edited")
    await act(async () => first.seen.at(-1)?.setData("after"))
    await act(async () => first.root.unmount())

    const second = await show(never, "test-edited")
    expect(second.seen[0]?.data).toBe("after")
    await act(async () => second.root.unmount())
  })

  it("starts empty without a name, as every other card does", async () => {
    const first = await show(() => Promise.resolve("left page"))
    await act(async () => first.root.unmount())

    const second = await show(never)
    expect(second.seen[0]?.data).toBeNull()
    await act(async () => second.root.unmount())
  })
})
