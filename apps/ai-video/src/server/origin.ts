import { getRequestHeader } from "@tanstack/react-start/server"

export function requireAppOrigin() {
  const origin = getRequestHeader("origin")
  if (!origin) {
    throw new Error("Invalid origin")
  }

  const normalized = origin.replace(/\/$/, "")
  if (!getAllowedOrigins().has(normalized) && !isAllowedDevOrigin(normalized)) {
    throw new Error("Invalid origin")
  }
}

function isAllowedDevOrigin(origin: string) {
  if (process.env.AI_VIDEO_API_ENV === "production") return false

  try {
    const url = new URL(origin)
    return (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  } catch {
    return false
  }
}

function getAllowedOrigins() {
  const configured = process.env.AI_VIDEO_APP_ORIGINS
  const origins = new Set(
    (configured || "http://127.0.0.1:3004,http://localhost:3004")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean)
  )

  if (process.env.AI_VIDEO_API_ENV !== "production") {
    origins.add("http://127.0.0.1:3004")
    origins.add("http://localhost:3004")
  }

  return origins
}
