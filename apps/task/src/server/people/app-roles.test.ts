import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/app/options", async () => ({
  appOptions: (await import("@/lib/test-app-roles")).testAppRoleOptions,
}))

import { createDefaultMemberSections, type ShellSection } from "@/lib/custom-shell"
import { testAppRoleOptions } from "@/lib/test-app-roles"
import { consumeAuthToken, now } from "@/server/auth/security"
import { createAccountByAdmin, updateUserRole } from "@/server/people/accounts"
import { syncContactsFromUsers } from "@/server/people/contacts"
import { inviteAccount } from "@/server/people/invite"
import { loadMembershipSummary } from "@/server/people/membership"
import { requireKnownRole, requireRoleFeature } from "@/server/people/roles"
import {
  customShellAuthTokens,
  customShellContacts,
  customShellUsers,
} from "@/server/schema"
import { sectionsForRole } from "@/server/shell-settings"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * App roles on the server, with the test-only `employee` and `editor` roles
 * from `src/lib/test-app-roles.ts` standing in for an app's own.
 */

let client: PGlite
let database: TestDatabase

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => {
  await client.close()
  vi.restoreAllMocks()
})

async function roleOf(userId: string) {
  const [row] = await database
    .select({ role: customShellUsers.role })
    .from(customShellUsers)
    .where(eq(customShellUsers.id, userId))
  return row?.role
}

/** The set-password link a test sent, read from the log email-off prints. */
function quietLinks() {
  const info = vi.spyOn(console, "info").mockImplementation(() => {})
  return () => {
    const line = String(info.mock.calls.at(-1)?.[0] ?? "")
    return decodeURIComponent(/token=([^&\s]+)/.exec(line)?.[1] ?? "")
  }
}

describe("the database takes the app's roles", () => {
  it("stores an app role and still stores admin and member", async () => {
    const admin = await insertUser(database, { role: "admin" })
    const member = await insertUser(database, { role: "member" })
    const employee = await insertUser(database, { role: "employee" })

    expect(await roleOf(admin.id)).toBe("admin")
    expect(await roleOf(member.id)).toBe("member")
    expect(await roleOf(employee.id)).toBe("employee")
  })

  it("refuses a role that is not the stored shape", async () => {
    await expect(insertUser(database, { role: "Employee" })).rejects.toThrow()
    await expect(insertUser(database, { role: "venue-owner" })).rejects.toThrow()
    await expect(insertUser(database, { role: "" })).rejects.toThrow()
  })
})

describe("every role written goes through one gate", () => {
  it("knows the shell's roles and the app's, and nothing else", () => {
    expect(requireKnownRole("admin")).toBe("admin")
    expect(requireKnownRole("member")).toBe("member")
    expect(requireKnownRole("employee")).toBe("employee")
    expect(() => requireKnownRole("venue_owner")).toThrow("UNKNOWN_ROLE")
  })

  it("moves an account onto an app role from Admin → Users", async () => {
    await insertUser(database, { role: "admin" })
    const member = await insertUser(database)

    await updateUserRole(member.id, "employee", database)
    expect(await roleOf(member.id)).toBe("employee")

    // And back again: a member is still a member.
    await updateUserRole(member.id, "member", database)
    expect(await roleOf(member.id)).toBe("member")
  })

  it("refuses a role the app does not declare, and leaves the account alone", async () => {
    await insertUser(database, { role: "admin" })
    const member = await insertUser(database)

    await expect(
      updateUserRole(member.id, "venue_owner", database)
    ).rejects.toThrow("UNKNOWN_ROLE")
    expect(await roleOf(member.id)).toBe("member")
  })

  it("refuses to make an account in a role the app does not declare", async () => {
    quietLinks()
    await expect(
      createAccountByAdmin("ghost@example.test", "Ghost", "venue_owner", database)
    ).rejects.toThrow("UNKNOWN_ROLE")
    const rows = await database
      .select()
      .from(customShellUsers)
      .where(eq(customShellUsers.email, "ghost@example.test"))
    expect(rows).toHaveLength(0)
  })

  it("still refuses to demote the last admin into an app role", async () => {
    const admin = await insertUser(database, { role: "admin" })
    await expect(
      updateUserRole(admin.id, "employee", database)
    ).rejects.toThrow("LAST_ADMIN")
  })
})

