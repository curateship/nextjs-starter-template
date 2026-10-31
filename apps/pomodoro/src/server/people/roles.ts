import type { Role, RoleFeature } from "@/lib/role-id"
import { isKnownRole, roleMay } from "@/lib/roles"

/**
 * The one gate every saved role passes through.
 *
 * The database only checks a role's shape, because a CHECK cannot read the
 * app's options. So the list lives here: `admin`, `member`, or a role this app
 * declared. Anything else is refused with `UNKNOWN_ROLE` before it is written.
 */
export function requireKnownRole(role: Role): Role {
  if (!isKnownRole(role)) {
    throw new Error("UNKNOWN_ROLE")
  }
  return role
}

/**
 * Refuses an account whose role does not get this part of the shell. Admins
 * and members always pass. Thrown as `FORBIDDEN`, the same word every other
 * refused door uses, so each screen's message already covers it.
 */
export function requireRoleFeature(
  user: { role: Role },
  feature: RoleFeature
) {
  if (!roleMay(user.role, feature)) {
    throw new Error("FORBIDDEN")
  }
}
