import { describe, expect, it } from "vitest"

import { OWN_HEIGHT, shareHeights } from "@/components/trade/notes/block-heights"

const CAP = 448

describe("shareHeights", () => {
  it("lets a cut-off block grow into spare room, only as far as its rows", () => {
    // Grid's rows want 580px; capped at 448. Folders is last at 108px. The
    // page is 700px in a 1100px panel, so 400px is spare.
    const shares = shareHeights(
      [
        { current: 448, natural: 580, last: false },
        { current: 108, natural: 108, last: true },
      ],
      1100,
      700,
      CAP
    )
    expect(shares[0]).toEqual({ height: 580, fills: false })
    // Folders gets the 268px left over on top of its own 108px.
    expect(shares[1]).toEqual({ height: 376, fills: true })
  })

  it("keeps the cap while the page already runs past the panel", () => {
    const shares = shareHeights(
      [
        { current: 448, natural: 580, last: false },
        { current: 108, natural: 108, last: true },
      ],
      800,
      900,
      CAP
    )
    expect(shares).toEqual([OWN_HEIGHT, OWN_HEIGHT])
  })

  it("gives spare room in page order, so two blocks never claim the same room", () => {
    const shares = shareHeights(
      [
        { current: 448, natural: 600, last: false },
        { current: 448, natural: 600, last: false },
      ],
      1300,
      1100,
      CAP
    )
    expect(shares[0]).toEqual({ height: 600, fills: false })
    expect(shares[1]).toEqual({ height: 496, fills: false })
  })

  it("gives the same answer once the heights are applied", () => {
    const blocks = [
      { current: 448, natural: 580, last: false },
      { current: 108, natural: 108, last: true },
    ]
    const first = shareHeights(blocks, 1100, 700, CAP)
    // The page grew by what the two blocks took: 132 + 268.
    const second = shareHeights(
      [
        { ...blocks[0], current: first[0].height! },
        { ...blocks[1], current: first[1].height! },
      ],
      1100,
      1100,
      CAP
    )
    expect(second).toEqual(first)
  })
})

describe("shareHeights while the panel keeps its height", () => {
  it("keeps a grown block when the block under it gets taller", () => {
    // Grid grew to 580. Folders opens a folder: 108px to 320px, so the page
    // is now 212px longer than the panel.
    const blocks = [
      { current: 580, natural: 580, last: false },
      { current: 320, natural: 320, last: true },
    ]
    const shares = shareHeights(blocks, 1100, 1312, CAP, true)
    expect(shares[0]).toEqual({ height: 580, fills: false })
    expect(shares[1]).toEqual(OWN_HEIGHT)
    // A new panel height starts fresh: Grid gives the room back.
    expect(shareHeights(blocks, 1000, 1312, CAP, false)[0]).toEqual(OWN_HEIGHT)
  })
})
