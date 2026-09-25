import { describe, expect, it } from "vitest"

import { suggestedEmailAddress } from "@/lib/email/domain-suggestion"

describe("email domain suggestion", () => {
  it.each([
    ["name@gmial.com", "name@gmail.com"],
    ["name@gmal.com", "name@gmail.com"],
    ["name@gmaill.com", "name@gmail.com"],
    ["name@gmail.co", "name@gmail.com"],
    ["name@outlok.com", "name@outlook.com"],
    ["name@hotnail.com", "name@hotmail.com"],
    ["name@yahooo.com", "name@yahoo.com"],
    [" Name+News@ICLOUF.COM ", "Name+News@icloud.com"],
  ])("suggests %s as %s", (email, suggestion) => {
    expect(suggestedEmailAddress(email)).toBe(suggestion)
  })

  it.each([
    "name@gmail.com",
    "name@company.com",
    "name@gmial.example",
    "name@gmail",
    "name@proton.me",
    "name@@gmail.com",
    "@gmial.com",
    "gmial.com",
    "",
  ])("stays quiet for %s", (email) => {
    expect(suggestedEmailAddress(email)).toBeNull()
  })
})
