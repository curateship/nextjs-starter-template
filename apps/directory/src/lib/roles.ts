import { appRoles, type AppOptions, type AppRole } from "@/lib/app-options"
import { isShellRole, type Role, type RoleFeature } from "@/lib/role-id"

/**
 * The kinds of account, and what each one may see.
 *
 * Every account is an `admin` or a `member`, which are the shell's own, or a
 * role the app declared in `roles` in its `src/app/options.ts`. Free and Pro
 * are plans a member pays for, not roles.
 *
 * Read inside a component, a loader or a handler, never at the top of a
 * module: an app's options file imports app components, which import shell
 * components, which import this one. The ids and the feature list, which
 * need no app answers, are in `role-id.ts`, outside that circle.
 */

/** The app's declaration of this role, or null for a shell role or a stray. */
export function appRoleFor(
  role: Role,
  options?: AppOptions
): AppRole | null {
  return appRoles(options).find((one) => one.id === role) ?? null
}

/** A role this app knows: one of the shell's two, or one it declared. */
export function isKnownRole(role: Role, options?: AppOptions): boolean {
  return isShellRole(role) || appRoleFor(role, options) !== null
}

/**
 * Whether this role gets that part of the shell.
 *
 * Admins and members get everything, as they always did. A role the app no
 * longer declares gets nothing, so an account left behind by a removed role
 * falls closed rather than open.
 */
export function roleMay(
  role: Role,
  feature: RoleFeature,
  options?: AppOptions
): boolean {
  if (isShellRole(role)) return true
  return appRoleFor(role, options)?.features?.includes(feature) ?? false
}

/** What a role is called on screen. A stray role shows its stored id. */
export function roleLabel(role: Role, options?: AppOptions): string {
  if (role === "admin") return "Admin"
  if (role === "member") return "Member"
  return appRoleFor(role, options)?.label ?? role
}

/** Every role this app has, the shell's two first, for pickers and filters. */
export function allRoles(
  options?: AppOptions
): readonly { id: Role; label: string }[] {
  return [
    { id: "admin", label: "Admin" },
    { id: "member", label: "Member" },
    ...appRoles(options).map((role) => ({ id: role.id, label: role.label })),
  ]
}

/**
 * Every role, plus this one when the app no longer declares it, so a picker
 * showing an account's role always has that role to show.
 */
export function rolesWith(
  current: Role,
  options?: AppOptions
): readonly { id: Role; label: string }[] {
  const roles = allRoles(options)
  return roles.some((one) => one.id === current)
    ? roles
    : [...roles, { id: current, label: current }]
}
