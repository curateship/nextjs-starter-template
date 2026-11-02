import { describe, expect, it } from "vitest"

import { emailFirstName } from "@/lib/email/recipient-name"

describe("emailFirstName", () => {
  it("uses the first word of a stored name", () => {
    expect(emailFirstName("  Sarah Jane Smith  ", "sarah@example.com")).toBe(
      "Sarah"
    )
  })

  it.each([null, undefined, "", "   ", "ADA@EXAMPLE.COM"])(
    "uses a natural fallback for %s",
    (name) => {
      expect(emailFirstName(name, "ada@example.com")).toBe("there")
    }
  )

  it("keeps user-supplied markup as text for the email renderer to escape", () => {
    expect(emailFirstName("<script> Ada", "ada@example.com")).toBe("<script>")
  })
})
