import localAppPorts from "../../../../local-apps.json"

// local-apps.json is the only place an app's port is assigned; never restate it.
const LOCAL_APP_URL = `http://localhost:${localAppPorts["custom-shell"]}`

/** Absolute base URL used for links in emails and Stripe redirects. */
export function appUrl() {
  return (process.env.CUSTOM_SHELL_APP_URL || LOCAL_APP_URL).replace(/\/$/, "")
}

export function appUrlFor(path: string) {
  return `${appUrl()}${path.startsWith("/") ? path : `/${path}`}`
}
