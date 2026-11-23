import driverSource from "../../../rack/iphone.py?raw"
import installScript from "../../../rack/install.sh?raw"
import launcherSource from "../../../rack/launcher.py?raw"
import programSource from "../../../rack/promo_rack.py?raw"

import { appUrl, getAppLinkStatus } from "@/server/app-url"

import { sha256Hex } from "./signing"

/**
 * The rack program Promo hands out, read from `rack/` at build time, so the
 * version a deploy serves is exactly the file in the repo. Its version is the
 * `VERSION` line in the file itself, so there is no second number to forget
 * to change: edit the program, raise that line, deploy, and every rack moves
 * to it on its next check-in.
 */

function versionOf(source: string): string {
  const found = /^VERSION = "([^"]+)"/m.exec(source)
  if (!found) throw new Error("rack/promo_rack.py has no VERSION line.")
  return found[1]
}

export const RACK_VERSION = versionOf(programSource)

/**
 * The program and, beside it, the iPhone driver (`rack/iphone.py`), which the
 * program imports from its own folder. The driver carries no version line of
 * its own: it travels with every release and is checked by its checksum.
 */
export type RackRelease = { version: string; source: string; sha256: string; driver: string; driverSha256: string }

export function rackRelease(): RackRelease {
  return {
    version: RACK_VERSION,
    source: programSource,
    sha256: sha256Hex(programSource),
    driver: driverSource,
    driverSha256: sha256Hex(driverSource),
  }
}

export function rackDriverSource(): string {
  return driverSource
}

export function rackLauncherSource(): string {
  return launcherSource
}

export function rackProgramSource(): string {
  return programSource
}

/**
 * The address a rack is told to call. The app's own setting when one is set,
 * and always on a live server. Without one on this computer, the shell's
 * `appUrl` falls back to Custom Shell's port, so a rack paired from a local
 * Promo would call the wrong app; this app's own dev port is used instead.
 */
export function rackServerAddress(): string {
  const status = getAppLinkStatus()
  if (status.configured || status.production || typeof __DEV_APP_PORT__ !== "number") return appUrl()
  return `http://localhost:${__DEV_APP_PORT__}`
}

/**
 * The install script with this Promo's address written in. The address comes
 * from the app's own setting, never from the request, so a forged Host header
 * cannot point a new rack at another server.
 */
export function rackInstallScript(appAddress: string): string {
  if (!/^https?:\/\/[^\s"'`$\\]+$/.test(appAddress)) {
    throw new Error("The app's address is not a plain web address.")
  }
  return installScript.replace("__PROMO_URL__", appAddress.replace(/\/$/, ""))
}