describe("the app's invite", () => {
  it("makes an account in the app role with no password and a set-password link", async () => {
    const lastLink = quietLinks()
    const result = await inviteAccount(
      { email: " Ben@Example.test ", name: " Ben ", role: "employee" },
      database
    )

    const [created] = await database
      .select()
      .from(customShellUsers)
      .where(eq(customShellUsers.id, result.id))
    expect(created.email).toBe("ben@example.test")
    expect(created.name).toBe("Ben")
    expect(created.role).toBe("employee")
    expect(created.passwordHash).toBeNull()

    const [tokenRow] = await database
      .select()
      .from(customShellAuthTokens)
      .where(eq(customShellAuthTokens.userId, created.id))
    expect(tokenRow.purpose).toBe("reset_password")
    expect(lastLink()).not.toBe("")
  })

  it("lets the link be spent once, and not after it runs out", async () => {
    const lastLink = quietLinks()
    await inviteAccount(
      { email: "once@example.test", name: "Once", role: "employee" },
      database
    )
    const token = lastLink()

    await consumeAuthToken(token, "reset_password", database)
    await expect(
      consumeAuthToken(token, "reset_password", database)
    ).rejects.toThrow("INVALID_OR_EXPIRED_TOKEN")

    await inviteAccount(
      { email: "late@example.test", name: "Late", role: "employee" },
      database
    )
    const lateToken = lastLink()
    const nextYear = new Date(now().getTime() + 365 * 24 * 60 * 60 * 1000)
    await expect(
      consumeAuthToken(lateToken, "reset_password", database, nextYear)
    ).rejects.toThrow("INVALID_OR_EXPIRED_TOKEN")
  })

  it("only invites into an app role", async () => {
    quietLinks()
    for (const role of ["admin", "member", "venue_owner"]) {
      await expect(
        inviteAccount({ email: `${role}@example.test`, name: "X", role }, database)
      ).rejects.toThrow("NOT_AN_APP_ROLE")
    }
  })

  it("refuses an email that already has an account", async () => {
    await insertUser(database, { email: "taken@example.test" })
    await expect(
      inviteAccount(
        { email: "taken@example.test", name: "Again", role: "employee" },
        database
      )
    ).rejects.toThrow("ACCOUNT_EXISTS")
  })

  it("refuses a blank name and a broken email", async () => {
    await expect(
      inviteAccount({ email: "a@example.test", name: "  ", role: "employee" }, database)
    ).rejects.toThrow("INVALID_NAME")
    await expect(
      inviteAccount({ email: "not an email", name: "A", role: "employee" }, database)
    ).rejects.toThrow()
  })
})

describe("what an app role is allowed on the server", () => {
  it("refuses an app role every feature its app did not give it", () => {
    expect(() => requireRoleFeature({ role: "employee" }, "billing")).toThrow(
      "FORBIDDEN"
    )
    expect(() => requireRoleFeature({ role: "employee" }, "feedback")).toThrow(
      "FORBIDDEN"
    )
    expect(() =>
      requireRoleFeature({ role: "editor" }, "feedback")
    ).not.toThrow()
    expect(() => requireRoleFeature({ role: "member" }, "billing")).not.toThrow()
  })
})

describe("each role's left menu", () => {
  const saved: ShellSection[] = [{ id: "s", title: "Saved", entries: [] }]
  const globals = {
    memberSections: createDefaultMemberSections(),
    roleSections: {},
  }

  it("gives an app role its app's menu, never the members'", () => {
    const employeeMenu = testAppRoleOptions.roles![0].menu
    expect(sectionsForRole("employee", [], globals)).toEqual(employeeMenu)
    expect(sectionsForRole("member", [], globals)).toEqual(globals.memberSections)
    expect(sectionsForRole("admin", saved, globals)).toEqual(saved)
  })

  it("prefers the menu an admin saved for the role, an empty one included", () => {
    expect(
      sectionsForRole("employee", [], { ...globals, roleSections: { employee: saved } })
    ).toEqual(saved)
    expect(
      sectionsForRole("employee", [], { ...globals, roleSections: { employee: [] } })
    ).toEqual([])
  })

  it("gives a role the app stopped declaring no menu at all", () => {
    expect(
      sectionsForRole("venue_owner", [], {
        ...globals,
        roleSections: { venue_owner: saved },
      })
    ).toEqual([])
  })
})

describe("code that used to treat every non-admin as a member", () => {
  it("tags an employee's contact as an employee, and swaps the tag when the role changes", async () => {
    const workspace = await insertWorkspace(database)
    const employee = await insertUser(database, {
      role: "employee",
      currentWorkspaceId: workspace.id,
    })
    await syncContactsFromUsers(workspace.id, database)

    const tagsOf = async () =>
      (
        await database
          .select({ tags: customShellContacts.tags })
          .from(customShellContacts)
          .where(eq(customShellContacts.userId, employee.id))
      )[0]?.tags

    expect(await tagsOf()).toEqual(["employee"])

    await database
      .update(customShellUsers)
      .set({ role: "member" })
      .where(eq(customShellUsers.id, employee.id))
    await syncContactsFromUsers(workspace.id, database)
    expect(await tagsOf()).toEqual(["member"])
  })

  it("counts members by name on Membership, and keeps app roles off the free plan", async () => {
    await insertUser(database, { role: "admin" })
    await insertUser(database, { role: "member" })
    await insertUser(database, { role: "employee" })
    await insertUser(database, { role: "employee" })

    const summary = await loadMembershipSummary(database)
    expect(summary.admins).toBe(1)
    expect(summary.members).toBe(1)
    // The admin and the member; neither employee holds a plan.
    const free = summary.planMembership.find((plan) => !plan.isPaid)
    expect(free?.people).toBe(2)
  })
})
