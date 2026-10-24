import { describe, expect, it } from "vitest"

import type { TaskCard } from "@/lib/api/project/tasks"
import { adminProjectColumn } from "@/lib/project/admin-projects"

const column = adminProjectColumn({
  projectInfo: {
    web: { name: "Website", color: "blue", teamName: "Acme", movable: true },
    app: { name: "App", color: "green", teamName: "Acme", movable: true },
    old: { name: "Old site", color: "slate", teamName: "Acme", movable: false },
    logo: { name: "Logo", color: "red", teamName: "Brand", movable: true },
    own: { name: "Just me", color: "slate", teamName: null, movable: false },
  },
})
const task = (projectId: string) => ({ projectId, projectName: "?" }) as TaskCard

/** Tyler, 23 Oct 2026: "I should be able to select a project in the project col", and "all should be this". */
describe("the site admin's Project chip", () => {
  it("shows the project's own name and colour", () => {
    expect(column.of(task("web"))).toMatchObject({ name: "Website", color: "blue" })
    expect(column.of(task("own"))).toMatchObject({ name: "Just me" })
  })

  it("offers every task the same list: Just me, then each team's open projects under its name", () => {
    const list = [
      [null, "Just me"],
      ["Acme", "App"],
      ["Acme", "Website"],
      ["Brand", "Logo"],
    ]
    expect(column.choices!(task("web")).map((choice) => [choice.group, choice.name])).toEqual(list)
    expect(column.choices!(task("own")).map((choice) => [choice.group, choice.name])).toEqual(list)
  })

  it("offers Just me by its stand-in id before the list exists", () => {
    const fresh = adminProjectColumn({
      projectInfo: { web: { name: "Website", color: "blue", teamName: "Acme", movable: true } },
    })
    expect(fresh.choices!(task("web")).map((choice) => choice.id)).toEqual(["personal", "web"])
  })
})
