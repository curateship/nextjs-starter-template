import * as React from "react"

import type { AccountMenuUser } from "@/components/pomodoro/account-menu"
import { loadCurrentUser } from "@/lib/api/auth/auth"

/**
 * Who is signed in, asked from the browser, for a page with no product loader
 * to hand it over: the sign-in pages and the pages an admin wrote. Signed out
 * is what most of them expect, and a failed look-up draws exactly that.
 *
 * Undefined until the answer arrives, so the guests' dark mode can wait for
 * it rather than treat a signed-in member as a guest for a moment. The header
 * draws undefined the same as signed out.
 */
export function useSignedInUser() {
  const [user, setUser] = React.useState<AccountMenuUser | null | undefined>(
    undefined
  )
  React.useEffect(() => {
    let cancelled = false
    void loadCurrentUser()
      .then((found) => {
        if (!cancelled) setUser(found)
      })
      // Signed out is the answer most of these pages expect, and a failed
      // look-up draws exactly that: Log in and Register.
      .catch(() => {
        if (!cancelled) setUser(null)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return user
}
