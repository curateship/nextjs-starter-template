import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  appAutomationNodes,
  appCanvasHeaderStatus,
  appCanvasPanel,
  appHeaderRightAction,
  appHeaderRightActionForRole,
  appNotificationLinks,
  appShowsRunButton,
  appOffersMemberTest,
  appPaletteGroups,
  appPublicTheme,
  appSettingsTabs,
  catchAllOverride,
  landingPageOverride,
  mayHaveWorkspace,
  whoMayHaveWorkspaces,
  capitalise,
  workspaceWord,
} from "@/lib/app-options"
import { createDefaultPublicTheme } from "@/lib/public-theme"
import { workspaceAddress } from "@/lib/workspaces/addresses"
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
  it("keeps the shell's public look", () => {
    expect(appPublicTheme({})).toEqual(createDefaultPublicTheme())
  })

  it("adds no app-owned control to the signed-in header", () => {
    expect(appHeaderRightAction({})).toBeNull()
  })

  it("keeps the shell's own front page", () => {
    expect(landingPageOverride({})).toBeNull()
  })

  it("adds no automation steps of its own", () => {
    expect(appAutomationNodes({})).toEqual([])
  })

  it("says no notice of its own leads anywhere", async () => {
    // The bell then falls back to what it always read off the notice itself,
    // which for an announcement is to open nothing and stay up.
    expect(
      await appNotificationLinks([{ id: "n1", type: "announcement" }], {})
    ).toEqual({})
  })

  it("leaves the catch-all to the written pages", () => {
    // Null is what `$.tsx` checks for before it asks anything of the app, so
    // this is the difference between "written pages as always" and an app
    // getting first refusal on every address in the app.
    expect(catchAllOverride({})).toBeNull()
  })
})

