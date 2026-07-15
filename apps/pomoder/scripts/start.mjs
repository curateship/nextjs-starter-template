import { pomoderPort } from "./app-port.mjs"

process.env.PORT = String(pomoderPort)
await import("../.output/server/index.mjs")
