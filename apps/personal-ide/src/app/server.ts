import type { WorkspaceInfo } from "@/app/types"

const workspacePackageNames: Record<string, string> = {
  hub: "@repo/hub",
}

// The lowest port an invented one may take, for a brand new app that is not in
// `local-apps.json` yet. Every existing app sits at or above this.
const FIRST_APP_PORT = 3000

/**
 * Each workspace's dev port, as read from that worktree's own
 * `local-apps.json` — the one place a port may ever be assigned.
 *
 * A workspace whose app has no port there is simply left out. It used to be
 * handed the next free number instead, which is how an app could show a port it
 * had never been given: this list was bundled in when the app was compiled, so
 * every app added afterwards was unrecognised, and the invented number even
 * moved when the workspaces were reordered.
 */
export function serverPortsForWorkspaces(workspaces: WorkspaceInfo[]) {
  const ports: Record<string, number> = {}

  for (const workspace of workspaces) {
    if (workspace.isTauri || typeof workspace.port !== "number") continue
    ports[workspace.id] = workspace.port
  }

  return ports
}

/**
 * A port for an app that does not exist yet. Only a guess: the app is written
 * into `local-apps.json` as it is created, and that step takes the next free
 * port itself if this one is already taken.
 */
export function nextServerPortForNewApp(workspaces: WorkspaceInfo[], appName: string) {
  const known = workspaces.find(
    (workspace) => workspace.appName === appName && typeof workspace.port === "number"
  )
  if (known?.port) return known.port

  const usedPorts = new Set(Object.values(serverPortsForWorkspaces(workspaces)))
  let port = Math.max(FIRST_APP_PORT - 1, ...usedPorts) + 1

  while (usedPorts.has(port)) port += 1
  return port
}

export function serverPortForWorkspaceInList(workspace: WorkspaceInfo, workspaces: WorkspaceInfo[]) {
  const ports = serverPortsForWorkspaces(workspaces)
  const port = ports[workspace.id]
  if (typeof port === "number") return port

  throw new Error(
    `"${workspace.appName}" has no port in local-apps.json. Every app gets one unused port there, under its own key.`
  )
}

export function serverStartCommand(workspace: WorkspaceInfo, port: number) {
  const origins = `http://127.0.0.1:${port},http://localhost:${port}`
  const originEnv = `CORE_APP_ORIGINS="${origins}" CUSTOM_SHELL_APP_ORIGINS="${origins}"`

  // No `--` before the script args: npm strips it, pnpm forwards it literally,
  // so `pnpm run dev -- --port N` reaches Vite as ["--", "--port", "N"] and the
  // port is silently ignored.
  if (workspace.isStandalone) {
    return `test -d node_modules || pnpm install\n${originEnv} pnpm run dev --port ${port}\n`
  }

  const workspaceName = workspacePackageNames[workspace.appName] ?? workspace.appName
  return `test -d ../../node_modules || (cd ../.. && pnpm install)\ncd ../.. && ${originEnv} pnpm --filter "${workspaceName}" dev --port ${port}\n`
}
