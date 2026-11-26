import { describe, expect, it } from "vitest"

import { hasRobotHeaders, isRobotAddress } from "@/lib/crm/robot-mail"

/** Mail from machines (CRM task 38, part 4). */
describe("robot mail", () => {
  it("knows the no-reply addresses, in any capitals and with a tag", () => {
    for (const email of [
      "noreply@shop.com",
      "No-Reply@shop.com",
      "donotreply@bank.com",
      "do-not-reply@bank.com",
      "noreply+orders@shop.com",
    ]) {
      expect(isRobotAddress(email)).toBe(true)
    }
  })

  it("leaves people's addresses alone, even ones that look a little like it", () => {
    for (const email of ["jane@buyer.com", "replyguy@x.com", "noreen@x.com", "reply@x.com", "info@x.com"]) {
      expect(isRobotAddress(email)).toBe(false)
    }
  })

  it("reads the headers machines send", () => {
    const headers = (bag: Record<string, string>) => (name: string) => bag[name] ?? null
    expect(hasRobotHeaders(headers({ "list-unsubscribe": "<mailto:u@x.com>" }))).toBe(true)
    expect(hasRobotHeaders(headers({ "auto-submitted": "auto-generated" }))).toBe(true)
    expect(hasRobotHeaders(headers({ "auto-submitted": "no" }))).toBe(false)
    expect(hasRobotHeaders(headers({ precedence: "Bulk" }))).toBe(true)
    expect(hasRobotHeaders(headers({ precedence: "first-class" }))).toBe(false)
    expect(hasRobotHeaders(headers({}))).toBe(false)
  })
})
