import { describe, expect, it } from "vitest"

import { appActionFoldsOnPhone as foldsOnPhone, type AppHeaderAction } from "@/lib/app-options"

const action = (options: Partial<AppHeaderAction>): AppHeaderAction => ({
  id: "goal",
  label: "Goal",
  icon: () => null,
  component: async () => ({ default: () => null }),
  ...options,
})
const row = (folds?: boolean) => ({
  type: "app" as const,
  id: "goal",
  visible: true,
  ...(folds === undefined ? {} : { foldsOnPhone: folds }),
})

describe("where an app control goes on a phone", () => {
  it("follows the app until somebody picks a place", () => {
    expect(foldsOnPhone(row(), action({ foldsOnPhone: true }))).toBe(true)
    expect(foldsOnPhone(row(), action({}))).toBe(false)
  })
  it("lets a saved choice win only on a control that offers one", () => {
    const choice = action({ foldsOnPhone: true, phoneChoice: true })
    expect(foldsOnPhone(row(false), choice)).toBe(false)
    expect(foldsOnPhone(row(true), action({ phoneChoice: true }))).toBe(true)
    expect(foldsOnPhone(row(false), action({ foldsOnPhone: true }))).toBe(true)
  })
})
