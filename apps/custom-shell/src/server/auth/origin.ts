import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server"

/** The caller's address for rate-limit keys; "unknown" when the proxy hid it. */
export function requestIp() {
  return getRequestIP({ xForwardedFor: true }) || "unknown"
}

export function requireAppOrigin() {
  const origin = getRequestHeader("origin")
  if (!origin) {
    throw new Error("Invalid origin")
  }

  if (!getAllowedOrigins().has(origin.replace(/\/$/, ""))) {
    throw new Error("Invalid origin")
  }
}

/**
 * This app's dev port, put here at build time from `local-apps.json` — see
 * `app-port.ts`. It used to be the number 3002 typed out three times below,
 * which is the one thing the monorepo rule about ports forbids: every app is a
 * copy of this folder and may not edit a shell file, so a new app on its own
 * port inherited 3002, could not legally change it, and had every save in
 * local dev refused until somebody set `CUSTOM_SHELL_APP_ORIGINS` by hand.
 *
 * `typeof` rather than a bare read, so a build that never substitutes it gets
 * no local addresses instead of a crash. It is declared in `src/globals.d.ts`.
 */
const devPort = typeof __DEV_APP_PORT__ === "number" ? __DEV_APP_PORT__ : null

/** The addresses this app answers to on a developer's own machine. */
function localOrigins() {
  return devPort
    ? [`http://127.0.0.1:${devPort}`, `http://localhost:${devPort}`]
    : []
}

function getAllowedOrigins() {
  const configured = process.env.CUSTOM_SHELL_APP_ORIGINS
  const origins = new Set(
    (configured ? configured.split(",") : localOrigins())
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean)
  )

  if (process.env.CUSTOM_SHELL_API_ENV !== "production") {
    for (const origin of localOrigins()) {
      origins.add(origin)
    }
  }

  return origins
}
