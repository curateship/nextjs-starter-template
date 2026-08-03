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

function getAllowedOrigins() {
  const configured = process.env.CUSTOM_SHELL_APP_ORIGINS
  const origins = new Set(
    (configured || "http://127.0.0.1:3002,http://localhost:3002")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean)
  )

  if (process.env.CUSTOM_SHELL_API_ENV !== "production") {
    origins.add("http://127.0.0.1:3002")
    origins.add("http://localhost:3002")
  }

  return origins
}
