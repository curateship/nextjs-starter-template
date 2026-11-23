import { describe, expect, it } from "vitest"

import {
  appHeaderLeftContentForRole,
  appHeaderRightActionsForRole,
  appQuickSettingsForRole,
  appRoles,
  mayHaveWorkspace,
  type AppOptions,
  type AppRole,
} from "@/lib/app-options"
import { ROLE_FEATURES } from "@/lib/role-id"
import {
  allRoles,
  isKnownRole,
  roleLabel,
  roleMay,
  rolesWith,
} from "@/lib/roles"
import { testAppRoleOptions as options } from "@/lib/test-app-roles"

const role = (overrides: Partial<AppRole>): AppOptions => ({
  roles: [{ id: "employee", label: "Employee", landing: "/dashboard", menu: [], ...overrides }],
})

describe("an app declares its roles", () => {
  it("has no roles of its own when it says nothing, so every account is an admin or a member", () => {
    expect(appRoles({})).toEqual([])
    expect(allRoles({}).map((one) => one.id)).toEqual(["admin", "member"])
    expect(isKnownRole("employee", {})).toBe(false)
  })

  it("lists the app's roles after the shell's two", () => {
    expect(allRoles(options)).toEqual([
      { id: "admin", label: "Admin" },
      { id: "member", label: "Member" },
      { id: "employee", label: "Employee" },
      { id: "editor", label: "Editor" },
    ])
    expect(isKnownRole("employee", options)).toBe(true)
    expect(isKnownRole("venue_owner", options)).toBe(false)
  })

  it("refuses a role that reuses the shell's admin or member", () => {
    expect(() => appRoles(role({ id: "admin" }))).toThrow("declared twice")
    expect(() => appRoles(role({ id: "member" }))).toThrow("declared twice")
  })

  it("refuses two roles with one id", () => {
    const twice: AppOptions = {
      roles: [...(role({}).roles ?? []), ...(role({}).roles ?? [])],
    }
    expect(() => appRoles(twice)).toThrow("declared twice")
  })

  it("refuses an id the database could not store", () => {
    expect(() => appRoles(role({ id: "Employee" }))).toThrow("not a role id")
    expect(() => appRoles(role({ id: "venue-owner" }))).toThrow("not a role id")
    expect(() => appRoles(role({ id: "a".repeat(51) }))).toThrow("not a role id")
    // CMS's role, as Tyler named it, fits.
    expect(appRoles(role({ id: "venue_owner" }))).toHaveLength(1)
  })

  it("refuses a landing page only admins may open", () => {
    expect(() => appRoles(role({ landing: "/admin" }))).toThrow("only admins")
    expect(() => appRoles(role({ landing: "/admin/users" }))).toThrow(
      "only admins"
    )
    expect(appRoles(role({ landing: "/administer" }))).toHaveLength(1)
  })
})

describe("what each role may see", () => {
  it("gives admins and members every part of the shell, as before", () => {
    for (const feature of ROLE_FEATURES) {
      expect(roleMay("admin", feature, options)).toBe(true)
      expect(roleMay("member", feature, options)).toBe(true)
    }
  })

  it("gives an app role none of it unless the app lists it", () => {
    for (const feature of ROLE_FEATURES) {
      expect(roleMay("employee", feature, options)).toBe(false)
    }
    expect(roleMay("editor", "feedback", options)).toBe(true)
    expect(roleMay("editor", "changelog", options)).toBe(true)
    expect(roleMay("editor", "billing", options)).toBe(false)
  })

  it("gives a role the app stopped declaring nothing at all", () => {
    for (const feature of ROLE_FEATURES) {
      expect(roleMay("venue_owner", feature, options)).toBe(false)
    }
  })

  it("names each role, and shows a stray role by its stored id", () => {
    expect(roleLabel("admin", options)).toBe("Admin")
    expect(roleLabel("member", options)).toBe("Member")
    expect(roleLabel("employee", options)).toBe("Employee")
    expect(roleLabel("venue_owner", options)).toBe("venue_owner")
  })

  it("keeps a stray role in the picker while an account still holds it", () => {
    expect(rolesWith("employee", options)).toEqual(allRoles(options))
    expect(rolesWith("venue_owner", options).at(-1)).toEqual({
      id: "venue_owner",
      label: "venue_owner",
    })
  })
})

describe("workspaces and the switcher", () => {
  const everyone: AppOptions = {
    ...options,
    workspaces: { whoMayHave: "everyone" },
  }

  it("gives an app role no workspace even when everyone may have one", () => {
    expect(mayHaveWorkspace({ role: "member" }, everyone)).toBe(true)
    expect(mayHaveWorkspace({ role: "employee" }, everyone)).toBe(false)
  })

  it("gives an app role a workspace when its app says so", () => {
    const withSwitcher: AppOptions = {
      ...everyone,
      roles: [{ ...role({}).roles![0], features: ["workspaces"] }],
    }
    expect(mayHaveWorkspace({ role: "employee" }, withSwitcher)).toBe(true)
  })

  it("keeps an app role out when only admins have workspaces", () => {
    const admins: AppOptions = { ...options, workspaces: { whoMayHave: "admins" } }
    expect(mayHaveWorkspace({ role: "employee" }, admins)).toBe(false)
  })
})

describe("the app's header items", () => {
  const icon = () => null
  const load = async () => ({ default: () => null })
  const header: AppOptions = {
    ...options,
    header: {
      leftContent: { component: load },
      rightActions: [
        { id: "everyone", label: "Everyone", icon, component: load },
        { id: "staff", label: "Staff", icon, roles: ["employee"], component: load },
      ],
      quickSettings: [{ id: "row", component: load }],
    },
  }

  it("leaves an unnamed item to admins and members, never an app role", () => {
    expect(
      appHeaderRightActionsForRole("member", header).map((one) => one.id)
    ).toEqual(["everyone"])
    expect(appHeaderLeftContentForRole("employee", header)).toBeNull()
    expect(appQuickSettingsForRole("employee", header)).toEqual([])
  })

  it("shows an app role the items the app names it on", () => {
    expect(
      appHeaderRightActionsForRole("employee", header).map((one) => one.id)
    ).toEqual(["staff"])
  })
})
