import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { appAutomationNodes, landingPageOverride } from "@/lib/app-options"
import { defineNode } from "@/lib/automations/node-descriptor"

/**
 * App options are how an app built from this shell changes the shell's
 * behaviour without editing a shell file. Two things have to stay true for that
 * to keep working, and they are what this file checks.
 *
 * The first is that an option nobody set means exactly what the shell did
 * before it existed. Every option is added to the shell first, defaulting to
 * today's behaviour, and only then used by an app — so if a default ever drifts,
 * every app that never asked for the change gets it anyway, silently, on their
 * next merge.
 *
 * The second is that the app's options file stays on the right side of the
 * server/browser line. It is the one file an app is expected to edit, so it is
 * also the easiest place to drag the database into a page or to open a door
 * nobody is guarding.
 *
 * Note the default is checked by passing an empty object rather than by reading
 * this app's own answers. An app that has set an option would otherwise fail its
 * own shell's test, and the test would only be asserting what that app already
 * says.
 */

/** The least a node can be and still be one — stands in for an app's own step. */
function testNode(kind: string) {
  return defineNode({
    kind,
    palette: { key: kind, group: "Actions", description: "A test step" },
    createSettings: () => ({}),
    settingsSchema: z.object({}),
    name: () => kind,
    description: () => "A test step",
    icon: () => null,
    outputPorts: [{ id: "then", label: "Then" }],
    hasInput: true,
    connectionError: () => null,
  })
}

describe("an option nobody set means what the shell always did", () => {
  it("keeps the shell's own front page", () => {
    expect(landingPageOverride({})).toBeNull()
  })

  it("adds no automation steps of its own", () => {
    expect(appAutomationNodes({})).toEqual([])
  })
})

describe("an app's answer wins", () => {
  it("hands over the front page", () => {
    const page = { Component: () => null }
    expect(landingPageOverride({ landing: { page } })).toBe(page)
  })

  it("hands over the app's own automation steps", () => {
    const nodes = [testNode("sendSms")]
    expect(appAutomationNodes({ automations: { nodes } })).toBe(nodes)
  })
})

describe("the app's options file stays on its own side of the line", () => {
  const source = () =>
    readFileSync(join(process.cwd(), "src/app/options.ts"), "utf8")

  it("keeps the database out of the browser", () => {
    // This file is imported by client code, so anything it pulls in ships to
    // the browser. Nothing under @/server may be reached from here.
    const serverImports = [...source().matchAll(/from "@\/server\/[^"]*"/g)]

    expect(serverImports.map((match) => match[0])).toEqual([])
  })

  it("leaves new doors to src/lib/api, where guards.test can see them", () => {
    // An endpoint declared in src/app would be invisible to the guard scanner,
    // which only walks src/lib/api — an unguarded door nobody is told about.
    expect(source()).not.toContain("createServerFn")
  })

  it("keeps its server-side twin out of the browser", () => {
    // server-options.ts is the same app's answers on the other side of the
    // line, and everything it holds reaches the database. Importing it from
    // here would drag all of that into the browser bundle by the back door.
    expect(source()).not.toContain("@/app/server-options")
  })
})
