import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { automationCompiledConfigSchema } from "@/lib/automations/compile"
import { AUTOMATION_TEMPLATES } from "@/lib/automations/templates"
import { createWorkspaceAutomation } from "@/server/automations/flows"
import {
  getUserAutomationTemplate,
  listUserAutomationTemplates,
  resetUserAutomationTemplate,
  saveUserAutomationTemplateDetails,
  saveUserAutomationTemplateGraph,
} from "@/server/automations/templates"
import type { CustomShellDb } from "@/server/db"
import { createTestDatabase, insertWorkspace, insertUser } from "@/server/test-support"

let client: PGlite
let database: CustomShellDb
/** The site every flow in these tests belongs to. */
let site: string

beforeEach(async () => {
  const created = await createTestDatabase()
  client = created.client
  database = created.db
  site = (await insertWorkspace(database)).id
})

afterEach(async () => {
  await client.close()
})

describe("creating an automation from a template", () => {
  it("stores a compiled, disabled copy of every built-in flow", async () => {
    const owner = await insertUser(database, { role: "admin" })

    for (const template of AUTOMATION_TEMPLATES) {
      const created = await createWorkspaceAutomation(site,
        owner.id,
        template.name,
        database,
        template.graph
      )

      expect(created.enabled, template.name).toBe(false)
      expect(created.graph, template.name).toEqual(template.graph)
      expect(
        automationCompiledConfigSchema.safeParse(created.compiledConfig)
          .success,
        template.name
      ).toBe(true)
    }
  })

  it("saves one admin's version without changing another admin's templates", async () => {
    const owner = await insertUser(database, { role: "admin" })
    const otherOwner = await insertUser(database, { role: "admin" })
    const builtIn = AUTOMATION_TEMPLATES[0]

    const saved = await saveUserAutomationTemplateDetails(
      owner.id,
      {
        key: builtIn.key,
        name: "Our welcome",
        description: "The welcome flow used by our team.",
      },
      database
    )

    expect(saved.name).toBe("Our welcome")
    expect(saved.isCustomized).toBe(true)
    expect(
      (await getUserAutomationTemplate(otherOwner.id, builtIn.key, database))
        .name
    ).toBe(builtIn.name)
    expect(
      (await listUserAutomationTemplates(owner.id, database)).filter(
        (template) => template.isCustomized
      )
    ).toHaveLength(1)
  })

  it("uses the saved graph for new copies and can reset to the built-in", async () => {
    const owner = await insertUser(database, { role: "admin" })
    const builtIn = AUTOMATION_TEMPLATES[0]
    const customizedGraph = {
      ...builtIn.graph,
      viewport: { x: 120, y: 80, zoom: 1.1 },
    }

    await saveUserAutomationTemplateDetails(
      owner.id,
      {
        key: builtIn.key,
        name: "Our welcome",
        description: "The welcome flow used by our team.",
      },
      database
    )
    await saveUserAutomationTemplateGraph(
      owner.id,
      builtIn.key,
      customizedGraph,
      database
    )
    await saveUserAutomationTemplateDetails(
      owner.id,
      {
        key: builtIn.key,
        name: "Our updated welcome",
        description: "The updated welcome flow used by our team.",
      },
      database
    )
    const effective = await getUserAutomationTemplate(
      owner.id,
      builtIn.key,
      database
    )
    const created = await createWorkspaceAutomation(site,
      owner.id,
      effective.name,
      database,
      effective.graph
    )

    expect(created.graph).toEqual(customizedGraph)
    expect(created.name).toBe("Our updated welcome")
    expect(created.enabled).toBe(false)

    const reset = await resetUserAutomationTemplate(
      owner.id,
      builtIn.key,
      database
    )
    expect(reset.name).toBe(builtIn.name)
    expect(reset.graph).toEqual(builtIn.graph)
    expect(reset.isCustomized).toBe(false)
  })
})
