import { describe, expect, it } from "vitest"

import { getOrderTemplateErrorMessage } from "@/lib/api/order-templates"

describe("order template errors", () => {
  it("does not expose raw database errors", () => {
    expect(
      getOrderTemplateErrorMessage(
        new Error('duplicate key violates constraint "order_templates_user_id_name_unique"')
      )
    ).toBe("Order template request failed.")
  })

  it("keeps safe, useful errors", () => {
    expect(getOrderTemplateErrorMessage(new Error("Order template not found"))).toBe(
      "Order template not found"
    )
  })
})
