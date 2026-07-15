import pino from "pino"
import * as Sentry from "@sentry/tanstackstart-react"

export const logger = pino({
  level: process.env.POMODER_LOG_LEVEL || "info",
  redact: { paths: ["password", "token", "authorization", "cookie", "prompt", "email"], censor: "[redacted]" },
})

let sentryStarted = false
export function startServerMonitoring() {
  if (sentryStarted || !process.env.SENTRY_DSN) return
  Sentry.init({ dsn: process.env.SENTRY_DSN, sendDefaultPii: false, environment: process.env.NODE_ENV || "development", tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0 })
  sentryStarted = true
}
