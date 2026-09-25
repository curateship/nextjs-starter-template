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
const listeners = new Set<() => void>()

export function setProductAuthenticated(authenticated: boolean) {
  if (auth.known && auth.authenticated === authenticated) return
  auth = { known: true, authenticated }
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
