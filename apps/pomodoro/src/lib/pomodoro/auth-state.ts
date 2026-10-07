import * as React from "react"

/**
 * Whether the person in the product is signed in — one module-level fact
 * the layout sets and every engine reads. The engines cannot ask a React
 * context (they live outside the tree), and asking the server from each
 * one would 401 for guests, so the `_pomodoro` layout, which already knows,
 * tells everyone once.
 */

type ProductAuth = { known: boolean; authenticated: boolean }

let auth: ProductAuth = { known: false, authenticated: false }
// Which account, not only whether there is one. Signing in does not reload the
// page, so logging out and straight back in as somebody else used to look like
// no change at all, and every engine kept the first account's scene, sound and
// Pro answer until a reload.
let account: string | null = null
const listeners = new Set<() => void>()

/** The signed-in account's email, or null for a guest. */
export function setProductAccount(email: string | null) {
  if (auth.known && account === email) return
  account = email
  auth = { known: true, authenticated: email !== null }
  for (const listener of listeners) listener()
}

export function productAuth(): ProductAuth {
  return auth
}

export function subscribeProductAuth(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const serverSnapshot: ProductAuth = { known: false, authenticated: false }

export function useProductAuth() {
  return React.useSyncExternalStore(
    subscribeProductAuth,
    productAuth,
    () => serverSnapshot
  )
}
