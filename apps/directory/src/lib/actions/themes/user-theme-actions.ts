import { createServerFn } from "@tanstack/react-start"
import { getTemplateSitesActionImpl, applyThemeToSiteActionImpl, deleteTemplateActionImpl } from "./user-theme-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./user-theme-actions.server"

export const getTemplateSitesAction = createServerFn({ method: "POST" })
  
  .handler(async () => getTemplateSitesActionImpl())

export const applyThemeToSiteAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; templateId: string }) => data)
  .handler(async ({ data }) => applyThemeToSiteActionImpl(data.siteId, data.templateId))

export const deleteTemplateAction = createServerFn({ method: "POST" })
  .inputValidator((data: { templateId: string }) => data)
  .handler(async ({ data }) => deleteTemplateActionImpl(data.templateId))
