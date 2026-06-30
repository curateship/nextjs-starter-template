import type { WorkspaceInfo } from "@/app/types"
import localAppPorts from "../../../../local-apps.json"

const workspacePackageNames = {
  hub: "@repo/hub",
} as const satisfies Partial<Record<keyof typeof localAppPorts, string>>

export function serverPortForWorkspace(workspace: WorkspaceInfo) {
  const appPort = localAppPorts[workspace.appName as keyof typeof localAppPorts]
  if (typeof appPort === "number") return appPort

  const fallbackBasePort = Math.max(...Object.values(localAppPorts))
  const workspaceNumber = Number(workspace.name.match(/#(\d+)/)?.[1])
  if (Number.isFinite(workspaceNumber) && workspaceNumber > 0) {
    return fallbackBasePort + workspaceNumber
  }

  const fallbackNumber = Number(workspace.id.match(/(\d+)$/)?.[1])
  return Number.isFinite(fallbackNumber) && fallbackNumber > 0
    ? fallbackBasePort + fallbackNumber
    : fallbackBasePort + 1
}

export function serverStartCommand(appName: string, port: number) {
  const origins = `http://127.0.0.1:${port},http://localhost:${port}`
  const workspaceName = workspacePackageNames[appName as keyof typeof workspacePackageNames] ?? appName
  return `test -d ../../node_modules || (cd ../.. && npm install)\ncd ../.. && CORE_APP_ORIGINS="${origins}" npm run dev --workspace="${workspaceName}" -- --port ${port}\n`
}
