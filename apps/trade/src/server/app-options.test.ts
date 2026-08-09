import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { appAutomationExecutors, appBackgroundWorkers } from "@/server/app-options"

/**
 * The server-side half of app options, checked the same way as the other half
 * in `src/lib/app-options.test.ts`: an option nobody set means exactly what the
 * shell did before it existed, and the app's file stays on the right side of
 * the lines it is near.
 *
 * The default is checked by passing an empty object rather than by reading this
 * app's own answers, so the check keeps working inside an app that has set the
 * option.
 */

describe("an option nobody set means what the shell always did", () => {
  it("adds no automation executors of its own", () => {
    expect(appAutomationExecutors({})).toEqual({})
  })

  it("runs no background workers of its own", () => {
    expect(appBackgroundWorkers({})).toEqual([])
  })
})

describe("an app's answer wins", () => {
  it("hands over the app's own executors", () => {
    const executors = {
      sendSms: async () => ({ type: "next" as const, summary: "Sent." }),
    }
    expect(appAutomationExecutors({ automations: { executors } })).toBe(
      executors
    )
  })

  it("hands over the app's own background workers", () => {
    const workers = [{ name: "video-media", tick: async () => {} }]
    expect(appBackgroundWorkers({ background: { workers } })).toBe(workers)
  })
})

describe("the app's server options file stays on its own side of the line", () => {
  const source = () =>
    readFileSync(join(process.cwd(), "src/app/server-options.ts"), "utf8")

  it("leaves new doors to src/lib/api, where guards.test can see them", () => {
    // An endpoint declared in src/app would be invisible to the guard scanner,
    // which only walks src/lib/api — an unguarded door nobody is told about.
    // This file may reach the database, which is exactly why it must not also
    // be an address the open internet can call.
    expect(source()).not.toContain("createServerFn")
  })
})
