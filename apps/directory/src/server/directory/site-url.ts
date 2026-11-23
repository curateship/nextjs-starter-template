import { appUrl } from "@/server/app-url"
import { workspaceBaseDomain } from "@/server/workspaces/host"

/** The public origin for one site, including the assigned local app port. */
export function directorySiteUrl(site: {
  subdomain: string
  customDomain: string | null
}) {
  if (site.customDomain) return `https://${site.customDomain}`

  const base = workspaceBaseDomain()
  if (!base) return appUrl()

  const deployment = new URL(appUrl())
  const port =
    deployment.hostname === "localhost" && typeof __DEV_APP_PORT__ === "number"
      ? String(__DEV_APP_PORT__)
      : deployment.port

  return `${deployment.protocol}//${site.subdomain}.${base}${port ? `:${port}` : ""}`
}
