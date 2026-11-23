import localAppPorts from "../../local-apps.json"

import appPackage from "./package.json"

/**
 * This app's dev port, read from the monorepo's `local-apps.json` — the one
 * place a port may ever be assigned.
 *
 * Looked up by the app's own name in `package.json`, not by a name written in
 * here. That matters because this file is part of the shell every other app is
 * copied from, and an app may never edit a shell file: renaming `package.json`
 * is something a new app does anyway, and doing it is enough to give that app
 * its own port everywhere the port is used.
 *
 * Both the dev server (`vite.config.ts`) and the check that a save came from
 * this app's own pages (`src/server/origin.ts`) read it from here, so they can
 * never disagree about which port this app is on.
 */
export const DEV_APP_PORT: number = (
  localAppPorts as Record<string, number | undefined>
)[appPackage.name] ?? 0

if (!DEV_APP_PORT) {
  throw new Error(
    `No port for "${appPackage.name}" in local-apps.json. Every app gets one unused port there, under its own key.`
  )
}
