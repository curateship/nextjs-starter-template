import { getRequestHeader } from "@tanstack/react-start/server"

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
  const configured = process.env.CORE_APP_ORIGINS
  const origins = new Set(
    (configured || "http://127.0.0.1:3003,http://localhost:3003")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean)
  )

  if (process.env.CORE_API_ENV !== "production") {
    origins.add("http://127.0.0.1:3003")
    origins.add("http://localhost:3003")
  }

  return origins
}
