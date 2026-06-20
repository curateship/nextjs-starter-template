import type { WorkspaceInfo } from "@/app/types"
import localAppPorts from "../../../../local-apps.json"

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

export function serverStartCommand(port: number) {
  const origins = `http://127.0.0.1:${port},http://localhost:${port}`
  return `app_name=$(node -p "require('./package.json').name")\ntest -d ../../node_modules || (cd ../.. && npm install)\ncd ../.. && CORE_APP_ORIGINS="${origins}" npm run dev --workspace="$app_name" -- --port ${port}\n`
}