describe("an app's answer wins", () => {
  it("uses the app's default public look", () => {
    const publicTheme = {
      brandColor: "#123456",
      colorScheme: "dark" as const,
      font: "serif" as const,
    }

    expect(appPublicTheme({ publicTheme })).toEqual({
      ...createDefaultPublicTheme(),
      ...publicTheme,
    })
  })

  it("hands over the signed-in header's app-owned control", () => {
    const rightAction = {
      id: "app-status",
      label: "App status",
      icon: () => null,
      roles: ["admin"],
      component: async () => ({ default: () => null }),
    }
    expect(appHeaderRightAction({ header: { rightAction } })).toBe(rightAction)
    expect(
      appHeaderRightActionForRole("admin", { header: { rightAction } })
    ).toBe(rightAction)
    expect(
      appHeaderRightActionForRole("member", { header: { rightAction } })
    ).toBeNull()
  })

  it("sends a notice where the app says it came from", async () => {
    const asked: string[] = []
    const links = await appNotificationLinks(
      [
        { id: "n1", type: "announcement" },
        { id: "n2", type: "feedback_vote" },
      ],
      {
        notifications: {
          linksFor: async (notices) => {
            for (const one of notices) asked.push(one.id)
            return { n1: "/admin/hyper-liquid?market=x" }
          },
        },
      }
    )
    expect(links).toEqual({ n1: "/admin/hyper-liquid?market=x" })
    // Which notices reach the app is the app's own business; the shell hands
    // over everything on screen and lets the app say which ones it knows.
    expect(asked).toEqual(["n1", "n2"])
  })

  it("does not ask the app about an empty tray", async () => {
    let asked = 0
    await appNotificationLinks([], {
      notifications: {
        linksFor: async () => {
          asked += 1
          return {}
        },
      },
    })
    expect(asked).toBe(0)
  })

  it("hands over the front page", () => {
    const page = { Component: () => null }
    expect(landingPageOverride({ landing: { page } })).toBe(page)
  })

  it("hands over the app's own automation steps", () => {
    const nodes = [testNode("sendSms")]
    expect(appAutomationNodes({ automations: { nodes } })).toBe(nodes)
  })

  it("hands over the catch-all", () => {
    const catchAll = {
      loader: async () => null,
      Component: () => null,
    }
    expect(catchAllOverride({ pages: { catchAll } })).toBe(catchAll)
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

describe("who may have a workspace", () => {
  const admin = { role: "admin" }
  const member = { role: "member" }

  it("means admins when the app has not said otherwise", () => {
    // The one option whose default is deliberately **not** what the shell did
    // before it existed — the old answer was everybody, and that was the hole.
    expect(whoMayHaveWorkspaces({})).toBe("admins")
    expect(mayHaveWorkspace(admin, {})).toBe(true)
    expect(mayHaveWorkspace(member, {})).toBe(false)
  })

  it("closes the door on everybody when an app is one site", () => {
    const off = { workspaces: { whoMayHave: "off" as const } }

    expect(mayHaveWorkspace(admin, off)).toBe(false)
    expect(mayHaveWorkspace(member, off)).toBe(false)
  })

  it("opens it to members only when an app asks for that", () => {
    const everyone = { workspaces: { whoMayHave: "everyone" as const } }

    expect(mayHaveWorkspace(member, everyone)).toBe(true)
    expect(mayHaveWorkspace(admin, everyone)).toBe(true)
  })

  it("refuses somebody who is not signed in at all", () => {
    expect(mayHaveWorkspace(null, { workspaces: { whoMayHave: "everyone" } })).toBe(
      false
    )
  })
})

describe("what an app calls a workspace", () => {
  it("says workspace when the app has not renamed it", () => {
    expect(workspaceWord({})).toEqual({ one: "workspace", many: "workspaces" })
  })

  it("uses the app's own word where somebody can see it", () => {
    const word = workspaceWord({
      workspaces: { word: { one: "site", many: "sites" } },
    })

    expect(word.one).toBe("site")
    // Written lower case and raised where a heading needs it, so an app never
    // has to write the same word twice in two shapes.
    expect(capitalise(word.many)).toBe("Sites")
  })

  it("leaves the address stand-in saying workspace until an app hands its own word in", () => {
    expect(workspaceAddress("", "example.com")).toBe(
      "your-workspace.example.com"
    )
    expect(workspaceAddress("", "example.com", "your-site")).toBe(
      "your-site.example.com"
    )
    // A typed address always wins over the stand-in.
    expect(workspaceAddress("alpha", "example.com", "your-site")).toBe(
      "alpha.example.com"
    )
  })
})

describe("the app's own palette headings", () => {
  it("are none unless an app asks for them", () => {
    expect(appPaletteGroups({})).toEqual([])
  })

  it("hands back what the app asked for", () => {
    const paletteGroups = ["Trading"]
    expect(appPaletteGroups({ automations: { paletteGroups } })).toBe(
      paletteGroups
    )
  })
})

describe("the app's own Settings tabs", () => {
  const panel = async () => ({ default: () => null })

  it("are none unless an app asks for them", () => {
    expect(appSettingsTabs({})).toEqual([])
  })

  it("refuses a tab named after one of the shell's own", () => {
    expect(() =>
      appSettingsTabs({ settings: { tabs: [{ id: "general", label: "G", panel }] } }, [
        "general",
      ])
    ).toThrow(/shell's own Settings tabs/)
  })

  it("refuses two tabs with the same id", () => {
    expect(() =>
      appSettingsTabs({
        settings: {
          tabs: [
            { id: "engine", label: "Engine", panel },
            { id: "engine", label: "Again", panel },
          ],
        },
      })
    ).toThrow(/both call themselves/)
  })

  it("hands back what the app asked for", () => {
    const tabs = [{ id: "engine", label: "Engine", panel }]
    expect(appSettingsTabs({ settings: { tabs } })).toBe(tabs)
  })
})


describe("the app's own canvas panel", () => {
  it("is nothing unless an app asks for one", () => {
    expect(appCanvasPanel({})).toBeNull()
  })

  it("hands back what the app asked for", () => {
    const canvasPanel = {
      label: "Backtest",
      panel: async () => ({ default: () => null }),
    }
    expect(appCanvasPanel({ automations: { canvasPanel } })).toBe(canvasPanel)
  })
})

describe("the app's own status in the canvas header", () => {
  it("is nothing unless an app asks for one", () => {
    // The default has to be nothing, or every app copied from this shell would
    // grow a piece of header it never asked for.
    expect(appCanvasHeaderStatus({})).toBeNull()
  })

  it("hands back what the app asked for", () => {
    const canvasHeaderStatus = {
      status: async () => ({ default: () => null }),
    }
    expect(
      appCanvasHeaderStatus({ automations: { canvasHeaderStatus } })
    ).toBe(canvasHeaderStatus)
  })
})

describe("whether the shell's Run button is drawn", () => {
  it("is shown unless an app says otherwise", () => {
    // The default has to be shown, or every app copied from this shell would
    // lose its button.
    expect(appShowsRunButton({})).toBe(true)
  })

  it("is hidden when an app draws its own instead", () => {
    expect(appShowsRunButton({ automations: { runButton: "hidden" } })).toBe(
      false
    )
  })
})

describe("testing a flow with one member", () => {
  it("is offered on every flow unless an app says otherwise", () => {
    expect(appOffersMemberTest([], {})).toBe(true)
    expect(appOffersMemberTest(["sendEmail"], {})).toBe(true)
  })

  it("is kept off the flows the app names, and left on the rest", () => {
    const options = {
      automations: {
        memberTest: {
          appliesTo: (kinds: readonly string[]) => !kinds.includes("tradeDca"),
        },
      },
    }

    expect(appOffersMemberTest(["tradeWallet", "tradeDca"], options)).toBe(false)
    expect(appOffersMemberTest(["sendEmail"], options)).toBe(true)
  })
})

describe("a canvas panel that only suits some flows", () => {
  const canvasPanel = {
    label: "Backtest",
    appliesTo: (kinds: readonly string[]) => kinds.includes("tradeDca"),
    panel: async () => ({ default: () => null }),
  }

  it("is offered to a flow holding the step it is about", () => {
    const asked = appCanvasPanel({ automations: { canvasPanel } })
    expect(asked?.appliesTo?.(["tradeWallet", "tradeDca"])).toBe(true)
  })

  it("is not offered to a flow without it", () => {
    const asked = appCanvasPanel({ automations: { canvasPanel } })
    expect(asked?.appliesTo?.(["sendEmail"])).toBe(false)
  })
})
