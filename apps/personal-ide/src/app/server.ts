import type { WorkspaceInfo } from "@/app/types"
import localAppPorts from "../../../../local-apps.json"

const workspacePackageNames = {
  hub: "@repo/hub",
} as const satisfies Partial<Record<keyof typeof localAppPorts, string>>

export function serverPortsForWorkspaces(workspaces: WorkspaceInfo[]) {
  const ports: Record<string, number> = {}
  const usedPorts = new Set<number>()
  let nextGeneratedPort = Math.max(...Object.values(localAppPorts)) + 1

  for (const workspace of workspaces) {
    if (workspace.isTauri) continue

    const appPort = localAppPorts[workspace.appName as keyof typeof localAppPorts]
    if (typeof appPort === "number") {
      ports[workspace.id] = appPort
      usedPorts.add(appPort)
      continue
    }

    while (usedPorts.has(nextGeneratedPort)) nextGeneratedPort += 1
    ports[workspace.id] = nextGeneratedPort
    usedPorts.add(nextGeneratedPort)
    nextGeneratedPort += 1
  }

  return ports
}

export function nextServerPortForNewApp(workspaces: WorkspaceInfo[], appName: string) {
  const configuredPort = localAppPorts[appName as keyof typeof localAppPorts]
  if (typeof configuredPort === "number") return configuredPort

  const usedPorts = new Set(Object.values(serverPortsForWorkspaces(workspaces)))
  let port = Math.max(...Object.values(localAppPorts)) + 1

  while (usedPorts.has(port)) port += 1
  return port
}

export function serverPortForWorkspaceInList(workspace: WorkspaceInfo, workspaces: WorkspaceInfo[]) {
  const ports = serverPortsForWorkspaces(workspaces)
  const port = ports[workspace.id]
  if (typeof port === "number") return port

  throw new Error("Workspace is not in the current workspace list.")
}

export function serverStartCommand(workspace: WorkspaceInfo, port: number) {
  const origins = `http://127.0.0.1:${port},http://localhost:${port}`
  const originEnv = `CORE_APP_ORIGINS="${origins}" CUSTOM_SHELL_APP_ORIGINS="${origins}"`

  if (workspace.isStandalone) {
    return `test -d node_modules || npm install\n${originEnv} npm run dev -- --port ${port}\n`
  }

  const workspaceName =
    workspacePackageNames[workspace.appName as keyof typeof workspacePackageNames] ??
    workspace.appName
  return `test -d ../../node_modules || (cd ../.. && npm install)\ncd ../.. && ${originEnv} npm run dev --workspace="${workspaceName}" -- --port ${port}\n`
}
