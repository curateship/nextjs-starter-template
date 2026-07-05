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
  const configured = process.env.AI_AGENTS_APP_ORIGINS
  const origins = new Set(
    (configured || "http://127.0.0.1:3008,http://localhost:3008")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean)
  )

  if (process.env.AI_AGENTS_API_ENV !== "production") {
    origins.add("http://127.0.0.1:3008")
    origins.add("http://localhost:3008")
  }

  return origins
}
