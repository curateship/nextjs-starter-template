import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/app/options", async () => ({
  appOptions: (await import("@/lib/test-app-roles")).testAppRoleOptions,
}))

let caller: { id: string; role: string } = { id: "u1", role: "member" }

vi.mock("@/server/auth/security", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/security")>()),
  requireUser: async () => caller,
}))
vi.mock("@/server/auth/origin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/origin")>()),
  requireAppOrigin: () => undefined,
}))
vi.mock("@/server/ticker", () => ({ ensureBackgroundTicker: () => undefined }))

import type { RoleFeature } from "@/lib/role-id"
import { featureGet, featurePost } from "@/server/guards"

/**
 * An app role is refused by the server, not just hidden on the screen.
 *
 * Two halves. The first reads every endpoint behind a part of the shell an
 * app role may not get, and insists each one carries `featureGet` or
 * `featurePost` for that part, or an admin guard. The second calls those two
 * guards as an app role, a member and an admin, the way a request would.
 * Together they say every one of those endpoints refuses an app role.
 */

const API_DIR = join(process.cwd(), "src/lib/api")

/**
 * Each file, the part of the shell its member endpoints sit behind, and the
 * endpoints in it that are open on purpose or behind a different part.
 */
const GATED_FILES: {
  file: string
  feature: RoleFeature
  except?: Record<string, string>
}[] = [
  {
    file: "billing/billing.ts",
    feature: "billing",
    except: {
      loadPublicPricingFn:
        "The public pricing page lists plans for visitors with no account.",
    },
  },
  { file: "people/member-home.ts", feature: "billing" },
  { file: "feedback.ts", feature: "feedback" },
  {
    file: "content/changelog.ts",
    feature: "changelog",
    except: {
      listAdminFn:
        "Answers null to anyone who is not an admin, so an app role learns nothing.",
    },
  },
  { file: "ai.ts", feature: "aiUsage" },
]

const ADMIN_GUARD = /\.middleware\(\[[^\]]*\badmin(Get|Post)\b|\brequireAdmin\w*\(/

function serverFns(file: string) {
  const source = readFileSync(join(API_DIR, file), "utf8")
  const matches = [...source.matchAll(/const (\w+) = createServerFn\(/g)]
  return matches.map((match, index) => ({
    name: match[1],
    body: source.slice(match.index, matches[index + 1]?.index ?? source.length),
  }))
}

describe("every endpoint behind a part of the shell names that part", () => {
  for (const { file, feature, except = {} } of GATED_FILES) {
    it(`${file} keeps an app role without ${feature} out`, () => {
      const fns = serverFns(file)
      expect(fns.length).toBeGreaterThan(0)

      const wrong = fns
        .filter(({ name }) => !(name in except))
        .filter(({ body }) => !ADMIN_GUARD.test(body))
        .filter(
          ({ body }) =>
            !body.includes(`featureGet("${feature}")`) &&
            !body.includes(`featurePost("${feature}")`)
        )
        .map(({ name }) => name)

      expect(wrong).toEqual([])
    })
  }
})

async function call(guard: ReturnType<typeof featureGet>) {
  const next = vi.fn(async (options: unknown) => options)
  const server = guard.options.server as unknown as (args: {
    next: typeof next
  }) => Promise<unknown>
  await server({ next })
  return next
}

describe("the feature guards, called as each kind of account", () => {
  beforeEach(() => {
    caller = { id: "u1", role: "member" }
  })

  const features: RoleFeature[] = [
    "billing",
    "aiUsage",
    "feedback",
    "changelog",
  ]

  for (const feature of features) {
    it(`refuses an employee at ${feature}, reading or changing`, async () => {
      caller = { id: "e1", role: "employee" }
      await expect(call(featureGet(feature))).rejects.toThrow("FORBIDDEN")
      await expect(call(featurePost(feature))).rejects.toThrow("FORBIDDEN")
    })

    it(`lets a member and an admin through at ${feature}`, async () => {
      for (const role of ["member", "admin"]) {
        caller = { id: "m1", role }
        const next = await call(featureGet(feature))
        expect(next).toHaveBeenCalledWith({ context: { user: caller } })
      }
    })
  }

  it("lets an app role through at the parts its app gave it", async () => {
    caller = { id: "d1", role: "editor" }
    await expect(call(featurePost("feedback"))).resolves.toBeTruthy()
    await expect(call(featureGet("changelog"))).resolves.toBeTruthy()
    await expect(call(featureGet("billing"))).rejects.toThrow("FORBIDDEN")
  })

  it("refuses a role the app no longer declares", async () => {
    caller = { id: "s1", role: "venue_owner" }
    await expect(call(featureGet("billing"))).rejects.toThrow("FORBIDDEN")
  })
})
