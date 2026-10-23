import { describe, expect, it } from "vitest"

import { compileAutomationGraph } from "./compile"
import { automationGraphSchema } from "./graph"
import {
  AUTOMATION_TEMPLATES,
  AUTOMATION_TEMPLATE_KEYS,
  automationTemplate,
} from "./templates"

describe("automation templates", () => {
  it("keeps every key unique and findable", () => {
    const keys = AUTOMATION_TEMPLATES.map((template) => template.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toEqual(AUTOMATION_TEMPLATE_KEYS)

    for (const template of AUTOMATION_TEMPLATES) {
      expect(automationTemplate(template.key)).toBe(template)
    }
  })

  it("only ships graphs the current automation registry can compile", () => {
    for (const template of AUTOMATION_TEMPLATES) {
      const graph = automationGraphSchema.parse(template.graph)
      const compiled = compileAutomationGraph(graph)

      expect(compiled.errors, template.name).toEqual([])
      expect(compiled.config, template.name).not.toBeNull()
    }
  })
})
