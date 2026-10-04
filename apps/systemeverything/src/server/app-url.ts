import localAppPorts from "../../../../local-apps.json"

// local-apps.json is the only place an app's port is assigned; never restate it.
const LOCAL_APP_URL = `http://localhost:${localAppPorts["custom-shell"]}`

type AppUrlEnvironment = Partial<
  Pick<
    NodeJS.ProcessEnv,
    "CUSTOM_SHELL_APP_URL" | "CUSTOM_SHELL_API_ENV" | "NODE_ENV"
  >
>

export type AppLinkStatus = {
  address: string
  configured: boolean
  production: boolean
  usableForLinks: boolean
}

/**
 * The address and whether it is safe to put in an email on a live server.
 *
 * This read never throws because Settings → Email needs to show the bad value
 * that explains a deployment problem. `appUrl` below is the enforcement point.
 */
export function getAppLinkStatus(
  environment: AppUrlEnvironment = process.env
): AppLinkStatus {
  const configuredAddress = environment.CUSTOM_SHELL_APP_URL?.trim() ?? ""
  const address = (configuredAddress || LOCAL_APP_URL).replace(/\/$/, "")
  const production =
    environment.CUSTOM_SHELL_API_ENV === "production" ||
    environment.NODE_ENV === "production"

  return {
    address,
    configured: Boolean(configuredAddress),
    production,
    usableForLinks: isUsableAppAddress(address),
  }
}

/** Absolute base URL used for links in emails and Stripe redirects. */
export function appUrl(environment: AppUrlEnvironment = process.env) {
  const status = getAppLinkStatus(environment)
  if (status.production && !status.usableForLinks) {
    throw new Error(
      status.configured
        ? "CUSTOM_SHELL_APP_URL must be a public HTTP or HTTPS address in production. Localhost links cannot be sent to customers."
        : "CUSTOM_SHELL_APP_URL is required in production. Set it to this app's public address; localhost links cannot be sent to customers."
    )
  }
  return status.address
}

export function appUrlFor(path: string) {
  return `${appUrl()}${path.startsWith("/") ? path : `/${path}`}`
}

function isUsableAppAddress(address: string) {
  try {
    const url = new URL(address)
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "")
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/" &&
      hostname !== "localhost" &&
      !hostname.endsWith(".localhost") &&
      !hostname.startsWith("127.") &&
      hostname !== "0.0.0.0" &&
      hostname !== "::1" &&
      hostname !== "[::1]"
    )
  } catch {
    return false
  }
}
