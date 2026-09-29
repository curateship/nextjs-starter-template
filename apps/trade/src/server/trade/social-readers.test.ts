import { afterEach, describe, expect, it } from "vitest"

import { clearRationing } from "@/server/protocols/rationing"
import {
  PROFILE_SOCIAL_READER,
  rationSocialReader,
  readSocialPosts,
} from "@/server/trade/social-readers"

afterEach(() => clearRationing())

describe("the reader slot", () => {
  /**
   * The rule that keeps the screens alive: a rationed reader is believed at
   * once and answers "busy" without touching the network, instead of waiting
   * inside the request while it holds a database connection.
   */
  it("answers busy at once while the reader is being left alone", async () => {
    rationSocialReader(PROFILE_SOCIAL_READER)

    const read = await readSocialPosts(PROFILE_SOCIAL_READER, {
      handle: "cryptosam",
    })

    expect(read).toEqual({ ok: false })
  })
})
