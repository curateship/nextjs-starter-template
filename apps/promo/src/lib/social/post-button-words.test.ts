import { describe, expect, it } from "vitest"

import { postButtonWords, postingBlockedReason } from "./wording"

const browserAccount = {
  handle: "promo_tester",
  blocked: false,
  reason: "",
  profile: { id: "pr1", name: "Browser one" },
  phone: null,
  posting: null,
}

const phoneAccount = {
  ...browserAccount,
  profile: null,
  phone: { id: "ph1", name: "Pixel 8a", shelfSlot: "4", status: "connected" as const, offlineReason: "", inUse: false, addressStop: "" },
}

const read = { thread: { body: "", replies: [] } }

describe("the Post button says which device (part 30)", () => {
  it("names the phone's slot or the browser, and changes with the account", () => {
    expect(postButtonWords(phoneAccount)).toBe("Post from phone · slot 4")
    expect(postButtonWords({ ...phoneAccount, phone: { ...phoneAccount.phone, shelfSlot: "" } })).toBe("Post from phone")
    expect(postButtonWords(browserAccount)).toBe("Post from browser")
    expect(postButtonWords(null)).toBe("Post comment")
  })

  it("says why Post is off for a phone that is offline, held, in use or stopped", () => {
    expect(postingBlockedReason(phoneAccount, read)).toBeNull()
    expect(
      postingBlockedReason({ ...phoneAccount, phone: { ...phoneAccount.phone, status: "offline", offlineReason: "Not plugged in" } }, read)?.text
    ).toBe("Pixel 8a in slot 4 is offline: Not plugged in. Check it on the Phones dashboard.")
    expect(postingBlockedReason({ ...phoneAccount, phone: { ...phoneAccount.phone, status: "held" } }, read)?.text).toBe(
      "Pixel 8a in slot 4 is held. Release it on the Phones dashboard, then post."
    )
    expect(
      postingBlockedReason({ ...phoneAccount, phone: { ...phoneAccount.phone, status: "held", inUse: true } }, read)?.text
    ).toContain("while someone uses its screen window")
    expect(
      postingBlockedReason({ ...phoneAccount, phone: { ...phoneAccount.phone, addressStop: "Apps see 203.0.113.5, the house's own address." } }, read)?.text
    ).toBe("Pixel 8a in slot 4 was stopped for showing the wrong address: Apps see 203.0.113.5, the house's own address.")
  })
})
