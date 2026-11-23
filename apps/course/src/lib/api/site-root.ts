import { createServerFn } from "@tanstack/react-start"

import { findCurrentUser } from "@/server/auth/security"
import { answerForRequest, workspaceBaseDomain } from "@/server/workspaces/host"

/**
 * Which of the two `/` the visited address is: one of the sites, whose front
 * page the shell draws from that site's own rows, or the deployment's own
 * address, which is the admin's front door and forwards.
 */
export type SiteRootAnswer =
  | { host: "site" }
  | { host: "platform"; signedIn: boolean }

const readSiteRootFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<SiteRootAnswer> => {
    // With no base domain there is one website and every address is it. The
    // shell calls every host "platform" then, so asking it would forward the
    // only website's visitors to a sign-in form.
    if (!workspaceBaseDomain()) return { host: "site" }

    // Every other host answers "site", an address nobody has taken included,
    // so it keeps behaving exactly as it did.
    const answer = await answerForRequest()
    if (answer.kind !== "platform") return { host: "site" }
    return {
      host: "platform",
      signedIn: Boolean(await findCurrentUser().catch(() => null)),
    }
  }
)

export function loadSiteRoot() {
  return readSiteRootFn()
}
