import { findCurrentUser } from "@/server/auth/security"
import { readPageVisibility } from "@/server/content/pages"

/**
 * Whether this visitor may open the Courses page on this site, from its own
 * switch on the Pages screen: off answers no for everyone, kept for members
 * answers no to somebody signed out.
 *
 * The course pages ask it before reading anything, and so does the Courses row
 * on the site's front page. One answer for both, so a site that switched
 * Courses off never shows a row of cards that all lead to "not found".
 */
export async function coursesPageOpen(workspaceId: string): Promise<boolean> {
  const visibility = await readPageVisibility(workspaceId, "/courses")
  if (visibility === "off") return false
  if (visibility === "members") {
    return Boolean(await findCurrentUser().catch(() => null))
  }
  return true
}
