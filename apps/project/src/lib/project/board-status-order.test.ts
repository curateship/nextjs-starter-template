import { describe, expect, it } from "vitest"

import { boardStatusOrder, statusOrderSchema } from "@/lib/project/rules"

describe("a project's Board column order", () => {
  it("is the usual order until someone drags a column", () => {
    expect(boardStatusOrder([])).toEqual(["todo", "doing", "done", "stuck"])
  })

  it("keeps a saved order, once each, and puts anything it leaves out at the end", () => {
    expect(boardStatusOrder(["stuck", "doing", "todo", "done"])).toEqual(["stuck", "doing", "todo", "done"])
    expect(boardStatusOrder(["done", "done", "gone", "todo"])).toEqual(["done", "todo", "doing", "stuck"])
  })

  it("saves only all four columns, each once", () => {
    const ok = (statusOrder: unknown) => statusOrderSchema.safeParse({ projectId: "p1", statusOrder }).success
    expect(ok(["doing", "todo", "done", "stuck"])).toBe(true)
    expect(ok(["doing", "todo", "done"])).toBe(false)
    expect(ok(["doing", "doing", "done", "stuck"])).toBe(false)
    expect(ok(["doing", "todo", "done", "later"])).toBe(false)
  })
})
