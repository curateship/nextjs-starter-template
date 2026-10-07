import * as React from "react"

import type { AccountMenuUser } from "@/components/pomodoro/account-menu"
import { PomodoroShell } from "@/components/pomodoro/pomodoro-shell"
import { loadCurrentUser } from "@/lib/api/auth/auth"

/**
 * The product shell around the shell's signed-out pages: sign in, register,
 * forgot and reset password, verify email, the sign-in link, change email and
 * its undo, reporting an unwanted sign-in, and maintenance.
 *
 * Handed to the shell through `signIn.frame` in `src/app/options.ts`. The card
 * in the middle is the shell's own, so its forms, Google, passkeys and
 * redirects are exactly what every other app has; only the sidebar, header and
 * scene around it are this app's, so the look does not break at the door.
 *
 * Who is signed in is asked from the browser, the way the shell's public
 * header asks, because these pages have no product loader to hand it over.
 * Most are reached signed out, and the header then shows Log in and Register;
 * on the few reached signed in, such as changing an email address, it shows
 * the account photo once the answer comes back.
 */
export default function SignInFrame({
  children,
}: {
  children: React.ReactNode
}) {
  const user = useSignedInUser()
  return (
    <PomodoroShell
      user={user}
      accountMenu={null}
      savedBackground={null}
      bell={{ unseen: 0, live: false }}
    >
      {/* Lifted up the scene, the way the timer ring floats on it, so the
          form is on screen without scrolling: at the product's usual height
          the card started 600px down a 900px window, with its Google and
          passkey buttons below the fold.

          440px rather than a step of the spacing scale because this margin
          and the content area's own -mt-40 overlap instead of adding up (the
          browser keeps the larger of two touching margins), so the number is
          the whole lift from the scene's bottom edge: 720 - 440 = 280px from
          the top of the page, measured. */}
      <div className="-mt-[440px] flex justify-center pb-10">{children}</div>
    </PomodoroShell>
  )
}

function useSignedInUser() {
  const [user, setUser] = React.useState<AccountMenuUser | null>(null)
  React.useEffect(() => {
    let cancelled = false
    void loadCurrentUser()
      .then((found) => {
        if (!cancelled) setUser(found)
      })
      // Signed out is the answer most of these pages expect, and a failed
      // look-up draws exactly that: Log in and Register.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])
  return user
}
