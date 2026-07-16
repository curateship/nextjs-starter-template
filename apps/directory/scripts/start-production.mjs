import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const localApps = require("../../../local-apps.json")

process.env.PORT ||= String(localApps.directory)

await import("../.output/server/index.mjs")
