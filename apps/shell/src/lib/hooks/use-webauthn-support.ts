import { useSyncExternalStore } from "react"

import { browserSupportsWebAuthn } from "@simplewebauthn/browser"

const subscribeNever = () => () => {}

/**
 * Whether this browser can do passkeys at all. False during the server render
 * — there is no browser to ask — and answered for real on the client, which is
 * the machine whose fingerprint reader actually matters. The answer never
 * changes within a page's life, so there is nothing to subscribe to.
 */
export function useBrowserSupportsWebAuthn() {
  return useSyncExternalStore(
    subscribeNever,
    browserSupportsWebAuthn,
    () => false
  )
}
