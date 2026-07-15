import localAppPorts from "../../../../local-apps.json"

export const pomoderPort = localAppPorts.pomoder
export const localPomoderUrl = `http://localhost:${pomoderPort}`
export const localPomoderOrigins = [localPomoderUrl, `http://127.0.0.1:${pomoderPort}`] as const
