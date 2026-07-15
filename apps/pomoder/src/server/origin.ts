import { getRequestHeader } from "@tanstack/react-start/server"

import { localPomoderOrigins } from "@/lib/app-port"

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
  const configured = process.env.POMODER_ALLOWED_ORIGINS
  const origins = new Set(
    (configured || "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean)
  )

  if (process.env.NODE_ENV !== "production") {
    for (const origin of localPomoderOrigins) origins.add(origin)
  }

  return origins
}
