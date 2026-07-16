import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const localApps = require("../../../../local-apps.json") as Record<string, number>

export const directoryLocalOrigin = `http://localhost:${localApps.directory}`
export const directoryInternalOrigin = `http://directory:${localApps.directory}`
