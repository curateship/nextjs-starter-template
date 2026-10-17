/**
 * The parts of a role that need nothing from the app: the shell's own two,
 * the stored shape, and the list of features a role can be given.
 *
 * Kept in a file that imports nothing, so `custom-shell.tsx` can use it
 * without joining the circle through the app's options. What an app declared
 * is read in `roles.ts`.
 */

/** The shell's own two roles. They mean exactly what they always meant. */
export const SHELL_ROLES = ["admin", "member"] as const

/**
 * A role an account holds: one of the shell's two, or one the app declared.
 *
 * Text rather than a closed list, because the list is the app's. The server
 * checks every role it saves against that list in `requireKnownRole`
 * (`src/server/people/roles.ts`), and the database holds only the shape.
 */
export type Role = string

/** The shape of every stored role. The database CHECK holds the same rule. */
export const ROLE_ID_PATTERN = /^[a-z][a-z0-9_]{0,49}$/

/**
 * The parts of the shell an app role can be given. Admins and members have
 * all of them; an app role has only the ones its app lists.
 *
 * - `billing`: plans, Upgrade, pricing, and the Account window's Billing tab.
 * - `aiUsage`: the person's own AI usage.
 * - `feedback`: the header's Feedback button and the feedback board.
 * - `changelog`: the changelog and What's new.
 * - `workspaces`: having workspaces and the switcher, when the app has them.
 * - `security`: everything on Account → Security. Without it the tab holds
 *   only the password and signing out other devices; passkeys and Delete my
 *   account are left out, because the site admin removes app-role people.
 * - `emailChange`: changing the sign-in email from Account → Profile.
 */
export const ROLE_FEATURES = [
  "billing",
  "aiUsage",
  "feedback",
  "changelog",
  "workspaces",
  "security",
  "emailChange",
] as const

export type RoleFeature = (typeof ROLE_FEATURES)[number]

export function isShellRole(role: Role): boolean {
  return (SHELL_ROLES as readonly string[]).includes(role)
}
