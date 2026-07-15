import { pomoderPort } from "./app-port.mjs"

try {
  const response = await fetch(`http://127.0.0.1:${pomoderPort}/api/health/live`)
  if (!response.ok) process.exitCode = 1
} catch {
  process.exitCode = 1
}
