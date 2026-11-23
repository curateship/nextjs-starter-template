import * as React from "react"

import { errorOf } from "@/lib/api-error"

export type Session =
  | { state: "checking" }
  | { state: "signed-out"; passwordSet: boolean }
  | { state: "signed-in" }
  | { state: "failed"; error: string }

async function fetchSession(): Promise<Session> {
  try {
    const response = await fetch("/api/session", { cache: "no-store" })
    if (!response.ok) throw new Error(await errorOf(response, `The sign-in check answered ${response.status}.`))
    const body = (await response.json()) as { signedIn: boolean; passwordSet: boolean }
    return body.signedIn ? { state: "signed-in" } : { state: "signed-out", passwordSet: body.passwordSet }
  } catch (error) {
    return {
      state: "failed",
      error: error instanceof Error ? error.message : "The sign-in check failed.",
    }
  }
}

/**
 * Whether this browser is signed in to Personal, checked once with
 * `/api/session`. `expired` is for a request that came back 401 later, when
 * the 30 days ran out.
 */
export function useSession() {
  const [session, setSession] = React.useState<Session>({ state: "checking" })

  React.useEffect(() => {
    let live = true
    void fetchSession().then((result) => {
      if (live) setSession(result)
    })
    return () => {
      live = false
    }
  }, [])

  const check = React.useCallback(() => {
    setSession({ state: "checking" })
    void fetchSession().then(setSession)
  }, [])

  /** Signs in, or says why not. */
  const signIn = React.useCallback(async (password: string): Promise<string | null> => {
    try {
      const response = await fetch("/api/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      if (!response.ok) return await errorOf(response, `Sign-in answered ${response.status}.`)
      setSession({ state: "signed-in" })
      return null
    } catch {
      return "Personal's server did not answer. Check it is running, then try again."
    }
  }, [])

  const signOut = React.useCallback(async () => {
    try {
      const response = await fetch("/api/sign-out", { method: "POST" })
      if (!response.ok) throw new Error(await errorOf(response, `Sign-out answered ${response.status}.`))
      setSession({ state: "signed-out", passwordSet: true })
    } catch (error) {
      setSession({
        state: "failed",
        error: `Signing out did not finish. ${error instanceof Error ? error.message : ""}`.trim(),
      })
    }
  }, [])

  const expired = React.useCallback(() => setSession({ state: "signed-out", passwordSet: true }), [])

  return { session, check, signIn, signOut, expired }
}
