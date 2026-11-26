import { createServerFn } from "@tanstack/react-start"

import { getCrmOverviewFigures, type CrmOverviewFigures } from "@/server/crm/overview"
import { adminGet } from "@/server/guards"
import { currentWorkspaceId } from "@/server/people/workspaces"

export type { CrmOverviewFigures }

/** The numbers behind the CRM Overview's Inbox widgets (CRM task 38, part 2). */
const loadCrmOverviewFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<CrmOverviewFigures> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    return getCrmOverviewFigures(workspaceId)
  })

export function loadCrmOverview() {
  return loadCrmOverviewFn()
}
